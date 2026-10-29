// Демо-данные. Запускается только на пустой базе, существующие данные не трогает.
// Полный сброс: удалите data/app.db и public/uploads/works, затем npm run seed.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../src/config.js';
import { db } from '../src/db/db.js';
import { saveSettings } from '../src/db/repos/settings.js';
import { saveWorkingHours } from '../src/db/repos/schedule.js';
import { saveWorkImage } from '../src/lib/images.js';

const alreadySeeded = db.prepare("SELECT 1 FROM settings WHERE key = 'master_name'").get();
if (alreadySeeded) {
  console.log('База уже заполнена, seed пропущен');
  process.exit(0);
}

const SETTINGS = {
  master_name: 'Алина Орлова',
  studio_name: 'Orlova Lash',
  city: 'Минск',
  address: 'ул. Притыцкого, 2, студия 14',
  metro: 'м. Фрунзенская',
  phone: '+375 29 123-45-67',
  telegram: 'orlova_lash',
  instagram: 'https://instagram.com/orlova.lash',
  whatsapp: 'https://wa.me/375291234567',
  accent_color: '#F2D2D8',
  hero_title: 'Ресницы под форму ваших глаз',
  hero_subtitle: 'Подбираю изгиб, длину и эффект под разрез глаз, а не под тренд. Лёгкие ресницы, которые носятся 3–4 недели.',
  seo_description:
    'Наращивание ресниц в Минске у м. Фрунзенская. Классика и объём 1,5D–4D, подбор эффекта под форму глаз. Онлайн-запись на удобное время.',
  why_title: 'Почему я',
  why_items: [
    { title: 'Подбор под глаза', text: 'Смотрю на посадку и разрез глаз и только потом выбираю изгиб и эффект.' },
    { title: 'Стерильность', text: 'Инструменты проходят стерилизацию в сухожаре, крафт-пакеты вскрываю при вас.' },
    { title: 'Бережные материалы', text: 'Гипоаллергенный клей и лёгкие ресницы, которые не утяжеляют свои.' },
    { title: 'Носка 3–4 недели', text: 'Правильная изоляция и фиксация: ресницы держатся до коррекции.' },
  ],
  visit_steps: [
    { title: 'Консультация', text: 'Обсуждаем образ, смотрим форму глаз и выбираем эффект на схеме.' },
    { title: 'Процедура', text: 'Вы лежите с закрытыми глазами, многие засыпают. От 2,5 до 3,5 часов.' },
    { title: 'Уход', text: 'Расчёсываю, рассказываю, как ухаживать, и записываю на коррекцию.' },
  ],
  rules: [
    { title: 'Запись на 3 недели', text: 'Окна открыты на три недели вперёд, новые даты появляются каждый день.' },
    { title: 'Перенос за 24 часа', text: 'Если планы изменились, напишите не позже чем за сутки до визита.' },
    { title: 'Опоздание до 15 минут', text: 'Дальше процедура может не поместиться, и запись придётся перенести.' },
    { title: 'Отмена за 24 часа', text: 'Так я успею предложить время другой клиентке.' },
  ],
  checklist: [
    'Приходите без макияжа на глазах или снимите его заранее',
    'Не завивайте ресницы и не красьте их тушью в день процедуры',
    'Снимите контактные линзы: возьмите очки или футляр',
    'Не пейте много кофе перед визитом: глаза будут спокойнее',
    'Возьмите наушники, если любите слушать музыку или подкасты',
  ],
  slot_step_min: 30,
  booking_horizon_days: 14,
};

const CATEGORIES = ['Наращивание', 'Снятие'];

// [категория, название, описание, цена, минуты, градиент, плитка, популярное]
const SERVICES = [
  [0, 'Классика', 'Одна искусственная ресница на каждую свою. Естественно, как будто это ваши.', 60, 150, 'blue', '2x1', false],
  [0, 'Объём 1,5D', 'Через ресничку пучок из двух. Чуть гуще классики, без эффекта «кукольности».', 63, 155, 'gray', '1x1', false],
  [0, 'Объём 2D', 'Пучок из двух ресниц. Самый популярный выбор: заметно, но легко.', 65, 165, 'pink', '1x2', true],
  [0, 'Объём 2,5D', 'Чередование 2D и 3D. Плотнее у внешнего угла, мягко у внутреннего.', 68, 170, 'gray', '1x1', false],
  [0, 'Объём 3D', 'Пучок из трёх тонких ресниц. Выразительный взгляд без макияжа.', 70, 180, 'blue', '1x2', false],
  [0, 'Объём 3,5D', 'Между 3D и 4D. Для тех, кому 3D мало, а 4D уже много.', 73, 195, 'gray', '1x1', false],
  [0, 'Объём 4D', 'Плотный, насыщенный ряд. Эффект подводки без стрелок.', 75, 210, 'dark', '2x1', false],
  [1, 'Снятие без наращивания', 'Бережно растворяю клей ремувером, свои ресницы остаются целыми.', 10, 30, 'gray', '1x1', false],
  [1, 'Снятие чужой работы', 'Сниму наращивание другого мастера перед новой процедурой.', 10, 30, 'pink', '1x1', false],
];

const EFFECTS = [
  ['natural', 'Натуральный', 'Длина плавно растёт от внутреннего угла к середине и мягко держится до края. Подходит почти всем и выглядит как свои ресницы.', [8, 9, 10, 10, 11]],
  ['doll', 'Кукольный', 'Самые длинные ресницы в центре. Глаз визуально округляется и раскрывается. Хорош для узкого и миндалевидного разреза.', [8, 10, 12, 10, 8]],
  ['fox', 'Лисий', 'Длина нарастает к внешнему углу и вытягивает глаз. Эффект стрелки без подводки, особенно на круглых глазах.', [8, 9, 10, 11, 12]],
  ['squirrel', 'Беличий', 'Акцент чуть до внешнего угла, а сам угол короче. Приподнимает взгляд, когда уголки глаз опущены.', [8, 9, 11, 12, 10]],
];

const REVIEWS = [
  ['Катерина', 'Хожу к Алине уже год. Ресницы держатся до коррекции, ни одного залома. И на процедуре я каждый раз высыпаюсь.', 5],
  ['Ольга', 'Боялась, что будет «слишком», а получилось ровно как свои, только лучше. Лисий эффект подобрали идеально под мои глаза.', 5],
  ['Мария', 'Очень чисто, всё стерильно, приятная музыка. Записалась онлайн за минуту, в Telegram сразу пришло подтверждение.', 5],
];

// [файл, подпись, [фокус X %, фокус Y %, ширина окна %] для первого экрана]
const WORK_FILES = [
  ['Gemini_Generated_Image_g2eks8g2eks8g2ek.jpg', 'Объём 3D, лисий эффект', [42, 60, 70]],
  ['Gemini_Generated_Image_eq1vg6eq1vg6eq1v.jpg', 'Объём 2D, мокрый эффект'],
  ['Gemini_Generated_Image_htqyhphtqyhphtqy.jpg', 'Объём 2,5D, лисий эффект'],
  ['Gemini_Generated_Image_mco8lfmco8lfmco8.jpg', 'Объём 4D, кукольный эффект'],
];

db.transaction(() => {
  saveSettings(SETTINGS);

  // Пн–Сб 10:00–19:00, воскресенье выходной
  saveWorkingHours(
    [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, is_working: weekday !== 0, start_min: 600, end_min: 1140 })),
  );

  const insertCategory = db.prepare('INSERT INTO categories (name, sort) VALUES (?, ?)');
  const categoryIds = CATEGORIES.map((name, i) => insertCategory.run(name, i).lastInsertRowid);

  const insertService = db.prepare(
    `INSERT INTO services (category_id, title, description, price_byn, duration_min, gradient, tile, is_popular, sort)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  SERVICES.forEach(([cat, title, desc, price, minutes, gradient, tile, popular], i) =>
    insertService.run(categoryIds[cat], title, desc, price, minutes, gradient, tile, popular ? 1 : 0, i),
  );

  const insertEffect = db.prepare('INSERT INTO effects (slug, name, description, profile_json, sort) VALUES (?, ?, ?, ?, ?)');
  EFFECTS.forEach(([slug, name, desc, profile], i) => insertEffect.run(slug, name, desc, JSON.stringify(profile), i));

  const insertReview = db.prepare('INSERT INTO reviews (author, text, rating, sort) VALUES (?, ?, ?, ?)');
  REVIEWS.forEach(([author, text, rating], i) => insertReview.run(author, text, rating, i));
})();

const insertWork = db.prepare(
  'INSERT INTO works (file_key, width, height, caption, sort, focus_x, focus_y, window_w) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
);
let heroWorkId = null;
for (const [index, [file, caption, focus = [50, 45, 76]]] of WORK_FILES.entries()) {
  const source = path.join(ROOT, 'image', file);
  if (!fs.existsSync(source)) continue;
  const saved = await saveWorkImage(fs.readFileSync(source));
  const id = insertWork.run(saved.file_key, saved.width, saved.height, caption, index, ...focus).lastInsertRowid;
  heroWorkId ??= id;
}
if (heroWorkId) saveSettings({ hero_work_id: heroWorkId });

console.log('Демо-данные добавлены');
