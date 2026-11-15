// Записи в виде календаря: месяц листается без перезагрузки (стрелки, свайп), день выбирается мгновенно.
// Сетку и карточки рисует сервер; здесь только навигация и подмена разметки.

const SWIPE_MIN = 50;

export const initCalendar = ({ haptic = () => {} } = {}) => {
  const root = document.querySelector('[data-calendar]');
  if (!root) return;
  let controller = null;

  const pageUrl = (month, day) => `/admin/bookings?view=calendar&month=${month}${day ? `&day=${day}` : ''}`;

  // Уровень загрузки дня — через CSSOM: атрибут style запрещён политикой безопасности
  const paintLoad = () => root.querySelectorAll('[data-load]').forEach((el) => el.style.setProperty('--load', el.dataset.load));

  const selectDay = (iso) => {
    root.dataset.selected = iso;
    root.querySelectorAll('[data-cal-day]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.calDay === iso)));
    root.querySelectorAll('[data-cal-panel]').forEach((p) => (p.hidden = p.dataset.calPanel !== iso));
    history.replaceState(null, '', pageUrl(root.dataset.month, iso));
  };

  const fetchCalendar = async (href) => {
    controller?.abort();
    controller = new AbortController();
    const html = await fetch(href, { signal: controller.signal }).then((r) => r.text());
    return new DOMParser().parseFromString(html, 'text/html').querySelector('[data-calendar]');
  };

  // Другой месяц: старая сетка уезжает в сторону листания, приходит новая
  const goTo = async (href, direction) => {
    root.style.setProperty('--dir', direction);
    root.classList.add('is-leaving');
    try {
      const [next] = await Promise.all([fetchCalendar(href), new Promise((r) => setTimeout(r, 140))]);
      root.innerHTML = next.innerHTML;
      root.dataset.month = next.dataset.month;
      root.dataset.selected = next.dataset.selected;
      paintLoad();
      history.replaceState(null, '', pageUrl(next.dataset.month, next.dataset.selected));
      root.style.setProperty('--dir', -direction);
      root.getBoundingClientRect(); // зафиксировать стартовую позицию перед въездом
      root.classList.remove('is-leaving');
    } catch (error) {
      if (error.name !== 'AbortError') location.href = href;
    }
  };

  // После смены статуса пересчитать загрузку и итоги, не трогая открытые карточки
  const refreshTop = async () => {
    try {
      const next = await fetchCalendar(pageUrl(root.dataset.month, root.dataset.selected));
      root.querySelector('[data-cal-top]').innerHTML = next.querySelector('[data-cal-top]').innerHTML;
      paintLoad();
    } catch {}
  };

  root.addEventListener('click', (event) => {
    const day = event.target.closest('[data-cal-day]');
    if (day) {
      if (day.getAttribute('aria-pressed') === 'true') return;
      haptic();
      selectDay(day.dataset.calDay);
      // на телефоне день под сеткой: показать его начало, если он ниже экрана
      const panel = root.querySelector(`[data-cal-panel="${day.dataset.calDay}"]`);
      if (panel.getBoundingClientRect().top > innerHeight - 120) panel.scrollIntoView({ block: 'start', behavior: 'smooth' });
      return;
    }
    const shift = event.target.closest('a[data-cal-shift]');
    if (!shift || event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    goTo(shift.href, Math.sign(Number(shift.dataset.calShift)) || 0);
  });

  // Свайп по сетке листает месяцы
  let touch = null;
  root.addEventListener('touchstart', (event) => {
    if (!event.target.closest('[data-cal-swipe]')) return;
    touch = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }, { passive: true });
  root.addEventListener('touchend', (event) => {
    if (!touch) return;
    const dx = event.changedTouches[0].clientX - touch.x;
    const dy = event.changedTouches[0].clientY - touch.y;
    touch = null;
    if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    root.querySelector(`[data-cal-shift="${dx < 0 ? 1 : -1}"].icon-btn`)?.click();
  });

  document.addEventListener('booking:changed', refreshTop);
  paintLoad();
};
