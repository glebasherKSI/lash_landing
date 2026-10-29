import { config } from '../config.js';
import { formatDateLong, formatTime } from './time.js';

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Уведомление мастеру о новой заявке. Не бросает ошибок: запись важнее уведомления. */
export const notifyNewBooking = async (booking) => {
  if (!config.TELEGRAM_BOT_TOKEN || !config.TELEGRAM_CHAT_ID) return;
  const lines = [
    '<b>Новая заявка</b>',
    `${escapeHtml(booking.service_title)}${booking.effect_name ? ' · ' + escapeHtml(booking.effect_name) : ''}`,
    `${formatDateLong(booking.date)}, ${formatTime(booking.start_min)}–${formatTime(booking.end_min)}`,
    `${booking.price_byn} BYN`,
    `${escapeHtml(booking.client_name)}, ${escapeHtml(booking.contact)}`,
  ];
  if (booking.comment) lines.push(`«${escapeHtml(booking.comment)}»`);
  try {
    const res = await fetch(`https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: config.TELEGRAM_CHAT_ID, text: lines.join('\n'), parse_mode: 'HTML' }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.warn('telegram: HTTP', res.status);
  } catch (error) {
    console.warn('telegram:', error.message);
  }
};
