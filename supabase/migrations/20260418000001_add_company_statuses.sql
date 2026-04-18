-- ============================================================
-- M11: カンパニーステータス マスタ + companies への適用
-- 目的: カンパニーにステータス（アクティブ/取引停止/見込み等）を持たせ、
--       管理者が追加・編集できるようにする。
-- 方針: account_statuses / contact_statuses と同一構造。
-- ============================================================

-- 1. マスタテーブル作成
CREATE TABLE company_statuses (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        UNIQUE NOT NULL,
  deleted_at      TIMESTAMPTZ,
  deleted_by      UUID        REFERENCES crm_users(id),
  deletion_reason TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_company_statuses_active ON company_statuses(id) WHERE deleted_at IS NULL;

-- 2. updated_at トリガー
CREATE TRIGGER trg_company_statuses_updated_at
  BEFORE UPDATE ON company_statuses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 3. 初期データ投入
INSERT INTO company_statuses (id, name) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'アクティブ'),
  ('c1000000-0000-0000-0000-000000000002', '休眠'),
  ('c1000000-0000-0000-0000-000000000003', '取引停止'),
  ('c1000000-0000-0000-0000-000000000004', '見込み');

-- 4. RLS 有効化 + ポリシー（他マスタと同一パターン）
ALTER TABLE company_statuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY company_statuses_select_authenticated ON company_statuses
  FOR SELECT TO authenticated USING (true);
CREATE POLICY company_statuses_insert_admin ON company_statuses
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY company_statuses_update_admin ON company_statuses
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY company_statuses_delete_admin ON company_statuses
  FOR DELETE TO authenticated USING (is_admin());

-- 5. companies にステータス列追加
ALTER TABLE companies
  ADD COLUMN company_status_id  UUID REFERENCES company_statuses(id),
  ADD COLUMN status_updated_at  TIMESTAMPTZ;

CREATE INDEX idx_companies_company_status_id ON companies (company_status_id);

-- 既存レコードを「アクティブ」で埋める
UPDATE companies
   SET company_status_id = 'c1000000-0000-0000-0000-000000000001'
 WHERE company_status_id IS NULL;

-- 以降は必須とする
ALTER TABLE companies
  ALTER COLUMN company_status_id SET NOT NULL;
