import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getService } from '../db/repos/catalog.js';
import { getSettings } from '../db/repos/settings.js';
import { BookingError, createBooking, findNearestWindow, getBookingDays, getDaySlots } from '../lib/booking.js';
import { verifyCsrf } from '../lib/csrf.js';
import { notifyNewBooking } from '../lib/telegram.js';
import { formatDateLong, formatTime } from '../lib/time.js';
import { bookingRequestSchema, fieldErrors, slotsQuerySchema } from '../validation/schemas.js';

export const apiRouter = Router();

const bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 6,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { ok: false, message: 'Слишком много заявок с вашего устройства. Напишите мастеру напрямую или попробуйте позже.' },
});

const readLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false });

apiRouter.get('/slots', readLimiter, (req, res) => {
  const parsed = slotsQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ ok: false, errors: fieldErrors(parsed.error) });

  const service = getService(parsed.data.service_id);
  if (!service?.is_active) return res.status(404).json({ ok: false, message: 'Услуга не найдена' });

  const settings = getSettings();
  if (!parsed.data.date) {
    return res.json({ ok: true, days: getBookingDays({ durationMin: service.duration_min, settings }) });
  }
  const slots = getDaySlots({ date: parsed.data.date, durationMin: service.duration_min, stepMin: settings.slot_step_min });
  res.json({
    ok: true,
    date: parsed.data.date,
    slots: slots.map((s) => ({ time: formatTime(s.start), end: formatTime(s.end), available: s.available, reason: s.reason })),
  });
});

apiRouter.get('/nearest', readLimiter, (_req, res) => {
  const nearest = findNearestWindow();
  res.json({ ok: true, nearest: nearest && { date: nearest.date, time: formatTime(nearest.start), label: nearest.label } });
});

apiRouter.post('/bookings', bookingLimiter, verifyCsrf, async (req, res) => {
  const parsed = bookingRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    // Сработал honeypot: отвечаем как будто всё хорошо, чтобы бот не подбирал обход.
    if (errors.website) return res.status(201).json({ ok: true });
    return res.status(422).json({ ok: false, message: 'Проверьте поля формы', errors });
  }

  const { time, website: _honeypot, ...rest } = parsed.data;
  try {
    const result = createBooking({ ...rest, start_min: time }, { source: 'site', ip: req.ip });
    const booking = {
      id: result.id,
      service_title: result.service.title,
      effect_name: result.effect?.name ?? null,
      price_byn: result.service.price_byn,
      date: result.date,
      start_min: result.start,
      end_min: result.end,
      client_name: rest.client_name,
      contact: rest.contact,
      comment: rest.comment,
    };
    notifyNewBooking(booking);
    res.status(201).json({
      ok: true,
      booking: {
        id: booking.id,
        service: booking.service_title,
        effect: booking.effect_name,
        date: formatDateLong(booking.date),
        time: `${formatTime(booking.start_min)}–${formatTime(booking.end_min)}`,
        price: booking.price_byn,
      },
    });
  } catch (error) {
    if (error instanceof BookingError) {
      return res.status(error.status).json({ ok: false, code: error.code, message: error.message });
    }
    throw error;
  }
});
