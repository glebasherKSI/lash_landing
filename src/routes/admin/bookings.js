import { Router } from 'express';
import { BOOKING_STATUSES, countBookingsByStatus, getBooking, listBookings, listClients, setBookingStatus } from '../../db/repos/bookings.js';
import { getService, listEffects, listServices } from '../../db/repos/catalog.js';
import { getDayHours } from '../../db/repos/schedule.js';
import { getSettings } from '../../db/repos/settings.js';
import { BookingError, createBooking, getDaySlots } from '../../lib/booking.js';
import { addDays, describeDate, formatDateLong, formatTime, formatTimestampLocal, isValidISODate, todayISO } from '../../lib/time.js';
import { adminBookingSchema, bookingStatusSchema } from '../../validation/schemas.js';
import { formatDuration } from '../../lib/format.js';
import { buildMonth, isValidMonth, monthGrid } from '../../lib/calendar.js';
import { formatPhone } from '../../../public/js/modules/phone.js';
import { action, idParam, notFound } from './helpers.js';

export const bookingsRouter = Router();

export const STATUS_LABELS = { new: 'Новая', confirmed: 'Подтверждена', cancelled: 'Отменена', done: 'Выполнена' };
const PERIODS = {
  upcoming: { label: 'Предстоящие', range: (today) => ({ fromDate: today }) },
  past: { label: 'Прошедшие', range: (today) => ({ fromDate: addDays(today, -60), toDate: addDays(today, -1) }) },
  all: { label: 'Все', range: () => ({}) },
};

const VIEWS = ['list', 'calendar'];
const VIEW_COOKIE = 'bookings_view';
const YEAR_MS = 365 * 24 * 3600 * 1000;

const toCard = (booking) => ({
  ...booking,
  time: `${formatTime(booking.start_min)}–${formatTime(booking.end_min)}`,
  createdLocal: formatTimestampLocal(booking.created_at),
});

// Режим «Календарь»: месяц из ?month, выбранный день из ?day (по умолчанию сегодня или 1-е число)
const calendarData = (query, today) => {
  const day = isValidISODate(String(query.day ?? '')) ? query.day : null;
  const month = isValidMonth(query.month) ? query.month : (day ?? today).slice(0, 7);
  const { from, to } = monthGrid(month);
  const cal = buildMonth({ month, today, bookings: listBookings({ fromDate: from, toDate: to }).map(toCard), hoursFor: getDayHours });
  const selected = day?.startsWith(month) ? day : today.startsWith(month) ? today : `${month}-01`;
  return { ...cal, selected, currentMonth: today.slice(0, 7) };
};

bookingsRouter.get('/bookings', (req, res) => {
  // выбранный режим запоминается: вкладка «Записи» открывается так, как мастер оставила
  let view = req.cookies[VIEW_COOKIE];
  if (VIEWS.includes(req.query.view)) {
    view = req.query.view;
    res.cookie(VIEW_COOKIE, view, { maxAge: YEAR_MS, httpOnly: true, sameSite: 'lax', path: '/admin' });
  }
  if (view === 'calendar') {
    const today = todayISO();
    return res.view('admin/bookings', {
      title: 'Записи',
      view,
      cal: calendarData(req.query, today),
      groups: [],
      statusLabels: STATUS_LABELS,
      services: listServices(),
      effects: listEffects(),
      formatDuration,
      formatPhone,
      formatDateLong,
      formatTime,
      today,
    });
  }

  const status = BOOKING_STATUSES.includes(req.query.status) ? req.query.status : '';
  const period = req.query.period in PERIODS ? req.query.period : 'upcoming';
  const today = todayISO();
  const bookings = listBookings({ status: status || undefined, ...PERIODS[period].range(today) });
  if (period === 'past') bookings.reverse();

  const groups = [];
  for (const booking of bookings) {
    let group = groups.at(-1);
    if (group?.date !== booking.date) {
      group = {
        date: booking.date,
        label: formatDateLong(booking.date),
        isToday: booking.date === today,
        isTomorrow: booking.date === addDays(today, 1),
        items: [],
      };
      groups.push(group);
    }
    group.items.push(toCard(booking));
  }

  res.view('admin/bookings', {
    title: 'Записи',
    view: 'list',
    groups,
    status,
    period,
    periods: Object.entries(PERIODS).map(([value, p]) => ({ value, label: p.label })),
    statuses: BOOKING_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] })),
    statusCounts: countBookingsByStatus(),
    statusLabels: STATUS_LABELS,
    total: bookings.length,
    services: listServices(),
    effects: listEffects(),
    formatDuration,
    formatPhone,
    today,
  });
});

// Быстрая запись в админке: дальше горизонта онлайн-записи и для скрытых услуг тоже
const ADMIN_DAYS_AHEAD = 90;

bookingsRouter.get('/api/slots', (req, res) => {
  const service = getService(Number(req.query.service_id));
  if (!service) return res.status(404).json({ ok: false, message: 'Услуга не найдена' });
  const { slot_step_min: stepMin, booking_horizon_days: horizon } = getSettings();
  const date = String(req.query.date ?? '');

  if (!date) {
    const today = todayISO();
    const days = Array.from({ length: Math.max(ADMIN_DAYS_AHEAD, horizon) }, (_, i) => {
      const iso = addDays(today, i);
      const working = Boolean(getDayHours(iso));
      const free = working ? getDaySlots({ date: iso, durationMin: service.duration_min, stepMin }).filter((s) => s.available).length : 0;
      return { ...describeDate(iso), working, free, offset: i };
    });
    return res.json({ ok: true, days });
  }

  if (!isValidISODate(date)) return res.status(400).json({ ok: false, message: 'Некорректная дата' });
  const slots = getDaySlots({ date, durationMin: service.duration_min, stepMin }).map((s) => ({
    time: formatTime(s.start),
    end: formatTime(s.end),
    available: s.available,
    reason: s.reason,
  }));
  res.json({ ok: true, working: Boolean(getDayHours(date)), slots });
});

bookingsRouter.get('/api/clients', (_req, res) => res.json({ ok: true, clients: listClients() }));

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
