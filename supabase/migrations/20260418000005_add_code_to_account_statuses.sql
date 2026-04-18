-- ============================================================
-- M07 拡張: account_statuses に code を追加
-- 目的: CSV取込時のマッピングキーとして使用する
-- 方針: VARCHAR(32) UK NN。既存4件（アクティブ/休眠/解約/見込み）に code をバックフィル
-- ============================================================

ALTER TABLE account_statuses
  ADD COLUMN code VARCHAR(32);

COMMENT ON COLUMN account_statuses.code IS 'CSV取込等の外部連携で使用するプログラムキー';

-- 既存シードのバックフィル（seed.sql 116-120 に一致）
UPDATE account_statuses SET code = 'active'   WHERE id = 'c0000000-0000-0000-0000-000000000001';
UPDATE account_statuses SET code = 'inactive' WHERE id = 'c0000000-0000-0000-0000-000000000002';
UPDATE account_statuses SET code = 'churned'  WHERE id = 'c0000000-0000-0000-0000-000000000003';
UPDATE account_statuses SET code = 'prospect' WHERE id = 'c0000000-0000-0000-0000-000000000004';

-- 残レコードがあれば name から簡易スラッグ化
UPDATE account_statuses SET code = 'status_' || replace(id::text, '-', '') WHERE code IS NULL;

ALTER TABLE account_statuses
  ALTER COLUMN code SET NOT NULL,
  ADD CONSTRAINT uq_account_statuses_code UNIQUE (code),
  ADD CONSTRAINT chk_account_statuses_code_format CHECK (code ~ '^[a-z][a-z0-9_]{0,31}$');
