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
