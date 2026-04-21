-- ============================================================
-- Fix: v_leads_with_category の JOIN を LEFT JOIN に変更
-- 背景:
--   20260419000009 で leads.status_id が NULL 許容になったが
--   20260419000008 の View は INNER JOIN のままで status_id=NULL の
--   Opportunity リードが View から消えてしまう問題を修正。
-- 変更:
--   lead_statuses / lead_temperatures を LEFT JOIN に変更。
--   lead_stages は必須（stage_id NOT NULL）のため INNER JOIN 維持。
-- ============================================================

CREATE OR REPLACE VIEW v_leads_with_category AS
SELECT
  l.*,
  ls.slug         AS stage_slug,
  ls.name         AS stage_name,
  ls.is_terminal,
  ls.auto_promote_to_deal,
  lst.code        AS status_code,
  lst.name        AS status_name,
  lt.code         AS temperature_code,
  lt.name         AS temperature_name,
  lt.color        AS temperature_color,
  CASE
    WHEN ls.slug = 'generation'                                THEN 'inquiry'
    WHEN ls.slug = 'nurturing'   AND (l.score IS NULL OR l.score >= 50) THEN 'mql'
    WHEN ls.slug IN ('qualification', 'sql')                   THEN 'tql'
    ELSE NULL
  END             AS category
FROM leads l
JOIN  lead_stages    ls  ON l.stage_id  = ls.id
LEFT JOIN lead_statuses  lst ON l.status_id = lst.id
LEFT JOIN lead_temperatures lt ON l.temperature_id = lt.id
WHERE l.deleted_at IS NULL;

COMMENT ON VIEW v_leads_with_category IS
  'Lead + Stage + Status + Temperature を結合し Category を CASE 式で算出する派生ビュー。'
  'Category: inquiry=獲得ステージ / mql=育成(score>=50) / tql=選定・SQL / NULL=その他'
  '20260419000011: lead_statuses / lead_temperatures を LEFT JOIN に変更（Opportunity の status_id=NULL 対応）';
