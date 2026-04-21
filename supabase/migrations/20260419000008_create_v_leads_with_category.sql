-- ============================================================
-- View: v_leads_with_category
-- Category は DB カラムを持たず View で都度算出する
-- 算出ロジック:
--   Inquiry  : stage.slug = 'generation'
--   MQL      : stage.slug = 'nurturing' AND lead.score >= 50
--   TQL      : stage.slug IN ('qualification', 'sql')
--   其他     : NULL（Opportunity/Customer/Dead は Lead 側ではなく Deal 側で管理）
-- ============================================================

CREATE VIEW v_leads_with_category AS
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
JOIN lead_stages    ls  ON l.stage_id  = ls.id
JOIN lead_statuses  lst ON l.status_id = lst.id
LEFT JOIN lead_temperatures lt ON l.temperature_id = lt.id
WHERE l.deleted_at IS NULL;

COMMENT ON VIEW v_leads_with_category IS
  'Lead + Stage + Status + Temperature を結合し Category を CASE 式で算出する派生ビュー。'
  'Category: inquiry=獲得ステージ / mql=育成(score>=50) / tql=選定・SQL / NULL=その他';
