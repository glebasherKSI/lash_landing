import path from 'node:path';
import { Router } from 'express';
import argon2 from 'argon2';
import rateLimit from 'express-rate-limit';
import { ROOT, config } from '../../config.js';
import { newCsrfToken, setCsrfCookie, verifyCsrf } from '../../lib/csrf.js';
import { endSession, isAuthenticated, requireAdmin, startSession } from '../../lib/session.js';
import { countBookingsByStatus } from '../../db/repos/bookings.js';
import { getSettings } from '../../db/repos/settings.js';
import { servicesRouter } from './services.js';
import { worksRouter } from './works.js';
import { bookingsRouter } from './bookings.js';
import { scheduleRouter } from './schedule.js';
import { settingsRouter } from './settings.js';
import { effectsRouter } from './effects.js';
import { integrationsRouter } from './integrations.js';
import { analyticsRouter } from './analytics.js';
import { storyRouter } from './story.js';

export const adminRouter = Router();

adminRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex, nofollow');
  next();
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).view('admin/login', { error: 'Слишком много попыток. Подождите 15 минут и попробуйте снова.' }),
});

adminRouter.get('/login', (req, res) => {
  if (isAuthenticated(req)) return res.redirect(303, '/admin');
  res.view('admin/login', { error: null });
});

adminRouter.post('/login', loginLimiter, verifyCsrf, async (req, res) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const valid = password.length > 0 && password.length < 200 && (await argon2.verify(config.ADMIN_PASSWORD_HASH, password).catch(() => false));
  if (!valid) return res.status(401).view('admin/login', { error: 'Неверный пароль' });
  startSession(res);
  // новый CSRF-токен после входа
  const token = newCsrfToken();
  setCsrfCookie(res, token);
  res.redirect(303, '/admin');
});

adminRouter.post('/logout', verifyCsrf, (req, res) => {
  endSession(req, res);
  res.redirect(303, '/admin/login');
});

// Режим приложения: service worker и экран «Нет связи» доступны без входа
adminRouter.get('/sw.js', (_req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.type('application/javascript').sendFile(path.join(ROOT, 'public', 'js', 'admin-sw.js'));
});

adminRouter.get('/offline', (_req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.send(`<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>Нет связи</title>
<style nonce="${res.locals.cspNonce}">
body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#E4E5E8;color:#131315;font:16px/1.5 system-ui,sans-serif;padding:24px}
main{max-width:360px;background:#F7F7F8;border-radius:28px;padding:32px 24px;text-align:center}
h1{font-weight:400;font-size:28px;margin:0 0 8px}p{color:#62626A;margin:0 0 24px}
a{display:inline-flex;min-height:52px;align-items:center;padding:0 28px;border-radius:999px;background:#131315;color:#fff;text-decoration:none;font-weight:500}
</style></head><body><main><h1>Нет связи</h1><p>Проверьте интернет. Записи и настройки загрузятся, как только связь появится.</p>
<a href="/admin/bookings">Повторить</a></main></body></html>`);
});

adminRouter.use(requireAdmin);
adminRouter.use(verifyCsrf);

// Общие данные для всех страниц админки
adminRouter.use((req, res, next) => {
  const counts = countBookingsByStatus();
  res.locals.newBookings = counts.new ?? 0;
  res.locals.studioName = getSettings().studio_name;
  res.locals.currentPath = req.baseUrl + req.path;
  next();
});

adminRouter.get('/', (_req, res) => res.redirect(303, '/admin/bookings'));

adminRouter.use(bookingsRouter);
adminRouter.use(servicesRouter);
adminRouter.use(worksRouter);
adminRouter.use(scheduleRouter);
adminRouter.use(settingsRouter);
adminRouter.use(effectsRouter);
adminRouter.use(integrationsRouter);
adminRouter.use(analyticsRouter);
adminRouter.use(storyRouter);
