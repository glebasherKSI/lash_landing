import { Router } from 'express';
import { createReview, deleteReview, listReviews, reorderReviews, updateReview } from '../../db/repos/catalog.js';
import { getSettings, saveSettings } from '../../db/repos/settings.js';
import { idListSchema, reviewSchema, settingsSchema } from '../../validation/schemas.js';
import { action, idParam, notFound } from './helpers.js';

export const settingsRouter = Router();

// Пустые строки из повторяющихся блоков (отзывы, правила) не сохраняем.
const compactItems = (body) => {
  const out = { ...body };
  for (const key of ['why_items', 'visit_steps', 'rules']) {
    out[key] = (Array.isArray(body[key]) ? body[key] : Object.values(body[key] ?? {})).filter(
      (item) => item && (item.title?.trim() || item.text?.trim()),
    );
  }
  out.checklist = (Array.isArray(body.checklist) ? body.checklist : Object.values(body.checklist ?? {}))
    .map((s) => String(s).trim())
    .filter(Boolean);
  return out;
};

settingsRouter.get('/settings', (_req, res) => {
  const settings = getSettings();
  const pad = (list, n) => [...list, ...Array.from({ length: Math.max(0, n - list.length) }, () => ({ title: '', text: '' }))];
  res.view('admin/settings', {
    title: 'Настройки сайта',
    s: settings,
    whyItems: pad(settings.why_items, 4),
    visitSteps: pad(settings.visit_steps, 3),
    rules: pad(settings.rules, 4),
    checklist: [...settings.checklist, '', ''].slice(0, Math.max(settings.checklist.length + 2, 5)).slice(0, 10),
    reviews: listReviews(),
  });
});

settingsRouter.post('/api/settings', (req, res, next) => {
  req.body = compactItems(req.body ?? {});
  next();
}, action(settingsSchema, (data) => saveSettings(data)));

/* ---------- Отзывы ---------- */

settingsRouter.post('/api/reviews', action(reviewSchema, (data) => ({ id: createReview(data), reload: true }), { message: 'Отзыв добавлен' }));

settingsRouter.post('/api/reviews/reorder', action(idListSchema, ({ ids }) => reorderReviews(ids), { message: 'Порядок сохранён' }));

settingsRouter.post(
  '/api/reviews/:id',
  action(reviewSchema, (data, req) => {
    if (!updateReview(idParam(req), data)) throw notFound('Отзыв');
  }),
);

settingsRouter.post(
  '/api/reviews/:id/delete',
  action(null, (_data, req) => {
    if (!deleteReview(idParam(req))) throw notFound('Отзыв');
  }, { message: 'Отзыв удалён' }),
);
