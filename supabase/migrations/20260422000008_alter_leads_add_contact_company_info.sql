-- ============================================================
-- leads テーブル: phone リネーム + 担当者情報・企業情報カラム追加
-- Phase 9b: Lead 詳細画面再編 DB スキーマ変更
-- ============================================================

-- 1-1. phone → company_phone リネーム + contact_phone 追加
ALTER TABLE leads RENAME COLUMN phone TO company_phone;
ALTER TABLE leads ADD COLUMN contact_phone VARCHAR(20);

-- 1-2. 担当者情報 9 カラム追加
ALTER TABLE leads
  ADD COLUMN contact_last_name        TEXT,
  ADD COLUMN contact_middle_name      TEXT,
  ADD COLUMN contact_first_name       TEXT,
  ADD COLUMN contact_last_name_kana   TEXT,
  ADD COLUMN contact_middle_name_kana TEXT,
  ADD COLUMN contact_first_name_kana  TEXT,
  ADD COLUMN contact_department       TEXT,
  ADD COLUMN contact_job_title        TEXT,
  ADD COLUMN contact_email            TEXT;

-- 1-3. 企業情報 3 カラム追加
ALTER TABLE leads
  ADD COLUMN company_name_kana    TEXT,
  ADD COLUMN representative_name  TEXT,
  ADD COLUMN corporate_number     VARCHAR(13);

-- 1-4. CHECK 制約
ALTER TABLE leads
  ADD CONSTRAINT chk_leads_contact_email_length
    CHECK (contact_email IS NULL OR char_length(contact_email) <= 255),
  ADD CONSTRAINT chk_leads_contact_name_length
    CHECK (contact_last_name IS NULL OR char_length(contact_last_name) <= 50),
  ADD CONSTRAINT chk_leads_contact_first_name_length
    CHECK (contact_first_name IS NULL OR char_length(contact_first_name) <= 50),
  ADD CONSTRAINT chk_leads_contact_department_length
    CHECK (contact_department IS NULL OR char_length(contact_department) <= 100),
  ADD CONSTRAINT chk_leads_contact_job_title_length
    CHECK (contact_job_title IS NULL OR char_length(contact_job_title) <= 100),
  ADD CONSTRAINT chk_leads_company_name_kana_length
    CHECK (company_name_kana IS NULL OR char_length(company_name_kana) <= 200),
  ADD CONSTRAINT chk_leads_representative_name_length
    CHECK (representative_name IS NULL OR char_length(representative_name) <= 100),
  ADD CONSTRAINT chk_leads_corporate_number_format
    CHECK (corporate_number IS NULL OR corporate_number ~ '^[0-9]{13}$');

-- 1-5. COMMENT
COMMENT ON COLUMN leads.company_phone          IS '代表電話（企業情報、旧 phone カラムをリネーム）';
COMMENT ON COLUMN leads.contact_phone          IS '担当者電話（コンタクト情報）';
COMMENT ON COLUMN leads.contact_last_name      IS '担当者姓（コンタクト基本情報、昇格時に contacts.last_name へ転記）';
COMMENT ON COLUMN leads.contact_middle_name    IS '担当者ミドルネーム（昇格時に contacts.middle_name へ転記）';
COMMENT ON COLUMN leads.contact_first_name     IS '担当者名（昇格時に contacts.first_name へ転記）';
COMMENT ON COLUMN leads.contact_last_name_kana IS '担当者姓カナ（昇格時に contacts.last_name_kana へ転記）';
COMMENT ON COLUMN leads.contact_middle_name_kana IS '担当者ミドルネームカナ（昇格時に contacts.middle_name_kana へ転記）';
COMMENT ON COLUMN leads.contact_first_name_kana IS '担当者名カナ（昇格時に contacts.first_name_kana へ転記）';
COMMENT ON COLUMN leads.contact_department     IS '担当者部署（昇格時に contacts.department へ転記）';
COMMENT ON COLUMN leads.contact_job_title      IS '担当者役職（昇格時に contacts.job_title へ転記）';
COMMENT ON COLUMN leads.contact_email          IS '担当者メールアドレス（昇格時に contact_emails へ転記）';
COMMENT ON COLUMN leads.company_name_kana      IS '企業名カナ（昇格時に companies.name_kana へ転記）';
COMMENT ON COLUMN leads.representative_name    IS '代表者名（昇格時に companies.representative_name へ転記）';
COMMENT ON COLUMN leads.corporate_number       IS '法人番号 13桁。companies.corporate_number の UNIQUE 制約と照合して重複検知';
