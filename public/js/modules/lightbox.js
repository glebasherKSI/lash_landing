import { prefersReducedMotion } from './motion.js';

const canAnimate = () => Boolean(window.gsap) && !prefersReducedMotion();

/** Сдвиг и масштаб, которые переносят прямоугольник `to` на место `from` (для FLIP). */
const flipDelta = (from, to) => ({
  x: from.left + from.width / 2 - (to.left + to.width / 2),
  y: from.top + from.height / 2 - (to.top + to.height / 2),
  scale: Math.max(from.width / to.width, from.height / to.height),
});

/** Просмотр работ в <dialog>: фото раскрывается из миниатюры, стрелки, Esc, свайп. */
export const initLightbox = () => {
  const dialog = document.getElementById('lightbox');
  const items = [...document.querySelectorAll('[data-lightbox]')];
  if (!dialog || !items.length) return;

  const img = dialog.querySelector('.lightbox__img');
  const caption = dialog.querySelector('.lightbox__caption');
  const controls = dialog.querySelectorAll('.icon-btn');
  let index = 0;
  let opener = null;
  let closing = false;

  const show = (i, { direction = 0 } = {}) => {
    index = (i + items.length) % items.length;
    const item = items[index];
    // Сразу миниатюра из кеша, затем полноразмерное фото
    img.src = item.querySelector('img').currentSrc || item.querySelector('img').src;
    img.width = Number(item.dataset.width);
    img.height = Number(item.dataset.height);
    img.alt = item.dataset.caption || 'Работа мастера';
    caption.textContent = item.dataset.caption || '';
    const full = new Image();
    full.onload = () => items[index] === item && (img.src = item.dataset.full);
    full.src = item.dataset.full;
    if (direction && canAnimate()) {
      window.gsap.fromTo(img, { x: direction * 60, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: 'expo.out' });
    }
  };

  const open = (i) => {
    opener = items[i];
    show(i);
    dialog.showModal();
    if (!canAnimate()) return;
    const g = window.gsap;
    const thumb = opener.querySelector('img').getBoundingClientRect();
    const d = flipDelta(thumb, img.getBoundingClientRect());
    g.timeline()
      .fromTo(dialog, { opacity: 0 }, { opacity: 1, duration: 0.35, ease: 'power1.out' }, 0)
      .fromTo(img, { x: d.x, y: d.y, scale: d.scale }, { x: 0, y: 0, scale: 1, duration: 0.7, ease: 'expo.out', clearProps: 'transform' }, 0)
      .fromTo(caption, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.4, clearProps: 'transform' }, 0.25)
      .fromTo(controls, { opacity: 0 }, { opacity: 1, duration: 0.4, stagger: 0.04 }, 0.3);
  };

  const close = () => {
    if (closing) return;
    if (!canAnimate() || !opener) return dialog.close();
    closing = true;
    const g = window.gsap;
    const target = items[index].querySelector('img');
    target.scrollIntoView({ block: 'nearest' });
    const d = flipDelta(target.getBoundingClientRect(), img.getBoundingClientRect());
    g.timeline({
      onComplete: () => {
        dialog.close();
        g.set([dialog, img, caption, ...controls], { clearProps: 'all' });
        closing = false;
      },
    })
      .to([caption, ...controls], { opacity: 0, duration: 0.15 }, 0)
      .to(img, { x: d.x, y: d.y, scale: d.scale, duration: 0.5, ease: 'expo.inOut' }, 0)
      .to(dialog, { opacity: 0, duration: 0.3, ease: 'power1.in' }, 0.2);
  };

  items.forEach((item, i) => item.addEventListener('click', () => open(i)));

  const multiple = items.length > 1;
  dialog.querySelector('[data-lightbox-prev]').hidden = !multiple;
  dialog.querySelector('[data-lightbox-next]').hidden = !multiple;

  dialog.addEventListener('click', (event) => {
    if (event.target.closest('[data-lightbox-close]') || event.target === dialog) close();
    else if (event.target.closest('[data-lightbox-prev]')) show(index - 1, { direction: -1 });
    else if (event.target.closest('[data-lightbox-next]')) show(index + 1, { direction: 1 });
  });

  // Esc: закрываем с анимацией вместо мгновенного закрытия
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });

  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') show(index - 1, { direction: -1 });
    if (event.key === 'ArrowRight') show(index + 1, { direction: 1 });
  });

  let touchX = null;
  dialog.addEventListener('touchstart', (e) => (touchX = e.touches[0].clientX), { passive: true });
  dialog.addEventListener('touchend', (e) => {
    if (touchX === null || !multiple) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1), { direction: dx < 0 ? 1 : -1 });
    touchX = null;
  });

  dialog.addEventListener('close', () => items[index]?.focus());
};
