-- ============================================================
-- コード採番カラムに DEFAULT を付与する
--
-- 背景:
--   account_code / company_code / contact_code / contract_code / deal_code /
--   project_code は BEFORE INSERT トリガー（generate_*_code）が採番する。
--   しかし DB 上は NOT NULL かつ DEFAULT なしのため、
--   supabase gen types が生成する Insert 型でこれらが「必須」と判定される。
--   その結果、createClient<Database>() で型を適用すると
--   全ての insert が「account_code が無い」と 37 件のエラーになっていた。
--
-- 対応:
--   DEFAULT '' を設定して Insert 型で optional にする。
--   トリガーは条件なしで NEW.<col> を上書きするため（IS NULL 判定を持たない）、
--   DEFAULT の値そのものが残ることはない。
--
--   例: generate_company_code()
--     NEW.company_code = 'CMP-' || LPAD(next_num::TEXT, 6, '0');
--
-- 注意:
--   トリガーを無効化して INSERT した場合のみ '' が入り、
--   2 件目で UNIQUE 制約に違反する。トリガーの無効化はしないこと。
-- ============================================================

ALTER TABLE accounts  ALTER COLUMN account_code  SET DEFAULT '';
ALTER TABLE companies ALTER COLUMN company_code  SET DEFAULT '';
ALTER TABLE contacts  ALTER COLUMN contact_code  SET DEFAULT '';
ALTER TABLE contracts ALTER COLUMN contract_code SET DEFAULT '';
ALTER TABLE deals     ALTER COLUMN deal_code     SET DEFAULT '';
ALTER TABLE projects  ALTER COLUMN project_code  SET DEFAULT '';

COMMENT ON COLUMN accounts.account_code   IS 'ACC-000001 形式。trg_accounts_generate_code が採番（DEFAULT は型生成のための形式的な指定）';
COMMENT ON COLUMN companies.company_code  IS 'CMP-000001 形式。trg_companies_generate_code が採番（同上）';
COMMENT ON COLUMN contacts.contact_code   IS 'CNT-000001 形式。trg_contacts_generate_code が採番（同上）';
COMMENT ON COLUMN contracts.contract_code IS 'CTR-000001 形式。trg_contracts_generate_code が採番（同上）';
COMMENT ON COLUMN deals.deal_code         IS 'DL-000001 形式。trg_deals_generate_code が採番（同上）';
COMMENT ON COLUMN projects.project_code   IS 'PRJ-000001 形式。trg_projects_generate_code が採番（同上）';
