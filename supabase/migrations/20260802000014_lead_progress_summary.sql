-- ============================================================
-- リードの進捗をステージ × カテゴリで数える
--
-- 一覧だけでは「どの層がどこで滞っているか」が見えない。
-- 件数を面で見るための集計。
--
-- **SECURITY INVOKER のまま**にする（既定）。呼んだ人の権限で leads を
-- 読むので、member には自分の担当分しか数えられない。RLS を回避すると
-- 一覧と集計で件数が食い違う。
-- ============================================================

CREATE OR REPLACE FUNCTION lead_progress_summary()
RETURNS TABLE (
  stage_id      UUID,
  stage_name    TEXT,
  stage_slug    TEXT,
  stage_order   INTEGER,
  is_terminal   BOOLEAN,
  category_id   UUID,
  category_name TEXT,
  category_code TEXT,
  category_color TEXT,
  lead_count    BIGINT
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  -- ステージ × カテゴリの全組み合わせを返す。**件数 0 の枠も出す。**
  -- 該当が無い列や行が消えると、どこが空いているのかが読み取れない
  SELECT
    s.id, s.name, s.slug, s.sort_order, s.is_terminal,
    c.id, c.name, c.code, c.color,
    count(l.id)
    FROM lead_stages s
    CROSS JOIN lead_categories c
    LEFT JOIN leads l
      ON l.stage_id = s.id
     AND l.category_id = c.id
     AND l.deleted_at IS NULL
   WHERE s.deleted_at IS NULL
     AND c.deleted_at IS NULL
   GROUP BY s.id, s.name, s.slug, s.sort_order, s.is_terminal,
            c.id, c.name, c.code, c.color, c.sort_order
   ORDER BY s.sort_order, c.sort_order;
$$;

COMMENT ON FUNCTION lead_progress_summary() IS
  'リードをステージ × カテゴリで数える。RLS が効くので見える範囲だけを数える';
