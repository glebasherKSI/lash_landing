import { Router } from 'express';
import {
  ALMOND_PATH,
  barRatio,
  buildLashLines,
  lashStrokes,
  LID_PATH,
  LOWER_LID_PATH,
  WINDOW_BOX,
} from '../../public/js/lash-geometry.js';
import { listCategories, listEffects, listReviews, listServices } from '../db/repos/catalog.js';
import { listWorkingHours } from '../db/repos/schedule.js';
import { getSettings } from '../db/repos/settings.js';
import { getWork, listWorks } from '../db/repos/works.js';
import { findNearestWindow } from '../lib/booking.js';
import { config } from '../config.js';
import { formatTime } from '../lib/time.js';
import {
  formatDuration,
  fullAddress,
  groupWorkingHours,
  mapUrl,
  phoneHref,
  splitTitleLines,
  telegramUrl,
} from '../lib/format.js';

export const publicRouter = Router();

// Профиль ресниц у окна на фото, если в базе нет ни одного эффекта
const HERO_PROFILE = [8, 9, 10, 11, 11];

const nearestLabel = (nearest) => {
  if (!nearest) return null;
  const day = nearest.daysFromToday === 0 ? 'сегодня' : nearest.daysFromToday === 1 ? 'завтра' : nearest.label;
  return { ...nearest, time: formatTime(nearest.start), dayText: day };
};

/** Три строки услуг на первом экране: сначала популярные, затем по порядку. */
const pickHeroServices = (services) =>
  [...services].sort((a, b) => Number(b.is_popular) - Number(a.is_popular) || a.sort - b.sort).slice(0, 3);

const buildServiceTabs = (categories, services) => {
  const tabs = categories
    .map((category) => ({ ...category, services: services.filter((s) => s.category_id === category.id) }))
    .filter((tab) => tab.services.length);
  const orphans = services.filter((s) => !categories.some((c) => c.id === s.category_id));
  if (orphans.length) tabs.push({ id: 0, name: 'Другое', services: orphans });
  return tabs;
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const buildJsonLd = (settings, workingHours, heroImage) => {
  return {
    '@context': 'https://schema.org',
    '@type': 'BeautySalon',
    name: settings.studio_name,
    description: settings.seo_description,
    url: config.SITE_URL,
    telephone: settings.phone || undefined,
    image: heroImage ? new URL(heroImage, config.SITE_URL).href : undefined,
    priceRange: 'BYN',
    address: {
      '@type': 'PostalAddress',
      streetAddress: settings.address,
      addressLocality: settings.city,
      addressCountry: 'BY',
    },
    openingHoursSpecification: workingHours
      .filter((d) => d.is_working)
      .map((d) => ({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: `https://schema.org/${DAY_NAMES[d.weekday]}`,
        opens: formatTime(d.start_min),
        closes: formatTime(d.end_min),
      })),
    hasMap: mapUrl(settings) || undefined,
    sameAs: [settings.instagram].filter(Boolean),
  };
};

publicRouter.get('/', (_req, res) => {
  const settings = getSettings();
  const services = listServices({ activeOnly: true });
  const effects = listEffects({ activeOnly: true });
  const works = listWorks();
  const workingHours = listWorkingHours();
  const heroWork = (settings.hero_work_id && getWork(settings.hero_work_id)) || null;
  const initialEffect = effects[0];

  res.view('public/index', {
    pageTitle: `Наращивание ресниц в ${settings.city === 'Минск' ? 'Минске' : settings.city} · ${settings.studio_name}`,
    pageDescription: settings.seo_description || settings.hero_subtitle,
    ogImage: heroWork?.src,
    preloadImage: heroWork && {
      href: heroWork.src,
      srcset: `${heroWork.thumb} 600w, ${heroWork.src} ${heroWork.width}w`,
      sizes: '(max-width: 900px) 100vw, 600px',
    },
    titleLines: splitTitleLines(settings.hero_title),
    heroLashes: lashStrokes(initialEffect?.profile ?? HERO_PROFILE),
    almondPath: ALMOND_PATH,
    windowBox: `${WINDOW_BOX.x} ${WINDOW_BOX.y} ${WINDOW_BOX.w} ${WINDOW_BOX.h}`,
    clientData: {
      services: services.map(({ id, title, price_byn, duration_min }) => ({ id, title, price: price_byn, duration: duration_min })),
      effects: effects.map(({ slug, name, description, profile }) => ({ slug, name, description, profile })),
    },
    scripts: ['/vendor/gsap/gsap.min.js', '/vendor/gsap/ScrollTrigger.min.js'],
    modules: ['/js/site.js'],
    settings,
    services,
    heroServices: pickHeroServices(services),
    tabs: buildServiceTabs(listCategories(), services),
    effects,
    initialEffect,
    initialLashes: initialEffect ? buildLashLines(initialEffect.profile) : [],
    lidPath: LID_PATH,
    lowerLidPath: LOWER_LID_PATH,
    barRatio,
    // фото первого экрана в галерее не повторяем
    works: works.filter((w) => w.id !== heroWork?.id),
    heroWork,
    reviews: listReviews({ activeOnly: true }),
    hours: groupWorkingHours(workingHours),
    nearest: nearestLabel(findNearestWindow(settings)),
    jsonLd: buildJsonLd(settings, workingHours, heroWork?.src),
    siteUrl: config.SITE_URL,
    formatDuration,
    telegramUrl: telegramUrl(settings.telegram),
    mapUrl: mapUrl(settings),
    fullAddress: fullAddress(settings),
    phoneHref: phoneHref(settings.phone),
  });
});

// Акцентный цвет из админки отдаётся отдельным CSS: строгий CSP запрещает inline-стили.
publicRouter.get('/theme.css', (_req, res) => {
  const { accent_color } = getSettings();
  res.type('text/css').set('Cache-Control', 'no-cache').send(`:root{--accent:${accent_color}}`);
});
