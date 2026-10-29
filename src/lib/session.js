import crypto from 'node:crypto';
import { config } from '../config.js';
import { db } from '../db/db.js';
import { baseCookieOptions } from './cookies.js';

const COOKIE = 'sid';
const ttlMs = () => config.SESSION_TTL_HOURS * 3_600_000;
const hashId = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

const insertSession = db.prepare('INSERT INTO sessions (id, expires_at) VALUES (?, ?)');
const selectSession = db.prepare('SELECT * FROM sessions WHERE id = ? AND expires_at > ?');
const deleteSession = db.prepare('DELETE FROM sessions WHERE id = ?');
const purgeExpired = db.prepare('DELETE FROM sessions WHERE expires_at <= ?');

export const startSession = (res) => {
  purgeExpired.run(Date.now());
  const raw = crypto.randomBytes(32).toString('base64url');
  insertSession.run(hashId(raw), Date.now() + ttlMs());
  res.cookie(COOKIE, raw, { ...baseCookieOptions(), maxAge: ttlMs() });
};

export const endSession = (req, res) => {
  const raw = req.cookies[COOKIE];
  if (raw) deleteSession.run(hashId(raw));
  res.clearCookie(COOKIE, baseCookieOptions());
};

export const isAuthenticated = (req) => {
  const raw = req.cookies[COOKIE];
  return Boolean(raw && selectSession.get(hashId(raw), Date.now()));
};

export const requireAdmin = (req, res, next) => {
  if (isAuthenticated(req)) return next();
  if (req.path.startsWith('/api/') || req.get('x-csrf-token') !== undefined) {
    return res.status(401).json({ ok: false, message: 'Сессия истекла, войдите снова' });
  }
  return res.redirect(303, '/admin/login');
};
