-- Базовая схема. Время хранится в минутах от полуночи, даты строкой YYYY-MM-DD (Europe/Minsk).

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL -- JSON
);

CREATE TABLE categories (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE services (
  id           INTEGER PRIMARY KEY,
  category_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  price_byn    INTEGER NOT NULL CHECK (price_byn >= 0),
  duration_min INTEGER NOT NULL CHECK (duration_min > 0),
  gradient     TEXT NOT NULL DEFAULT 'gray' CHECK (gradient IN ('blue', 'pink', 'gray', 'dark')),
  tile         TEXT NOT NULL DEFAULT '1x1' CHECK (tile IN ('1x1', '2x1', '1x2')),
  is_popular   INTEGER NOT NULL DEFAULT 0,
  is_active    INTEGER NOT NULL DEFAULT 1,
  sort         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE effects (
  id           INTEGER PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  profile_json TEXT NOT NULL, -- 5 длин в мм, от внутреннего угла к внешнему
  is_active    INTEGER NOT NULL DEFAULT 1,
  sort         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE works (
  id         INTEGER PRIMARY KEY,
  file_key   TEXT NOT NULL UNIQUE, -- /uploads/works/{file_key}-1600.webp и -600.webp
  width      INTEGER NOT NULL,
  height     INTEGER NOT NULL,
  caption    TEXT NOT NULL DEFAULT '',
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE reviews (
  id        INTEGER PRIMARY KEY,
  author    TEXT NOT NULL,
  text      TEXT NOT NULL,
  rating    INTEGER NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  is_active INTEGER NOT NULL DEFAULT 1,
  sort      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE working_hours (
  weekday    INTEGER PRIMARY KEY CHECK (weekday BETWEEN 0 AND 6), -- 0 = воскресенье
  is_working INTEGER NOT NULL DEFAULT 1,
  start_min  INTEGER NOT NULL DEFAULT 600,
  end_min    INTEGER NOT NULL DEFAULT 1140
);

CREATE TABLE schedule_exceptions (
  date       TEXT PRIMARY KEY,
  is_day_off INTEGER NOT NULL DEFAULT 1,
  start_min  INTEGER,
  end_min    INTEGER,
  note       TEXT NOT NULL DEFAULT ''
);

CREATE TABLE bookings (
  id            INTEGER PRIMARY KEY,
  service_id    INTEGER REFERENCES services(id) ON DELETE SET NULL,
  -- снимок услуги на момент записи, чтобы правки прайса не меняли историю
  service_title TEXT NOT NULL,
  price_byn     INTEGER NOT NULL,
  duration_min  INTEGER NOT NULL,
  effect_slug   TEXT,
  effect_name   TEXT,
  date          TEXT NOT NULL,
  start_min     INTEGER NOT NULL,
  end_min       INTEGER NOT NULL,
  client_name   TEXT NOT NULL,
  contact       TEXT NOT NULL,
  comment       TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'confirmed', 'cancelled', 'done')),
  source        TEXT NOT NULL DEFAULT 'site' CHECK (source IN ('site', 'admin')),
  ip            TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX bookings_date_status ON bookings (date, status);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY, -- sha256 от значения cookie, сам токен в БД не хранится
  expires_at INTEGER NOT NULL -- unix ms
);
