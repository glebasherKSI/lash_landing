import crypto from 'node:crypto';
import path from 'node:path';
import compression from 'compression';
import express from 'express';
import helmet from 'helmet';
import { Eta } from 'eta';
import { ROOT, config } from './config.js';
import { cookieMiddleware } from './lib/cookies.js';
import { csrfToken } from './lib/csrf.js';
import { ASSET_PREFIX, asset } from './lib/assets.js';
import { getSettings } from './db/repos/settings.js';
import { apiRouter } from './routes/api.js';
import { publicRouter } from './routes/public.js';
import { adminRouter } from './routes/admin/index.js';
import { seoRouter } from './routes/seo.js';

const eta = new Eta({ views: path.join(ROOT, 'src', 'views'), cache: config.isProd });

const app = express();
app.disable('x-powered-by');
if (config.TRUST_PROXY) app.set('trust proxy', 1);

app.use(compression());

// Nonce для единственного inline-стиля (акцентный цвет из настроек)
app.use((_req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
  next();
});

// Домены Яндекс Метрики (по документации Метрики: счётчик, пиксели, вебвизор)
const METRIKA_HOSTS = {
  script: ['https://mc.yandex.ru', 'https://mc.yandex.com', 'https://yastatic.net'],
  img: ['https://mc.yandex.ru', 'https://mc.yandex.by', 'https://mc.yandex.com'],
  connect: ['https://mc.yandex.ru', 'https://mc.yandex.by', 'https://mc.yandex.com', 'wss://mc.yandex.ru', 'wss://mc.yandex.com'],
  frame: ['blob:', 'https://mc.yandex.ru', 'https://mc.yandex.com'],
};
const metrikaOn = (res) => (res.locals.metrikaOn ??= Boolean(getSettings().metrika_id));
// Для CSP-директивы: хосты Метрики, если она включена; иначе безобидный повтор 'self'
const metrika = (kind) => (_req, res) => (metrikaOn(res) ? METRIKA_HOSTS[kind].join(' ') : "'self'");

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", metrika('script')],
        styleSrc: ["'self'", 'https://fonts.googleapis.com', (_req, res) => `'nonce-${res.locals.cspNonce}'`],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:', metrika('img')],
        connectSrc: ["'self'", metrika('connect')],
        frameSrc: ["'self'", metrika('frame')],
        childSrc: ["'self'", metrika('frame')],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: config.isProd ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    strictTransportSecurity: config.isProd,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }),
);

// Статика с версией в адресе: в продакшене содержимое под этим адресом не меняется, кешируем навсегда.
// В разработке версия считается при старте, а CSS правится без перезапуска, поэтому там без кеша.
app.use(
  ASSET_PREFIX,
  express.static(path.join(ROOT, 'public'), {
    index: false,
    ...(config.isProd ? { immutable: true, maxAge: '1y' } : { setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }),
  }),
);

// Адреса без версии (старые ссылки, favicon) браузер обязан перепроверять; фото уникальны и неизменны
app.use(
  express.static(path.join(ROOT, 'public'), {
    setHeaders: (res, filePath) => {
      const isUpload = filePath.includes(`${path.sep}uploads${path.sep}`);
      res.setHeader('Cache-Control', isUpload ? 'public, max-age=31536000, immutable' : 'no-cache');
    },
  }),
);

app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: true, limit: '256kb' }));
app.use(cookieMiddleware);
app.use(csrfToken);

app.use((req, res, next) => {
  res.locals.asset = asset;
  res.view = (name, data = {}) => {
    // HTML не берём из кеша без проверки: иначе он может разойтись со статикой новой версии
    res.set('Cache-Control', 'no-cache');
    res.send(eta.render(name, { ...res.locals, ...data }));
  };
  next();
});

app.use('/api', apiRouter);
app.use('/admin', adminRouter);
app.use(seoRouter);
app.use(publicRouter);

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ ok: false, message: 'Не найдено' });
  res.status(404).view('public/not-found', { title: 'Страница не найдена' });
});

app.use((error, req, res, _next) => {
  console.error(error);
  const status = error.status ?? error.statusCode ?? 500;
  const message = status < 500 ? error.message : 'Что-то пошло не так. Попробуйте ещё раз.';
  if (req.path.startsWith('/api/') || req.path.startsWith('/admin/api/')) return res.status(status).json({ ok: false, message });
  res.status(status).type('text').send(message);
});

app.listen(config.PORT, config.HOST, () => {
  console.log(`Сайт:    http://${config.HOST === '0.0.0.0' ? 'localhost' : config.HOST}:${config.PORT}`);
  console.log(`Админка: http://${config.HOST === '0.0.0.0' ? 'localhost' : config.HOST}:${config.PORT}/admin`);
});
