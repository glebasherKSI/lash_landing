import { config } from '../config.js';
import { getSecret, getSettings } from '../db/repos/settings.js';
import { formatDateLong, formatTime } from './time.js';

const API = 'https://api.telegram.org';
const TIMEOUT_MS = 8000;

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export class TelegramError extends Error {}

/** Ответ Telegram → понятное сообщение для мастера. */
const humanize = (code, description = '') => {
  const d = description.toLowerCase();
  if (code === 401 || code === 404) return 'Неверный токен бота. Скопируйте его заново у @BotFather.';
  if (d.includes('chat not found')) return 'Группа не найдена. Добавьте бота в группу и проверьте ID.';
  if (d.includes('kicked') || d.includes('not a member')) return 'Бота нет в группе. Добавьте его в группу заново.';
  if (d.includes('not enough rights') || d.includes('have no rights')) return 'У бота нет права писать в группу. Разрешите ему отправлять сообщения.';
  if (d.includes('group chat was upgraded')) return 'Группа стала супергруппой и сменила ID. Нажмите «Найти группы» ещё раз.';
  if (code === 409) return 'У бота включён webhook, поиск групп недоступен. Впишите ID группы вручную.';
  if (code === 429) return 'Telegram просит подождать. Попробуйте через минуту.';
  return `Telegram ответил ошибкой: ${description || code}`;
};

const call = async (token, method, payload = {}) => {
  let res;
  try {
    res = await fetch(`${API}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new TelegramError('Нет связи с Telegram. Проверьте позже.');
  }
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new TelegramError(humanize(data.error_code ?? res.status, data.description));
  return data.result;
};

/**
 * Куда слать уведомления: настройки из админки, а если там пусто — переменные .env.
 * null, если уведомления выключены или не настроены.
 */
export const getTelegramTarget = () => {
  const settings = getSettings();
  const token = getSecret('telegram_bot_token');
  if (settings.telegram_enabled && token && settings.telegram_chat_id) return { token, chatId: settings.telegram_chat_id };
  if (!token && !settings.telegram_chat_id && config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID) {
    return { token: config.TELEGRAM_BOT_TOKEN, chatId: config.TELEGRAM_CHAT_ID };
  }
  return null;
};

// Кнопка под сообщением работает только с https-адресом (на localhost её нет)
const adminButton = () =>
  config.SITE_URL.startsWith('https://')
    ? { reply_markup: { inline_keyboard: [[{ text: 'Открыть записи', url: `${config.SITE_URL}/admin/bookings` }]] } }
    : {};

const bookingText = (b) => {
  const lines = [
    '🗓 <b>Новая запись с сайта</b>',
    '',
    `<b>${escapeHtml(b.service_title)}</b>${b.effect_name ? ` · ${escapeHtml(b.effect_name)}` : ''}`,
    `${formatDateLong(b.date)}, ${formatTime(b.start_min)}–${formatTime(b.end_min)}`,
    `${b.price_byn} BYN`,
    '',
    `👤 ${escapeHtml(b.client_name)}`,
    `📞 ${escapeHtml(b.contact)}`,
  ];
  if (b.comment) lines.push(`💬 «${escapeHtml(b.comment)}»`);
  return lines.join('\n');
};

/** Уведомление о записи с сайта. Не бросает ошибок: запись важнее уведомления. */
export const notifyNewBooking = async (booking) => {
  const target = getTelegramTarget();
  if (!target) return;
  try {
    await call(target.token, 'sendMessage', {
      chat_id: target.chatId,
      text: bookingText(booking),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...adminButton(),
    });
  } catch (error) {
    console.warn('telegram:', error.message);
  }
};

/** Пробное сообщение из админки. Бросает TelegramError с понятным текстом. */
export const sendTestMessage = async ({ token, chatId }) => {
  const me = await call(token, 'getMe');
  await call(token, 'sendMessage', {
    chat_id: chatId,
    text: `✅ Уведомления подключены. Сюда будут приходить новые записи с сайта.\n\nБот: @${escapeHtml(me.username)}`,
    parse_mode: 'HTML',
    ...adminButton(),
  });
  return me;
};

/**
 * Группы, в которые добавлен бот, по последним событиям (getUpdates хранит их 24 часа).
 * Возвращает [{ id, title, type }] без дублей.
 */
export const findChats = async (token) => {
  const me = await call(token, 'getMe');
  const updates = await call(token, 'getUpdates', { limit: 100, allowed_updates: ['message', 'my_chat_member', 'channel_post'] });
  const chats = new Map();
  for (const u of updates) {
    const chat = u.my_chat_member?.chat ?? u.message?.chat ?? u.channel_post?.chat;
    const left = u.my_chat_member && ['left', 'kicked'].includes(u.my_chat_member.new_chat_member?.status);
    if (!chat || chat.type === 'private') continue;
    if (left) chats.delete(chat.id);
    else chats.set(chat.id, { id: String(chat.id), title: chat.title ?? String(chat.id), type: chat.type });
    // группа превратилась в супергруппу: у неё новый ID
    const migrated = u.message?.migrate_to_chat_id;
    if (migrated) {
      chats.delete(chat.id);
      chats.set(migrated, { id: String(migrated), title: chat.title ?? String(migrated), type: 'supergroup' });
    }
  }
  return { bot: me.username, chats: [...chats.values()] };
};
