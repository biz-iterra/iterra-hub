-- ============================================================
-- View: v_leads_with_category 再作成
-- 旧: stage.slug と score から CASE で category を算出
-- 新: leads.category_id → lead_categories を LEFT JOIN し、
--      category_code / category_name / category_color を提供
-- DROP → CREATE で完全再定義
-- ============================================================

DROP VIEW IF EXISTS v_leads_with_category;

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
  lc.code         AS category_code,
  lc.name         AS category_name,
  lc.color        AS category_color
FROM leads l
JOIN lead_stages    ls  ON l.stage_id  = ls.id
LEFT JOIN lead_statuses  lst ON l.status_id    = lst.id
LEFT JOIN lead_temperatures lt ON l.temperature_id = lt.id
LEFT JOIN lead_categories   lc ON l.category_id    = lc.id
WHERE l.deleted_at IS NULL;

COMMENT ON VIEW v_leads_with_category IS
  'Lead + Stage + Status + Temperature + Category を結合した派生ビュー。'
  'Category は lead_categories マスタ参照（stage/score とは独立）';
