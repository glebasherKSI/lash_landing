import { addDays, weekdayOf } from './time.js';

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

export const isValidMonth = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value ?? '');

/** «2026-11» ± n месяцев. */
export const shiftMonth = (month, n) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};

export const monthTitle = (month) => {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};

// Понедельник — первый день недели
const mondayIndex = (iso) => (weekdayOf(iso) + 6) % 7;

/** Границы сетки месяца: с понедельника первой недели по воскресенье последней. */
export const monthGrid = (month) => {
  const first = `${month}-01`;
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  return { first, last, from: addDays(first, -mondayIndex(first)), to: addDays(last, 6 - mondayIndex(last)) };
};

/**
 * Месяц для календаря записей: по дням — записи, занятые и рабочие минуты, загрузка;
 * итог месяца — записи, часы работы, доход и свободные рабочие часы впереди.
 * hoursFor(iso) → { start, end } в минутах или null для выходного.
 */
export const buildMonth = ({ month, today, bookings, hoursFor }) => {
  const { first, last, from, to } = monthGrid(month);
  const byDate = new Map();
  for (const b of bookings) byDate.set(b.date, [...(byDate.get(b.date) ?? []), b]);
  const days = [];
  for (let iso = from; iso <= to; iso = addDays(iso, 1)) {
    const items = byDate.get(iso) ?? [];
    const active = items.filter((b) => b.status !== 'cancelled');
    const hours = hoursFor(iso);
    const busyMin = active.reduce((sum, b) => sum + (b.end_min - b.start_min), 0);
    const workMin = hours ? hours.end - hours.start : 0;
    days.push({
      iso,
      day: Number(iso.slice(8)),
      inMonth: iso >= first && iso <= last,
      isToday: iso === today,
      isPast: iso < today,
      hours,
      items,
      count: active.length,
      busyMin,
      workMin,
      load: workMin ? Math.min(1, busyMin / workMin) : busyMin ? 1 : 0,
      hasNew: active.some((b) => b.status === 'new'),
      revenue: active.reduce((sum, b) => sum + b.price_byn, 0),
    });
  }
  const own = days.filter((d) => d.inMonth);
  return {
    month,
    title: monthTitle(month),
    prev: shiftMonth(month, -1),
    next: shiftMonth(month, 1),
    weeks: Array.from({ length: days.length / 7 }, (_, i) => days.slice(i * 7, i * 7 + 7)),
    days: own,
    total: {
      count: own.reduce((s, d) => s + d.count, 0),
      busyMin: own.reduce((s, d) => s + d.busyMin, 0),
      revenue: own.reduce((s, d) => s + d.revenue, 0),
      workDays: own.filter((d) => d.count).length,
      freeMin: own.filter((d) => d.iso >= today).reduce((s, d) => s + Math.max(0, d.workMin - d.busyMin), 0),
    },
  };
};
