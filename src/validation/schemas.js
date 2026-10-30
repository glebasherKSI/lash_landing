import { z } from 'zod';
import { isValidISODate, parseTime } from '../lib/time.js';

const trimmed = (max) => z.string().trim().max(max, `Не длиннее ${max} символов`);

const isoDate = z.string().refine(isValidISODate, 'Некорректная дата');

const timeHHMM = z
  .string()
  .refine((v) => parseTime(v) !== null, 'Время в формате ЧЧ:ММ')
  .transform((v) => parseTime(v));

const PHONE_RE = /^\+?[\d\s()-]{7,20}$/;
const TELEGRAM_RE = /^@?[a-zA-Z][a-zA-Z0-9_]{4,31}$/;

/** Телефон или ник в Telegram; нормализуется к «+375…» или «@nick». */
export const contactSchema = z
  .string()
  .trim()
  .min(1, 'Укажите телефон или Telegram')
  .max(40)
  .refine((v) => {
    if (TELEGRAM_RE.test(v)) return true;
    if (!PHONE_RE.test(v)) return false;
    const digits = v.replace(/\D/g, '');
    return digits.length >= 9 && digits.length <= 15;
  }, 'Телефон (например +375 29 123-45-67) или Telegram (@username)')
  .transform((v) => {
    if (TELEGRAM_RE.test(v)) return v.startsWith('@') ? v : '@' + v;
    const digits = v.replace(/\D/g, '');
    return v.trim().startsWith('+') ? '+' + digits : digits;
  });

export const bookingRequestSchema = z.object({
  service_id: z.coerce.number().int().positive('Выберите услугу'),
  effect_slug: z.string().trim().max(40).optional().or(z.literal('')).transform((v) => v || null),
  date: isoDate,
  time: timeHHMM,
  client_name: trimmed(60).min(2, 'Как к вам обращаться? Минимум 2 буквы'),
  contact: contactSchema,
  comment: trimmed(500).optional().default(''),
  // honeypot: живой человек это поле не видит и не заполняет
  website: z.string().max(0).optional().default(''),
});

export const slotsQuerySchema = z.object({
  service_id: z.coerce.number().int().positive(),
  date: isoDate.optional(),
});

/* ---------- Админка ---------- */

const checkbox = z.preprocess((v) => v === true || v === 'on' || v === '1' || v === 'true', z.boolean());

// Пустое поле — это «не заполнено», а не ноль.
const requiredInt = (label) =>
  z.preprocess(
    (v) => (v === '' || v == null ? undefined : Number(v)),
    z.number({ error: `Укажите ${label} числом` }).int(`${label[0].toUpperCase() + label.slice(1)} целым числом`),
  );

export const GRADIENTS = ['blue', 'pink', 'gray', 'dark'];
export const TILES = ['1x1', '2x1', '1x2'];

export const serviceSchema = z.object({
  title: trimmed(80).min(2, 'Название минимум 2 символа'),
  description: trimmed(400).default(''),
  category_id: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().int().positive().nullable()),
  price_byn: requiredInt('цену').pipe(z.number().min(0, 'Цена не может быть отрицательной').max(10000, 'Слишком большая цена')),
  duration_min: requiredInt('длительность').pipe(z.number().min(15, 'Минимум 15 минут').max(600, 'Максимум 600 минут')),
  gradient: z.enum(GRADIENTS),
  tile: z.enum(TILES),
  is_popular: checkbox,
  is_active: checkbox,
});

export const categorySchema = z.object({ name: trimmed(40).min(1, 'Введите название') });

export const idListSchema = z.object({ ids: z.array(z.coerce.number().int().positive()).max(500) });

const mm = z.coerce.number().min(4, 'Не короче 4 мм').max(18, 'Не длиннее 18 мм');

export const effectSchema = z.object({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9-]{1,30}$/, 'Код: латиница, цифры и дефис, например fox'),
  name: trimmed(40).min(1, 'Введите название'),
  description: trimmed(400).default(''),
  profile: z.array(mm).length(5, 'Нужно 5 значений'),
  is_active: checkbox,
});

export const reviewSchema = z.object({
  author: trimmed(60).min(1, 'Введите имя'),
  text: trimmed(800).min(5, 'Слишком короткий отзыв'),
  rating: z.coerce.number().int().min(1).max(5),
  is_active: checkbox,
});

export const workCaptionSchema = z.object({ caption: trimmed(120).default('') });

export const workFocusSchema = z.object({
  focus_x: z.coerce.number().min(0).max(100),
  focus_y: z.coerce.number().min(0).max(100),
  window_w: z.coerce.number().min(40, 'Окно не уже 40%').max(100, 'Окно не шире карточки'),
});

const dayHoursSchema = z
  .object({
    weekday: z.coerce.number().int().min(0).max(6),
    is_working: checkbox,
    start: timeHHMM,
    end: timeHHMM,
  })
  .refine((d) => !d.is_working || d.end > d.start, 'Конец рабочего дня позже начала')
  .transform((d) => ({ weekday: d.weekday, is_working: d.is_working, start_min: d.start, end_min: d.end }));

export const scheduleSchema = z.object({
  days: z.array(dayHoursSchema).length(7),
  slot_step_min: z.coerce.number().int().refine((v) => [10, 15, 20, 30, 45, 60].includes(v), 'Шаг: 10, 15, 20, 30, 45 или 60 минут'),
  booking_horizon_days: z.coerce.number().int().min(1, 'Минимум 1 день').max(60, 'Не больше 60 дней'),
});

export const exceptionSchema = z
  .object({
    date: isoDate,
    is_day_off: checkbox,
    start: z.string().optional(),
    end: z.string().optional(),
    note: trimmed(120).default(''),
  })
  .transform((d, ctx) => {
    if (d.is_day_off) return { date: d.date, is_day_off: true, start_min: null, end_min: null, note: d.note };
    const start = parseTime(d.start ?? '');
    const end = parseTime(d.end ?? '');
    if (start === null || end === null || end <= start) {
      ctx.addIssue({ code: 'custom', message: 'Укажите часы работы: конец позже начала', path: ['start'] });
      return z.NEVER;
    }
    return { date: d.date, is_day_off: false, start_min: start, end_min: end, note: d.note };
  });

const optionalUrl = z
  .string()
  .trim()
  .max(200)
  .refine((v) => v === '' || /^https:\/\/[^\s]+$/.test(v), 'Ссылка должна начинаться с https://');

const titledItem = z.object({ title: trimmed(80).min(1, 'Заполните заголовок'), text: trimmed(400).default('') });

export const settingsSchema = z.object({
  master_name: trimmed(60).min(1, 'Введите имя мастера'),
  studio_name: trimmed(60).min(1, 'Введите название студии'),
  city: trimmed(40),
  address: trimmed(120),
  metro: trimmed(60),
  map_url: optionalUrl,
  phone: trimmed(30),
  telegram: trimmed(40).transform((v) => v.replace(/^@/, '')),
  instagram: optionalUrl,
  whatsapp: optionalUrl,
  accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Цвет в формате #RRGGBB'),
  hero_title: trimmed(80).min(1, 'Заголовок не может быть пустым'),
  hero_subtitle: trimmed(240),
  seo_description: trimmed(200),
  why_title: trimmed(40),
  why_items: z.array(titledItem).max(4),
  visit_steps: z.array(titledItem).max(3),
  rules: z.array(titledItem).max(4),
  checklist: z.array(trimmed(160).min(1)).max(10),
});

export const bookingStatusSchema = z.object({ status: z.enum(['new', 'confirmed', 'cancelled', 'done']) });

export const adminBookingSchema = z.object({
  service_id: z.coerce.number().int().positive('Выберите услугу'),
  effect_slug: z.string().trim().max(40).optional().or(z.literal('')).transform((v) => v || null),
  date: isoDate,
  time: timeHHMM,
  client_name: trimmed(60).min(1, 'Введите имя клиента'),
  contact: trimmed(40).min(1, 'Введите контакт'),
  comment: trimmed(500).default(''),
  status: z.enum(['new', 'confirmed']).default('confirmed'),
  force: checkbox,
});

/** Первая понятная ошибка для каждого поля. */
export const fieldErrors = (error) => {
  const errors = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    errors[key] ??= issue.message;
  }
  return errors;
};

/* ---------- Интеграции ---------- */

const TELEGRAM_TOKEN_RE = /^\d{5,12}:[A-Za-z0-9_-]{30,50}$/;
// ID группы отрицательный (-100… у супергрупп); для канала можно @username
const TELEGRAM_CHAT_RE = /^(-?\d{5,20}|@[A-Za-z][A-Za-z0-9_]{4,31})$/;

const telegramToken = z
  .string()
  .trim()
  .refine((v) => v === '' || TELEGRAM_TOKEN_RE.test(v), 'Токен выглядит как 123456789:AAH… — скопируйте его у @BotFather целиком');

const telegramChat = z
  .string()
  .trim()
  .refine((v) => v === '' || TELEGRAM_CHAT_RE.test(v), 'ID группы — число, обычно начинается с -100. Нажмите «Найти группы»');

// Пустой токен значит «оставить сохранённый»
export const telegramSettingsSchema = z.object({
  telegram_enabled: checkbox,
  telegram_bot_token: telegramToken.default(''),
  telegram_chat_id: telegramChat.default(''),
  telegram_chat_title: trimmed(120).default(''),
});

export const telegramTestSchema = z.object({
  telegram_bot_token: telegramToken.default(''),
  telegram_chat_id: telegramChat.default(''),
});

export const metrikaSettingsSchema = z.object({
  metrika_id: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{5,12}$/.test(v), 'Номер счётчика — только цифры, например 98765432'),
  metrika_webvisor: checkbox,
});
