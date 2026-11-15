import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientSummary } from '../src/routes/admin/clients.js';

const b = (date, status, price, service = 'Классика') => ({ date, status, price_byn: price, service_title: service });

test('статистика клиентки: визиты, отмены, впереди, интервал, любимая услуга', () => {
  const s = clientSummary(
    [b('2026-12-01', 'confirmed', 65, '2D'), b('2026-11-01', 'done', 60), b('2026-10-15', 'cancelled', 60), b('2026-10-02', 'done', 60), b('2026-09-02', 'done', 70, '3D')],
    '2026-11-15',
  );
  assert.deepEqual(s, { visits: 3, cancelled: 1, upcoming: 1, spent: 190, average: 63, first: '2026-09-02', interval: 30, favorite: 'Классика' });
});

test('одна запись в будущем: визитов нет, интервала нет', () => {
  const s = clientSummary([b('2026-12-01', 'new', 60)], '2026-11-15');
  assert.equal(s.visits, 0);
  assert.equal(s.average, 0);
  assert.equal(s.interval, null);
});
