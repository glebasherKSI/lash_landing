import { Router } from 'express';
import { getDayHours } from '../../db/repos/schedule.js';
import { getSettings } from '../../db/repos/settings.js';
import { getDaySlots, referenceService } from '../../lib/booking.js';
import { addDays, describeDate, formatTime, isValidISODate, todayISO, weekdayOf } from '../../lib/time.js';

export const storyRouter = Router();

// Больше 7 дней не помещается в сторис вместе с местом под стикер-ссылку
export const STORY_MAX_DAYS = 7;
const STORY_DAYS_AHEAD = 30;
const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

storyRouter.get('/story', (_req, res) => {
  const settings = getSettings();
  res.view('admin/story', {
    title: 'Окошки для сторис',
    today: todayISO(),
    maxDays: STORY_MAX_DAYS,
    brand: {
      studio: settings.studio_name,
      master: settings.master_name,
      accent: settings.accent_color,
    },
  });
});

storyRouter.get('/api/story', (req, res) => {
  // Процедуры у мастера почти одинаковые по длительности: окна считаются по обычной процедуре.
  // Показываем каждое свободное начало — как в форме записи, чтобы цифры совпадали
  const service = referenceService();
  if (!service) return res.status(404).json({ ok: false, message: 'Сначала добавьте услугу' });
  const today = todayISO();
  const from = isValidISODate(String(req.query.from)) && req.query.from >= today ? String(req.query.from) : today;
  if (from > addDays(today, STORY_DAYS_AHEAD)) return res.status(400).json({ ok: false, message: 'Слишком далеко вперёд' });
  const days = Math.min(STORY_MAX_DAYS, Math.max(1, Number.parseInt(req.query.days, 10) || STORY_MAX_DAYS));
  const stepMin = getSettings().slot_step_min;

  const list = Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i);
    const working = Boolean(getDayHours(date));
    const windows = working ? getDaySlots({ date, durationMin: service.duration_min, stepMin }).filter((s) => s.available) : [];
    const d = describeDate(date);
    return { date, working, weekday: WEEKDAYS[weekdayOf(date)], label: d.label, day: d.day, month: d.month, times: windows.map((w) => formatTime(w.start)) };
  });

  res.json({ ok: true, from, to: addDays(from, days - 1), days: list });
});
