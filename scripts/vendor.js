// Копирует GSAP из node_modules в public/vendor, чтобы не зависеть от CDN.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'public', 'vendor', 'gsap');
fs.mkdirSync(target, { recursive: true });

for (const file of ['gsap.min.js', 'ScrollTrigger.min.js']) {
  fs.copyFileSync(path.join(root, 'node_modules', 'gsap', 'dist', file), path.join(target, file));
}
console.log('GSAP скопирован в public/vendor/gsap');
