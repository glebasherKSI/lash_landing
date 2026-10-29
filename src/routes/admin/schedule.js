import { Router } from 'express';
import { deleteException, listExceptions, listWorkingHours, saveException, saveWorkingHours } from '../../db/repos/schedule.js';
import { getSettings, saveSettings } from '../../db/repos/settings.js';
import { db } from '../../db/db.js';
import { formatDateLong, formatTime, isValidISODate, todayISO, WEEKDAYS_FULL } from '../../lib/time.js';
import { exceptionSchema, scheduleSchema } from '../../validation/schemas.js';
import { action } from './helpers.js';

export const scheduleRouter = Router();

scheduleRouter.get('/schedule', (_req, res) => {
  const settings = getSettings();
  const hours = listWorkingHours();
  // Понедельник первым
  const days = [1, 2, 3, 4, 5, 6, 0].map((weekday) => {
    const day = hours.find((d) => d.weekday === weekday) ?? { weekday, is_working: false, start_min: 600, end_min: 1140 };
    return { ...day, name: WEEKDAYS_FULL[weekday], start: formatTime(day.start_min), end: formatTime(day.end_min) };
  });
  res.view('admin/schedule', {
    title: 'Расписание',
    days,
    exceptions: listExceptions({ fromDate: todayISO() }).map((e) => ({
      ...e,
      label: formatDateLong(e.date),
      hours: e.is_day_off ? 'выходной' : `${formatTime(e.start_min)}–${formatTime(e.end_min)}`,
    })),
    slotStep: settings.slot_step_min,
    horizon: settings.booking_horizon_days,
    today: todayISO(),
  });
});

scheduleRouter.post(
  '/api/schedule',
  action(scheduleSchema, ({ days, slot_step_min, booking_horizon_days }) => {
    db.transaction(() => {
      saveWorkingHours(days);
      saveSettings({ slot_step_min, booking_horizon_days });
    })();
  }),
);

scheduleRouter.post('/api/schedule/exceptions', action(exceptionSchema, (data) => {
  saveException(data);
  return { reload: true };
}));

scheduleRouter.post(
  '/api/schedule/exceptions/:date/delete',
  action(null, (_data, req) => {
    if (!isValidISODate(req.params.date)) throw Object.assign(new Error('Некорректная дата'), { status: 400 });
    deleteException(req.params.date);
  }, { message: 'Исключение удалено' }),
);
