-- ============================================================
-- Phase E: 監査列の全面整備
-- 目的: 「いつ・誰が・何を・どのように」更新したかを全エンティティで追跡
-- 追加カラム:
--   created_by      (NN, DEFAULT admin_uuid, FK→crm_users)
--   last_updated_by (NULLable, FK→crm_users)
-- 対象: マスタ14 + トランザクション6 + 従属6 + 中間2 + IS拡張7 = 35 テーブル
-- バックフィル戦略: DEFAULT 値で既存行・シード行を自動補完
-- 除外: crm_users / activity_logs / *_change_histories / R01 / R02
--       （それぞれ既に監査カラム保有、INSERT ONLY、読み取り専用のため）
-- ============================================================

-- ============================================================
-- 0. admin ユーザーの先行投入
-- seed.sql が走る前にバックフィル用に admin レコードを用意。
-- seed.sql 側は ON CONFLICT DO NOTHING / UPDATE で衝突吸収。
-- ============================================================

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new, phone_change, phone_change_token,
  raw_app_meta_data, raw_user_meta_data
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'a0000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated',
  'admin@iterra.jp',
  '', -- 空パスワード。seed.sql が bcrypt ハッシュで上書き
  NOW(), NOW(), NOW(), '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"管理者テスト"}'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO crm_users (id, email, full_name, full_name_kana, role) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'admin@iterra.jp', '管理者テスト', 'カンリシャテスト', 'admin')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 1. ALTER TABLE: created_by (NN, DEFAULT admin) + last_updated_by (NULLable)
--    DEFAULT 値は既存行にも適用され、ADD COLUMN 時点でバックフィルされる。
--    Phase F 以降で DEFAULT を除去してもよいが、seed 簡素化のため当面残す。
-- ============================================================

-- マスタ系（14）
ALTER TABLE pipeline_types           ADD COLUMN created_by UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id), ADD COLUMN last_updated_by UUID REFERENCES crm_users(id);
ALTER TABLE contract_types           ADD COLUMN created_by UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id), ADD COLUMN last_updated_by UUID REFERENCES crm_users(id);
ALTER TABLE corporate_types          ADD COLUMN created_by UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id), ADD COLUMN last_updated_by UUID REFERENCES crm_users(id);
ALTER TABLE services                 ADD COLUMN created_by UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id), ADD COLUMN last_updated_by UUID REFERENCES crm_users(id);
ALTER TABLE lead_sources             ADD COLUMN created_by UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id), ADD COLUMN last_updated_by UUID REFERENCES crm_users(id);
ALTER TABLE account_types            ADD COLUMN created_by UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id), ADD COLUMN last_updated_by UUID REFERENCES crm_users(id);
ALTER TABLE account_statuses         ADD COLUMN created_by UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id), ADD COLUMN last_updated_by UUID REFERENCES crm_users(id);
ALTER TABLE contact_statuses         ADD COLUMN created_by UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id), ADD COLUMN last_updated_by UUID REFERENCES crm_users(id);
ALTER TABLE skill_categories         ADD COLUMN created_by UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id), ADD COLUMN last_updated_by UUID REFERENCES crm_users(id);
ALTER TABLE skills                   ADD COLUMN created_by UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id), ADD COLUMN last_updated_by UUID REFERENCES crm_users(id);
ALTER TABLE company_statuses         ADD COLUMN created_by UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id), ADD COLUMN last_updated_by UUID REFERENCES crm_users(id);
ALTER TABLE deal_stages              ADD COLUMN created_by UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id), ADD COLUMN last_updated_by UUID REFERENCES crm_users(id);
ALTER TABLE deal_statuses            ADD COLUMN created_by UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id), ADD COLUMN last_updated_by UUID REFERENCES crm_users(id);
ALTER TABLE industry_classifications ADD COLUMN created_by UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id), ADD COLUMN last_updated_by UUID REFERENCES crm_users(id);

-- トランザクションエンティティ（6）。deals は last_updated_by 既存のため created_by のみ
ALTER TABLE companies  ADD COLUMN created_by UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id), ADD COLUMN last_updated_by UUID REFERENCES crm_users(id);
ALTER TABLE accounts   ADD COLUMN created_by UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id), ADD COLUMN last_updated_by UUID REFERENCES crm_users(id);
ALTER TABLE contacts   ADD COLUMN created_by UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id), ADD COLUMN last_updated_by UUID REFERENCES crm_users(id);
ALTER TABLE deals      ADD COLUMN created_by UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id);
ALTER TABLE contracts  ADD COLUMN created_by UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id), ADD COLUMN last_updated_by UUID REFERENCES crm_users(id);
ALTER TABLE talents    ADD COLUMN created_by UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id), ADD COLUMN last_updated_by UUID REFERENCES crm_users(id);

-- 従属テーブル（6）
ALTER TABLE contact_emails   ADD COLUMN created_by UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id), ADD COLUMN last_updated_by UUID REFERENCES crm_users(id);
ALTER TABLE contact_phones   ADD COLUMN created_by UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id), ADD COLUMN last_updated_by UUID REFERENCES crm_users(id);
ALTER TABLE financial_info   ADD COLUMN created_by UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id), ADD COLUMN last_updated_by UUID REFERENCES crm_users(id);
ALTER TABLE other_addresses  ADD COLUMN created_by UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id), ADD COLUMN last_updated_by UUID REFERENCES crm_users(id);
ALTER TABLE talent_skills    ADD COLUMN created_by UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id), ADD COLUMN last_updated_by UUID REFERENCES crm_users(id);
ALTER TABLE talent_careers   ADD COLUMN created_by UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id), ADD COLUMN last_updated_by UUID REFERENCES crm_users(id);

-- 中間テーブル（2）: UPDATE 発生しないため created_by のみ
ALTER TABLE deal_services     ADD COLUMN created_by UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id);
ALTER TABLE account_contacts  ADD COLUMN created_by UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id);

-- インサイドセールス拡張・マスタ（7）
ALTER TABLE inside_sales_phases         ADD COLUMN created_by UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id), ADD COLUMN last_updated_by UUID REFERENCES crm_users(id);
ALTER TABLE inside_sales_large_segments ADD COLUMN created_by UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id), ADD COLUMN last_updated_by UUID REFERENCES crm_users(id);
ALTER TABLE inside_sales_small_segments ADD COLUMN created_by UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id), ADD COLUMN last_updated_by UUID REFERENCES crm_users(id);
ALTER TABLE inside_sales_call_statuses  ADD COLUMN created_by UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id), ADD COLUMN last_updated_by UUID REFERENCES crm_users(id);
ALTER TABLE inside_sales_callers        ADD COLUMN created_by UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id), ADD COLUMN last_updated_by UUID REFERENCES crm_users(id);
ALTER TABLE deal_ext_inside_sales       ADD COLUMN created_by UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id), ADD COLUMN last_updated_by UUID REFERENCES crm_users(id);
ALTER TABLE deal_ext_inside_sales_calls ADD COLUMN created_by UUID NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id), ADD COLUMN last_updated_by UUID REFERENCES crm_users(id);

-- ============================================================
-- 2. INDEX 付与（監査ログ検索・集計用）
-- ============================================================

CREATE INDEX idx_companies_created_by  ON companies(created_by);
CREATE INDEX idx_accounts_created_by   ON accounts(created_by);
CREATE INDEX idx_contacts_created_by   ON contacts(created_by);
CREATE INDEX idx_deals_created_by      ON deals(created_by);
CREATE INDEX idx_contracts_created_by  ON contracts(created_by);
CREATE INDEX idx_talents_created_by    ON talents(created_by);

-- ============================================================
-- 3. コメント
-- ============================================================

COMMENT ON COLUMN companies.created_by       IS '作成者（監査）。NN。Server Action で auth.uid() を明示設定、未指定時は admin を DEFAULT';
COMMENT ON COLUMN companies.last_updated_by  IS '最終更新者（監査）。NULLable。UPDATE 時に Server Action で設定';
-- 他テーブルも同義のため簡潔化のためコメント省略
