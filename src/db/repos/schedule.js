import { db } from '../db.js';
import { weekdayOf } from '../../lib/time.js';

export const listWorkingHours = () =>
  db
    .prepare('SELECT * FROM working_hours ORDER BY weekday')
    .all()
    .map((row) => ({ ...row, is_working: Boolean(row.is_working) }));

export const saveWorkingHours = db.transaction((days) => {
  const upsert = db.prepare(
    `INSERT INTO working_hours (weekday, is_working, start_min, end_min) VALUES (@weekday, @is_working, @start_min, @end_min)
     ON CONFLICT(weekday) DO UPDATE SET is_working = excluded.is_working, start_min = excluded.start_min, end_min = excluded.end_min`,
  );
  for (const day of days) upsert.run({ ...day, is_working: day.is_working ? 1 : 0 });
});

export const listExceptions = ({ fromDate } = {}) =>
  db
    .prepare(`SELECT * FROM schedule_exceptions ${fromDate ? 'WHERE date >= ?' : ''} ORDER BY date`)
    .all(...(fromDate ? [fromDate] : []))
    .map((row) => ({ ...row, is_day_off: Boolean(row.is_day_off) }));

export const saveException = ({ date, is_day_off, start_min, end_min, note }) =>
  db
    .prepare(
      `INSERT INTO schedule_exceptions (date, is_day_off, start_min, end_min, note) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET is_day_off = excluded.is_day_off, start_min = excluded.start_min,
         end_min = excluded.end_min, note = excluded.note`,
    )
    .run(date, is_day_off ? 1 : 0, is_day_off ? null : start_min, is_day_off ? null : end_min, note);

export const deleteException = (date) => db.prepare('DELETE FROM schedule_exceptions WHERE date = ?').run(date).changes;

const selectException = db.prepare('SELECT * FROM schedule_exceptions WHERE date = ?');
const selectWeekday = db.prepare('SELECT * FROM working_hours WHERE weekday = ?');

/** Рабочий интервал на дату с учётом исключений; null, если день нерабочий. */
export const getDayHours = (date) => {
  const exception = selectException.get(date);
  if (exception) {
    return exception.is_day_off ? null : { start: exception.start_min, end: exception.end_min };
  }
  const day = selectWeekday.get(weekdayOf(date));
  return day?.is_working ? { start: day.start_min, end: day.end_min } : null;
};
