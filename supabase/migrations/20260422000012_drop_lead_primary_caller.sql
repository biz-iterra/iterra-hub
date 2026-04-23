-- ============================================================
-- leads.primary_caller_id 廃止
-- 社内担当者 (owner_user_id) と重複する概念のため統合
-- v_leads_with_category は l.* を使用しているため
-- DROP → ALTER TABLE → 再作成の順で実行する
-- lead_callers マスタ自体は次のマイグレーション (20260422000013) で DROP
-- ============================================================

-- ビューを先に DROP（primary_caller_id に対する暗黙依存を解除）
DROP VIEW IF EXISTS v_leads_with_category;

-- primary_caller_id カラム削除
ALTER TABLE leads DROP COLUMN primary_caller_id;

-- ビューを再作成（primary_caller_id なし）
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
  'Category は lead_categories マスタ参照（stage/score とは独立）。'
  'primary_caller_id は Phase 10b-3 で廃止。';
