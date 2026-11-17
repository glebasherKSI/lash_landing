// Сторис «Свободные окошки» 1080×1920: рисуется на canvas шрифтом сайта, отправляется в Instagram
// через системное меню «Поделиться» или скачивается картинкой.
import { buildLashLines } from '../lash-geometry.js';

const W = 1080;
const H = 1920;
const PAD = 88;
// Зоны Instagram: сверху имя аккаунта, снизу поле ответа — туда ничего важного не ставим
const CONTENT_TOP = 200;
const DAYS_TOP = 590;
const DAYS_BOTTOM = 1520;
// Пустое место под стикер «Ссылка» (кнопку записи мастер ставит в Instagram сама)
export const STICKER_ZONE = { x: 190, y: 1616, w: 700, h: 180 };
const HINT_Y = 1580;
const CHIP_GAP = 10;
const LINE_GAP = 10;
const DAY_GAP = { min: 18, max: 64 };
// Размер окон подбирается под их количество: от крупных до компактных, пока всё не влезет
// label — размер даты слева: при немногих окнах всё крупнее, без пустоты на картинке
const SIZES = [
  { font: 54, h: 104, min: 182, label: 46 },
  { font: 48, h: 94, min: 166, label: 42 },
  { font: 42, h: 84, min: 150, label: 38 },
  { font: 38, h: 76, min: 136, label: 36 },
  { font: 34, h: 68, min: 122, label: 34 },
  { font: 31, h: 60, min: 110, label: 32 },
  { font: 28, h: 54, min: 96, label: 30 },
  { font: 26, h: 50, min: 88, label: 28 },
  { font: 24, h: 46, min: 80, label: 27 },
];
// ширина колонки с датой под самую длинную «30 сентября»
const labelWidth = (size) => Math.round(size.label * 6.6);

// поля внутри окна — от высоты: в мелком размере ячейки плотнее и в строку их влезает больше
const chipWidth = (ctx, label, size) => Math.max(size.min, ctx.measureText(label).width + size.h * 0.5);

/** Окна дня по строкам на ширину картинки; не влезло в maxLines — последнее окно меняется на «+N». */
export const layoutDay = (ctx, times, size, maxLines = Infinity) => {
  setFont(ctx, 500, size.font);
  const area = W - PAD - (PAD + labelWidth(size));
  const lines = [[]];
  let x = 0;
  for (let i = 0; i < times.length; i++) {
    const w = chipWidth(ctx, times[i], size);
    if (lines.at(-1).length && x + w > area) {
      if (lines.length === maxLines) {
        const line = lines.at(-1);
        line.pop();
        const label = `+${times.length - i + 1}`;
        line.push({ label, w: chipWidth(ctx, label, size), extra: true });
        break;
      }
      lines.push([]);
      x = 0;
    }
    lines.at(-1).push({ label: times[i], w });
    x += w + CHIP_GAP;
  }
  return lines;
};

const dayHeight = (lines, size) => lines.length * size.h + (lines.length - 1) * LINE_GAP;

// Все дни одной высоты — по самому «многострочному»: ровный ритм строк на картинке
export const rowHeight = (plans, size) => Math.max(...plans.map((p) => dayHeight(p.lines, size)));

/**
 * Размер окон: сначала самый крупный, при котором каждый день помещается в одну строку;
 * не выходит — с переносом; крайний случай — две строки на день и «+N».
 */
export const planDays = (ctx, rows) => {
  const avail = DAYS_BOTTOM - DAYS_TOP;
  const fits = (plans, size) => rowHeight(plans, size) * plans.length + DAY_GAP.min * (plans.length - 1) <= avail;
  for (const singleLine of [true, false]) {
    for (const size of SIZES) {
      const plans = rows.map((day) => ({ day, lines: layoutDay(ctx, day.times, size) }));
      if (singleLine && plans.some((p) => p.lines.length > 1)) continue;
      if (fits(plans, size)) return { size, plans };
    }
  }
  const size = SIZES.at(-1);
  return { size, plans: rows.map((day) => ({ day, lines: layoutDay(ctx, day.times, size, 2) })) };
};

const THEMES = {
  pink: { bg: ['#F6DDE2', '#E8B9C4'], text: '#131315', muted: '#4A4A52', chip: 'rgba(255,255,255,.82)', chipText: '#131315', pill: 'rgba(255,255,255,.55)', lash: 'rgba(19,19,21,.10)' },
  light: { bg: ['#F7F7F8', '#EDEEF0'], text: '#131315', muted: '#62626A', chip: 'accent', chipText: '#131315', pill: '#E4E5E8', lash: 'rgba(19,19,21,.08)', glow: true },
  dark: { bg: ['#2B2B33', '#131315'], text: '#FFFFFF', muted: '#B9B9C2', chip: 'accent', chipText: '#131315', pill: 'rgba(255,255,255,.10)', lash: 'rgba(242,210,216,.16)' },
};

const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
};

const setFont = (ctx, weight, size, spacing = 0) => {
  ctx.font = `${weight} ${size}px Onest, system-ui, sans-serif`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
};

/** Подпись периода: «16–22 ноября» или «28 ноября – 4 декабря». */
const periodLabel = (days) => {
  const first = days[0];
  const last = days.at(-1);
  if (first.date === last.date) return first.label;
  return first.month === last.month ? `${first.day}–${last.day} ${last.month}` : `${first.label} – ${last.label}`;
};

export const drawStory = (canvas, { days, theme: themeName, brand, hidden }) => {
  const ctx = canvas.getContext('2d');
  const t = THEMES[themeName];
  const chipBg = t.chip === 'accent' ? brand.accent : t.chip;

  // Фон
  const gradient = ctx.createLinearGradient(0, 0, W, H);
  gradient.addColorStop(0, t.bg[0]);
  gradient.addColorStop(1, t.bg[1]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);
  if (t.glow) {
    const glow = ctx.createRadialGradient(W - 120, 260, 40, W - 120, 260, 720);
    glow.addColorStop(0, `${brand.accent}cc`);
    glow.addColorStop(1, `${brand.accent}00`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
  }

  // Ресницы — фирменный мотив сайта, крупно и едва заметно в углу
  ctx.save();
  ctx.translate(470, 70);
  ctx.scale(1.15, 1.15);
  ctx.fillStyle = t.lash;
  for (const line of buildLashLines([8, 9, 10, 11, 12])) ctx.fill(new Path2D(line.d));
  ctx.strokeStyle = t.lash;
  ctx.lineWidth = 4;
  ctx.stroke(new Path2D('M60 230Q300 40 540 230'));
  ctx.restore();

  // Студия
  setFont(ctx, 500, 32);
  const brandText = brand.studio === brand.master ? brand.master : `${brand.studio} · ${brand.master}`;
  const pillW = ctx.measureText(brandText).width + 56;
  ctx.fillStyle = t.pill;
  roundRect(ctx, PAD, CONTENT_TOP, pillW, 64, 32);
  ctx.fill();
  ctx.fillStyle = t.text;
  ctx.textBaseline = 'middle';
  ctx.fillText(brandText, PAD + 28, CONTENT_TOP + 33);

  // Заголовок, как на первом экране сайта
  ctx.textBaseline = 'alphabetic';
  setFont(ctx, 300, 100, -1.5);
  ctx.fillText('СВОБОДНЫЕ', PAD - 4, 384);
  ctx.fillText('ОКОШКИ', PAD - 4, 480);
  setFont(ctx, 500, 40);
  ctx.fillStyle = t.muted;
  // Период — по дням, которые реально есть на картинке (выходные не показываются)
  const rows = days.filter((d) => d.working);
  ctx.fillText(periodLabel(rows.length ? rows : days), PAD, 538);

  // Дни: дата слева, окна справа; блок растягивается на всю высоту между заголовком и ссылкой
  // полностью занятые дни клиенткам ничего не дают — на картинку не попадают
  const visible = rows
    .map((day) => ({ ...day, times: day.times.filter((time) => !hidden.has(`${day.date}|${time}`)) }))
    .filter((day) => day.times.length);
  const { size, plans } = planDays(ctx, visible);
  const rowH = plans.length ? rowHeight(plans, size) : 0;
  const heights = plans.map(() => rowH);
  const sumH = heights.reduce((a, b) => a + b, 0);
  const avail = DAYS_BOTTOM - DAYS_TOP;
  const gap = plans.length > 1 ? Math.min(DAY_GAP.max, Math.max(DAY_GAP.min, (avail - sumH) / (plans.length - 1))) : 0;
  let y = DAYS_TOP + Math.max(0, (avail - sumH - gap * (plans.length - 1)) / 2);
  plans.forEach(({ day, lines }, i) => {
    // подпись дня — по центру первой строки окон
    const cy = y + size.h / 2;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    setFont(ctx, 500, Math.round(size.label * 0.72), 2);
    ctx.fillStyle = t.muted;
    ctx.fillText(day.weekday.toUpperCase(), PAD, cy - size.label * 0.22);
    setFont(ctx, 500, size.label);
    ctx.fillStyle = t.text;
    ctx.fillText(day.label, PAD, cy + size.label * 0.9);

    setFont(ctx, 500, size.font);
    lines.forEach((line, li) => {
      let x = PAD + labelWidth(size);
      const top = y + li * (size.h + LINE_GAP);
      for (const chip of line) {
        roundRect(ctx, x, top, chip.w, size.h, size.h / 2);
        if (chip.extra) {
          ctx.strokeStyle = t.muted;
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          ctx.fillStyle = chipBg;
          ctx.fill();
        }
        ctx.fillStyle = chip.extra ? t.text : t.chipText;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillText(chip.label, x + chip.w / 2, top + size.h / 2 + 2);
        x += chip.w + CHIP_GAP;
      }
    });
    ctx.textAlign = 'left';
    y += heights[i] + gap;
  });

  // Подсказка над местом для стикера
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  setFont(ctx, 500, 34);
  ctx.fillStyle = t.text;
  ctx.fillText('Запись по ссылке ↓', W / 2, HINT_Y);
  ctx.textAlign = 'left';
};

export const initStory = () => {
  const root = document.querySelector('[data-story]');
  if (!root) return;
  const canvas = root.querySelector('[data-story-canvas]');
  const list = root.querySelector('[data-story-list]');
  const fromInput = root.querySelector('[data-story-from]');
  const daysBox = root.querySelector('[data-story-days]');
  const themesBox = root.querySelector('[data-story-themes]');
  const shareButton = root.querySelector('[data-story-share]');
  const downloadButton = root.querySelector('[data-story-download]');
  const brand = JSON.parse(document.getElementById('story-brand').textContent);
  const state = { theme: 'pink', days: 7, data: null, hidden: new Set() };
  let request = 0;

  const redraw = () => {
    if (!state.data) return;
    drawStory(canvas, { ...state.data, theme: state.theme, brand, hidden: state.hidden });
    root.dataset.theme = state.theme; // цвет пунктирной зоны стикера под оформление
    canvas.classList.remove('is-fresh');
    void canvas.offsetWidth;
    canvas.classList.add('is-fresh');
    const visible = state.data.days.some((d) => d.times.some((time) => !state.hidden.has(`${d.date}|${time}`)));
    shareButton.disabled = downloadButton.disabled = !visible;
  };

  const renderList = () => {
    const working = state.data.days.filter((d) => d.working);
    if (!working.length) return void (list.innerHTML = '<p class="muted">В эти дни выходные.</p>');
    list.innerHTML = working
      .map((d) => `<div class="story-day"><span class="story-day__label"><b>${d.weekday}</b> ${d.label}</span><span class="story-day__times">${
        d.times.length
          ? d.times.map((time) => `<button type="button" class="story-time" data-key="${d.date}|${time}" aria-pressed="${!state.hidden.has(`${d.date}|${time}`)}">${time}</button>`).join('')
          : '<span class="muted">всё занято</span>'
      }</span></div>`)
      .join('');
  };

  const load = async () => {
    const id = ++request;
    root.classList.add('is-loading');
    const params = new URLSearchParams({ from: fromInput.value, days: state.days });
    const res = await fetch(`/admin/api/story?${params}`).then((r) => r.json());
    if (id !== request) return;
    root.classList.remove('is-loading');
    if (!res.ok) return void (list.innerHTML = `<p class="field-error">${res.message}</p>`);
    state.data = res;
    renderList();
    redraw();
  };

  list.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-key]');
    if (!chip) return;
    const key = chip.dataset.key;
    if (state.hidden.has(key)) state.hidden.delete(key);
    else state.hidden.add(key);
    chip.setAttribute('aria-pressed', String(!state.hidden.has(key)));
    navigator.vibrate?.(8);
    redraw();
  });

  daysBox.addEventListener('click', (event) => {
    const button = event.target.closest('[data-days]');
    if (!button) return;
    daysBox.querySelectorAll('[data-days]').forEach((b) => b.setAttribute('aria-current', String(b === button)));
    state.days = Number(button.dataset.days);
    load();
  });

  themesBox.addEventListener('click', (event) => {
    const button = event.target.closest('[data-theme]');
    if (!button) return;
    themesBox.querySelectorAll('[data-theme]').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    state.theme = button.dataset.theme;
    redraw();
  });

  fromInput.addEventListener('change', load);

  const toFile = () =>
    new Promise((resolve) =>
      canvas.toBlob((blob) => resolve(new File([blob], `okoshki-${state.data.from}.png`, { type: 'image/png' })), 'image/png'),
    );

  const download = (file) => {
    const url = URL.createObjectURL(file);
    const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Системное меню «Поделиться» сразу предлагает Instagram (сторис); если его нет — скачиваем
  shareButton.addEventListener('click', async () => {
    const file = await toFile();
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
      } catch {}
    } else download(file);
  });
  downloadButton.addEventListener('click', async () => download(await toFile()));

  // Шрифт сайта должен загрузиться до первой отрисовки, иначе canvas нарисует запасным
  Promise.all(['300 132px Onest', '400 34px Onest', '500 38px Onest'].map((f) => document.fonts.load(f))).finally(load);
};
