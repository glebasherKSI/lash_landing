import { Router } from 'express';
import {
  createCategory,
  createService,
  deleteCategory,
  deleteService,
  getService,
  listCategories,
  listServices,
  renameCategory,
  reorderCategories,
  reorderServices,
  setServiceActive,
  updateService,
} from '../../db/repos/catalog.js';
import { formatDuration } from '../../lib/format.js';
import { categorySchema, GRADIENTS, idListSchema, serviceSchema, TILES } from '../../validation/schemas.js';
import { action, idParam, notFound } from './helpers.js';

export const servicesRouter = Router();

const GRADIENT_LABELS = { blue: 'Голубой', pink: 'Розовый', gray: 'Серый', dark: 'Тёмный' };
const TILE_LABELS = { '1x1': '1×1', '2x1': '2×1 (широкая)', '1x2': '1×2 (высокая)' };

servicesRouter.get('/services', (_req, res) => {
  res.view('admin/services', {
    title: 'Услуги',
    services: listServices(),
    categories: listCategories(),
    gradients: GRADIENTS.map((value) => ({ value, label: GRADIENT_LABELS[value] })),
    tiles: TILES.map((value) => ({ value, label: TILE_LABELS[value] })),
    formatDuration,
  });
});

servicesRouter.post('/api/services', action(serviceSchema, (data) => ({ id: createService(data) }), { message: 'Услуга добавлена' }));

servicesRouter.post(
  '/api/services/reorder',
  action(idListSchema, ({ ids }) => reorderServices(ids), { message: 'Порядок сохранён' }),
);

servicesRouter.post(
  '/api/services/:id',
  action(serviceSchema, (data, req) => {
    if (!updateService(idParam(req), data)) throw notFound('Услуга');
  }),
);

servicesRouter.post(
  '/api/services/:id/toggle',
  action(null, (_data, req) => {
    const service = getService(idParam(req));
    if (!service) throw notFound('Услуга');
    setServiceActive(service.id, !service.is_active);
    return { is_active: !service.is_active, message: service.is_active ? 'Услуга скрыта с сайта' : 'Услуга снова на сайте' };
  }),
);

servicesRouter.post(
  '/api/services/:id/delete',
  action(null, (_data, req) => {
    if (!deleteService(idParam(req))) throw notFound('Услуга');
  }, { message: 'Услуга удалена' }),
);

/* ---------- Категории ---------- */

servicesRouter.post('/api/categories', action(categorySchema, ({ name }) => ({ id: createCategory(name) }), { message: 'Вкладка добавлена' }));

servicesRouter.post(
  '/api/categories/reorder',
  action(idListSchema, ({ ids }) => reorderCategories(ids), { message: 'Порядок сохранён' }),
);

servicesRouter.post(
  '/api/categories/:id',
  action(categorySchema, ({ name }, req) => {
    if (!renameCategory(idParam(req), name)) throw notFound('Вкладка');
  }),
);

servicesRouter.post(
  '/api/categories/:id/delete',
  action(null, (_data, req) => {
    if (!deleteCategory(idParam(req))) throw notFound('Вкладка');
  }, { message: 'Вкладка удалена' }),
);
