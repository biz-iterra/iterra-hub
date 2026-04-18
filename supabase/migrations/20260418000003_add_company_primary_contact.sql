-- ============================================================
-- T02 companies: primary_contact_id（担当コンタクト）を追加
-- 目的: カンパニーに紐づくコンタクトの中から「担当者」を一人指定できるようにする。
-- 既存の owner_user_id（crm_users）は「社内担当者」として UI で区別する。
-- ============================================================

ALTER TABLE companies
  ADD COLUMN primary_contact_id UUID REFERENCES contacts(id);

CREATE INDEX idx_companies_primary_contact_id ON companies (primary_contact_id);

COMMENT ON COLUMN companies.primary_contact_id IS 'カンパニー担当者（紐づく contacts から選択）';
