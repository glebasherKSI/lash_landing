import { Router } from 'express';
import { getAnalytics, RANGES } from '../../lib/analytics.js';

export const analyticsRouter = Router();

// Сдвиг вперёд ограничен: дальше следующего периода записей ещё нет
const MAX_OFFSET = 1;
const MIN_OFFSET = -60;

const readParams = (query) => ({
  range: RANGES.includes(query.range) ? query.range : 'month',
  offset: Math.min(MAX_OFFSET, Math.max(MIN_OFFSET, Number.parseInt(query.offset, 10) || 0)),
});

analyticsRouter.get('/analytics', (req, res) => {
  const { range, offset } = readParams(req.query);
  res.view('admin/analytics', { title: 'Аналитика', initial: getAnalytics(range, offset), maxOffset: MAX_OFFSET });
});

analyticsRouter.get('/api/analytics', (req, res) => {
  const { range, offset } = readParams(req.query);
  res.json({ ok: true, ...getAnalytics(range, offset) });
});
