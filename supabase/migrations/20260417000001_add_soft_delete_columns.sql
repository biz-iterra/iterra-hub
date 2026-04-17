-- ============================================================
-- Soft delete 列の追加
-- 目的: is_active フラグから deleted_at/deleted_by/deletion_reason へ移行
--       物理削除せず一定期間ログに残す方針に統一
-- 対応: 18 テーブル（is_active を持つもの）+ deals（is_active 未保持）
-- 互換: is_active カラムは当面残し、アプリ側で両書きする
-- ============================================================

-- マスタ系（12）
ALTER TABLE pipeline_types     ADD COLUMN deleted_at TIMESTAMPTZ, ADD COLUMN deleted_by UUID REFERENCES crm_users(id), ADD COLUMN deletion_reason TEXT;
ALTER TABLE contract_types     ADD COLUMN deleted_at TIMESTAMPTZ, ADD COLUMN deleted_by UUID REFERENCES crm_users(id), ADD COLUMN deletion_reason TEXT;
ALTER TABLE corporate_types    ADD COLUMN deleted_at TIMESTAMPTZ, ADD COLUMN deleted_by UUID REFERENCES crm_users(id), ADD COLUMN deletion_reason TEXT;
ALTER TABLE services           ADD COLUMN deleted_at TIMESTAMPTZ, ADD COLUMN deleted_by UUID REFERENCES crm_users(id), ADD COLUMN deletion_reason TEXT;
ALTER TABLE lead_sources       ADD COLUMN deleted_at TIMESTAMPTZ, ADD COLUMN deleted_by UUID REFERENCES crm_users(id), ADD COLUMN deletion_reason TEXT;
ALTER TABLE account_types      ADD COLUMN deleted_at TIMESTAMPTZ, ADD COLUMN deleted_by UUID REFERENCES crm_users(id), ADD COLUMN deletion_reason TEXT;
ALTER TABLE account_statuses   ADD COLUMN deleted_at TIMESTAMPTZ, ADD COLUMN deleted_by UUID REFERENCES crm_users(id), ADD COLUMN deletion_reason TEXT;
ALTER TABLE contact_statuses   ADD COLUMN deleted_at TIMESTAMPTZ, ADD COLUMN deleted_by UUID REFERENCES crm_users(id), ADD COLUMN deletion_reason TEXT;
ALTER TABLE skill_categories   ADD COLUMN deleted_at TIMESTAMPTZ, ADD COLUMN deleted_by UUID REFERENCES crm_users(id), ADD COLUMN deletion_reason TEXT;
ALTER TABLE skills             ADD COLUMN deleted_at TIMESTAMPTZ, ADD COLUMN deleted_by UUID REFERENCES crm_users(id), ADD COLUMN deletion_reason TEXT;
ALTER TABLE deal_stages        ADD COLUMN deleted_at TIMESTAMPTZ, ADD COLUMN deleted_by UUID REFERENCES crm_users(id), ADD COLUMN deletion_reason TEXT;
ALTER TABLE deal_statuses      ADD COLUMN deleted_at TIMESTAMPTZ, ADD COLUMN deleted_by UUID REFERENCES crm_users(id), ADD COLUMN deletion_reason TEXT;

-- 主要エンティティ（5）
ALTER TABLE companies          ADD COLUMN deleted_at TIMESTAMPTZ, ADD COLUMN deleted_by UUID REFERENCES crm_users(id), ADD COLUMN deletion_reason TEXT;
ALTER TABLE accounts           ADD COLUMN deleted_at TIMESTAMPTZ, ADD COLUMN deleted_by UUID REFERENCES crm_users(id), ADD COLUMN deletion_reason TEXT;
ALTER TABLE contacts           ADD COLUMN deleted_at TIMESTAMPTZ, ADD COLUMN deleted_by UUID REFERENCES crm_users(id), ADD COLUMN deletion_reason TEXT;
ALTER TABLE contracts          ADD COLUMN deleted_at TIMESTAMPTZ, ADD COLUMN deleted_by UUID REFERENCES crm_users(id), ADD COLUMN deletion_reason TEXT;
ALTER TABLE talents            ADD COLUMN deleted_at TIMESTAMPTZ, ADD COLUMN deleted_by UUID REFERENCES crm_users(id), ADD COLUMN deletion_reason TEXT;

-- 共有エンティティ（2）
ALTER TABLE financial_info     ADD COLUMN deleted_at TIMESTAMPTZ, ADD COLUMN deleted_by UUID REFERENCES crm_users(id), ADD COLUMN deletion_reason TEXT;
ALTER TABLE other_addresses    ADD COLUMN deleted_at TIMESTAMPTZ, ADD COLUMN deleted_by UUID REFERENCES crm_users(id), ADD COLUMN deletion_reason TEXT;

-- deals（is_active 未保持。新規追加）
ALTER TABLE deals              ADD COLUMN deleted_at TIMESTAMPTZ, ADD COLUMN deleted_by UUID REFERENCES crm_users(id), ADD COLUMN deletion_reason TEXT;

-- ============================================================
-- is_active = FALSE の既存データをバックフィル
-- ============================================================

UPDATE pipeline_types     SET deleted_at = NOW() WHERE is_active = FALSE;
UPDATE contract_types     SET deleted_at = NOW() WHERE is_active = FALSE;
UPDATE corporate_types    SET deleted_at = NOW() WHERE is_active = FALSE;
UPDATE services           SET deleted_at = NOW() WHERE is_active = FALSE;
UPDATE lead_sources       SET deleted_at = NOW() WHERE is_active = FALSE;
UPDATE account_types      SET deleted_at = NOW() WHERE is_active = FALSE;
UPDATE account_statuses   SET deleted_at = NOW() WHERE is_active = FALSE;
UPDATE contact_statuses   SET deleted_at = NOW() WHERE is_active = FALSE;
UPDATE skill_categories   SET deleted_at = NOW() WHERE is_active = FALSE;
UPDATE skills             SET deleted_at = NOW() WHERE is_active = FALSE;
UPDATE deal_stages        SET deleted_at = NOW() WHERE is_active = FALSE;
UPDATE deal_statuses      SET deleted_at = NOW() WHERE is_active = FALSE;
UPDATE companies          SET deleted_at = NOW() WHERE is_active = FALSE;
UPDATE accounts           SET deleted_at = NOW() WHERE is_active = FALSE;
UPDATE contacts           SET deleted_at = NOW() WHERE is_active = FALSE;
UPDATE contracts          SET deleted_at = NOW() WHERE is_active = FALSE;
UPDATE talents            SET deleted_at = NOW() WHERE is_active = FALSE;
UPDATE financial_info     SET deleted_at = NOW() WHERE is_active = FALSE;
UPDATE other_addresses    SET deleted_at = NOW() WHERE is_active = FALSE;

-- ============================================================
-- 部分インデックス（有効レコードの高速検索用）
-- ============================================================

CREATE INDEX idx_pipeline_types_active     ON pipeline_types(id)     WHERE deleted_at IS NULL;
CREATE INDEX idx_contract_types_active     ON contract_types(id)     WHERE deleted_at IS NULL;
CREATE INDEX idx_corporate_types_active    ON corporate_types(id)    WHERE deleted_at IS NULL;
CREATE INDEX idx_services_active           ON services(id)           WHERE deleted_at IS NULL;
CREATE INDEX idx_lead_sources_active       ON lead_sources(id)       WHERE deleted_at IS NULL;
CREATE INDEX idx_account_types_active      ON account_types(id)      WHERE deleted_at IS NULL;
CREATE INDEX idx_account_statuses_active   ON account_statuses(id)   WHERE deleted_at IS NULL;
CREATE INDEX idx_contact_statuses_active   ON contact_statuses(id)   WHERE deleted_at IS NULL;
CREATE INDEX idx_skill_categories_active   ON skill_categories(id)   WHERE deleted_at IS NULL;
CREATE INDEX idx_skills_active             ON skills(id)             WHERE deleted_at IS NULL;
CREATE INDEX idx_deal_stages_active        ON deal_stages(id)        WHERE deleted_at IS NULL;
CREATE INDEX idx_deal_statuses_active      ON deal_statuses(id)      WHERE deleted_at IS NULL;
CREATE INDEX idx_companies_active          ON companies(id)          WHERE deleted_at IS NULL;
CREATE INDEX idx_accounts_active           ON accounts(id)           WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_active           ON contacts(id)           WHERE deleted_at IS NULL;
CREATE INDEX idx_contracts_active          ON contracts(id)          WHERE deleted_at IS NULL;
CREATE INDEX idx_talents_active            ON talents(id)            WHERE deleted_at IS NULL;
CREATE INDEX idx_financial_info_active     ON financial_info(id)     WHERE deleted_at IS NULL;
CREATE INDEX idx_other_addresses_active    ON other_addresses(id)    WHERE deleted_at IS NULL;
CREATE INDEX idx_deals_active              ON deals(id)              WHERE deleted_at IS NULL;

-- 削除済み一覧表示用の非部分インデックス（削除日時降順）
CREATE INDEX idx_companies_deleted_at_desc  ON companies(deleted_at DESC)  WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_accounts_deleted_at_desc   ON accounts(deleted_at DESC)   WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_contacts_deleted_at_desc   ON contacts(deleted_at DESC)   WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_contracts_deleted_at_desc  ON contracts(deleted_at DESC)  WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_deals_deleted_at_desc      ON deals(deleted_at DESC)      WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_talents_deleted_at_desc    ON talents(deleted_at DESC)    WHERE deleted_at IS NOT NULL;

-- ============================================================
-- コメント
-- ============================================================

COMMENT ON COLUMN companies.deleted_at       IS '論理削除日時。NULL=有効、非NULL=削除済み';
COMMENT ON COLUMN companies.deleted_by       IS '削除実行者';
COMMENT ON COLUMN companies.deletion_reason  IS '削除理由（任意）';
-- 他テーブルも同義（簡潔化のためコメント省略）
