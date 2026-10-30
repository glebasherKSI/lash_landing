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
  // Уведомления о записях в Telegram-группу
  telegram_enabled: false,
  telegram_bot_token: '',
  telegram_chat_id: '',
  telegram_chat_title: '',
  // Яндекс Метрика
  metrika_id: '',
  metrika_webvisor: true,
};

// Секреты не попадают в getSettings(): этот объект уходит в шаблоны сайта и админки.
const SECRET_KEYS = ['telegram_bot_token'];

const selectAll = db.prepare('SELECT key, value FROM settings');
const upsert = db.prepare(
  'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
);

const readAll = () => ({
  ...SETTINGS_DEFAULTS,
  ...Object.fromEntries(selectAll.all().map((row) => [row.key, JSON.parse(row.value)])),
});

export const getSettings = () => {
  const settings = readAll();
  for (const key of SECRET_KEYS) delete settings[key];
  return settings;
};

/** Значение секретной настройки (например, токен бота) — только для серверного кода. */
export const getSecret = (key) => {
  if (!SECRET_KEYS.includes(key)) throw new Error(`Не секретная настройка: ${key}`);
  return readAll()[key];
};

export const saveSettings = db.transaction((values) => {
  for (const [key, value] of Object.entries(values)) {
    if (!(key in SETTINGS_DEFAULTS)) throw new Error(`Неизвестная настройка: ${key}`);
    upsert.run(key, JSON.stringify(value));
  }
});
