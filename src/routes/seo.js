import { Router } from 'express';
import { config } from '../config.js';
import { todayISO } from '../lib/time.js';

export const seoRouter = Router();

seoRouter.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api\n\nSitemap: ${config.SITE_URL}/sitemap.xml\n`);
});

seoRouter.get('/sitemap.xml', (_req, res) => {
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      `  <url><loc>${config.SITE_URL}/</loc><lastmod>${todayISO()}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>\n` +
      `</urlset>\n`,
  );
});
