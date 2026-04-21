-- ============================================================
-- M13 inside_sales_phases 廃止 + deal_stages.phase_id カラム削除
-- 目的:
--   - inside_sales_phases は lead_temperatures (M20) に統合するため廃止
--   - v_account_current_phase は deal_stages.phase_id に依存しているため先に DROP
--   - deal_stages.phase_id カラムは DB-FK なし（アプリ層参照のみ）なので DROP のみ
-- 注意:
--   - 20260418000006_alter_deal_stages_add_phase.sql でカラム追加したが、
--     既存マイグレーション修正禁止のため本マイグレーションで対応する
-- ============================================================

-- ------------------------------------------------------------
-- Step 1: v_account_current_phase を DROP（deal_stages.phase_id に依存）
-- インサイドセールス pipeline の phase 派生ビューは inside_sales_phases 廃止で意味をなさなくなる。
-- Lead 導入後に必要な View は新規マイグレーションで再定義する。
-- ------------------------------------------------------------
DROP VIEW IF EXISTS v_account_current_phase;

-- ------------------------------------------------------------
-- Step 2: deal_stages.phase_id カラムを DROP
-- index も一緒に削除
-- ------------------------------------------------------------
DROP INDEX IF EXISTS idx_deal_stages_phase_id;

ALTER TABLE deal_stages DROP COLUMN IF EXISTS phase_id;

-- ------------------------------------------------------------
-- Step 3: inside_sales_phases の RLS ポリシーを DROP してからテーブル DROP
-- ------------------------------------------------------------
DROP POLICY IF EXISTS inside_sales_phases_select_authenticated ON inside_sales_phases;
DROP POLICY IF EXISTS inside_sales_phases_insert_admin         ON inside_sales_phases;
DROP POLICY IF EXISTS inside_sales_phases_update_admin         ON inside_sales_phases;
DROP POLICY IF EXISTS inside_sales_phases_delete_admin         ON inside_sales_phases;

DROP TABLE IF EXISTS inside_sales_phases;

COMMENT ON TABLE deal_stages IS 'ディールステージ（phase_id カラムは 20260419000002 で廃止。温度感は lead_temperatures で管理）';
