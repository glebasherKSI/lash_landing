import { formatTime } from './time.js';

export const formatDuration = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} мин`;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
};

const SHORT_DAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

/** «Пн–Сб 10:00–19:00», «Вс выходной»: соседние дни с одинаковыми часами склеиваются. */
export const groupWorkingHours = (workingHours) => {
  const ordered = [1, 2, 3, 4, 5, 6, 0].map((wd) => workingHours.find((d) => d.weekday === wd)).filter(Boolean);
  const groups = [];
  for (const day of ordered) {
    const text = day.is_working ? `${formatTime(day.start_min)}–${formatTime(day.end_min)}` : 'выходной';
    const last = groups.at(-1);
    if (last && last.text === text) last.days.push(day.weekday);
    else groups.push({ text, days: [day.weekday], isWorking: day.is_working });
  }
  return groups.map((g) => ({
    label: g.days.length > 1 ? `${SHORT_DAYS[g.days[0]]}–${SHORT_DAYS[g.days.at(-1)]}` : SHORT_DAYS[g.days[0]],
    text: g.text,
    isWorking: g.isWorking,
  }));
};

/**
 * Делит заголовок первого экрана на строки для построчного появления.
 * Переносы, поставленные в админке, сохраняются; иначе слова делятся примерно на три строки.
 */
export const splitTitleLines = (title) => {
  const manual = title.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (manual.length > 1) return manual;
  const words = title.trim().split(/\s+/);
  const target = Math.max(8, Math.ceil(title.length / 3));
  const lines = [];
  for (const word of words) {
    const last = lines.at(-1);
    if (last && (last + ' ' + word).length <= target) lines[lines.length - 1] = last + ' ' + word;
    else lines.push(word);
  }
  return lines;
};

export const telegramUrl = (username) => (username ? `https://t.me/${username.replace(/^@/, '')}` : '');

export const phoneHref = (phone) => (phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : '');
