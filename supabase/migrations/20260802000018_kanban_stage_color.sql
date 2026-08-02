-- ============================================================
-- カンバンの列にマスタの色を渡す
--
-- 列の色を並び順から割り当てると、ステージを 1 つ足しただけで既存の列の
-- 色がずれる。バッジ側は既に `color` を使っているので、そことも食い違う。
-- **色はマスタから渡す**（src/lib/kanban-color.ts）。
-- ============================================================

DROP FUNCTION IF EXISTS lead_kanban_cards(INTEGER, TEXT);

CREATE OR REPLACE FUNCTION lead_kanban_cards(
  p_limit         INTEGER DEFAULT 20,
  p_category_code TEXT DEFAULT NULL
)
RETURNS TABLE (
  stage_id          UUID,
  stage_name        TEXT,
  stage_order       INTEGER,
  stage_color       TEXT,
  lead_id           UUID,
  lead_name         TEXT,
  company_name      TEXT,
  score             INTEGER,
  temperature_name  TEXT,
  temperature_color TEXT,
  status_name       TEXT,
  owner_name        TEXT,
  updated_at        TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH ranked AS (
    SELECT
      l.id, l.stage_id, l.lead_name, l.company_name, l.score,
      l.temperature_id, l.status_id, l.owner_user_id, l.updated_at,
      row_number() OVER (
        PARTITION BY l.stage_id
        ORDER BY l.score DESC NULLS LAST, l.updated_at DESC
      ) AS rn
      FROM leads l
     WHERE l.deleted_at IS NULL
       AND (
         p_category_code IS NULL
         OR l.category_id = (SELECT id FROM lead_categories WHERE code = p_category_code)
       )
  )
  SELECT
    s.id, s.name, s.sort_order, s.color,
    r.id, r.lead_name, r.company_name, r.score,
    t.name, t.color,
    st.name,
    u.full_name,
    r.updated_at
    FROM lead_stages s
    LEFT JOIN ranked r ON r.stage_id = s.id AND r.rn <= p_limit
    LEFT JOIN lead_temperatures t ON t.id = r.temperature_id
    LEFT JOIN lead_statuses     st ON st.id = r.status_id
    LEFT JOIN crm_users         u ON u.id = r.owner_user_id
   WHERE s.deleted_at IS NULL
   ORDER BY s.sort_order, r.rn;
$$;

COMMENT ON FUNCTION lead_kanban_cards(INTEGER, TEXT) IS
  'カンバン用。ステージごとに上位 N 件。カテゴリで絞れる。列の色はマスタの color';

-- 集計側でも同じ色を使う（ステージ見出しの色を揃えるため）
DROP FUNCTION IF EXISTS lead_progress_summary(TEXT);

CREATE OR REPLACE FUNCTION lead_progress_summary(p_category_code TEXT DEFAULT NULL)
RETURNS TABLE (
  stage_id     UUID,
  stage_name   TEXT,
  stage_slug   TEXT,
  stage_order  INTEGER,
  stage_color  TEXT,
  is_terminal  BOOLEAN,
  status_id    UUID,
  status_name  TEXT,
  status_order INTEGER,
  lead_count   BIGINT
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    s.id, s.name, s.slug, s.sort_order, s.color, s.is_terminal,
    st.id, st.name, st.sort_order,
    count(l.id)
    FROM lead_stages s
    LEFT JOIN lead_statuses st ON st.stage_id = s.id AND st.deleted_at IS NULL
    LEFT JOIN leads l
      ON l.stage_id = s.id
     AND (st.id IS NULL OR l.status_id = st.id)
     AND l.deleted_at IS NULL
     AND (
       p_category_code IS NULL
       OR l.category_id = (SELECT id FROM lead_categories WHERE code = p_category_code)
     )
   WHERE s.deleted_at IS NULL
   GROUP BY s.id, s.name, s.slug, s.sort_order, s.color, s.is_terminal,
            st.id, st.name, st.sort_order
   ORDER BY s.sort_order, st.sort_order NULLS FIRST;
$$;

COMMENT ON FUNCTION lead_progress_summary(TEXT) IS
  'リードをステージ × ステータスで数える。カテゴリで絞れる。RLS が効く';
