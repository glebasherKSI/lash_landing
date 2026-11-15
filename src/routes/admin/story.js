import { Router } from 'express';
import { getService, listServices } from '../../db/repos/catalog.js';
import { getDayHours } from '../../db/repos/schedule.js';
import { getSettings } from '../../db/repos/settings.js';
import { getDaySlots } from '../../lib/booking.js';
import { pickWindows } from '../../lib/slots.js';
import { addDays, describeDate, formatTime, isValidISODate, todayISO, weekdayOf } from '../../lib/time.js';

export const storyRouter = Router();

// Больше 7 дней по 4 окна не помещается в сторис вместе с местом под стикер-ссылку
export const STORY_MAX_DAYS = 7;
const STORY_DAYS_AHEAD = 30;
const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

// По умолчанию — самая короткая полноценная процедура, как у «Ближайшего окна» на сайте
const defaultService = (services) => {
  const full = services.filter((s) => s.duration_min >= 60);
  return (full.length ? full : services).reduce((min, s) => (!min || s.duration_min < min.duration_min ? s : min), null);
};

storyRouter.get('/story', (_req, res) => {
  const services = listServices({ activeOnly: true });
  const settings = getSettings();
  res.view('admin/story', {
    title: 'Окошки для сторис',
    services,
    defaultServiceId: defaultService(services)?.id,
    today: todayISO(),
    maxDays: STORY_MAX_DAYS,
    brand: {
      studio: settings.studio_name,
      master: settings.master_name,
      place: settings.metro || settings.address || settings.city,
      accent: settings.accent_color,
    },
  });
});

storyRouter.get('/api/story', (req, res) => {
  const service = getService(Number(req.query.service_id));
  if (!service) return res.status(404).json({ ok: false, message: 'Услуга не найдена' });
  const today = todayISO();
  const from = isValidISODate(String(req.query.from)) && req.query.from >= today ? String(req.query.from) : today;
  if (from > addDays(today, STORY_DAYS_AHEAD)) return res.status(400).json({ ok: false, message: 'Слишком далеко вперёд' });
  const days = Math.min(STORY_MAX_DAYS, Math.max(1, Number.parseInt(req.query.days, 10) || STORY_MAX_DAYS));
  const stepMin = getSettings().slot_step_min;

  const list = Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i);
    const working = Boolean(getDayHours(date));
    const windows = working ? pickWindows(getDaySlots({ date, durationMin: service.duration_min, stepMin })) : [];
    const d = describeDate(date);
    return { date, working, weekday: WEEKDAYS[weekdayOf(date)], label: d.label, day: d.day, month: d.month, times: windows.map((w) => formatTime(w.start)) };
  });

  res.json({ ok: true, service: { id: service.id, title: service.title }, from, to: addDays(from, days - 1), days: list });
});
