import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDaySlots } from '../src/lib/slots.js';

const hours = { start: 600, end: 1140 }; // 10:00–19:00
const free = (slots) => slots.filter((s) => s.available).map((s) => s.start);

test('услуга должна закончиться до конца рабочего дня', () => {
  const slots = buildDaySlots({ hours, durationMin: 165, stepMin: 30, busy: [] });
  assert.equal(Math.max(...free(slots)), 960); // 16:00 + 2:45 = 18:45
  assert.equal(slots.find((s) => s.start === 990).reason, 'closing');
});

test('слот не пересекается с существующей записью', () => {
  const busy = [{ start: 960, end: 1125 }]; // 16:00–18:45
  const slots = buildDaySlots({ hours, durationMin: 150, stepMin: 30, busy });
  // 13:30 + 2:30 = 16:00 — касается, но не пересекается
  assert.ok(free(slots).includes(810));
  assert.equal(slots.find((s) => s.start === 840).reason, 'busy');
});

test('выходной день — нет слотов', () => {
  assert.deepEqual(buildDaySlots({ hours: null, durationMin: 60, stepMin: 30, busy: [] }), []);
});

test('сегодня прошедшее время не предлагается', () => {
  const slots = buildDaySlots({ hours, durationMin: 60, stepMin: 30, busy: [], earliestStart: 905 });
  assert.equal(slots[0].start, 930);
});

test('шаг сетки берётся из настроек', () => {
  const slots = buildDaySlots({ hours, durationMin: 30, stepMin: 45, busy: [] });
  assert.deepEqual(slots.slice(0, 3).map((s) => s.start), [600, 645, 690]);
});
