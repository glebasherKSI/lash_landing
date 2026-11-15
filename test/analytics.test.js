import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodBounds } from '../src/lib/analytics.js';

const TODAY = '2026-11-18'; // среда

test('неделя: с понедельника по воскресенье, сдвиг назад', () => {
  assert.deepEqual(periodBounds('week', 0, TODAY), { from: '2026-11-16', to: '2026-11-22', label: '16–22 ноября' });
  assert.equal(periodBounds('week', -3, TODAY).label, '26 октября – 1 ноября');
});

test('месяц: границы и переход через год', () => {
  assert.deepEqual(periodBounds('month', 0, TODAY), { from: '2026-11-01', to: '2026-11-30', label: 'Ноябрь 2026' });
  assert.deepEqual(periodBounds('month', 2, TODAY), { from: '2027-01-01', to: '2027-01-31', label: 'Январь 2027' });
  assert.equal(periodBounds('month', -9, TODAY).to, '2026-02-28');
});

test('квартал и год', () => {
  assert.deepEqual(periodBounds('quarter', 0, TODAY), { from: '2026-10-01', to: '2026-12-31', label: 'IV квартал 2026' });
  assert.equal(periodBounds('quarter', -1, TODAY).label, 'III квартал 2026');
  assert.deepEqual(periodBounds('year', -1, TODAY), { from: '2025-01-01', to: '2025-12-31', label: '2025' });
});
