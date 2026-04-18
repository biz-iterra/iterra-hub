-- ============================================================
-- EX01 deal_ext_inside_sales.url の長さ制約を緩和
-- 背景: CSV取込でUTMパラメータ等を含む実URLが500文字を超えるケースが存在
-- 方針: 500 → 1000 に緩和（実データ最大593文字 + マージン）
-- ============================================================

ALTER TABLE deal_ext_inside_sales
  DROP CONSTRAINT chk_deal_ext_inside_sales_url_length;

ALTER TABLE deal_ext_inside_sales
  ADD CONSTRAINT chk_deal_ext_inside_sales_url_length
  CHECK (url IS NULL OR char_length(url) <= 1000);
