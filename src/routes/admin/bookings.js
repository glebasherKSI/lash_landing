import { Router } from 'express';
import { BOOKING_STATUSES, getBooking, listBookings, setBookingStatus } from '../../db/repos/bookings.js';
import { listEffects, listServices } from '../../db/repos/catalog.js';
import { BookingError, createBooking } from '../../lib/booking.js';
import { addDays, formatDateLong, formatTime, formatTimestampLocal, todayISO } from '../../lib/time.js';
import { adminBookingSchema, bookingStatusSchema } from '../../validation/schemas.js';
import { action, idParam, notFound } from './helpers.js';

export const bookingsRouter = Router();

export const STATUS_LABELS = { new: 'Новая', confirmed: 'Подтверждена', cancelled: 'Отменена', done: 'Выполнена' };
const PERIODS = {
  upcoming: { label: 'Предстоящие', range: (today) => ({ fromDate: today }) },
  past: { label: 'Прошедшие', range: (today) => ({ fromDate: addDays(today, -60), toDate: addDays(today, -1) }) },
  all: { label: 'Все', range: () => ({}) },
};

bookingsRouter.get('/bookings', (req, res) => {
  const status = BOOKING_STATUSES.includes(req.query.status) ? req.query.status : '';
  const period = req.query.period in PERIODS ? req.query.period : 'upcoming';
  const today = todayISO();
  const bookings = listBookings({ status: status || undefined, ...PERIODS[period].range(today) });
  if (period === 'past') bookings.reverse();

  const groups = [];
  for (const booking of bookings) {
    let group = groups.at(-1);
    if (group?.date !== booking.date) {
      group = { date: booking.date, label: formatDateLong(booking.date), isToday: booking.date === today, items: [] };
      groups.push(group);
    }
    group.items.push({
      ...booking,
      time: `${formatTime(booking.start_min)}–${formatTime(booking.end_min)}`,
      createdLocal: formatTimestampLocal(booking.created_at),
    });
  }

  res.view('admin/bookings', {
    title: 'Записи',
    groups,
    status,
    period,
    periods: Object.entries(PERIODS).map(([value, p]) => ({ value, label: p.label })),
    statuses: BOOKING_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] })),
    services: listServices(),
    effects: listEffects(),
    today,
  });
});

bookingsRouter.post(
  '/api/bookings/:id/status',
  action(bookingStatusSchema, ({ status }, req) => {
    const booking = getBooking(idParam(req));
    if (!booking) throw notFound('Запись');
    setBookingStatus(booking.id, status);
    return { message: `Статус: ${STATUS_LABELS[status].toLowerCase()}` };
  }),
);

bookingsRouter.post(
  '/api/bookings',
  action(adminBookingSchema, ({ time, force, ...data }, _req, res) => {
    try {
      const result = createBooking({ ...data, start_min: time }, { source: 'admin', force });
      return { id: result.id, reload: true, message: 'Запись добавлена' };
    } catch (error) {
      if (!(error instanceof BookingError)) throw error;
      const ADMIN_MESSAGES = {
        slot_taken: 'Это время пересекается с другой записью.',
        slot_invalid: 'Время не попадает в сетку слотов или в рабочие часы.',
      };
      const hint = force ? '' : ' Отметьте «Записать, даже если время занято», если это осознанно.';
      res.status(409).json({ ok: false, message: (ADMIN_MESSAGES[error.code] ?? error.message) + hint });
    }
  }),
);
