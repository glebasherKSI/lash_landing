import { db } from '../db/db.js';
import { addDays, todayISO, weekdayOf } from './time.js';

// Аналитика записей за календарный период: неделя, месяц, квартал или год со сдвигом назад/вперёд.
export const RANGES = ['week', 'month', 'quarter', 'year'];

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const capitalize = (s) => s[0].toUpperCase() + s.slice(1);

const iso = (y, m, d) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
const parts = (date) => date.split('-').map(Number);

/** Границы периода { from, to, label } для сдвига offset (0 — текущий, -1 — прошлый). */
export const periodBounds = (range, offset = 0, today = todayISO()) => {
  const [y, m] = parts(today);
  if (range === 'week') {
    const monday = addDays(today, -((weekdayOf(today) + 6) % 7) + offset * 7);
    const sunday = addDays(monday, 6);
    const [, m1, d1] = parts(monday);
    const [, m2, d2] = parts(sunday);
    const label = m1 === m2 ? `${d1}–${d2} ${MONTHS_GEN[m2 - 1]}` : `${d1} ${MONTHS_GEN[m1 - 1]} – ${d2} ${MONTHS_GEN[m2 - 1]}`;
    return { from: monday, to: sunday, label };
  }
  if (range === 'month') {
    const first = new Date(Date.UTC(y, m - 1 + offset, 1));
    const fy = first.getUTCFullYear();
    const fm = first.getUTCMonth();
    return { from: iso(fy, fm, 1), to: iso(fy, fm + 1, 0), label: `${capitalize(MONTHS[fm])} ${fy}` };
  }
  if (range === 'quarter') {
    const start = new Date(Date.UTC(y, Math.floor((m - 1) / 3) * 3 + offset * 3, 1));
    const qy = start.getUTCFullYear();
    const qm = start.getUTCMonth();
    return { from: iso(qy, qm, 1), to: iso(qy, qm + 3, 0), label: `${['I', 'II', 'III', 'IV'][qm / 3]} квартал ${qy}` };
  }
  const year = y + offset;
  return { from: iso(year, 0, 1), to: iso(year, 11, 31), label: String(year) };
};

/** Корзины для графика выручки: по дням (неделя, месяц), по неделям (квартал), по месяцам (год). */
const buildBuckets = (range, from, to) => {
  const buckets = [];
  if (range === 'year') {
    const [y] = parts(from);
    for (let mo = 0; mo < 12; mo++) buckets.push({ from: iso(y, mo, 1), to: iso(y, mo + 1, 0), label: capitalize(MONTHS[mo]), short: MONTHS_SHORT[mo] });
  } else if (range === 'quarter') {
    for (let d = from; d <= to; d = addDays(d, 7)) {
      const end = addDays(d, 6) < to ? addDays(d, 6) : to;
      const [, m1, d1] = parts(d);
      buckets.push({ from: d, to: end, label: `${d1} ${MONTHS_GEN[m1 - 1]} – ${parts(end)[2]} ${MONTHS_GEN[parts(end)[1] - 1]}`, short: `${d1}.${String(m1).padStart(2, '0')}` });
    }
  } else {
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const [, mo, day] = parts(d);
      buckets.push({ from: d, to: d, label: `${day} ${MONTHS_GEN[mo - 1]}, ${WEEKDAYS[(weekdayOf(d) + 6) % 7].toLowerCase()}`, short: range === 'week' ? WEEKDAYS[(weekdayOf(d) + 6) % 7] : String(day) });
    }
  }
  return buckets.map((b) => ({ ...b, earned: 0, planned: 0, count: 0 }));
};

const selectRange = db.prepare('SELECT * FROM bookings WHERE date BETWEEN ? AND ?');
const selectFirstVisits = db.prepare(
  "SELECT contact, MIN(date) AS first FROM bookings WHERE status != 'cancelled' GROUP BY contact",
);

const summarize = (rows, today) => {
  const active = rows.filter((r) => r.status !== 'cancelled');
  const earned = active.filter((r) => r.date <= today).reduce((sum, r) => sum + r.price_byn, 0);
  const planned = active.filter((r) => r.date > today).reduce((sum, r) => sum + r.price_byn, 0);
  return {
    revenue: earned + planned,
    earned,
    planned,
    count: active.length,
    average: active.length ? Math.round((earned + planned) / active.length) : 0,
    cancelled: rows.length - active.length,
    cancelRate: rows.length ? Math.round(((rows.length - active.length) / rows.length) * 100) : 0,
  };
};

const TOP_SERVICES = 5;

export const getAnalytics = (range, offset = 0, today = todayISO()) => {
  const period = periodBounds(range, offset, today);
  const previous = periodBounds(range, offset - 1, today);
  const rows = selectRange.all(period.from, period.to);
  const active = rows.filter((r) => r.status !== 'cancelled');

  const buckets = buildBuckets(range, period.from, period.to);
  for (const r of active) {
    const bucket = buckets.find((b) => r.date >= b.from && r.date <= b.to);
    if (!bucket) continue;
    bucket[r.date <= today ? 'earned' : 'planned'] += r.price_byn;
    bucket.count += 1;
  }

  const bySource = { site: { count: 0, revenue: 0 }, admin: { count: 0, revenue: 0 } };
  for (const r of active) {
    bySource[r.source].count += 1;
    bySource[r.source].revenue += r.price_byn;
  }

  const services = new Map();
  for (const r of active) {
    const s = services.get(r.service_title) ?? { title: r.service_title, count: 0, revenue: 0 };
    s.count += 1;
    s.revenue += r.price_byn;
    services.set(r.service_title, s);
  }
  const ranked = [...services.values()].sort((a, b) => b.revenue - a.revenue || b.count - a.count);
  const top = ranked.slice(0, TOP_SERVICES);
  const rest = ranked.slice(TOP_SERVICES);
  if (rest.length) {
    top.push({ title: 'Другое', count: rest.reduce((n, s) => n + s.count, 0), revenue: rest.reduce((n, s) => n + s.revenue, 0), other: true });
  }

  const weekdays = WEEKDAYS.map((label) => ({ label, count: 0 }));
  for (const r of active) weekdays[(weekdayOf(r.date) + 6) % 7].count += 1;

  // Новая клиентка — та, чья первая (не отменённая) запись попала в этот период
  const firstVisit = new Map(selectFirstVisits.all().map((r) => [r.contact, r.first]));
  const clients = new Set(active.map((r) => r.contact));
  let newClients = 0;
  for (const contact of clients) {
    const first = firstVisit.get(contact);
    if (first >= period.from && first <= period.to) newClients += 1;
  }

  return {
    range,
    offset,
    period: { ...period, isCurrent: offset === 0, hasFuture: period.to > today },
    summary: summarize(rows, today),
    previous: summarize(selectRange.all(previous.from, previous.to), today),
    buckets: buckets.map(({ label, short, earned, planned, count, from }) => ({ label, short, earned, planned, count, isFuture: from > today })),
    source: bySource,
    services: top,
    weekdays,
    clients: { total: clients.size, new: newClients, returning: clients.size - newClients },
  };
};
