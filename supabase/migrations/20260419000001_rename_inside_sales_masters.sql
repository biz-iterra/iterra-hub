-- ============================================================
-- M14-M17: inside_sales_* マスタテーブルを lead_* にリネーム
-- 目的: Lead エンティティ導入に伴い、マスタをパイプライン非依存の共通リソースへ昇格
-- 方針:
--   - テーブルリネーム（物理名変更）
--   - インデックス・トリガー・ポリシー・シーケンスも追従してリネーム
--   - FK参照先が変わらないためFKの張り直しは不要
--   - 既存 RLS ポリシーは DROP して再作成（ポリシー名に旧テーブル名が含まれるため）
-- ============================================================

-- ------------------------------------------------------------
-- M14: inside_sales_large_segments → lead_large_segments
-- ------------------------------------------------------------
ALTER TABLE inside_sales_large_segments RENAME TO lead_large_segments;

ALTER INDEX idx_inside_sales_large_segments_active
  RENAME TO idx_lead_large_segments_active;

ALTER TRIGGER trg_inside_sales_large_segments_updated_at
  ON lead_large_segments
  RENAME TO trg_lead_large_segments_updated_at;

-- RLS ポリシー再作成
DROP POLICY inside_sales_large_segments_select_authenticated ON lead_large_segments;
DROP POLICY inside_sales_large_segments_insert_admin         ON lead_large_segments;
DROP POLICY inside_sales_large_segments_update_admin         ON lead_large_segments;
DROP POLICY inside_sales_large_segments_delete_admin         ON lead_large_segments;

CREATE POLICY lead_large_segments_select_authenticated ON lead_large_segments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY lead_large_segments_insert_admin ON lead_large_segments
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY lead_large_segments_update_admin ON lead_large_segments
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY lead_large_segments_delete_admin ON lead_large_segments
  FOR DELETE TO authenticated USING (is_admin());

COMMENT ON TABLE lead_large_segments IS 'リード 大セグメント（旧: inside_sales_large_segments）';

-- ------------------------------------------------------------
-- M15: inside_sales_small_segments → lead_small_segments
-- ------------------------------------------------------------
ALTER TABLE inside_sales_small_segments RENAME TO lead_small_segments;

ALTER INDEX idx_inside_sales_small_segments_large
  RENAME TO idx_lead_small_segments_large;
ALTER INDEX idx_inside_sales_small_segments_active
  RENAME TO idx_lead_small_segments_active;

ALTER TRIGGER trg_inside_sales_small_segments_updated_at
  ON lead_small_segments
  RENAME TO trg_lead_small_segments_updated_at;

-- FK 制約名は内部名のため変更不要だが、COMMENT 用に整理
-- （inside_sales_small_segments の FK は lead_large_segments を参照。名前は変わらない）

-- RLS ポリシー再作成
DROP POLICY inside_sales_small_segments_select_authenticated ON lead_small_segments;
DROP POLICY inside_sales_small_segments_insert_admin         ON lead_small_segments;
DROP POLICY inside_sales_small_segments_update_admin         ON lead_small_segments;
DROP POLICY inside_sales_small_segments_delete_admin         ON lead_small_segments;

CREATE POLICY lead_small_segments_select_authenticated ON lead_small_segments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY lead_small_segments_insert_admin ON lead_small_segments
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY lead_small_segments_update_admin ON lead_small_segments
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY lead_small_segments_delete_admin ON lead_small_segments
  FOR DELETE TO authenticated USING (is_admin());

COMMENT ON TABLE lead_small_segments IS 'リード 小セグメント（旧: inside_sales_small_segments）';

-- ------------------------------------------------------------
-- M16: inside_sales_call_statuses → lead_call_statuses
-- ------------------------------------------------------------
ALTER TABLE inside_sales_call_statuses RENAME TO lead_call_statuses;

ALTER INDEX idx_inside_sales_call_statuses_active
  RENAME TO idx_lead_call_statuses_active;

ALTER TRIGGER trg_inside_sales_call_statuses_updated_at
  ON lead_call_statuses
  RENAME TO trg_lead_call_statuses_updated_at;

-- RLS ポリシー再作成
DROP POLICY inside_sales_call_statuses_select_authenticated ON lead_call_statuses;
DROP POLICY inside_sales_call_statuses_insert_admin         ON lead_call_statuses;
DROP POLICY inside_sales_call_statuses_update_admin         ON lead_call_statuses;
DROP POLICY inside_sales_call_statuses_delete_admin         ON lead_call_statuses;

CREATE POLICY lead_call_statuses_select_authenticated ON lead_call_statuses
  FOR SELECT TO authenticated USING (true);
CREATE POLICY lead_call_statuses_insert_admin ON lead_call_statuses
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY lead_call_statuses_update_admin ON lead_call_statuses
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY lead_call_statuses_delete_admin ON lead_call_statuses
  FOR DELETE TO authenticated USING (is_admin());

COMMENT ON TABLE lead_call_statuses IS 'リード 架電ステータス（旧: inside_sales_call_statuses）';

-- ------------------------------------------------------------
-- M17: inside_sales_callers → lead_callers
-- ------------------------------------------------------------
ALTER TABLE inside_sales_callers RENAME TO lead_callers;

ALTER INDEX idx_inside_sales_callers_active
  RENAME TO idx_lead_callers_active;
ALTER INDEX idx_inside_sales_callers_linked_user
  RENAME TO idx_lead_callers_linked_user;

ALTER TRIGGER trg_inside_sales_callers_updated_at
  ON lead_callers
  RENAME TO trg_lead_callers_updated_at;

-- RLS ポリシー再作成
DROP POLICY inside_sales_callers_select_authenticated ON lead_callers;
DROP POLICY inside_sales_callers_insert_admin         ON lead_callers;
DROP POLICY inside_sales_callers_update_admin         ON lead_callers;
DROP POLICY inside_sales_callers_delete_admin         ON lead_callers;

CREATE POLICY lead_callers_select_authenticated ON lead_callers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY lead_callers_insert_admin ON lead_callers
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY lead_callers_update_admin ON lead_callers
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY lead_callers_delete_admin ON lead_callers
  FOR DELETE TO authenticated USING (is_admin());

COMMENT ON TABLE lead_callers IS 'リード 架電担当者マスタ（旧: inside_sales_callers）';
COMMENT ON COLUMN lead_callers.caller_type IS 'internal=社内 / external=社外BPO等';
COMMENT ON COLUMN lead_callers.linked_user_id IS 'internal のとき任意で crm_users と紐付け';
