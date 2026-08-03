-- ============================================================
-- 採番トリガーを SECURITY DEFINER にする
--
-- generate_*_code() は「テーブル全体の MAX + 1」で採番するが、
-- SECURITY INVOKER のため **呼び出したユーザーの RLS が SELECT に効いていた**。
--
-- companies / accounts / contacts / deals の SELECT ポリシーは
-- 「manager 以上 or owner」なので、member が新規作成すると
-- 自分が owner の行しか MAX の対象にならない。
--   - 他人の行しか無ければ MAX = 0 → CMP-000001 を採番 → 既存と UNIQUE 衝突（作成不能）
--   - 自分の行が少数あれば 既存の最大値より小さい番号 → やはり衝突
-- INSERT ポリシー自体は「認証済み全員」なので、member は作れる建て付けなのに
-- 実際には採番で落ちる、という食い違いになっていた。
--
-- 採番は「誰が作ったか」に依存してはいけない値なので、
-- RLS をバイパスして全行から MAX を取る。
-- SECURITY DEFINER に伴い search_path を固定する（検索パス乗っ取りの防止）。
--
-- 注記: MAX+1 方式そのものは並列 INSERT で衝突しうる（採番の設計上の懸念。
-- docs/test-cases/02-integration-db.md §7-2）。ここではその話には踏み込まず、
-- RLS 起因の確定的な失敗だけを直す。
-- ============================================================

CREATE OR REPLACE FUNCTION generate_company_code() RETURNS TRIGGER
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(company_code FROM 5) AS INTEGER)), 0) + 1
  INTO next_num FROM companies;
  NEW.company_code = 'CMP-' || LPAD(next_num::TEXT, 6, '0');
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION generate_account_code() RETURNS TRIGGER
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(account_code FROM 5) AS INTEGER)), 0) + 1
  INTO next_num FROM accounts;
  NEW.account_code = 'ACC-' || LPAD(next_num::TEXT, 6, '0');
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION generate_contact_code() RETURNS TRIGGER
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(contact_code FROM 5) AS INTEGER)), 0) + 1
  INTO next_num FROM contacts;
  NEW.contact_code = 'CNT-' || LPAD(next_num::TEXT, 6, '0');
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION generate_deal_code() RETURNS TRIGGER
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(deal_code FROM 4) AS INTEGER)), 0) + 1
  INTO next_num FROM deals;
  NEW.deal_code = 'DL-' || LPAD(next_num::TEXT, 6, '0');
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION generate_contract_code() RETURNS TRIGGER
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(contract_code FROM 5) AS INTEGER)), 0) + 1
  INTO next_num FROM contracts;
  NEW.contract_code = 'CTR-' || LPAD(next_num::TEXT, 6, '0');
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION generate_project_code() RETURNS TRIGGER
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(project_code FROM 5) AS INTEGER)), 0) + 1
  INTO next_num FROM projects;
  NEW.project_code = 'PRJ-' || LPAD(next_num::TEXT, 6, '0');
  RETURN NEW;
END; $$;

COMMENT ON FUNCTION generate_company_code()  IS '採番トリガー。RLS をバイパスして全行の MAX を読むため SECURITY DEFINER';
COMMENT ON FUNCTION generate_account_code()  IS '採番トリガー。RLS をバイパスして全行の MAX を読むため SECURITY DEFINER';
COMMENT ON FUNCTION generate_contact_code()  IS '採番トリガー。RLS をバイパスして全行の MAX を読むため SECURITY DEFINER';
COMMENT ON FUNCTION generate_deal_code()     IS '採番トリガー。RLS をバイパスして全行の MAX を読むため SECURITY DEFINER';
COMMENT ON FUNCTION generate_contract_code() IS '採番トリガー。RLS をバイパスして全行の MAX を読むため SECURITY DEFINER';
COMMENT ON FUNCTION generate_project_code()  IS '採番トリガー。RLS をバイパスして全行の MAX を読むため SECURITY DEFINER';
