import { Router } from 'express';
import { createEffect, deleteEffect, listEffects, reorderEffects, updateEffect } from '../../db/repos/catalog.js';
import { buildLashLines, LID_PATH, LOWER_LID_PATH } from '../../../public/js/lash-geometry.js';
import { effectSchema, idListSchema } from '../../validation/schemas.js';
import { action, idParam, notFound } from './helpers.js';

export const effectsRouter = Router();

const uniqueSlugGuard = (fn) => (data, req) => {
  try {
    return fn(data, req);
  } catch (error) {
    if (String(error.code).startsWith('SQLITE_CONSTRAINT')) {
      throw Object.assign(new Error(`Код «${data.slug}» уже занят другим эффектом`), { status: 422 });
    }
    throw error;
  }
};

effectsRouter.get('/effects', (_req, res) => {
  const effects = listEffects();
  res.view('admin/effects', {
    title: 'Эффекты',
    effects: effects.map((e) => ({ ...e, lashes: buildLashLines(e.profile) })),
    blankLashes: buildLashLines([8, 9, 10, 11, 11]),
    lidPath: LID_PATH,
    lowerLidPath: LOWER_LID_PATH,
  });
});

effectsRouter.post(
  '/api/effects',
  action(effectSchema, uniqueSlugGuard((data) => ({ id: createEffect(data), reload: true })), { message: 'Эффект добавлен' }),
);

effectsRouter.post('/api/effects/reorder', action(idListSchema, ({ ids }) => reorderEffects(ids), { message: 'Порядок сохранён' }));

effectsRouter.post(
  '/api/effects/:id',
  action(
    effectSchema,
    uniqueSlugGuard((data, req) => {
      if (!updateEffect(idParam(req), data)) throw notFound('Эффект');
    }),
  ),
);

effectsRouter.post(
  '/api/effects/:id/delete',
  action(null, (_data, req) => {
    if (!deleteEffect(idParam(req))) throw notFound('Эффект');
  }, { message: 'Эффект удалён' }),
);
