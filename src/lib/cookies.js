import { config } from '../config.js';

export const parseCookies = (header = '') =>
  Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const eq = part.indexOf('=');
        if (eq === -1) return [part, ''];
        try {
          return [part.slice(0, eq), decodeURIComponent(part.slice(eq + 1))];
        } catch {
          return [part.slice(0, eq), ''];
        }
      }),
  );

export const cookieMiddleware = (req, _res, next) => {
  req.cookies = parseCookies(req.headers.cookie);
  next();
};

export const baseCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: config.isProd,
  path: '/',
});
