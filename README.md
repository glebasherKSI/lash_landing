# Orlova Lash: лендинг мастера по наращиванию ресниц

Сайт с онлайн-записью и админкой. Услуги, цены, длительность, фото работ, расписание, эффекты конструктора, отзывы и тексты хозяйка сайта меняет сама в `/admin`, правка кода не нужна.

Стек: Node.js 20+, Express 5, SQLite (better-sqlite3), шаблоны Eta, zod, GSAP + ScrollTrigger (локально), multer + sharp.

## Запуск

```bash
npm i
npm run dev
```

При первом запуске `npm run dev`:

1. создаёт `.env` со случайным паролем администратора и **один раз печатает пароль в консоль** (в файлах хранится только хеш, поэтому сохраните пароль);
2. применяет миграции из `migrations/`;
3. заполняет демо-данные: студия Orlova Lash, прайс, эффекты, отзывы, 4 фото из `image/`;
4. копирует GSAP из `node_modules` в `public/vendor`.

Сайт: http://localhost:3000, админка: http://localhost:3000/admin.

Тесты расчёта слотов: `npm test`.

## Структура

```
migrations/          SQL-миграции, применяются по порядку при старте
scripts/             prepare (первый запуск), seed, hash-password, vendor
src/
  server.js          Express, helmet/CSP, статика, обработка ошибок
  config.js          чтение и проверка .env
  db/                подключение, мигратор, репозитории
  lib/               слоты, запись, сессии, CSRF, изображения, Telegram, даты
  routes/            публичные страницы, /api, /admin, sitemap/robots
  validation/        zod-схемы
  views/             шаблоны Eta (public/, admin/, partials/)
public/
  css/ js/           стили и скрипты сайта и админки
  js/lash-geometry.js  геометрия схемы ресниц (общая для сервера, сайта и админки)
  uploads/works/     загруженные фото (WebP 1600 px и 600 px)
deploy/              pm2 и nginx
test/                тесты
```

## Переменные окружения (`.env`)

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `NODE_ENV` | `development` | `production` на сервере: кеш шаблонов, secure-cookie, HSTS |
| `PORT` | `3000` | порт |
| `HOST` | `127.0.0.1` | `0.0.0.0` в Docker |
| `SITE_URL` | `http://localhost:3000` | публичный адрес: sitemap, Open Graph, JSON-LD |
| `DB_PATH` | `data/app.db` | файл базы SQLite |
| `ADMIN_PASSWORD_HASH` | — | **обязательно**, argon2-хеш пароля админа |
| `SESSION_TTL_HOURS` | `12` | сколько живёт вход в админку |
| `TRUST_PROXY` | `false` | `true` за nginx, чтобы rate limit видел настоящий IP |
| `TELEGRAM_BOT_TOKEN` | — | токен бота для уведомлений о заявках (необязательно) |
| `TELEGRAM_CHAT_ID` | — | куда слать уведомления |

## Как сменить пароль администратора

```bash
npm run hash-password -- "новый-надёжный-пароль"
```

Скрипт выведет строку `ADMIN_PASSWORD_HASH=…`. Замените ею строку в `.env` и перезапустите сервер. Активные входы при этом сохраняются до истечения сессии. Чтобы сбросить и их, удалите строки таблицы `sessions`.

## Уведомления в Telegram

1. Создайте бота у [@BotFather](https://t.me/BotFather) и возьмите токен.
2. Напишите боту любое сообщение, затем откройте `https://api.telegram.org/bot<ТОКЕН>/getUpdates` и найдите `chat.id`.
3. Пропишите `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID` в `.env`, перезапустите сервер.

Если Telegram недоступен, запись всё равно создаётся, ошибка уходит только в лог.

## Как устроена запись

- Слоты считаются на сервере из рабочих часов (с учётом исключений по датам), длительности услуги, шага сетки и уже существующих записей. Отменённые записи время не занимают.
- Время недоступно, если процедура не успевает закончиться до конца рабочего дня или пересекается с другой записью. На сегодня запись открыта не раньше чем через час.
- `POST /api/bookings` проверяет данные через zod, затем перепроверяет слот и создаёт запись в одной `IMMEDIATE`-транзакции, поэтому одно время нельзя занять дважды.
- Защита от спама: honeypot-поле, rate limit по IP (6 заявок в час), CSRF-токен.

## Сброс демо-данных

```bash
rm -rf data public/uploads/works
npm run seed
```

`npm run seed` ничего не делает, если база уже заполнена.

## Развёртывание

### Вариант 1: Docker

```bash
cp .env.example .env
docker compose build
docker compose run --rm --no-deps web node scripts/hash-password.js "пароль"
# впишите хеш в .env, укажите SITE_URL=https://ваш-домен, NODE_ENV=production, TRUST_PROXY=true
docker compose up -d
docker compose exec web node scripts/seed.js   # только если нужны демо-данные
```

База и фото лежат в `./data` и `./public/uploads` на хосте, поэтому переживают пересборку контейнера. Контейнер слушает `127.0.0.1:3000`, а снаружи его открывает nginx (см. ниже).

### Вариант 2: pm2 + nginx

```bash
# на сервере, Node.js 20+
git clone … /var/www/orlova-lash && cd /var/www/orlova-lash
npm ci --omit=dev
npm run vendor
cp .env.example .env && npm run hash-password -- "пароль"   # заполните .env
npm i -g pm2
pm2 start deploy/ecosystem.config.cjs
pm2 save && pm2 startup
```

Nginx: скопируйте `deploy/nginx.conf` в `/etc/nginx/sites-available/`, замените домен и путь, включите сайт и выпустите сертификат через `certbot --nginx`. В `.env` поставьте `TRUST_PROXY=true`.

Запускайте один процесс: SQLite и rate limit живут в одном процессе, кластер не нужен.

### Резервные копии

Достаточно двух вещей: базы и загруженных фото.

```bash
sqlite3 data/app.db ".backup backup/app-$(date +%F).db"
tar czf backup/uploads-$(date +%F).tgz public/uploads
```

## Безопасность

- helmet со строгим CSP: скрипты только свои, один inline-стиль с nonce (акцентный цвет).
- Пароль хранится только как argon2id-хеш. Вход ограничен 5 неудачными попытками за 15 минут.
- Сессия в httpOnly-cookie (`SameSite=Lax`, `Secure` в продакшене). В базе лежит sha256 от токена, а не сам токен.
- CSRF-токен (double-submit cookie) на всех POST.
- Фото проверяются по содержимому через sharp, а не по расширению; принимаются JPG, PNG, WebP, HEIC до 15 МБ. EXIF и геометки удаляются.
- Вывод в шаблонах экранируется.
