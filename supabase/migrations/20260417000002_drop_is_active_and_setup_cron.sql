-- ============================================================
-- Phase 3c: is_active カラム削除 + pg_cron で 90 日経過物理削除
-- ============================================================
-- 前提: 20260417000001 で全テーブルに deleted_at を追加済み
--       アプリ側は deleted_at IS NULL ベースに完全移行済み
-- crm_users は auth 連携のため対象外（is_active を維持）
-- ============================================================

-- ============================================================
-- Part 1: is_active カラム DROP
-- ============================================================

-- マスタ系（12）
ALTER TABLE pipeline_types     DROP COLUMN is_active;
ALTER TABLE contract_types     DROP COLUMN is_active;
ALTER TABLE corporate_types    DROP COLUMN is_active;
ALTER TABLE services           DROP COLUMN is_active;
ALTER TABLE lead_sources       DROP COLUMN is_active;
ALTER TABLE account_types      DROP COLUMN is_active;
ALTER TABLE account_statuses   DROP COLUMN is_active;
ALTER TABLE contact_statuses   DROP COLUMN is_active;
ALTER TABLE skill_categories   DROP COLUMN is_active;
ALTER TABLE skills             DROP COLUMN is_active;
ALTER TABLE deal_stages        DROP COLUMN is_active;
ALTER TABLE deal_statuses      DROP COLUMN is_active;

-- 主要エンティティ（5）
ALTER TABLE companies          DROP COLUMN is_active;
ALTER TABLE accounts           DROP COLUMN is_active;
ALTER TABLE contacts           DROP COLUMN is_active;
ALTER TABLE contracts          DROP COLUMN is_active;
ALTER TABLE talents            DROP COLUMN is_active;

-- 共有エンティティ（2）
ALTER TABLE financial_info     DROP COLUMN is_active;
ALTER TABLE other_addresses    DROP COLUMN is_active;

-- crm_users は対象外（auth 連携の都合で is_active を維持）

-- ============================================================
-- Part 2: pg_cron 拡張の有効化
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- ============================================================
-- Part 3: 90 日経過した論理削除レコードを物理削除する関数
-- ============================================================

CREATE OR REPLACE FUNCTION purge_soft_deleted_records()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cutoff TIMESTAMPTZ := NOW() - INTERVAL '90 days';
BEGIN
  -- マスタ系（FK 依存が少ない順）
  DELETE FROM skills             WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;
  DELETE FROM skill_categories   WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;
  DELETE FROM deal_statuses      WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;
  DELETE FROM deal_stages        WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;
  DELETE FROM contact_statuses   WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;
  DELETE FROM account_statuses   WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;
  DELETE FROM account_types      WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;
  DELETE FROM lead_sources       WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;
  DELETE FROM services           WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;
  DELETE FROM corporate_types    WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;
  DELETE FROM contract_types     WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;
  DELETE FROM pipeline_types     WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;

  -- 共有エンティティ
  DELETE FROM financial_info     WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;
  DELETE FROM other_addresses    WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;

  -- 主要エンティティ（子 → 親 の順）
  DELETE FROM contracts          WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;
  DELETE FROM deals              WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;
  DELETE FROM talents            WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;
  DELETE FROM contacts           WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;
  DELETE FROM accounts           WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;
  DELETE FROM companies          WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;
END;
$$;

COMMENT ON FUNCTION purge_soft_deleted_records IS
  '論理削除（deleted_at）から 90 日以上経過したレコードを物理削除する。pg_cron で毎日実行';

-- ============================================================
-- Part 4: 毎日 03:00 (UTC) に物理削除ジョブを実行
-- ============================================================

SELECT cron.schedule(
  'purge_soft_deleted_records_daily',
  '0 3 * * *',
  $$SELECT purge_soft_deleted_records();$$
);
