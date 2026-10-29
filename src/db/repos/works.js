import { db } from '../db.js';

export const workUrls = (work) => ({
  ...work,
  src: `/uploads/works/${work.file_key}-1600.webp`,
  thumb: `/uploads/works/${work.file_key}-600.webp`,
  thumbHeight: Math.round((work.height / work.width) * 600),
});

export const listWorks = () => db.prepare('SELECT * FROM works ORDER BY sort, id').all().map(workUrls);

export const getWork = (id) => {
  const row = db.prepare('SELECT * FROM works WHERE id = ?').get(id);
  return row ? workUrls(row) : null;
};

export const createWork = ({ file_key, width, height, caption }) =>
  db
    .prepare(
      `INSERT INTO works (file_key, width, height, caption, sort)
       VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(sort), -1) + 1 FROM works))`,
    )
    .run(file_key, width, height, caption).lastInsertRowid;

export const updateWorkCaption = (id, caption) =>
  db.prepare('UPDATE works SET caption = ? WHERE id = ?').run(caption, id).changes;

export const updateWorkFocus = (id, { focus_x, focus_y, window_w }) =>
  db.prepare('UPDATE works SET focus_x = ?, focus_y = ?, window_w = ? WHERE id = ?').run(focus_x, focus_y, window_w, id).changes;

export const deleteWork = (id) => db.prepare('DELETE FROM works WHERE id = ?').run(id).changes;

export const reorderWorks = db.transaction((ids) => {
  const update = db.prepare('UPDATE works SET sort = ? WHERE id = ?');
  ids.forEach((id, index) => update.run(index, id));
});
