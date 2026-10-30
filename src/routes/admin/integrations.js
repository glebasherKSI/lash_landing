import { Router } from 'express';
import { getSecret, getSettings, saveSettings } from '../../db/repos/settings.js';
import { findChats, sendTestMessage, TelegramError } from '../../lib/telegram.js';
import { metrikaSettingsSchema, telegramSettingsSchema, telegramTestSchema } from '../../validation/schemas.js';
import { action } from './helpers.js';

export const integrationsRouter = Router();

/** «••••AbCd» — по последним символам видно, какой токен сохранён, сам токен в браузер не уходит. */
export const maskToken = (token) => (token ? `••••${token.slice(-4)}` : '');

const fail = (res, message, errors) => res.status(422).json({ ok: false, message, ...(errors ? { errors } : {}) });

// Токен из формы, а если поле пустое — сохранённый
const resolveToken = (input) => input || getSecret('telegram_bot_token');

integrationsRouter.post(
  '/api/integrations/telegram',
  action(telegramSettingsSchema, (data, _req, res) => {
    const token = resolveToken(data.telegram_bot_token);
    if (data.telegram_enabled && !token) {
      return fail(res, 'Укажите токен бота', { telegram_bot_token: 'Без токена бот не сможет отправлять сообщения' });
    }
    if (data.telegram_enabled && !data.telegram_chat_id) {
      return fail(res, 'Укажите группу', { telegram_chat_id: 'Нажмите «Найти группы» или впишите ID' });
    }
    const values = {
      telegram_enabled: data.telegram_enabled,
      telegram_chat_id: data.telegram_chat_id,
      telegram_chat_title: data.telegram_chat_title,
    };
    if (data.telegram_bot_token) values.telegram_bot_token = data.telegram_bot_token;
    saveSettings(values);
    return {
      message: data.telegram_enabled ? 'Уведомления включены' : 'Уведомления выключены',
      tokenMask: maskToken(token),
    };
  }),
);

integrationsRouter.post(
  '/api/integrations/telegram/test',
  action(telegramTestSchema, async (data, _req, res) => {
    const token = resolveToken(data.telegram_bot_token);
    const chatId = data.telegram_chat_id || getSettings().telegram_chat_id;
    if (!token) return fail(res, 'Сначала укажите токен бота', { telegram_bot_token: 'Нужен токен от @BotFather' });
    if (!chatId) return fail(res, 'Сначала укажите группу', { telegram_chat_id: 'Нажмите «Найти группы» или впишите ID' });
    try {
      await sendTestMessage({ token, chatId });
      return { message: 'Тестовое сообщение отправлено, проверьте группу' };
    } catch (error) {
      if (error instanceof TelegramError) return fail(res, error.message);
      throw error;
    }
  }),
);

integrationsRouter.post(
  '/api/integrations/telegram/chats',
  action(telegramTestSchema, async (data, _req, res) => {
    const token = resolveToken(data.telegram_bot_token);
    if (!token) return fail(res, 'Сначала укажите токен бота', { telegram_bot_token: 'Нужен токен от @BotFather' });
    try {
      const { bot, chats } = await findChats(token);
      return {
        bot,
        chats,
        message: chats.length
          ? `Найдено групп: ${chats.length}. Нажмите на нужную`
          : `Групп не найдено. Добавьте @${bot} в группу, напишите там любое сообщение и нажмите ещё раз`,
      };
    } catch (error) {
      if (error instanceof TelegramError) return fail(res, error.message);
      throw error;
    }
  }),
);

integrationsRouter.post(
  '/api/integrations/metrika',
  action(metrikaSettingsSchema, (data) => {
    saveSettings(data);
    return { message: data.metrika_id ? 'Метрика подключена' : 'Метрика отключена' };
  }),
);
