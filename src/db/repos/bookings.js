import { db } from '../db.js';

export const BOOKING_STATUSES = ['new', 'confirmed', 'cancelled', 'done'];

const selectBusy = db.prepare(
  "SELECT id, start_min AS start, end_min AS end FROM bookings WHERE date = ? AND status != 'cancelled'",
);

export const listBusyIntervals = (date, { excludeId } = {}) =>
  selectBusy.all(date).filter((row) => row.id !== excludeId);

export const listBookings = ({ status, fromDate, toDate } = {}) => {
  const where = [];
  const params = {};
  if (status) {
    where.push('status = @status');
    params.status = status;
  }
  if (fromDate) {
    where.push('date >= @fromDate');
    params.fromDate = fromDate;
  }
  if (toDate) {
    where.push('date <= @toDate');
    params.toDate = toDate;
  }
  return db
    .prepare(`SELECT * FROM bookings ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY date, start_min`)
    .all(params);
};

export const getBooking = (id) => db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);

export const countBookingsByStatus = () =>
  Object.fromEntries(
    db.prepare('SELECT status, COUNT(*) AS n FROM bookings GROUP BY status').all().map((r) => [r.status, r.n]),
  );

const insert = db.prepare(
  `INSERT INTO bookings (service_id, service_title, price_byn, duration_min, effect_slug, effect_name, date,
     start_min, end_min, client_name, contact, comment, status, source, ip)
   VALUES (@service_id, @service_title, @price_byn, @duration_min, @effect_slug, @effect_name, @date,
     @start_min, @end_min, @client_name, @contact, @comment, @status, @source, @ip)`,
);

export const insertBooking = (data) => insert.run(data).lastInsertRowid;

export const setBookingStatus = (id, status) =>
  db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, id).changes;

// Клиентки для подсказок в ручной записи: по номеру — последнее имя, число визитов, последний визит.
// SQLite берёт client_name из строки с MAX(date) — так подставляется самое свежее имя.
const selectClients = db.prepare(
  `SELECT contact, client_name AS name, COUNT(*) AS visits, MAX(date) AS last
   FROM bookings WHERE status != 'cancelled' AND contact LIKE '+375%' AND length(contact) = 13
   GROUP BY contact ORDER BY last DESC LIMIT 1000`,
);

export const listClients = () => selectClients.all();

/* ---------- Клиентки (раздел «Клиенты»): отдельной таблицы нет, клиентка — это номер в записях ---------- */

// Статистика по каждому номеру; визит — неотменённая запись не позже сегодняшнего дня
const selectClientStats = db.prepare(
  `SELECT contact,
     client_name AS name,
     SUM(status != 'cancelled' AND date <= @today) AS visits,
     SUM(status != 'cancelled' AND date > @today) AS upcoming,
     SUM(status = 'cancelled') AS cancelled,
     SUM(CASE WHEN status != 'cancelled' AND date <= @today THEN price_byn ELSE 0 END) AS spent,
     MIN(CASE WHEN status != 'cancelled' THEN date END) AS first,
     MAX(CASE WHEN status != 'cancelled' AND date <= @today THEN date END) AS last,
     MIN(CASE WHEN status != 'cancelled' AND date > @today THEN date END) AS next,
     MAX(created_at) AS touched
   FROM bookings GROUP BY contact ORDER BY touched DESC`,
);

export const listClientStats = (today) => selectClientStats.all({ today });

export const listClientBookings = (contact) =>
  db.prepare('SELECT * FROM bookings WHERE contact = ? ORDER BY date DESC, start_min DESC').all(contact);

/** Новые имя и номер — во всех записях клиентки. Если номер уже чей-то, записи объединяются. */
export const updateClient = db.transaction((oldContact, { name, contact }) =>
  db.prepare('UPDATE bookings SET client_name = ?, contact = ? WHERE contact = ? OR contact = ?').run(name, contact, oldContact, contact).changes,
);
