-- ============================================================
-- lead_scoring_rules → lead_score_thresholds リネーム
-- 役割は据え置き: score範囲 → temperature_id 変換用マスタ
-- Phase 2 以降で新設する lead_score_rules（加点ルール）と
-- 混同しないよう名称を整理する。
-- ============================================================

-- 1. テーブル本体のリネーム
ALTER TABLE lead_scoring_rules RENAME TO lead_score_thresholds;

-- 2. インデックスのリネーム
ALTER INDEX idx_lead_scoring_rules_active      RENAME TO idx_lead_score_thresholds_active;
ALTER INDEX idx_lead_scoring_rules_temperature RENAME TO idx_lead_score_thresholds_temperature;

-- 3. 制約名のリネーム
ALTER TABLE lead_score_thresholds
  RENAME CONSTRAINT chk_lead_scoring_rules_score_range
  TO chk_lead_score_thresholds_score_range;

-- 4. トリガ名のリネーム
ALTER TRIGGER trg_lead_scoring_rules_updated_at
  ON lead_score_thresholds
  RENAME TO trg_lead_score_thresholds_updated_at;

-- 5. RLS ポリシー名のリネーム
ALTER POLICY lead_scoring_rules_select_authenticated ON lead_score_thresholds
  RENAME TO lead_score_thresholds_select_authenticated;
ALTER POLICY lead_scoring_rules_insert_admin ON lead_score_thresholds
  RENAME TO lead_score_thresholds_insert_admin;
ALTER POLICY lead_scoring_rules_update_admin ON lead_score_thresholds
  RENAME TO lead_score_thresholds_update_admin;
ALTER POLICY lead_scoring_rules_delete_admin ON lead_score_thresholds
  RENAME TO lead_score_thresholds_delete_admin;

-- 6. COMMENT の更新
COMMENT ON TABLE lead_score_thresholds IS 'スコア範囲→温度感変換マップ（旧: lead_scoring_rules）。Server Actionでscore更新時に参照してtemperature_idを設定する';
COMMENT ON COLUMN lead_score_thresholds.max_score IS 'NULL の場合は上限なし（例: hot は 80 以上）';
