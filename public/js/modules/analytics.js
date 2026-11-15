// Аналитика в админке: KPI, выручка по времени, источник, клиентки, услуги, дни недели.
// Рисуется из JSON (/admin/api/analytics); переключение периода без перезагрузки, с анимацией.

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = (n) => Math.round(n).toLocaleString('ru-RU');
const plural = (n, one, few, many) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};
const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const BUCKET_NAME = { week: 'дням', month: 'дням', quarter: 'неделям', year: 'месяцам' };

/* ---------- Числа: плавный досчёт ---------- */

const countUp = (el, to) => {
  const from = Number(el.dataset.value ?? 0);
  el.dataset.value = to;
  if (reduced() || from === to) return void (el.textContent = fmt(to));
  const start = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - start) / 650);
    const eased = 1 - (1 - k) ** 3;
    el.textContent = fmt(from + (to - from) * eased);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};

// Сравнение с прошлым периодом: «к прошлому месяцу» для изменения, «в прошлом месяце» для случаев без изменения
const PREVIOUS = {
  week: { to: 'к прошлой неделе', in: 'на прошлой неделе' },
  month: { to: 'к прошлому месяцу', in: 'в прошлом месяце' },
  quarter: { to: 'к прошлому кварталу', in: 'в прошлом квартале' },
  year: { to: 'к прошлому году', in: 'в прошлом году' },
};

// Для отмен рост — это плохо: стрелка та же, но цвет «лучше/хуже» берётся из смысла метрики.
// short — для маленьких плиток, full — для главной плитки, подсказки и экранного диктора.
const deltaText = (now, before, prev, { lowerIsBetter = false, points = false } = {}) => {
  if (!before && !now) return { short: '—', full: `как ${prev.in}`, tone: 'flat' };
  if (!before) return { short: 'новое', full: `${prev.in} не было`, tone: 'flat' };
  const diff = points ? now - before : Math.round(((now - before) / before) * 100);
  if (diff === 0) return { short: '= 0%', full: `как ${prev.in}`, tone: 'flat' };
  const short = `${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)}${points ? ' п.п.' : '%'}`;
  return { short, full: `${short} ${prev.to}`, tone: (lowerIsBetter ? diff < 0 : diff > 0) ? 'up' : 'down' };
};

const renderKpis = (root, data) => {
  const { summary: s, previous: p } = data;
  for (const key of ['revenue', 'count', 'average', 'cancelRate']) countUp(root.querySelector(`[data-kpi="${key}"]`), s[key]);
  const name = PREVIOUS[data.range];
  const deltas = {
    revenue: deltaText(s.revenue, p.revenue, name),
    count: deltaText(s.count, p.count, name),
    average: deltaText(s.average, p.average, name),
    cancelRate: deltaText(s.cancelRate, p.cancelRate, name, { lowerIsBetter: true, points: true }),
  };
  for (const [key, d] of Object.entries(deltas)) {
    const el = root.querySelector(`[data-delta="${key}"]`);
    el.textContent = key === 'revenue' ? d.full : d.short;
    el.title = d.full;
    el.setAttribute('aria-label', d.full);
    el.dataset.tone = d.tone;
  }
  root.querySelector('[data-kpi-sub="revenue"]').textContent = s.planned
    ? `заработано ${fmt(s.earned)} · запланировано ${fmt(s.planned)}`
    : s.revenue ? 'всё уже заработано' : '';
  root.querySelector('[data-kpi-sub="cancelled"]').textContent = s.cancelled
    ? `${s.cancelled} ${plural(s.cancelled, 'запись', 'записи', 'записей')}`
    : 'без отмен';
};

/* ---------- Выручка по времени: столбцы SVG ---------- */

// Скругление только у верхнего конца столбика, низ стоит на базовой линии
const topRounded = (x, y, w, h, r) => {
  const rr = Math.min(r, w / 2, h);
  return `M${x} ${y + h}V${y + rr}Q${x} ${y} ${x + rr} ${y}H${x + w - rr}Q${x + w} ${y} ${x + w} ${y + rr}V${y + h}Z`;
};

const niceMax = (value) => {
  if (value <= 0) return 100;
  const pow = 10 ** Math.floor(Math.log10(value));
  const n = value / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
};

const renderRevenue = (card, data) => {
  const box = card.querySelector('[data-chart="revenue"]');
  const tooltip = box.querySelector('[data-an-tooltip]');
  box.querySelector('svg')?.remove();
  box.querySelector('.an-empty')?.remove();
  tooltip.hidden = true;
  card.querySelector('[data-an-bucket-name]').textContent = BUCKET_NAME[data.range];
  card.querySelector('[data-legend-planned]').hidden = !data.summary.planned;

  const buckets = data.buckets;
  const W = Math.max(280, box.clientWidth);
  const H = W < 520 ? 200 : 240;
  const pad = { top: 12, right: 4, bottom: 26, left: 40 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const max = niceMax(Math.max(...buckets.map((b) => b.earned + b.planned)));
  const band = plotW / buckets.length;
  const barW = Math.max(3, Math.min(28, band * 0.62));
  const y = (v) => pad.top + plotH - (v / max) * plotH;
  const labelEvery = Math.ceil(buckets.length / Math.floor(plotW / 34));

  const grid = [0, 0.5, 1]
    .map((k) => `<line class="an-grid" x1="${pad.left}" x2="${W - pad.right}" y1="${y(max * k)}" y2="${y(max * k)}"/>
      <text class="an-axis" x="${pad.left - 8}" y="${y(max * k) + 4}" text-anchor="end">${fmt(max * k)}</text>`)
    .join('');

  const bars = buckets
    .map((b, i) => {
      const x = pad.left + band * i + (band - barW) / 2;
      const earnedH = (b.earned / max) * plotH;
      const plannedH = (b.planned / max) * plotH;
      const gap = earnedH && plannedH ? 2 : 0; // 2px фона между сегментами
      const parts = [];
      if (earnedH) parts.push(`<path class="an-bar-earned" d="${topRounded(x, y(b.earned), barW, earnedH, plannedH ? 0 : 4)}"/>`);
      if (plannedH) parts.push(`<path class="an-bar-planned" d="${topRounded(x + 0.5, y(b.earned + b.planned) + 0.5, barW - 1, plannedH - gap - 0.5, 4)}"/>`);
      const label = i % labelEvery === 0 ? `<text class="an-axis" x="${x + barW / 2}" y="${H - 8}" text-anchor="middle">${escape(b.short)}</text>` : '';
      return `<g class="an-col" data-i="${i}"><g class="an-bar">${parts.join('')}</g>${label}
        <rect class="an-hit" x="${pad.left + band * i}" y="${pad.top}" width="${band}" height="${plotH + 4}"/></g>`;
    })
    .join('');

  box.insertAdjacentHTML(
    'afterbegin',
    `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img"
      aria-label="Выручка по ${BUCKET_NAME[data.range]}: всего ${fmt(data.summary.revenue)} BYN">
      <defs><pattern id="an-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" class="an-hatch-bg"/><line x1="0" y1="0" x2="0" y2="6" class="an-hatch-line"/></pattern></defs>
      ${grid}${bars}
      <line class="an-baseline" x1="${pad.left}" x2="${W - pad.right}" y1="${y(0)}" y2="${y(0)}"/>
    </svg>`,
  );

  // Столбики вырастают волной от базовой линии
  if (!reduced()) {
    box.querySelectorAll('.an-bar').forEach((bar, i) => {
      bar.style.animationDelay = `${Math.min(i * 18, 360)}ms`;
      bar.classList.add('is-growing');
    });
  }

  if (!data.summary.count) box.insertAdjacentHTML('beforeend', '<p class="an-empty">За этот период записей нет</p>');

  const svg = box.querySelector('svg');
  const show = (col) => {
    const b = buckets[Number(col.dataset.i)];
    svg.querySelectorAll('.an-col').forEach((c) => c.classList.toggle('is-dim', c !== col));
    tooltip.innerHTML = `<b>${escape(b.label)}</b>
      ${b.earned ? `<span><i class="an-swatch an-swatch--earned"></i>Заработано ${fmt(b.earned)} BYN</span>` : ''}
      ${b.planned ? `<span><i class="an-swatch an-swatch--planned"></i>Запланировано ${fmt(b.planned)} BYN</span>` : ''}
      <span class="muted">${b.count ? `${b.count} ${plural(b.count, 'запись', 'записи', 'записей')}` : 'нет записей'}</span>`;
    tooltip.hidden = false;
    const hit = col.querySelector('.an-hit').getBoundingClientRect();
    const host = box.getBoundingClientRect();
    const left = Math.min(Math.max(hit.left - host.left + hit.width / 2 - tooltip.offsetWidth / 2, 0), host.width - tooltip.offsetWidth);
    tooltip.style.transform = `translateX(${left}px)`;
  };
  const hide = () => {
    tooltip.hidden = true;
    svg.querySelectorAll('.an-col').forEach((c) => c.classList.remove('is-dim'));
  };
  svg.addEventListener('pointerover', (e) => e.target.closest('.an-col') && show(e.target.closest('.an-col')));
  svg.addEventListener('click', (e) => e.target.closest('.an-col') && show(e.target.closest('.an-col')));
  svg.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && hide());

  // Таблица для тех, кому график неудобен
  card.querySelector('[data-an-table]').innerHTML = `<table><thead><tr><th>Период</th><th>Заработано</th><th>План</th><th>Записей</th></tr></thead><tbody>
    ${buckets.filter((b) => b.count).map((b) => `<tr><td>${escape(b.label)}</td><td>${fmt(b.earned)}</td><td>${fmt(b.planned)}</td><td>${b.count}</td></tr>`).join('') || '<tr><td colspan="4">Записей нет</td></tr>'}
  </tbody></table>`;
};

/* ---------- Доли: сегментированная полоса ---------- */

const renderSplit = (box, parts, unit) => {
  const total = parts.reduce((n, p) => n + p.value, 0);
  box.innerHTML = `<div class="an-split${total ? '' : ' is-empty'}">${parts
    .map((p, i) => `<span class="an-split__seg an-series-${i + 1}" data-flex="${p.value}"></span>`)
    .join('')}</div>
    <ul class="an-split-legend">${parts
      .map((p, i) => `<li><span class="an-swatch an-series-${i + 1}" aria-hidden="true"></span><span class="an-split-legend__name">${escape(p.label)}</span>
        <b>${total ? Math.round((p.value / total) * 100) : 0}%</b><span class="muted">${p.value} ${unit(p.value)}${p.extra ? ` · ${p.extra}` : ''}</span></li>`)
      .join('')}</ul>`;
  box.querySelectorAll('[data-flex]').forEach((seg) => (seg.style.flexGrow = seg.dataset.flex || '0'));
  if (!reduced()) box.querySelector('.an-split').classList.add('is-growing');
};

/* ---------- Услуги: полосы в строку ---------- */

const renderServices = (list, services) => {
  if (!services.length) return void (list.innerHTML = '<li class="muted">Записей нет</li>');
  const max = Math.max(...services.map((s) => s.revenue));
  list.innerHTML = services
    .map((s) => `<li class="an-meter${s.other ? ' is-other' : ''}">
      <span class="an-meter__name">${escape(s.title)}</span>
      <span class="an-meter__value">${fmt(s.revenue)} BYN <span class="muted">· ${s.count}</span></span>
      <span class="an-meter__track"><span class="an-meter__fill" data-k="${max ? s.revenue / max : 0}"></span></span>
    </li>`)
    .join('');
  list.querySelectorAll('.an-meter__fill').forEach((fill, i) => {
    const k = fill.dataset.k;
    if (reduced()) return void (fill.style.transform = `scaleX(${k})`);
    fill.style.transitionDelay = `${i * 60}ms`;
    requestAnimationFrame(() => requestAnimationFrame(() => (fill.style.transform = `scaleX(${k})`)));
  });
};

/* ---------- Дни недели: столбцы ---------- */

const renderWeekdays = (box, weekdays) => {
  const max = Math.max(1, ...weekdays.map((d) => d.count));
  const top = weekdays.findIndex((d) => d.count === max && d.count > 0);
  box.innerHTML = weekdays
    .map((d, i) => `<button type="button" class="an-day${i === top ? ' is-top is-active' : ''}" aria-label="${d.label}: ${d.count} ${plural(d.count, 'запись', 'записи', 'записей')}">
      <span class="an-day__count">${d.count}</span>
      <span class="an-day__bar"><span class="an-day__fill" data-k="${d.count / max}"></span></span>
      <span class="an-day__label">${d.label}</span></button>`)
    .join('');
  box.querySelectorAll('.an-day__fill').forEach((fill, i) => {
    const k = Math.max(Number(fill.dataset.k), 0.02);
    if (reduced()) return void (fill.style.transform = `scaleY(${k})`);
    fill.style.transitionDelay = `${i * 40}ms`;
    requestAnimationFrame(() => requestAnimationFrame(() => (fill.style.transform = `scaleY(${k})`)));
  });
};

/* ---------- Сборка и переключение периодов ---------- */

export const initAnalytics = () => {
  const root = document.querySelector('[data-analytics]');
  if (!root) return;
  const rangeBox = document.querySelector('[data-an-range]');
  const thumb = rangeBox.querySelector('.segmented__thumb');
  const title = document.querySelector('[data-an-title]');
  const prev = document.querySelector('[data-an-shift="-1"]');
  const next = document.querySelector('[data-an-shift="1"]');
  const maxOffset = Number(root.dataset.maxOffset);
  const cache = new Map();
  let state = JSON.parse(document.getElementById('analytics-data').textContent);
  let controller = null;

  const key = (range, offset) => `${range}:${offset}`;
  cache.set(key(state.range, state.offset), state);

  const moveThumb = () => {
    const active = rangeBox.querySelector('[aria-current="true"]');
    thumb.style.width = `${active.offsetWidth}px`;
    thumb.style.transform = `translateX(${active.offsetLeft - 4}px)`;
  };

  const render = (data) => {
    renderKpis(root, data);
    renderRevenue(root.querySelector('.an-card--wide'), data);
    renderSplit(
      root.querySelector('[data-chart="source"]'),
      [
        { label: 'С сайта', value: data.source.site.count, extra: `${fmt(data.source.site.revenue)} BYN` },
        { label: 'Внесены вручную', value: data.source.admin.count, extra: `${fmt(data.source.admin.revenue)} BYN` },
      ],
      (n) => plural(n, 'запись', 'записи', 'записей'),
    );
    renderSplit(
      root.querySelector('[data-chart="clients"]'),
      [
        { label: 'Новые', value: data.clients.new },
        { label: 'Постоянные', value: data.clients.returning },
      ],
      (n) => plural(n, 'клиентка', 'клиентки', 'клиенток'),
    );
    renderServices(root.querySelector('[data-chart="services"]'), data.services);
    renderWeekdays(root.querySelector('[data-chart="weekdays"]'), data.weekdays);
    next.disabled = data.offset >= maxOffset;
  };

  const load = async (range, offset) => {
    const cached = cache.get(key(range, offset));
    if (cached) return cached;
    controller?.abort();
    controller = new AbortController();
    const res = await fetch(`/admin/api/analytics?range=${range}&offset=${offset}`, { signal: controller.signal });
    const data = await res.json();
    cache.set(key(range, offset), data);
    return data;
  };

  // Соседний прошлый период подгружается заранее: стрелка «назад» срабатывает мгновенно
  const prefetch = () => load(state.range, state.offset - 1).catch(() => {});

  const go = async (range, offset, direction = 0) => {
    title.dataset.dir = direction < 0 ? 'back' : direction > 0 ? 'forward' : 'none';
    root.classList.add('is-switching');
    try {
      const [data] = await Promise.all([load(range, offset), new Promise((r) => setTimeout(r, reduced() ? 0 : 120))]);
      state = data;
      title.textContent = data.period.label;
      title.classList.remove('is-changing');
      void title.offsetWidth; // перезапуск анимации заголовка
      title.classList.add('is-changing');
      render(data);
      history.replaceState(null, '', `?range=${range}&offset=${offset}`);
      prefetch();
    } catch (error) {
      if (error.name !== 'AbortError') location.href = `?range=${range}&offset=${offset}`;
    } finally {
      root.classList.remove('is-switching');
    }
  };

  rangeBox.addEventListener('click', (event) => {
    const button = event.target.closest('[data-range]');
    if (!button || button.getAttribute('aria-current') === 'true') return;
    rangeBox.querySelectorAll('[data-range]').forEach((b) => b.setAttribute('aria-current', String(b === button)));
    moveThumb();
    go(button.dataset.range, 0);
  });

  [prev, next].forEach((button) =>
    button.addEventListener('click', () => {
      const shift = Number(button.dataset.anShift);
      go(state.range, Math.min(maxOffset, state.offset + shift), shift);
    }),
  );

  // Свайп по графикам влево/вправо листает периоды
  let touch = null;
  root.addEventListener('touchstart', (e) => (touch = { x: e.touches[0].clientX, y: e.touches[0].clientY }), { passive: true });
  root.addEventListener('touchend', (e) => {
    if (!touch) return;
    const dx = e.changedTouches[0].clientX - touch.x;
    const dy = e.changedTouches[0].clientY - touch.y;
    touch = null;
    if (Math.abs(dx) < 60 || Math.abs(dy) > 40) return;
    const shift = dx > 0 ? -1 : 1;
    if (state.offset + shift > maxOffset) return;
    go(state.range, state.offset + shift, shift);
  });

  // Нажатие на день недели показывает его число
  root.querySelector('[data-chart="weekdays"]').addEventListener('click', (e) => {
    const day = e.target.closest('.an-day');
    if (!day) return;
    day.parentElement.querySelectorAll('.an-day').forEach((d) => d.classList.toggle('is-active', d === day));
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    moveThumb();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => renderRevenue(root.querySelector('.an-card--wide'), state), 150);
  });

  rangeBox.classList.add('has-thumb');
  // как в «Записях»: подложка пересчитывается при изменении размеров вкладок и после загрузки шрифтов
  const thumbObserver = new ResizeObserver(moveThumb);
  rangeBox.querySelectorAll('[data-range]').forEach((b) => thumbObserver.observe(b));
  document.fonts?.ready.then(moveThumb);
  render(state);
  prefetch();
};
