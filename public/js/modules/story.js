// Сторис «Свободные окошки» 1080×1920: рисуется на canvas шрифтом сайта, отправляется в Instagram
// через системное меню «Поделиться» или скачивается картинкой.
import { buildLashLines } from '../lash-geometry.js';

const W = 1080;
const H = 1920;
const PAD = 88;
// Зоны Instagram: сверху имя аккаунта, снизу поле ответа — туда ничего важного не ставим
const CONTENT_TOP = 250;
const DAYS_TOP = 700;
const DAYS_BOTTOM = 1300;
// Пустое место под стикер «Ссылка» (кнопку записи мастер ставит в Instagram сама)
export const STICKER_ZONE = { x: 190, y: 1390, w: 700, h: 220 };
const HINT_Y = 1352;
const FOOTER_Y = 1668;
const ROW_H = 76;
const ROW_GAP = 10;
const LABEL_W = 230;
const MAX_CHIPS = 4;

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

export const drawStory = (canvas, { days, service, theme: themeName, brand, hidden }) => {
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
  setFont(ctx, 300, 132, -2);
  ctx.fillText('СВОБОДНЫЕ', PAD - 6, 470);
  ctx.fillText('ОКОШКИ', PAD - 6, 596);
  setFont(ctx, 500, 40);
  ctx.fillStyle = t.muted;
  // Период — по дням, которые реально есть на картинке (выходные не показываются)
  const rows = days.filter((d) => d.working);
  ctx.fillText(`${periodLabel(rows.length ? rows : days)} · ${service.title}`, PAD, 660);

  // Дни: дата слева, окна справа
  const blockH = rows.length * (ROW_H + ROW_GAP) - ROW_GAP;
  let y = DAYS_TOP + Math.max(0, (DAYS_BOTTOM - DAYS_TOP - blockH) / 2);
  for (const day of rows) {
    const times = day.times.filter((time) => !hidden.has(`${day.date}|${time}`));
    ctx.textBaseline = 'alphabetic';
    setFont(ctx, 500, 26, 2);
    ctx.fillStyle = t.muted;
    ctx.fillText(day.weekday.toUpperCase(), PAD, y + 30);
    setFont(ctx, 500, 36);
    ctx.fillStyle = t.text;
    ctx.fillText(day.label, PAD, y + 70);

    let x = PAD + LABEL_W;
    if (!times.length) {
      setFont(ctx, 400, 34);
      ctx.fillStyle = t.muted;
      ctx.textBaseline = 'middle';
      ctx.fillText('всё занято', x, y + ROW_H / 2);
    } else {
      const shown = times.length > MAX_CHIPS ? times.slice(0, MAX_CHIPS - 1) : times;
      const chips = times.length > MAX_CHIPS ? [...shown, `+${times.length - shown.length}`] : shown;
      for (const label of chips) {
        const extra = label.startsWith('+');
        setFont(ctx, 500, 38);
        const chipW = Math.max(132, ctx.measureText(label).width + 44);
        roundRect(ctx, x, y, chipW, ROW_H, ROW_H / 2);
        if (extra) {
          ctx.strokeStyle = t.muted;
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          ctx.fillStyle = chipBg;
          ctx.fill();
        }
        ctx.fillStyle = extra ? t.text : t.chipText;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillText(label, x + chipW / 2, y + ROW_H / 2 + 2);
        ctx.textAlign = 'left';
        x += chipW + 12;
      }
    }
    y += ROW_H + ROW_GAP;
  }

  // Подсказка над местом для стикера и адрес внизу
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  setFont(ctx, 500, 34);
  ctx.fillStyle = t.text;
  ctx.fillText('Запись по ссылке ↓', W / 2, HINT_Y);
  if (brand.place) {
    setFont(ctx, 400, 30);
    ctx.fillStyle = t.muted;
    ctx.fillText(brand.place, W / 2, FOOTER_Y);
  }
  ctx.textAlign = 'left';
};

export const initStory = () => {
  const root = document.querySelector('[data-story]');
  if (!root) return;
  const canvas = root.querySelector('[data-story-canvas]');
  const list = root.querySelector('[data-story-list]');
  const serviceSelect = root.querySelector('[data-story-service]');
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
    const params = new URLSearchParams({ service_id: serviceSelect.value, from: fromInput.value, days: state.days });
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

  serviceSelect.addEventListener('change', () => {
    state.hidden.clear();
    load();
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
