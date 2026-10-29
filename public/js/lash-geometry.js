// Геометрия схемы глаза. Общий модуль: импортируется сервером (первичный SVG),
// сайтом (конструктор эффекта) и админкой (живое превью профиля).

// Верхнее веко: квадратичная кривая Безье. Внутренний угол слева, внешний справа.
export const LID = { p0: [60, 230], p1: [300, 40], p2: [540, 230] };
export const PX_PER_MM = 8;

// width — толщина основания ресницы в px (к кончику сходится в ноль).
export const LINES = [
  { count: 34, offset: 0, scale: 1, width: 2.6 },
  { count: 33, offset: 0.5, scale: 0.78, width: 1.6 },
];

// Участок кривой, на котором растут ресницы (у самых уголков их нет).
const T_START = 0.035;
const T_END = 0.975;

const pointAt = (t) => {
  const { p0, p1, p2 } = LID;
  const a = (1 - t) ** 2;
  const b = 2 * (1 - t) * t;
  const c = t ** 2;
  return [a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1]];
};

const tangentAt = (t) => {
  const { p0, p1, p2 } = LID;
  const dx = 2 * (1 - t) * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]);
  const dy = 2 * (1 - t) * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
  const len = Math.hypot(dx, dy);
  return [dx / len, dy / len];
};

const normalize = ([x, y]) => {
  const len = Math.hypot(x, y) || 1;
  return [x / len, y / len];
};

/** Длина в мм в точке t: линейная интерполяция 5 опорных значений профиля. */
export const lengthAt = (profile, t) => {
  const pos = Math.min(Math.max(t, 0), 1) * (profile.length - 1);
  const i = Math.min(Math.floor(pos), profile.length - 2);
  const f = pos - i;
  return profile[i] * (1 - f) + profile[i + 1] * f;
};

/**
 * Координаты одной линии ресниц: на каждую ресницу 6 чисел
 * (основание, контрольная точка, кончик) для команды «M x y Q cx cy x y».
 * Одинаковое количество чисел у любых профилей позволяет плавно морфить path.
 */
export const lineCoords = (profile, { count, offset, scale }) => {
  const coords = [];
  for (let i = 0; i < count; i++) {
    const u = (i + offset) / (count - 1 + offset * 2 || 1);
    const t = T_START + (T_END - T_START) * u;
    const [bx, by] = pointAt(t);
    const [tx, ty] = tangentAt(t);
    const normal = [ty, -tx]; // от века наружу
    // Ресницы наклонены к внешнему углу, сильнее ближе к нему.
    const dir = normalize([normal[0] + tx * (0.12 + 0.62 * t), normal[1] + ty * (0.12 + 0.62 * t)]);
    const len = lengthAt(profile, t) * PX_PER_MM * scale;
    // Короче у самого внутреннего угла, почти без затухания у внешнего,
    // иначе пропадает разница между эффектами.
    const edge = Math.min(1, 0.55 + t * 7) * Math.min(1, 0.88 + (1 - t) * 5);
    const L = len * edge;
    const cx = bx + dir[0] * L * 0.55;
    const cy = by + dir[1] * L * 0.55;
    // Кончик загибается вверх: смешиваем направление с вертикалью.
    const tipDir = normalize([dir[0] * 0.55, dir[1] * 0.55 - 0.45]);
    const tipX = cx + tipDir[0] * L * 0.5;
    const tipY = cy + tipDir[1] * L * 0.5;
    coords.push(bx, by, cx, cy, tipX, tipY);
  }
  return coords;
};

const f = (v) => v.toFixed(1);

/**
 * Каждая ресница — залитый «клинок»: широкое основание сходится в острый кончик.
 * Строится из координат на каждом кадре, поэтому морфинг координат даёт морфинг формы.
 */
export const coordsToPath = (coords, width = 2) => {
  let d = '';
  for (let i = 0; i < coords.length; i += 6) {
    const [bx, by, cx, cy, tx, ty] = coords.slice(i, i + 6);
    const [nx, ny] = normalize([-(cy - by), cx - bx]);
    const hb = width / 2;
    const hc = width * 0.28;
    d +=
      `M${f(bx + nx * hb)} ${f(by + ny * hb)}` +
      `Q${f(cx + nx * hc)} ${f(cy + ny * hc)} ${f(tx)} ${f(ty)}` +
      `Q${f(cx - nx * hc)} ${f(cy - ny * hc)} ${f(bx - nx * hb)} ${f(by - ny * hb)}Z`;
  }
  return d;
};

/** Обе линии ресниц для профиля: [{ coords, width, d }, …]. */
export const buildLashLines = (profile) =>
  LINES.map((line) => {
    const coords = lineCoords(profile, line);
    return { coords, width: line.width, d: coordsToPath(coords, line.width) };
  });

/* ---------- «Окно-глаз» на фото первого экрана ---------- */

// Область окна в координатах схемы: место под ресницы сверху, само окно — между веками.
export const WINDOW_BOX = { x: 40, y: 20, w: 520, h: 330 };
// Точка схемы, которая совмещается с точкой фокуса фото (между глаз модели).
export const WINDOW_CENTER = { x: 300, y: 210 };
export const ALMOND_PATH = `M${LID.p0.join(' ')}Q${LID.p1.join(' ')} ${LID.p2.join(' ')}Q300 330 ${LID.p0.join(' ')}Z`;

/** Ресницы основной линии как отдельные штрихи «M … Q …» (для прорисовки по одной). */
export const lashStrokes = (profile) => {
  const coords = lineCoords(profile, LINES[0]);
  const strokes = [];
  for (let i = 0; i < coords.length; i += 6) {
    const [bx, by, cx, cy, tx, ty] = coords.slice(i, i + 6).map((v) => v.toFixed(1));
    strokes.push(`M${bx} ${by}Q${cx} ${cy} ${tx} ${ty}`);
  }
  return strokes;
};

/** Путь верхнего века и нижнего (для контура глаза). */
export const LID_PATH = `M${LID.p0.join(' ')}Q${LID.p1.join(' ')} ${LID.p2.join(' ')}`;
export const LOWER_LID_PATH = `M${LID.p0.join(' ')}Q300 330 ${LID.p2.join(' ')}`;

/** Высоты столбиков 0..1 относительно шкалы 6–14 мм. */
export const barRatio = (mm) => Math.min(1, Math.max(0.08, (mm - 4) / 10));
