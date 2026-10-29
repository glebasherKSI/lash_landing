import { config } from '../config.js';

const MINUTES_IN_DAY = 1440;

const zonedParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map((p) => [p.type, p.value]));
};

export const todayISO = () => {
  const p = zonedParts();
  return `${p.year}-${p.month}-${p.day}`;
};

export const nowMinutes = () => {
  const p = zonedParts();
  return Number(p.hour) * 60 + Number(p.minute);
};

const parseISO = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

export const isValidISODate = (iso) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  return parseISO(iso).toISOString().slice(0, 10) === iso;
};

export const addDays = (iso, days) => {
  const date = parseISO(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export const weekdayOf = (iso) => parseISO(iso).getUTCDay();

export const daysBetween = (fromISO, toISO) => Math.round((parseISO(toISO) - parseISO(fromISO)) / 86_400_000);

export const formatTime = (minutes) => {
  const m = ((minutes % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

export const parseTime = (hhmm) => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

const WEEKDAYS_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
export const WEEKDAYS_FULL = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

export const describeDate = (iso) => {
  const date = parseISO(iso);
  return {
    iso,
    day: date.getUTCDate(),
    weekday: WEEKDAYS_SHORT[date.getUTCDay()],
    month: MONTHS_GENITIVE[date.getUTCMonth()],
    label: `${date.getUTCDate()} ${MONTHS_GENITIVE[date.getUTCMonth()]}`,
  };
};

/** SQLite datetime('now') (UTC, «YYYY-MM-DD HH:MM:SS») → «29.10 18:36» по Минску. */
export const formatTimestampLocal = (sqliteUtc) =>
  new Intl.DateTimeFormat('ru-RU', {
    timeZone: config.timezone,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(new Date(sqliteUtc.replace(' ', 'T') + 'Z'))
    .replace(',', '');

export const formatDateLong = (iso) => {
  const d = describeDate(iso);
  return `${d.label}, ${WEEKDAYS_FULL[weekdayOf(iso)].toLowerCase()}`;
};
