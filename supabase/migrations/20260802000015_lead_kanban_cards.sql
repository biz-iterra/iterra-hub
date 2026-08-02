-- ============================================================
-- カンバンに並べるリードを取る
--
-- リードは 3,800 件あり、全部をカードにすると開けない。
-- **ステージごとに上位だけ**を返す。総数は lead_progress_summary で数える。
--
-- 並びはスコアの高い順。追客の判断に使うので、点の高いものから見る。
--
-- SECURITY INVOKER のまま（既定）。集計と同じく RLS が効く範囲だけを返す。
-- ============================================================

CREATE OR REPLACE FUNCTION lead_kanban_cards(p_limit INTEGER DEFAULT 20)
RETURNS TABLE (
  stage_id          UUID,
  stage_name        TEXT,
  stage_order       INTEGER,
  lead_id           UUID,
  lead_name         TEXT,
  company_name      TEXT,
  score             INTEGER,
  temperature_name  TEXT,
  temperature_color TEXT,
  category_name     TEXT,
  category_color    TEXT,
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
      l.temperature_id, l.category_id, l.owner_user_id, l.updated_at,
      row_number() OVER (
        PARTITION BY l.stage_id
        ORDER BY l.score DESC NULLS LAST, l.updated_at DESC
      ) AS rn
      FROM leads l
     WHERE l.deleted_at IS NULL
  )
  SELECT
    s.id, s.name, s.sort_order,
    r.id, r.lead_name, r.company_name, r.score,
    t.name, t.color,
    c.name, c.color,
    u.full_name,
    r.updated_at
    FROM lead_stages s
    -- 件数 0 のステージも列として出す
    LEFT JOIN ranked r ON r.stage_id = s.id AND r.rn <= p_limit
    LEFT JOIN lead_temperatures t ON t.id = r.temperature_id
    LEFT JOIN lead_categories   c ON c.id = r.category_id
    LEFT JOIN crm_users         u ON u.id = r.owner_user_id
   WHERE s.deleted_at IS NULL
   ORDER BY s.sort_order, r.rn;
$$;

COMMENT ON FUNCTION lead_kanban_cards(INTEGER) IS
  'カンバン用。ステージごとに上位 N 件を返す。総数は lead_progress_summary で数える';
