-- Точка фокуса фото (центр «окна-глаза» на первом экране), в процентах от размеров фото,
-- и ширина окна в процентах от ширины карточки.
ALTER TABLE works ADD COLUMN focus_x REAL NOT NULL DEFAULT 50;
ALTER TABLE works ADD COLUMN focus_y REAL NOT NULL DEFAULT 45;
ALTER TABLE works ADD COLUMN window_w REAL NOT NULL DEFAULT 76;
