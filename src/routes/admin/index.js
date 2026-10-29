import { Router } from 'express';
import argon2 from 'argon2';
import rateLimit from 'express-rate-limit';
import { config } from '../../config.js';
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
