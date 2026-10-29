import { db } from '../db.js';

// Значения по умолчанию: всё, что не сохранено в БД, берётся отсюда.
export const SETTINGS_DEFAULTS = {
  master_name: 'Мастер',
  studio_name: 'Lash studio',
  city: 'Минск',
  address: '',
  metro: '',
  map_url: '',
  phone: '',
  telegram: '',
  instagram: '',
  whatsapp: '',
  accent_color: '#F2D2D8',
  hero_title: 'Ресницы под форму ваших глаз',
  hero_subtitle: '',
  seo_description: '',
  why_title: 'Почему я',
  why_items: [],
  visit_steps: [],
  rules: [],
  checklist: [],
  slot_step_min: 30,
  booking_horizon_days: 14,
  hero_work_id: null,
};

const selectAll = db.prepare('SELECT key, value FROM settings');
const upsert = db.prepare(
  'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
);

export const getSettings = () => {
  const stored = Object.fromEntries(selectAll.all().map((row) => [row.key, JSON.parse(row.value)]));
  return { ...SETTINGS_DEFAULTS, ...stored };
};

export const saveSettings = db.transaction((values) => {
  for (const [key, value] of Object.entries(values)) {
    if (!(key in SETTINGS_DEFAULTS)) throw new Error(`Неизвестная настройка: ${key}`);
    upsert.run(key, JSON.stringify(value));
  }
});
