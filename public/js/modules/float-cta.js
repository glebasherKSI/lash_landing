/**
 * Плавающая кнопка «Записаться»: появляется, когда первый экран ушёл вверх,
 * и прячется, пока на экране форма записи или футер.
 */
export const initFloatCta = () => {
  const button = document.querySelector('[data-float-cta]');
  const hero = document.querySelector('.hero');
  const blockers = [document.getElementById('booking'), document.querySelector('.footer')].filter(Boolean);
  if (!button || !hero || !('IntersectionObserver' in window)) return;

  let heroVisible = true;
  const blockersVisible = new Set();

  const update = () => {
    const visible = !heroVisible && blockersVisible.size === 0;
    button.classList.toggle('is-visible', visible);
    button.setAttribute('aria-hidden', String(!visible));
    button.tabIndex = visible ? 0 : -1;
  };

  new IntersectionObserver(([entry]) => {
    heroVisible = entry.isIntersecting;
    update();
  }, { rootMargin: '0px 0px -40% 0px' }).observe(hero);

  const blockerObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) blockersVisible.add(entry.target);
      else blockersVisible.delete(entry.target);
    }
    update();
  }, { threshold: 0.05 });
  blockers.forEach((el) => blockerObserver.observe(el));
};
