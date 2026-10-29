import { barRatio, buildLashLines, LINES, coordsToPath, lineCoords } from '../lash-geometry.js';
import { animateValueChange, onFirstView, prefersReducedMotion, tweenNumber } from './motion.js';

const MORPH_DURATION = 0.8;
const GROW_DURATION = 1.6;
// С этого профиля ресницы «вырастают», когда конструктор впервые попадает в экран
const SEED_PROFILE = [4, 4, 4, 4, 4];

/**
 * Конструктор эффекта: чипы переключают профиль, ресницы морфятся
 * (интерполяция координат одной и той же структуры path), столбики меняют высоту.
 */
export const initEffect = ({ effects = [] }, { onEffectChosen } = {}) => {
  const section = document.getElementById('effect');
  if (!section || !effects.length) return;

  const chips = [...section.querySelectorAll('[data-effect]')];
  const desc = section.querySelector('#effect-desc');
  const paths = [...section.querySelectorAll('[data-lash-line]')];
  const bars = [...section.querySelectorAll('[data-bar]')];
  const barValues = [...section.querySelectorAll('[data-bar-value]')];
  const cta = section.querySelector('[data-effect-cta]');

  const pressed = chips.find((c) => c.getAttribute('aria-pressed') === 'true')?.dataset.effect;
  let current = effects.find((e) => e.slug === pressed) ?? effects[0];
  let currentCoords = LINES.map((line) => lineCoords(current.profile, line));
  let stopMorph = null;

  const draw = (coords) => paths.forEach((p, i) => p.setAttribute('d', coordsToPath(coords[i], LINES[i].width)));

  const setBars = (profile) => {
    profile.forEach((mm, i) => {
      bars[i]?.style.setProperty('--ratio', mm ? barRatio(mm).toFixed(3) : '0');
      if (barValues[i] && mm) barValues[i].textContent = `${mm} мм`;
    });
  };

  const morphTo = (profile, { duration = MORPH_DURATION, ease } = {}) => {
    const target = buildLashLines(profile).map((l) => l.coords);
    stopMorph?.();
    if (prefersReducedMotion()) {
      currentCoords = target;
      draw(target);
      return;
    }
    const from = currentCoords;
    stopMorph = tweenNumber({
      duration,
      ease,
      onUpdate: (k) => {
        currentCoords = from.map((coords, line) => coords.map((v, j) => v + (target[line][j] - v) * k));
        draw(currentCoords);
      },
    });
  };

  // Первое появление: короткие ресницы и пустые столбики, затем рост до выбранного эффекта
  if (!prefersReducedMotion() && document.documentElement.classList.contains('motion')) {
    currentCoords = LINES.map((line) => lineCoords(SEED_PROFILE, line));
    draw(currentCoords);
    setBars([0, 0, 0, 0, 0]);
    onFirstView(section.querySelector('.effect__scheme'), () => {
      morphTo(current.profile, { duration: GROW_DURATION, ease: 'expo.out' });
      setBars(current.profile);
    }, 'top 70%');
  } else {
    setBars(current.profile);
  }

  const choose = (slug) => {
    const effect = effects.find((e) => e.slug === slug);
    if (!effect || effect === current) return;
    current = effect;
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.effect === slug)));
    desc.textContent = effect.description;
    animateValueChange(desc);
    morphTo(effect.profile);
    setBars(effect.profile);
    barValues.forEach(animateValueChange);
  };

  section.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-effect]');
    if (chip) choose(chip.dataset.effect);
  });

  cta?.addEventListener('click', () => onEffectChosen?.(current.slug));
};
