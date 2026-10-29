// Анимации на GSAP + ScrollTrigger: только transform и opacity.
// При prefers-reduced-motion ничего не прячется и не двигается: контент сразу виден.

const EASE_OUT = 'power3.out';
const EASE_SOFT = 'expo.out';
const PARALLAX_PX = 8;

const gsap = () => window.gsap;

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const canAnimate = () => Boolean(gsap()) && !prefersReducedMotion();
const finePointer = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/* ---------- Публичные помощники для других модулей ---------- */

/** Анимирует число 0→1, вызывая onUpdate(k). Возвращает функцию остановки. */
export const tweenNumber = ({ duration = 0.6, ease = 'power2.inOut', onUpdate }) => {
  if (!canAnimate()) {
    onUpdate(1);
    return () => {};
  }
  const state = { k: 0 };
  const tween = gsap().to(state, { k: 1, duration, ease, onUpdate: () => onUpdate(state.k) });
  return () => tween.kill();
};

/** Колбэк один раз, когда элемент впервые попал в экран (без анимаций — сразу). */
export const onFirstView = (el, callback, start = 'top 75%') => {
  if (!el) return;
  if (!canAnimate() || !window.ScrollTrigger) return callback();
  window.ScrollTrigger.create({ trigger: el, start, once: true, onEnter: callback });
};

/** Новые элементы списка (даты, время) появляются волной. */
export const animateListIn = (nodes) => {
  if (!canAnimate() || !nodes.length) return;
  gsap().fromTo(
    nodes,
    { opacity: 0, y: 10 },
    { opacity: 1, y: 0, duration: 0.45, ease: EASE_OUT, stagger: { each: 0.025, from: 'start' }, clearProps: 'transform,opacity' },
  );
};

/** Значение сменилось: старое уходит вверх, новое приходит снизу. */
export const animateValueChange = (el) => {
  if (!canAnimate() || !el) return;
  gsap().fromTo(el, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.4, ease: EASE_OUT, clearProps: 'transform,opacity' });
};

/** Число в тексте плавно досчитывает до нового значения. */
export const animateCount = (el, from, to, format) => {
  if (!canAnimate() || from === to || from == null) {
    el.textContent = format(to);
    return;
  }
  const state = { v: from };
  gsap().to(state, {
    v: to,
    duration: 0.6,
    ease: 'power2.out',
    onUpdate: () => (el.textContent = format(Math.round(state.v))),
  });
};

/** Смена панели вкладок: старые карточки уходят, новые приходят волной. */
export const swapPanels = (from, to) => {
  if (!canAnimate() || !from) {
    if (from) from.hidden = true;
    to.hidden = false;
    return;
  }
  const g = gsap();
  g.killTweensOf([...from.children, ...to.children]);
  g.to(from.children, {
    opacity: 0,
    y: -10,
    duration: 0.2,
    ease: 'power1.in',
    stagger: 0.02,
    onComplete: () => {
      from.hidden = true;
      g.set(from.children, { clearProps: 'transform,opacity' });
      to.hidden = false;
      g.fromTo(
        to.children,
        { opacity: 0, y: 32, scale: 0.97 },
        { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: EASE_SOFT, stagger: 0.05, clearProps: 'transform,opacity' },
      );
    },
  });
};

export const animateSuccess = (form, success) => {
  if (!canAnimate()) {
    form.hidden = true;
    success.hidden = false;
    return;
  }
  const g = gsap();
  g.timeline()
    .to(form, { opacity: 0, y: -8, duration: 0.25, ease: 'power1.in' })
    .add(() => {
      form.hidden = true;
      g.set(form, { clearProps: 'opacity,transform' });
      success.hidden = false;
    })
    .fromTo(success, { opacity: 0, y: 16, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: EASE_SOFT })
    .fromTo(success.querySelector('.success__circle'), { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.6, ease: 'power2.out' }, '<')
    .fromTo(success.querySelector('.success__tick'), { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.35, ease: 'power2.out' }, '-=0.15')
    .fromTo(success.querySelectorAll(':scope > :not(svg)'), { opacity: 0, y: 10 }, { opacity: 1, y: 0, stagger: 0.07, duration: 0.45, ease: EASE_OUT }, '-=0.3');
};

/* ---------- Первый экран ---------- */

const heroIntro = () => {
  const g = gsap();
  const lines = document.querySelectorAll('.hero__title .line__inner');
  const glass = document.querySelector('.photo-card .glass');
  const edgeLines = document.querySelectorAll('.eye-window__outline');
  const edgeLashes = document.querySelectorAll('.eye-window__lash');
  const illustrationLashes = document.querySelectorAll('.draw-lashes');
  const chips = document.querySelectorAll('.reveal-chip');
  const photo = document.querySelectorAll('.photo-card__media');
  if (!lines.length) return;

  const tl = g.timeline({ defaults: { ease: EASE_OUT } });
  const fadeUp = (targets, distance, vars, position) =>
    tl.fromTo(targets, { opacity: 0, y: distance }, { opacity: 1, y: 0, clearProps: 'transform', ...vars }, position);

  // Фото «проявляется» из лёгкого приближения
  if (photo) tl.fromTo(photo, { scale: 1.22 }, { scale: 1.1, duration: 1.8, ease: EASE_SOFT }, 0);
  tl.fromTo(lines, { yPercent: 110, opacity: 1 }, { yPercent: 0, duration: 1, stagger: 0.09, clearProps: 'transform' }, 0);
  fadeUp('.hero .eyebrow, .hero__lead', 12, { duration: 0.7, stagger: 0.08 }, 0.25);
  tl.set('.hero-services', { opacity: 1 }, 0.3);
  fadeUp('.hero-services > li', 18, { duration: 0.7, stagger: 0.07, ease: EASE_SOFT }, 0.35);
  // Главный момент: фото затягивает рифлёным стеклом, остаётся только «окно-глаз»,
  // его контур прорисовывается, затем ресницы одна за другой от внутреннего угла к внешнему
  if (glass) tl.fromTo(glass, { opacity: 0 }, { opacity: 1, duration: 1.1, ease: 'power2.inOut' }, 0.15);
  if (edgeLines.length) tl.to(edgeLines, { strokeDashoffset: 0, opacity: 1, duration: 0.9, ease: 'power2.inOut' }, 0.45);
  if (edgeLashes.length) tl.to(edgeLashes, { strokeDashoffset: 0, opacity: 1, duration: 0.45, ease: 'power2.out', stagger: 0.03 }, 0.9);
  if (illustrationLashes.length) tl.fromTo(illustrationLashes, { opacity: 0 }, { opacity: 1, duration: 0.8, stagger: 0.15 }, 0.55);
  if (chips.length) fadeUp(chips, 10, { duration: 0.6, stagger: 0.08 }, '-=0.25');
};

/** Фото под стеклом чуть смещается за курсором, будто смотришь сквозь окно. Только для мыши. */
const heroParallax = () => {
  if (!finePointer()) return;
  const card = document.querySelector('[data-parallax]');
  const layer = card?.querySelectorAll('.photo-card__media');
  if (!layer) return;
  const g = gsap();
  const toX = g.quickTo(layer, 'x', { duration: 0.8, ease: EASE_OUT });
  const toY = g.quickTo(layer, 'y', { duration: 0.8, ease: EASE_OUT });
  card.addEventListener('pointermove', (e) => {
    const r = card.getBoundingClientRect();
    toX(((e.clientX - r.left) / r.width - 0.5) * 2 * PARALLAX_PX);
    toY(((e.clientY - r.top) / r.height - 0.5) * 2 * PARALLAX_PX);
  });
  card.addEventListener('pointerleave', () => {
    toX(0);
    toY(0);
  });
};

/**
 * При прокрутке фото медленно приближается к точке фокуса (transform-origin = фокус),
 * поэтому глаза остаются в окне.
 */
const heroScroll = () => {
  const photo = document.querySelectorAll('.photo-card__media');
  const card = document.querySelector('.photo-card');
  if (!photo || !card) return;
  gsap().fromTo(
    photo,
    { scale: 1.1 },
    {
      scale: 1.2,
      ease: 'none',
      immediateRender: false,
      scrollTrigger: { trigger: card, start: 'top top', end: 'bottom top', scrub: 0.6 },
    },
  );
};

/* ---------- Заголовки по словам ---------- */

const splitWords = (el) => {
  if (el.dataset.split) return [];
  el.dataset.split = '1';
  const words = el.textContent.trim().split(/\s+/);
  el.setAttribute('aria-label', el.textContent.trim());
  el.replaceChildren(
    ...words.flatMap((word, i) => {
      const outer = document.createElement('span');
      outer.className = 'word';
      outer.setAttribute('aria-hidden', 'true');
      const inner = document.createElement('span');
      inner.className = 'word__inner';
      inner.textContent = word;
      outer.append(inner);
      return i < words.length - 1 ? [outer, document.createTextNode(' ')] : [outer];
    }),
  );
  return el.querySelectorAll('.word__inner');
};

const headingReveals = () => {
  const g = gsap();
  document.querySelectorAll('main .h2:not(.success__title), .footer__studio').forEach((heading) => {
    const words = splitWords(heading);
    if (!words.length) return;
    g.set(words, { yPercent: 110 });
    onFirstView(heading, () =>
      g.to(words, { yPercent: 0, duration: 1, ease: EASE_SOFT, stagger: 0.06, clearProps: 'transform' }), 'top 88%');
  });
  // Подписи над заголовками
  document.querySelectorAll('main .section .eyebrow').forEach((eyebrow) => {
    g.set(eyebrow, { opacity: 0, y: 10 });
    onFirstView(eyebrow, () => g.to(eyebrow, { opacity: 1, y: 0, duration: 0.6, ease: EASE_OUT, clearProps: 'transform' }), 'top 90%');
  });
};

/* ---------- Появление групп карточек ---------- */

/** Элементы скрыты заранее и появляются волной по мере того, как попадают в экран. */
const batchReveal = (targets, from, { stagger = 0.08, duration = 0.9, start = 'top 90%', ease = EASE_SOFT } = {}) => {
  const items = [...(typeof targets === 'string' ? document.querySelectorAll(targets) : targets)];
  if (!items.length) return;
  const g = gsap();
  const to = Object.fromEntries(Object.keys(from).map((k) => [k, k === 'opacity' || k.startsWith('scale') ? 1 : 0]));
  g.set(items, from);
  window.ScrollTrigger.batch(items, {
    start,
    once: true,
    onEnter: (batch) => g.to(batch, { ...to, duration, ease, stagger, overwrite: true, clearProps: 'transform,opacity' }),
  });
};

const whySection = () => {
  const section = document.querySelector('.why');
  if (!section) return;
  const g = gsap();
  const rings = [...section.querySelectorAll('.rings span')].reverse(); // от центра наружу
  const heading = section.querySelector('.why__heading');
  const [leftCol, rightCol] = section.querySelectorAll('.why__col');
  const wide = window.matchMedia('(min-width: 901px)').matches;

  g.set(rings, { scale: 0.3, opacity: 0 });
  g.set(heading, { scale: 0.85, opacity: 0 });
  onFirstView(section, () => {
    g.timeline()
      .to(rings, { scale: 1, opacity: 1, duration: 1.4, ease: EASE_SOFT, stagger: 0.12 })
      .to(heading, { scale: 1, opacity: 1, duration: 1, ease: EASE_SOFT }, 0.15);
  }, 'top 80%');

  // Карточки въезжают с боков на десктопе, снизу на телефоне
  batchReveal(leftCol?.children ?? [], wide ? { opacity: 0, x: -48 } : { opacity: 0, y: 32 }, { stagger: 0.12 });
  batchReveal(rightCol?.children ?? [], wide ? { opacity: 0, x: 48 } : { opacity: 0, y: 32 }, { stagger: 0.12 });

  // Кольца медленно «дышат» при прокрутке
  g.fromTo(section.querySelector('.rings'), { scale: 0.96 }, {
    scale: 1.04,
    ease: 'none',
    scrollTrigger: { trigger: section, start: 'top bottom', end: 'bottom top', scrub: 1 },
  });
};

const servicesSection = () => {
  batchReveal('.services .tab', { opacity: 0, y: 24 }, { stagger: 0.08 });
  batchReveal('.bento:not([hidden]) > *', { opacity: 0, y: 48, scale: 0.96 }, { stagger: 0.07, duration: 1 });
};

const effectSection = () => {
  batchReveal('.effect__text > *:not(.eyebrow):not(.h2)', { opacity: 0, y: 20 }, { stagger: 0.08 });
  batchReveal('.effect__scheme', { opacity: 0, y: 40, scale: 0.97 }, { duration: 1.1 });
};

const worksSection = () => {
  const items = document.querySelectorAll('.works__grid > li');
  batchReveal(items, { opacity: 0, y: 56 }, { stagger: 0.1, duration: 1.1 });
  // Внутри карточки фото «оседает» из приближения
  const imgs = document.querySelectorAll('.works__grid img');
  if (!imgs.length) return;
  gsap().set(imgs, { scale: 1.25 });
  window.ScrollTrigger.batch(imgs, {
    start: 'top 92%',
    once: true,
    onEnter: (batch) => gsap().to(batch, { scale: 1, duration: 1.6, ease: EASE_SOFT, stagger: 0.1, clearProps: 'transform' }),
  });
};

const visitSection = () => {
  const g = gsap();
  const steps = document.querySelectorAll('.steps > .step');
  batchReveal(steps, { opacity: 0, y: 40 }, { stagger: 0.14 });
  batchReveal('.step__num', { opacity: 0, x: -16 }, { stagger: 0.14, duration: 1.1 });

  // Линия прорисовывается вместе со скроллом и по пути зажигает точки шагов
  const line = document.querySelector('.steps__line span');
  if (!line || !window.matchMedia('(min-width: 721px)').matches) return;
  document.querySelector('.steps').classList.add('steps--js');
  g.set(line, { scaleX: 0 });
  g.to(line, {
    scaleX: 1,
    ease: 'none',
    scrollTrigger: {
      trigger: '.steps',
      start: 'top 85%',
      end: 'top 35%',
      scrub: 0.8,
      onUpdate: (self) => steps.forEach((step, i) => step.classList.toggle('is-lit', self.progress >= i / steps.length - 0.02)),
    },
  });
};

const rulesSection = () => {
  batchReveal('.rules__grid > li', { opacity: 0, y: 36 }, { stagger: 0.09 });
  batchReveal('.checklist', { opacity: 0, x: 40 }, { duration: 1.1 });
  batchReveal('.checklist li', { opacity: 0, x: 16 }, { stagger: 0.07, duration: 0.7 });
  batchReveal('.checklist__mark', { scale: 0 }, { stagger: 0.07, duration: 0.6, ease: 'back.out(2.2)' });
};

const reviewsSection = () => {
  batchReveal('.reviews__grid > li', { opacity: 0, y: 48, rotate: 1.5 }, { stagger: 0.12, duration: 1.1 });
  batchReveal('.review__stars svg', { scale: 0 }, { stagger: 0.04, duration: 0.5, ease: 'back.out(2.5)' });
};

const bookingSection = () => {
  batchReveal('.booking__steps > .bstep', { opacity: 0, y: 32 }, { stagger: 0.08 });
  batchReveal('.summary__card', { opacity: 0, y: 40, scale: 0.97 }, { duration: 1.1 });
};

const footerReveal = () => {
  batchReveal('.footer__inner > *', { opacity: 0, y: 24 }, { stagger: 0.08, start: 'top 98%' });
};

/* ---------- Блик на карточках услуг ---------- */

const cardSpotlight = () => {
  if (!finePointer()) return;
  document.addEventListener('pointermove', (e) => {
    const card = e.target.closest?.('.svc-card');
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${e.clientX - r.left}px`);
    card.style.setProperty('--my', `${e.clientY - r.top}px`);
  });
};

export const initMotion = () => {
  if (!canAnimate() || !document.documentElement.classList.contains('motion')) return;
  window.__motionReady = true;
  if (window.ScrollTrigger) gsap().registerPlugin(window.ScrollTrigger);

  heroIntro();
  heroParallax();
  cardSpotlight();
  if (!window.ScrollTrigger) return;

  heroScroll();
  headingReveals();
  whySection();
  servicesSection();
  effectSection();
  worksSection();
  visitSection();
  rulesSection();
  reviewsSection();
  bookingSection();
  footerReveal();

  // Шрифты и фото меняют высоту страницы: пересчитываем точки срабатывания
  document.fonts?.ready.then(() => window.ScrollTrigger.refresh());
};
