import { Router } from 'express';
import { listClientBookings, listClientStats, updateClient } from '../../db/repos/bookings.js';
import { daysBetween, formatDateLong, formatTime, todayISO } from '../../lib/time.js';
import { clientUpdateSchema } from '../../validation/schemas.js';
import { formatPhone, isValidPhone } from '../../../public/js/modules/phone.js';
import { action, notFound } from './helpers.js';
import { STATUS_LABELS } from './bookings.js';

export const clientsRouter = Router();

const SORTS = {
  recent: { label: 'Недавние', compare: () => 0 }, // запрос уже отдаёт по последней записи
  visits: { label: 'Частые', compare: (a, b) => b.visits - a.visits || b.spent - a.spent },
  spent: { label: 'По сумме', compare: (a, b) => b.spent - a.spent },
};

const clientUrl = (contact) => `/admin/clients/view?c=${encodeURIComponent(contact)}`;
const shortDate = (iso) => (iso ? formatDateLong(iso).split(',')[0] : '');

clientsRouter.get('/clients', (req, res) => {
  const sort = req.query.sort in SORTS ? req.query.sort : 'recent';
  const clients = listClientStats(todayISO())
    .sort(SORTS[sort].compare)
    .map((c) => ({ ...c, url: clientUrl(c.contact), phone: formatPhone(c.contact), valid: isValidPhone(c.contact), lastLabel: shortDate(c.last), nextLabel: shortDate(c.next) }));
  res.view('admin/clients', {
    title: 'Клиенты',
    clients,
    sort,
    sorts: Object.entries(SORTS).map(([value, s]) => ({ value, label: s.label })),
  });
});

/** Статистика одной клиентки по её записям. */
export const clientSummary = (bookings, today) => {
  const active = bookings.filter((b) => b.status !== 'cancelled');
  const visits = active.filter((b) => b.date <= today);
  const spent = visits.reduce((sum, b) => sum + b.price_byn, 0);
  const dates = [...new Set(visits.map((b) => b.date))].sort();
  const counts = {};
  for (const b of active) counts[b.service_title] = (counts[b.service_title] ?? 0) + 1;
  const favorite = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    visits: visits.length,
    cancelled: bookings.length - active.length,
    upcoming: active.length - visits.length,
    spent,
    average: visits.length ? Math.round(spent / visits.length) : 0,
    first: dates[0] ?? null,
    interval: dates.length > 1 ? Math.round(daysBetween(dates[0], dates.at(-1)) / (dates.length - 1)) : null,
    favorite,
  };
};

clientsRouter.get('/clients/view', (req, res) => {
  const contact = String(req.query.c ?? '');
  const bookings = listClientBookings(contact);
  if (!bookings.length) throw notFound('Клиентка');
  const today = todayISO();
  const stats = clientSummary(bookings, today);
  res.view('admin/client', {
    title: bookings[0].client_name,
    contact,
    name: bookings[0].client_name,
    phone: formatPhone(contact),
    valid: isValidPhone(contact),
    stats,
    firstLabel: shortDate(stats.first),
    history: bookings.map((b) => ({
      ...b,
      dateLabel: formatDateLong(b.date),
      time: formatTime(b.start_min),
      statusLabel: STATUS_LABELS[b.status],
      future: b.date > today,
    })),
  });
});

clientsRouter.post(
  '/api/client',
  action(clientUpdateSchema, ({ old_contact, client_name, contact, merge }, _req, res) => {
    if (!listClientBookings(old_contact).length) throw notFound('Клиентка');
    const other = contact !== old_contact ? listClientBookings(contact)[0] : null;
    if (other && !merge) {
      return void res.status(409).json({
        ok: false,
        message: `Этот номер уже у клиентки «${other.client_name}»`,
        confirm: `Номер ${formatPhone(contact)} уже записан на «${other.client_name}». Объединить записи в одну клиентку «${client_name}»?`,
        confirmOk: 'Объединить',
      });
    }
    updateClient(old_contact, { name: client_name, contact });
    return { redirect: clientUrl(contact), message: other ? 'Клиентки объединены' : 'Сохранено' };
  }),
);
