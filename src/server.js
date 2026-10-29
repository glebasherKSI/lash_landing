import crypto from 'node:crypto';
import path from 'node:path';
import compression from 'compression';
import express from 'express';
import helmet from 'helmet';
import { Eta } from 'eta';
import { ROOT, config } from './config.js';
import { cookieMiddleware } from './lib/cookies.js';
import { csrfToken } from './lib/csrf.js';
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

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", 'https://fonts.googleapis.com', (_req, res) => `'nonce-${res.locals.cspNonce}'`],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
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

app.use(
  express.static(path.join(ROOT, 'public'), {
    maxAge: config.isProd ? '7d' : 0,
    setHeaders: (res, filePath) => {
      if (filePath.includes(`${path.sep}uploads${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  }),
);

app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: true, limit: '256kb' }));
app.use(cookieMiddleware);
app.use(csrfToken);

app.use((req, res, next) => {
  res.view = (name, data = {}) => res.send(eta.render(name, { ...res.locals, ...data }));
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
