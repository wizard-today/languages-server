-- ══════════════════════════════════════════════════════════
-- ИНИЦИАЛИЗАЦИЯ ТАБЛИЦ
-- Запускать в Supabase SQL Editor или через psql
-- ══════════════════════════════════════════════════════════

-- Интервалы повторений (бывший REPEATS_DB)
CREATE TABLE IF NOT EXISTS repeats (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  duration  TEXT        NOT NULL,
  timestamp INTEGER     NOT NULL,  -- порядок сортировки
  UNIQUE (timestamp)
);

-- Категории (бывший CATEGORIES_DB)
CREATE TABLE IF NOT EXISTS categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  short_name TEXT NOT NULL DEFAULT '',
  collapsed  BOOLEAN NOT NULL DEFAULT FALSE
);

-- Вложенность категорий (many-to-many: parent → children)
CREATE TABLE IF NOT EXISTS category_nested (
  parent_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  child_id  UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (parent_id, child_id)
);

-- Карточки (бывший CARDS_DB)
CREATE TABLE IF NOT EXISTS cards (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  question              TEXT        NOT NULL,
  answer                TEXT        NOT NULL DEFAULT '',
  comment               TEXT        NOT NULL DEFAULT '',
  category_id           UUID        REFERENCES categories(id) ON DELETE SET NULL,
  repeat_after_id       UUID        REFERENCES repeats(id) ON DELETE SET NULL,
  repeat_date           TIMESTAMPTZ,

  -- Карточка «готова к повторению» если:
  --   repeat_date IS NULL (ещё ни разу не выучена)
  --   ИЛИ repeat_date <= now()
  CONSTRAINT repeatable_check CHECK (TRUE) -- логика вынесена в view
);

-- Индексы для частых запросов
CREATE INDEX IF NOT EXISTS idx_cards_category_id     ON cards(category_id);
CREATE INDEX IF NOT EXISTS idx_cards_repeat_date     ON cards(repeat_date);
CREATE INDEX IF NOT EXISTS idx_category_nested_parent ON category_nested(parent_id);

-- ── View: карточки, готовые к повторению ──────────────────
CREATE OR REPLACE VIEW repeatable_cards AS
  SELECT *
  FROM   cards
  WHERE  repeat_date IS NULL OR repeat_date <= NOW();

-- ══════════════════════════════════════════════════════════
-- ФУНКЦИЯ: подсчёт карточек для дерева категорий
-- Возвращает для каждой категории:
--   cards_count        — общее число карточек
--   repeat_cards_count — карточки, готовые к повторению
-- ══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_category_card_counts(category_ids UUID[])
RETURNS TABLE(
  category_id        UUID,
  cards_count        BIGINT,
  repeat_cards_count BIGINT
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    c.category_id,
    COUNT(*)                                                            AS cards_count,
    COUNT(*) FILTER (WHERE c.repeat_date IS NULL OR c.repeat_date <= NOW()) AS repeat_cards_count
  FROM   cards c
  WHERE  c.category_id = ANY(category_ids)
  GROUP  BY c.category_id;
$$;
