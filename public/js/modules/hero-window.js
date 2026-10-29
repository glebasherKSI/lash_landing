import { LID, WINDOW_BOX, WINDOW_CENTER } from '../lash-geometry.js';

/**
 * «Окно-глаз» на фото первого экрана: рифлёное стекло накрывает фото целиком,
 * а в нём вырезано чистое окно в форме глаза. Фото кадрируется так, что точка фокуса
 * (между глаз модели) совпадает с центром окна на любой ширине карточки.
 */

const toPx = (rect) => (x, y) => [
  rect.x + ((x - WINDOW_BOX.x) / WINDOW_BOX.w) * rect.w,
  rect.y + ((y - WINDOW_BOX.y) / WINDOW_BOX.h) * rect.h,
];

/** Прямоугольник окна (область WINDOW_BOX) в px внутри карточки. */
export const windowRect = (cardW, cardH, { fx, fy, ww }) => {
  const w = (cardW * ww) / 100;
  const h = (w * WINDOW_BOX.h) / WINDOW_BOX.w;
  return {
    x: (cardW * fx) / 100 - ((WINDOW_CENTER.x - WINDOW_BOX.x) / WINDOW_BOX.w) * w,
    y: (cardH * fy) / 100 - ((WINDOW_CENTER.y - WINDOW_BOX.y) / WINDOW_BOX.h) * h,
    w,
    h,
  };
};

/** Стекло с дыркой: прямоугольник карточки + миндалевидное окно, правило evenodd. */
const glassClipPath = (cardW, cardH, rect) => {
  const p = toPx(rect);
  const f = (pt) => pt.map((v) => v.toFixed(1)).join(' ');
  const almond =
    `M${f(p(...LID.p0))}Q${f(p(...LID.p1))} ${f(p(...LID.p2))}` + `Q${f(p(300, 330))} ${f(p(...LID.p0))}Z`;
  return `path(evenodd, "M0 0H${cardW}V${cardH}H0Z${almond}")`;
};

const readFocus = (card) => ({
  fx: Number(card.dataset.fx ?? 50),
  fy: Number(card.dataset.fy ?? 45),
  ww: Number(card.dataset.ww ?? 76),
});

export const mountHeroWindow = (card) => {
  if (!card) return null;
  const imgs = card.querySelectorAll('.photo-card__img');
  const media = card.querySelectorAll('.photo-card__media');
  const glass = card.querySelector('.glass');
  const overlay = card.querySelector('.eye-window');
  if (!imgs.length || !glass || !overlay) return null;

  let focus = readFocus(card);

  const layout = () => {
    const { width, height } = card.getBoundingClientRect();
    if (!width || !height) return;
    const rect = windowRect(width, height, focus);
    imgs.forEach((img) => (img.style.objectPosition = `${focus.fx}% ${focus.fy}%`));
    media.forEach((m) => (m.style.transformOrigin = `${focus.fx}% ${focus.fy}%`));
    glass.style.clipPath = glassClipPath(width, height, rect);
    Object.assign(overlay.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` });
    card.classList.add('is-window-ready');
  };

  new ResizeObserver(layout).observe(card);
  layout();

  return {
    update(next) {
      focus = { ...focus, ...next };
      Object.assign(card.dataset, { fx: focus.fx, fy: focus.fy, ww: focus.ww });
      layout();
    },
  };
};
