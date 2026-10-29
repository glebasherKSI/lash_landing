import { Router } from 'express';
import multer from 'multer';
import { getSettings, saveSettings } from '../../db/repos/settings.js';
import { createWork, deleteWork, getWork, listWorks, reorderWorks, updateWorkCaption, updateWorkFocus } from '../../db/repos/works.js';
import { listEffects } from '../../db/repos/catalog.js';
import { ALMOND_PATH, lashStrokes, WINDOW_BOX } from '../../../public/js/lash-geometry.js';
import { ImageError, MAX_UPLOAD_BYTES, removeWorkImage, saveWorkImage } from '../../lib/images.js';
import { idListSchema, workCaptionSchema, workFocusSchema } from '../../validation/schemas.js';
import { action, idParam, notFound } from './helpers.js';

export const worksRouter = Router();

const MAX_FILES = 30;
const ALLOWED_MIME = /^image\/(jpeg|png|webp|heic|heif|avif)$/;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: MAX_FILES },
  fileFilter: (_req, file, cb) => cb(null, ALLOWED_MIME.test(file.mimetype)),
});

worksRouter.get('/works', (req, res) => {
  const works = listWorks();
  const heroWorkId = getSettings().hero_work_id;
  res.view('admin/works', {
    title: 'Работы',
    works,
    heroWorkId,
    heroWork: works.find((w) => w.id === heroWorkId) ?? null,
    // сразу после выбора фото для первого экрана открываем настройку окна
    openFocus: req.query.focus === '1',
    // для превью «окна-глаза» (тот же partial, что на сайте)
    heroLashes: lashStrokes(listEffects({ activeOnly: true })[0]?.profile ?? [8, 9, 10, 11, 11]),
    almondPath: ALMOND_PATH,
    windowBox: `${WINDOW_BOX.x} ${WINDOW_BOX.y} ${WINDOW_BOX.w} ${WINDOW_BOX.h}`,
    maxMb: MAX_UPLOAD_BYTES / 1024 / 1024,
  });
});

const uploadErrorMessage = (error) => {
  if (error.code === 'LIMIT_FILE_SIZE') return `Файл больше ${MAX_UPLOAD_BYTES / 1024 / 1024} МБ`;
  if (error.code === 'LIMIT_FILE_COUNT') return `За раз можно загрузить до ${MAX_FILES} фото`;
  return 'Не удалось загрузить файлы';
};

worksRouter.post('/api/works', (req, res, next) => {
  upload.array('photos', MAX_FILES)(req, res, async (error) => {
    if (error) return res.status(400).json({ ok: false, message: uploadErrorMessage(error) });
    try {
      const files = req.files ?? [];
      if (!files.length) return res.status(400).json({ ok: false, message: 'Выберите фото в формате JPG, PNG, WebP или HEIC' });

      const saved = [];
      const failed = [];
      for (const file of files) {
        try {
          const image = await saveWorkImage(file.buffer);
          saved.push(createWork({ ...image, caption: '' }));
        } catch (e) {
          if (!(e instanceof ImageError)) throw e;
          failed.push(`${file.originalname}: ${e.message}`);
        }
      }
      const message = failed.length
        ? `Загружено ${saved.length} из ${files.length}. Не подошли: ${failed.join('; ')}`
        : `Загружено фото: ${saved.length}`;
      res.status(saved.length ? 200 : 400).json({ ok: saved.length > 0, message, reload: saved.length > 0 });
    } catch (e) {
      next(e);
    }
  });
});

worksRouter.post('/api/works/reorder', action(idListSchema, ({ ids }) => reorderWorks(ids), { message: 'Порядок сохранён' }));

worksRouter.post(
  '/api/works/:id',
  action(workCaptionSchema, ({ caption }, req) => {
    if (!updateWorkCaption(idParam(req), caption)) throw notFound('Фото');
  }),
);

worksRouter.post(
  '/api/works/:id/focus',
  action(workFocusSchema, (data, req) => {
    if (!updateWorkFocus(idParam(req), data)) throw notFound('Фото');
  }, { message: 'Окно сохранено' }),
);

worksRouter.post(
  '/api/works/:id/hero',
  action(null, (_data, req) => {
    const work = getWork(idParam(req));
    if (!work) throw notFound('Фото');
    saveSettings({ hero_work_id: work.id });
    return { redirect: '/admin/works?focus=1' };
  }, { message: 'Фото на первом экране. Отметьте точку между глаз' }),
);

worksRouter.post(
  '/api/works/:id/delete',
  action(null, async (_data, req) => {
    const work = getWork(idParam(req));
    if (!work) throw notFound('Фото');
    deleteWork(work.id);
    if (getSettings().hero_work_id === work.id) saveSettings({ hero_work_id: null });
    await removeWorkImage(work.file_key);
  }, { message: 'Фото удалено' }),
);
