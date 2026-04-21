-- ============================================================
-- leads テーブルに Opportunity 昇格時の関連エンティティ参照カラムを追加
-- ============================================================

-- 1. promoted_company_id（法人昇格時に新規作成した Company）
ALTER TABLE leads
  ADD COLUMN promoted_company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

-- 2. promoted_contact_id（昇格時に新規作成した Contact）
ALTER TABLE leads
  ADD COLUMN promoted_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL;

-- 3. promoted_account_id（昇格時に新規作成した Account）
ALTER TABLE leads
  ADD COLUMN promoted_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

-- インデックス
CREATE INDEX idx_leads_promoted_company_id ON leads(promoted_company_id) WHERE promoted_company_id IS NOT NULL;
CREATE INDEX idx_leads_promoted_contact_id ON leads(promoted_contact_id) WHERE promoted_contact_id IS NOT NULL;
CREATE INDEX idx_leads_promoted_account_id ON leads(promoted_account_id) WHERE promoted_account_id IS NOT NULL;

COMMENT ON COLUMN leads.promoted_company_id IS 'Opportunity 昇格時に新規作成した companies.id（法人のみ）';
COMMENT ON COLUMN leads.promoted_contact_id IS 'Opportunity 昇格時に新規作成した contacts.id';
COMMENT ON COLUMN leads.promoted_account_id IS 'Opportunity 昇格時に新規作成した accounts.id';

-- ============================================================
-- account_types に slug カラムを追加（法人/個人判定用）
-- ============================================================
ALTER TABLE account_types
  ADD COLUMN slug TEXT;

CREATE UNIQUE INDEX idx_account_types_slug ON account_types(slug) WHERE slug IS NOT NULL;

-- 既存データに slug を設定（name ベース）
UPDATE account_types SET slug = 'corporate'        WHERE name = '法人';
UPDATE account_types SET slug = 'sole_proprietor'  WHERE name = '個人事業主';
UPDATE account_types SET slug = 'government'       WHERE name = '官公庁・自治体';

COMMENT ON COLUMN account_types.slug IS '法人/個人判定用スラッグ。corporate = 法人系、sole_proprietor = 個人事業主、government = 官公庁';
