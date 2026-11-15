import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMonth, monthGrid, shiftMonth } from '../src/lib/calendar.js';

test('сетка месяца — с понедельника по воскресенье, переход через год', () => {
  // 1 ноября 2026 — воскресенье, 30 ноября — понедельник
  assert.deepEqual(monthGrid('2026-11'), { first: '2026-11-01', last: '2026-11-30', from: '2026-10-26', to: '2026-12-06' });
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
});

test('загрузка дня и итоги месяца: отмены не считаются, свободно — только впереди', () => {
  const b = (date, start, end, status = 'confirmed', price = 60) => ({ date, start_min: start, end_min: end, status, price_byn: price });
  const cal = buildMonth({
    month: '2026-11',
    today: '2026-11-15',
    bookings: [b('2026-11-10', 600, 750), b('2026-11-18', 600, 780, 'new', 65), b('2026-11-18', 840, 960, 'cancelled'), b('2026-10-30', 600, 700)],
    // рабочие дни — будни с 10:00 до 19:00
    hoursFor: (iso) => ([0, 6].includes(new Date(`${iso}T12:00Z`).getUTCDay()) ? null : { start: 600, end: 1140 }),
  });
  assert.equal(cal.weeks.length, 6);
  assert.equal(cal.days.length, 30);
  const day18 = cal.days.find((d) => d.iso === '2026-11-18');
  assert.equal(day18.count, 1);
  assert.equal(day18.busyMin, 180);
  assert.equal(day18.load, 180 / 540);
  assert.equal(day18.hasNew, true);
  // 30 октября в сетке есть, но в итоги месяца не входит
  assert.deepEqual({ ...cal.total, freeMin: undefined }, { count: 2, busyMin: 330, revenue: 125, workDays: 2, freeMin: undefined });
  // будни с 16-го по 30-е: 11 дней по 540 минут минус 180 занятых
  assert.equal(cal.total.freeMin, 11 * 540 - 180);
});
