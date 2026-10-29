import { db } from '../db.js';

// Категории, услуги, эффекты и отзывы: простые CRUD-таблицы с ручной сортировкой.

const toBool = (row, ...keys) => {
  if (!row) return row;
  for (const key of keys) row[key] = Boolean(row[key]);
  return row;
};

const reorder = (table) => {
  const update = db.prepare(`UPDATE ${table} SET sort = ? WHERE id = ?`);
  return db.transaction((ids) => ids.forEach((id, index) => update.run(index, id)));
};

const nextSort = (table) => db.prepare(`SELECT COALESCE(MAX(sort), -1) + 1 FROM ${table}`).pluck();

/* ---------- Категории ---------- */

export const listCategories = () => db.prepare('SELECT * FROM categories ORDER BY sort, id').all();

export const createCategory = (name) =>
  db.prepare('INSERT INTO categories (name, sort) VALUES (?, ?)').run(name, nextSort('categories').get())
    .lastInsertRowid;

export const renameCategory = (id, name) => db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(name, id).changes;

export const deleteCategory = (id) => db.prepare('DELETE FROM categories WHERE id = ?').run(id).changes;

export const reorderCategories = reorder('categories');

/* ---------- Услуги ---------- */

const SERVICE_FIELDS = ['category_id', 'title', 'description', 'price_byn', 'duration_min', 'gradient', 'tile', 'is_popular', 'is_active'];

const serviceRow = (row) => toBool(row, 'is_popular', 'is_active');

export const listServices = ({ activeOnly = false } = {}) =>
  db
    .prepare(
      `SELECT s.*, c.name AS category_name FROM services s
       LEFT JOIN categories c ON c.id = s.category_id
       ${activeOnly ? 'WHERE s.is_active = 1' : ''}
       ORDER BY s.sort, s.id`,
    )
    .all()
    .map(serviceRow);

export const getService = (id) => serviceRow(db.prepare('SELECT * FROM services WHERE id = ?').get(id));

const serviceParams = (data) => ({ ...data, is_popular: data.is_popular ? 1 : 0, is_active: data.is_active ? 1 : 0 });

export const createService = (data) =>
  db
    .prepare(
      `INSERT INTO services (${SERVICE_FIELDS.join(', ')}, sort)
       VALUES (${SERVICE_FIELDS.map((f) => '@' + f).join(', ')}, @sort)`,
    )
    .run({ ...serviceParams(data), sort: nextSort('services').get() }).lastInsertRowid;

export const updateService = (id, data) =>
  db
    .prepare(`UPDATE services SET ${SERVICE_FIELDS.map((f) => `${f} = @${f}`).join(', ')} WHERE id = @id`)
    .run({ ...serviceParams(data), id }).changes;

export const setServiceActive = (id, isActive) =>
  db.prepare('UPDATE services SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, id).changes;

export const deleteService = (id) => db.prepare('DELETE FROM services WHERE id = ?').run(id).changes;

export const reorderServices = reorder('services');

/* ---------- Эффекты ---------- */

const effectRow = (row) => {
  if (!row) return row;
  const { profile_json, ...rest } = toBool(row, 'is_active');
  return { ...rest, profile: JSON.parse(profile_json) };
};

export const listEffects = ({ activeOnly = false } = {}) =>
  db
    .prepare(`SELECT * FROM effects ${activeOnly ? 'WHERE is_active = 1' : ''} ORDER BY sort, id`)
    .all()
    .map(effectRow);

export const getEffectBySlug = (slug) => effectRow(db.prepare('SELECT * FROM effects WHERE slug = ?').get(slug));

export const createEffect = ({ slug, name, description, profile, is_active }) =>
  db
    .prepare(
      `INSERT INTO effects (slug, name, description, profile_json, is_active, sort)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(slug, name, description, JSON.stringify(profile), is_active ? 1 : 0, nextSort('effects').get()).lastInsertRowid;

export const updateEffect = (id, { slug, name, description, profile, is_active }) =>
  db
    .prepare('UPDATE effects SET slug = ?, name = ?, description = ?, profile_json = ?, is_active = ? WHERE id = ?')
    .run(slug, name, description, JSON.stringify(profile), is_active ? 1 : 0, id).changes;

export const deleteEffect = (id) => db.prepare('DELETE FROM effects WHERE id = ?').run(id).changes;

export const reorderEffects = reorder('effects');

/* ---------- Отзывы ---------- */

export const listReviews = ({ activeOnly = false } = {}) =>
  db
    .prepare(`SELECT * FROM reviews ${activeOnly ? 'WHERE is_active = 1' : ''} ORDER BY sort, id`)
    .all()
    .map((row) => toBool(row, 'is_active'));

export const createReview = ({ author, text, rating, is_active }) =>
  db
    .prepare('INSERT INTO reviews (author, text, rating, is_active, sort) VALUES (?, ?, ?, ?, ?)')
    .run(author, text, rating, is_active ? 1 : 0, nextSort('reviews').get()).lastInsertRowid;

export const updateReview = (id, { author, text, rating, is_active }) =>
  db
    .prepare('UPDATE reviews SET author = ?, text = ?, rating = ?, is_active = ? WHERE id = ?')
    .run(author, text, rating, is_active ? 1 : 0, id).changes;

export const deleteReview = (id) => db.prepare('DELETE FROM reviews WHERE id = ?').run(id).changes;

export const reorderReviews = reorder('reviews');
