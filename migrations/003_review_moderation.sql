-- Отзывы с сайта: приходят скрытыми и ждут проверки мастером в админке.
ALTER TABLE reviews ADD COLUMN is_pending INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reviews ADD COLUMN source TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE reviews ADD COLUMN created_at TEXT;
