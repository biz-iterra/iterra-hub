-- ============================================================
-- 顧客情報の「参照」を認証済み全員に広げる
--
-- 背景（2026-08-03 の Gate 4 で判明）:
--   member ロールで商談を新規作成しようとすると、相手先の取引先・事業者情報が
--   1 件も選べない。accounts / companies / contacts の SELECT が
--   「manager 以上 or owner」だったため、自分が担当していない相手を選べなかった。
--   実務では他の担当者が管理している取引先に対して商談を起こすことがあり、
--   参照できないと業務が回らない（ユーザー判断で参照を全員可にすることに決定）。
--
-- 方針:
--   - **参照だけ**を認証済み全員に広げる。作成・更新・削除の範囲は一切変えない
--     （更新は従来どおり admin または owner のみ。多層防御の
--      Server Action 側オーナーチェックもそのまま効く）
--   - 従属テーブル（メール・電話・SNS・ドメイン・住所・名刺・取引先×連絡先）も
--     親に合わせて参照可にする。一覧で見えるのに詳細で欠ける状態を作らないため
--
-- 広げないもの（意図的）:
--   - financial_info … 口座情報。manager 以上のまま（機微度が違う）
--   - talents / talent_skills / talent_careers … 人材特性。別エンティティとして扱う
--   - leads … 20260803000007 で担当者に絞ったばかり。営業の担当分離が意味を持つ
--   - deals … 同上
-- ============================================================

-- ---------- 主テーブル ----------
DROP POLICY IF EXISTS accounts_select_manager_admin ON accounts;
CREATE POLICY accounts_select ON accounts
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS companies_select_manager_admin ON companies;
CREATE POLICY companies_select ON companies
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS contacts_select_manager_admin ON contacts;
CREATE POLICY contacts_select ON contacts
  FOR SELECT TO authenticated USING (true);

-- ---------- 従属テーブル ----------
DROP POLICY IF EXISTS contact_emails_select ON contact_emails;
CREATE POLICY contact_emails_select ON contact_emails
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS contact_phones_select ON contact_phones;
CREATE POLICY contact_phones_select ON contact_phones
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS contact_social_accounts_select ON contact_social_accounts;
CREATE POLICY contact_social_accounts_select ON contact_social_accounts
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS company_domains_select ON company_domains;
CREATE POLICY company_domains_select ON company_domains
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS account_contacts_select ON account_contacts;
CREATE POLICY account_contacts_select ON account_contacts
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS business_cards_select ON business_cards;
CREATE POLICY business_cards_select ON business_cards
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS entity_addresses_select ON entity_addresses;
CREATE POLICY entity_addresses_select ON entity_addresses
  FOR SELECT TO authenticated USING (true);

-- is_entity_address_accessible() は INSERT / UPDATE / DELETE のポリシーでも
-- 使われているため定義は変えない（書き込みの範囲は従来どおり owner / manager）。

COMMENT ON POLICY accounts_select ON accounts IS
  '参照は認証済み全員。更新・削除は owner / admin のみ（20260803000008）';
COMMENT ON POLICY companies_select ON companies IS
  '参照は認証済み全員。更新・削除は owner / admin のみ（20260803000008）';
COMMENT ON POLICY contacts_select ON contacts IS
  '参照は認証済み全員。更新・削除は owner / admin のみ（20260803000008）';
