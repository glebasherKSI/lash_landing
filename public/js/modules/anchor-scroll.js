// Переходы к разделам по ссылкам «#…»: своя прокрутка вместо браузерной.
// Нативная плавная прокрутка проезжает 8–9 тысяч пикселей за секунду с шагом до 800px за кадр —
// глаз видит рывок. Здесь длинный путь сокращается: страница незаметно переносится на экран
// до цели, а последний экран доезжает плавно, с мягкой остановкой.

const OFFSET = 16; // как scroll-padding-top в site.css
const GLIDE_VIEWPORTS = 1; // столько экранов видно в пути при дальнем переходе
const DURATION = { min: 650, max: 950, perPx: 0.9 };
const CANCEL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

// Движение продолжается после переноса и долго, мягко тормозит (quart out):
// у expo первый кадр слишком резкий и читается как толчок
const easeOutQuart = (t) => 1 - (1 - t) ** 4;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const targetY = (el) => Math.min(
  el.getBoundingClientRect().top + scrollY - OFFSET,
  document.documentElement.scrollHeight - innerHeight,
);

/** Плавно доводит страницу до элемента. Возвращает функцию отмены. */
export const scrollToElement = (el, { onDone } = {}) => {
  const finish = () => onDone?.();
  if (reducedMotion()) {
    scrollTo({ top: targetY(el), behavior: 'instant' });
    finish();
    return () => {};
  }

  const glide = innerHeight * GLIDE_VIEWPORTS;
  const distance = targetY(el) - scrollY;
  // Дальний переход: перенос без анимации на экран до цели, дальше — плавный подъезд
  if (Math.abs(distance) > glide * 1.5) scrollTo({ top: targetY(el) - Math.sign(distance) * glide, behavior: 'instant' });

  const start = scrollY;
  const duration = Math.min(DURATION.max, Math.max(DURATION.min, Math.abs(targetY(el) - start) * DURATION.perPx));
  const startedAt = performance.now();
  let frame = 0;

  const cancel = () => {
    cancelAnimationFrame(frame);
    removeEventListener('wheel', cancel);
    removeEventListener('touchstart', cancel);
    removeEventListener('keydown', onKey);
  };
  const onKey = (event) => CANCEL_KEYS.has(event.key) && cancel();

  const step = (now) => {
    const progress = Math.min(1, (now - startedAt) / duration);
    // цель пересчитывается каждый кадр: догружающиеся фото не дают рывка в конце
    scrollTo({ top: start + (targetY(el) - start) * easeOutQuart(progress), behavior: 'instant' });
    if (progress < 1) frame = requestAnimationFrame(step);
    else {
      cancel();
      finish();
    }
  };

  addEventListener('wheel', cancel, { passive: true });
  addEventListener('touchstart', cancel, { passive: true });
  addEventListener('keydown', onKey);
  frame = requestAnimationFrame(step);
  return cancel;
};

/** Все ссылки «#раздел» на странице ведут к разделу плавно; адрес и фокус — как у обычной ссылки. */
export const initAnchorScroll = () => {
  let cancelCurrent = () => {};
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
    const hash = link.getAttribute('href');
    const target = hash.length > 1 && document.getElementById(decodeURIComponent(hash.slice(1)));
    if (!target) return;
    event.preventDefault();
    cancelCurrent();
    if (location.hash !== hash) history.pushState(null, '', hash);
    cancelCurrent = scrollToElement(target, {
      // фокус на раздел — клавиатура и скринридер продолжают с него
      onDone: () => {
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      },
    });
  });
};
