import { Router } from 'express';
import {
  createReview,
  deleteReview,
  listPendingReviews,
  listReviews,
  publishReview,
  reorderReviews,
  updateReview,
} from '../../db/repos/catalog.js';
import { formatTimestampLocal } from '../../lib/time.js';
import { idListSchema, reviewSchema } from '../../validation/schemas.js';
import { action, idParam, notFound } from './helpers.js';

export const reviewsRouter = Router();

reviewsRouter.get('/reviews', (_req, res) => {
  res.view('admin/reviews', {
    title: 'Отзывы',
    pending: listPendingReviews().map((r) => ({ ...r, createdLocal: r.created_at ? formatTimestampLocal(r.created_at) : '' })),
    reviews: listReviews(),
  });
});

reviewsRouter.post('/api/reviews', action(reviewSchema, (data) => ({ id: createReview(data), reload: true }), { message: 'Отзыв добавлен' }));

reviewsRouter.post('/api/reviews/reorder', action(idListSchema, ({ ids }) => reorderReviews(ids), { message: 'Порядок сохранён' }));

reviewsRouter.post(
  '/api/reviews/:id/publish',
  action(null, (_data, req) => {
    if (!publishReview(idParam(req))) throw notFound('Отзыв');
    return { reload: true };
  }, { message: 'Отзыв опубликован' }),
);

reviewsRouter.post(
  '/api/reviews/:id',
  action(reviewSchema, (data, req) => {
    if (!updateReview(idParam(req), data)) throw notFound('Отзыв');
  }),
);

reviewsRouter.post(
  '/api/reviews/:id/delete',
  action(null, (_data, req) => {
    if (!deleteReview(idParam(req))) throw notFound('Отзыв');
  }, { message: 'Отзыв удалён' }),
);
