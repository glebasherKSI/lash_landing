import { config } from '../config.js';
import { getSecret, getSettings } from '../db/repos/settings.js';
import { formatDateLong, formatTime } from './time.js';
import { formatPhone } from '../../public/js/modules/phone.js';

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

const call = async (token, method, payload = {}, timeoutMs = TIMEOUT_MS) => {
  let res;
  try {
    res = await fetch(`${API}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
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

// Кнопка-ссылка работает только с https-адресом (на localhost её нет)
const adminRow = () =>
  config.SITE_URL.startsWith('https://') ? [[{ text: 'Открыть записи', url: `${config.SITE_URL}/admin/bookings` }]] : [];

const adminButton = () => {
  const rows = adminRow();
  return rows.length ? { reply_markup: { inline_keyboard: rows } } : {};
};

// Кнопки статуса под уведомлением зависят от текущего статуса записи
const statusKeyboard = (b) => {
  const rows = [];
  if (b.status === 'new') rows.push([{ text: '✅ Подтвердить', callback_data: `b:${b.id}:confirm` }, { text: '✖️ Отменить', callback_data: `b:${b.id}:ask` }]);
  if (b.status === 'confirmed') rows.push([{ text: '✖️ Отменить запись', callback_data: `b:${b.id}:ask` }]);
  return { inline_keyboard: [...rows, ...adminRow()] };
};

// Отмена в два шага: случайное нажатие в чате не должно освобождать время
const cancelAskKeyboard = (b) => ({
  inline_keyboard: [[{ text: 'Да, отменить', callback_data: `b:${b.id}:cancel` }, { text: 'Назад', callback_data: `b:${b.id}:back` }]],
});

const STATUS_LINES = { confirmed: '✅ Подтвердила', cancelled: '❌ Отменила', done: '☑️ Отметила выполненной', new: '↩️ Вернула в новые' };

const bookingText = (b) => {
  const lines = [
    '🗓 <b>Новая запись с сайта</b>',
    '',
    `<b>${escapeHtml(b.service_title)}</b>${b.effect_name ? ` · ${escapeHtml(b.effect_name)}` : ''}`,
    `${formatDateLong(b.date)}, ${formatTime(b.start_min)}–${formatTime(b.end_min)}`,
    `${b.price_byn} BYN`,
    '',
    `👤 ${escapeHtml(b.client_name)}`,
    `📞 ${escapeHtml(formatPhone(b.contact))}`,
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
      reply_markup: statusKeyboard({ id: booking.id, status: 'new' }),
    });
  } catch (error) {
    console.warn('telegram:', error.message);
  }
};

/* ---------- Кнопки статуса: нажатия приходят через getUpdates (сервер опрашивает Telegram сам) ---------- */

const ACTIONS = {
  confirm: { from: ['new'], to: 'confirmed', done: 'Запись подтверждена' },
  cancel: { from: ['new', 'confirmed'], to: 'cancelled', done: 'Запись отменена, время свободно' },
};
const STATUS_NAMES = { new: 'новая', confirmed: 'уже подтверждена', cancelled: 'уже отменена', done: 'уже выполнена' };

/**
 * Нажатие кнопки под уведомлением. Принимается только из группы, указанной в настройках.
 * repo: { getBooking, setBookingStatus } — передаётся снаружи, чтобы проверять без базы.
 */
export const handleCallback = async (target, query, repo, send = call) => {
  const answer = (text) => send(target.token, 'answerCallbackQuery', { callback_query_id: query.id, text });
  const message = query.message;
  if (!message || String(message.chat.id) !== String(target.chatId)) return answer('Эта кнопка работает только в группе уведомлений');
  const [, rawId, action] = /^b:(\d+):(\w+)$/.exec(query.data ?? '') ?? [];
  const booking = rawId ? repo.getBooking(Number(rawId)) : null;
  if (!booking) return answer('Запись не найдена — возможно, её удалили');
  const edit = (payload) => send(target.token, 'editMessageReplyMarkup', { chat_id: message.chat.id, message_id: message.message_id, ...payload });

  if (action === 'ask' || action === 'back') {
    if (action === 'ask' && !ACTIONS.cancel.from.includes(booking.status)) return answer(`Запись ${STATUS_NAMES[booking.status]}`);
    await edit({ reply_markup: action === 'ask' ? cancelAskKeyboard(booking) : statusKeyboard(booking) });
    return answer(action === 'ask' ? 'Точно отменить запись?' : '');
  }

  const rule = ACTIONS[action];
  if (!rule) return answer('');
  if (!rule.from.includes(booking.status)) {
    // статус уже поменяли в админке: просто привести кнопки в порядок
    await edit({ reply_markup: statusKeyboard(booking) }).catch(() => {});
    return answer(`Запись ${STATUS_NAMES[booking.status]}`);
  }
  repo.setBookingStatus(booking.id, rule.to);
  const updated = { ...booking, status: rule.to };
  const who = escapeHtml([query.from?.first_name, query.from?.last_name].filter(Boolean).join(' ') || 'мастер');
  await send(target.token, 'editMessageText', {
    chat_id: message.chat.id,
    message_id: message.message_id,
    text: `${bookingText(updated)}\n\n${STATUS_LINES[rule.to]} ${who}`,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: statusKeyboard(updated),
  });
  return answer(rule.done);
};

// Группы, куда добавлен бот, по событиям Telegram; общая логика для опроса и кнопки «Найти группы»
const collectChats = (updates, chats) => {
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
  return chats;
};

const ALLOWED_UPDATES = ['message', 'my_chat_member', 'channel_post', 'callback_query'];
const POLL_SECONDS = 25;
const IDLE_MS = 15_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Опрос идёт, пока уведомления включены. Группы, замеченные опросом, отдаёт «Найти группы»:
// второй getUpdates с тем же токеном забрал бы события у опроса
const poller = { token: null, offset: 0, chats: new Map() };

/** Фоновый опрос Telegram: нажатия кнопок статуса и события групп. Один процесс — один опрос. */
export const startTelegramPolling = (repo) => {
  const loop = async () => {
    for (;;) {
      const target = getTelegramTarget();
      if (!target) {
        poller.token = null;
        await sleep(IDLE_MS);
        continue;
      }
      if (poller.token !== target.token) Object.assign(poller, { token: target.token, offset: 0, chats: new Map() });
      try {
        const updates = await call(target.token, 'getUpdates', { offset: poller.offset, timeout: POLL_SECONDS, allowed_updates: ALLOWED_UPDATES }, (POLL_SECONDS + 10) * 1000);
        for (const u of updates) {
          poller.offset = u.update_id + 1;
          collectChats([u], poller.chats);
          if (u.callback_query) await handleCallback(target, u.callback_query, repo).catch((e) => console.warn('telegram callback:', e.message));
        }
      } catch (error) {
        console.warn('telegram poll:', error.message);
        await sleep(IDLE_MS);
      }
    }
  };
  loop();
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
  if (poller.token === token) return { bot: me.username, chats: [...poller.chats.values()] };
  const updates = await call(token, 'getUpdates', { limit: 100, allowed_updates: ALLOWED_UPDATES });
  return { bot: me.username, chats: [...collectChats(updates, new Map()).values()] };
};
