import { fieldErrors } from '../../validation/schemas.js';

/** POST-обработчик админки: валидация zod → действие → JSON { ok, message }. */
export const action = (schema, handler, { message = 'Сохранено' } = {}) => async (req, res) => {
  let data = req.body ?? {};
  if (schema) {
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      return res.status(422).json({ ok: false, message: 'Проверьте выделенные поля', errors: fieldErrors(parsed.error) });
    }
    data = parsed.data;
  }
  const result = await handler(data, req, res);
  if (res.headersSent) return;
  res.json({ ok: true, message, ...(result ?? {}) });
};

export const idParam = (req) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error('Некорректный идентификатор');
    error.status = 400;
    throw error;
  }
  return id;
};

export const notFound = (what = 'Запись') => {
  const error = new Error(`${what} не найдена. Обновите страницу.`);
  error.status = 404;
  return error;
};
