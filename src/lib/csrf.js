import crypto from 'node:crypto';
import { baseCookieOptions } from './cookies.js';

// Double-submit cookie: токен лежит в httpOnly-cookie и дублируется в форме/заголовке.
// Сторонний сайт не может ни прочитать cookie, ни подставить свою.
const COOKIE = 'csrf';

export const newCsrfToken = () => crypto.randomBytes(24).toString('base64url');

export const setCsrfCookie = (res, token) => res.cookie(COOKIE, token, baseCookieOptions());

export const csrfToken = (req, res, next) => {
  let token = req.cookies[COOKIE];
  if (!token || token.length !== 32) {
    token = newCsrfToken();
    setCsrfCookie(res, token);
  }
  res.locals.csrfToken = token;
  next();
};

const safeEqual = (a, b) => {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

export const verifyCsrf = (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const expected = req.cookies[COOKIE];
  const received = req.get('x-csrf-token') ?? req.body?._csrf;
  if (expected && received && safeEqual(expected, received)) return next();

  const message = 'Страница устарела. Обновите её и повторите действие.';
  if (/^\/(admin\/)?api\//.test(req.originalUrl) || req.is('json')) {
    return res.status(403).json({ ok: false, message });
  }
  return res.status(403).type('text').send(message);
};
