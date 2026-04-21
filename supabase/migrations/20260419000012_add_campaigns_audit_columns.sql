-- ============================================================
-- Fix: campaigns テーブルに監査カラム created_by / last_updated_by を追加
-- 背景:
--   src/actions/campaigns.ts の INSERT/UPDATE で created_by / last_updated_by を
--   書き込んでいるが campaigns テーブルにカラムが存在せずエラーが発生。
--   leads テーブル（20260419000006）の定義と型・nullability を揃える。
-- ============================================================

ALTER TABLE campaigns
  ADD COLUMN created_by     UUID REFERENCES crm_users(id),
  ADD COLUMN last_updated_by UUID REFERENCES crm_users(id);

COMMENT ON COLUMN campaigns.created_by      IS '作成ユーザー（crm_users.id）';
COMMENT ON COLUMN campaigns.last_updated_by IS '最終更新ユーザー（crm_users.id）';

-- ------------------------------------------------------------
-- seed データの backfill
-- seed.sql で投入された3件のサンプルキャンペーンに seed admin ユーザーを設定
-- seed admin = '00000000-0000-0000-0000-000000000001'（seed.sql 参照）
-- ------------------------------------------------------------
UPDATE campaigns
SET
  created_by      = '00000000-0000-0000-0000-000000000001',
  last_updated_by = '00000000-0000-0000-0000-000000000001'
WHERE id IN (
  'a3000000-0000-0000-0000-000000000001',
  'a3000000-0000-0000-0000-000000000002',
  'a3000000-0000-0000-0000-000000000003'
);
