// Первый запуск в dev-режиме: создаёт .env со случайным паролем админа,
// применяет миграции, заполняет демо-данные и копирует GSAP.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import argon2 from 'argon2';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(root, '.env');

if (!fs.existsSync(envFile)) {
  const password = crypto.randomBytes(9).toString('base64url');
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  fs.writeFileSync(envFile, example.replace(/^ADMIN_PASSWORD_HASH=.*$/m, `ADMIN_PASSWORD_HASH=${hash}`));
  console.log('\n────────────────────────────────────────────');
  console.log(' Создан .env. Пароль администратора:');
  console.log(`   ${password}`);
  console.log(' Сохраните его: в файлах хранится только хеш.');
  console.log(' Сменить: npm run hash-password');
  console.log('────────────────────────────────────────────\n');
}

const run = (script) => execFileSync(process.execPath, [path.join(root, 'scripts', script)], { stdio: 'inherit' });

if (!fs.existsSync(path.join(root, 'public', 'vendor', 'gsap', 'gsap.min.js'))) run('vendor.js');
run('seed.js');
