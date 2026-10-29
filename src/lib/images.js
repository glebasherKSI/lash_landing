import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { config } from '../config.js';

export const WORKS_DIR = path.join(config.uploadsDir, 'works');
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'heif', 'avif']);

const SIZES = [
  { suffix: '1600', width: 1600, quality: 80 },
  { suffix: '600', width: 600, quality: 74 },
];

export class ImageError extends Error {}

/**
 * Проверяет, что буфер — настоящее изображение (по содержимому, а не по расширению),
 * и сохраняет WebP 1600 px и миниатюру 600 px. EXIF и геометка удаляются.
 */
export const saveWorkImage = async (buffer) => {
  let meta;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    throw new ImageError('Файл не похож на изображение');
  }
  if (!ALLOWED_FORMATS.has(meta.format)) throw new ImageError('Поддерживаются JPG, PNG, WebP, HEIC');

  await fs.mkdir(WORKS_DIR, { recursive: true });
  const fileKey = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
  let size = null;

  for (const { suffix, width, quality } of SIZES) {
    const info = await sharp(buffer)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality })
      .toFile(path.join(WORKS_DIR, `${fileKey}-${suffix}.webp`));
    size ??= { width: info.width, height: info.height };
  }
  return { file_key: fileKey, ...size };
};

export const removeWorkImage = async (fileKey) => {
  await Promise.all(
    SIZES.map(({ suffix }) => fs.rm(path.join(WORKS_DIR, `${fileKey}-${suffix}.webp`), { force: true })),
  );
};
