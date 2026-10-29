import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../config.js';

// Версия статики = хеш содержимого CSS/JS/вендоров. После каждого обновления кода меняется адрес
// (/a/<версия>/css/site.css), поэтому браузеры не держат устаревшие стили и модули из кеша.
const VERSIONED_DIRS = ['css', 'js', 'vendor'];

const listFiles = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? listFiles(full) : [full];
      })
    : [];

const computeVersion = () => {
  const hash = crypto.createHash('sha256');
  const files = VERSIONED_DIRS.flatMap((d) => listFiles(path.join(ROOT, 'public', d))).sort();
  for (const file of files) {
    hash.update(path.relative(ROOT, file));
    hash.update(fs.readFileSync(file));
  }
  return hash.digest('hex').slice(0, 10);
};

export const ASSET_VERSION = computeVersion();
export const ASSET_PREFIX = `/a/${ASSET_VERSION}`;

/** Адрес файла из public с версией: asset('/css/site.css') → '/a/<версия>/css/site.css'. */
export const asset = (publicPath) => `${ASSET_PREFIX}${publicPath}`;
