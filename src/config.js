import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

dotenv.config({ path: path.join(ROOT, '.env'), quiet: true });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('127.0.0.1'),
  SITE_URL: z.url().default('http://localhost:3000'),
  DB_PATH: z.string().default('data/app.db'),
  ADMIN_PASSWORD_HASH: z.string().startsWith('$argon2', 'ADMIN_PASSWORD_HASH должен быть argon2-хешем (npm run hash-password)'),
  SESSION_TTL_HOURS: z.coerce.number().positive().default(12),
  TRUST_PROXY: z.stringbool().default(false),
  TELEGRAM_BOT_TOKEN: z.string().optional().default(''),
  TELEGRAM_CHAT_ID: z.string().optional().default(''),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Ошибка в .env:\n' + z.prettifyError(parsed.error));
  process.exit(1);
}

export const config = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
  dbFile: path.resolve(ROOT, parsed.data.DB_PATH),
  uploadsDir: path.join(ROOT, 'public', 'uploads'),
  timezone: 'Europe/Minsk',
};
