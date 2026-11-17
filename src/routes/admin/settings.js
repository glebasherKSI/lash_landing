import { Router } from 'express';
import { getSecret, getSettings, saveSettings } from '../../db/repos/settings.js';
import { maskToken } from './integrations.js';
import { config } from '../../config.js';
import { mapUrl } from '../../lib/format.js';
import { settingsSchema } from '../../validation/schemas.js';
import { action, idParam, notFound } from './helpers.js';

export const settingsRouter = Router();

// Пустые строки из повторяющихся блоков (отзывы, правила) не сохраняем.
const compactItems = (body) => {
  const out = { ...body };
  for (const key of ['why_items', 'visit_steps', 'rules']) {
    out[key] = (Array.isArray(body[key]) ? body[key] : Object.values(body[key] ?? {})).filter(
      (item) => item && (item.title?.trim() || item.text?.trim()),
    );
  }
  out.checklist = (Array.isArray(body.checklist) ? body.checklist : Object.values(body.checklist ?? {}))
    .map((s) => String(s).trim())
    .filter(Boolean);
  return out;
};

settingsRouter.get('/settings', (_req, res) => {
  const settings = getSettings();
  const pad = (list, n) => [...list, ...Array.from({ length: Math.max(0, n - list.length) }, () => ({ title: '', text: '' }))];
  res.view('admin/settings', {
    title: 'Настройки сайта',
    s: settings,
    mapUrl: mapUrl(settings),
    tokenMask: maskToken(getSecret('telegram_bot_token')),
    siteHost: new URL(config.SITE_URL).host,
    whyItems: pad(settings.why_items, 4),
    visitSteps: pad(settings.visit_steps, 3),
    rules: pad(settings.rules, 4),
    checklist: [...settings.checklist, '', ''].slice(0, Math.max(settings.checklist.length + 2, 5)).slice(0, 10),
  });
});

settingsRouter.post('/api/settings', (req, res, next) => {
  req.body = compactItems(req.body ?? {});
  next();
}, action(settingsSchema, (data) => saveSettings(data)));

