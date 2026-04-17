-- ============================================================================
-- セクション1: updated_at 自動更新トリガー
-- ============================================================================

-- 汎用 updated_at 更新関数
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 各テーブルにトリガーを適用
CREATE TRIGGER trg_pipeline_types_updated_at
  BEFORE UPDATE ON pipeline_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_contract_types_updated_at
  BEFORE UPDATE ON contract_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_corporate_types_updated_at
  BEFORE UPDATE ON corporate_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_services_updated_at
  BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_lead_sources_updated_at
  BEFORE UPDATE ON lead_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_account_types_updated_at
  BEFORE UPDATE ON account_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_account_statuses_updated_at
  BEFORE UPDATE ON account_statuses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_contact_statuses_updated_at
  BEFORE UPDATE ON contact_statuses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_skill_categories_updated_at
  BEFORE UPDATE ON skill_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_skills_updated_at
  BEFORE UPDATE ON skills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_deal_stages_updated_at
  BEFORE UPDATE ON deal_stages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_deal_statuses_updated_at
  BEFORE UPDATE ON deal_statuses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_constellation_fortune_telling_updated_at
  BEFORE UPDATE ON constellation_fortune_telling
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_number_diagnosis_updated_at
  BEFORE UPDATE ON number_diagnosis
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_crm_users_updated_at
  BEFORE UPDATE ON crm_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_deals_updated_at
  BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_contracts_updated_at
  BEFORE UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_talents_updated_at
  BEFORE UPDATE ON talents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_talent_skills_updated_at
  BEFORE UPDATE ON talent_skills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_talent_careers_updated_at
  BEFORE UPDATE ON talent_careers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_financial_info_updated_at
  BEFORE UPDATE ON financial_info
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_other_addresses_updated_at
  BEFORE UPDATE ON other_addresses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_deal_activities_updated_at
  BEFORE UPDATE ON deal_activities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================================
-- セクション2: 自動採番トリガー
-- ============================================================================

-- companies: 'CMP-' + 6桁連番
CREATE OR REPLACE FUNCTION generate_company_code()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(company_code FROM 5) AS INTEGER)), 0) + 1
  INTO next_num FROM companies;
  NEW.company_code = 'CMP-' || LPAD(next_num::TEXT, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_companies_generate_code
  BEFORE INSERT ON companies
  FOR EACH ROW EXECUTE FUNCTION generate_company_code();

-- accounts: 'ACC-' + 6桁連番
CREATE OR REPLACE FUNCTION generate_account_code()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(account_code FROM 5) AS INTEGER)), 0) + 1
  INTO next_num FROM accounts;
  NEW.account_code = 'ACC-' || LPAD(next_num::TEXT, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_accounts_generate_code
  BEFORE INSERT ON accounts
  FOR EACH ROW EXECUTE FUNCTION generate_account_code();

-- contacts: 'CNT-' + 6桁連番
CREATE OR REPLACE FUNCTION generate_contact_code()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(contact_code FROM 5) AS INTEGER)), 0) + 1
  INTO next_num FROM contacts;
  NEW.contact_code = 'CNT-' || LPAD(next_num::TEXT, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_contacts_generate_code
  BEFORE INSERT ON contacts
  FOR EACH ROW EXECUTE FUNCTION generate_contact_code();

-- deals: 'DL-' + 6桁連番（プレフィックス3文字なので FROM 4）
CREATE OR REPLACE FUNCTION generate_deal_code()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(deal_code FROM 4) AS INTEGER)), 0) + 1
  INTO next_num FROM deals;
  NEW.deal_code = 'DL-' || LPAD(next_num::TEXT, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_deals_generate_code
  BEFORE INSERT ON deals
  FOR EACH ROW EXECUTE FUNCTION generate_deal_code();

-- contracts: 'CTR-' + 6桁連番
CREATE OR REPLACE FUNCTION generate_contract_code()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(contract_code FROM 5) AS INTEGER)), 0) + 1
  INTO next_num FROM contracts;
  NEW.contract_code = 'CTR-' || LPAD(next_num::TEXT, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_contracts_generate_code
  BEFORE INSERT ON contracts
  FOR EACH ROW EXECUTE FUNCTION generate_contract_code();


-- ============================================================================
-- セクション3: RLS ポリシー
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 3-1: 全テーブルで RLS を有効化
-- ----------------------------------------------------------------------------
ALTER TABLE pipeline_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE corporate_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE industry_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE constellation_fortune_telling ENABLE ROW LEVEL SECURITY;
ALTER TABLE number_diagnosis ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE talents ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_phones ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE other_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE talent_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE talent_careers ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_activity_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_stage_histories ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_status_histories ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_change_histories ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_change_histories ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_change_histories ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_change_histories ENABLE ROW LEVEL SECURITY;
ALTER TABLE talent_change_histories ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 3-2: ヘルパー関数
-- ----------------------------------------------------------------------------

-- 現在のユーザーのロールを取得
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM crm_users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 管理者かどうか
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT get_user_role() = 'admin';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- マネージャー以上かどうか
CREATE OR REPLACE FUNCTION is_manager_or_above()
RETURNS BOOLEAN AS $$
  SELECT get_user_role() IN ('manager', 'admin');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ----------------------------------------------------------------------------
-- 3-3: マスタテーブル RLS ポリシー
-- SELECT: 認証済みユーザー全員 / INSERT・UPDATE・DELETE: admin のみ
-- ----------------------------------------------------------------------------

-- pipeline_types
CREATE POLICY pipeline_types_select_authenticated ON pipeline_types
  FOR SELECT TO authenticated USING (true);
CREATE POLICY pipeline_types_insert_admin ON pipeline_types
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY pipeline_types_update_admin ON pipeline_types
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY pipeline_types_delete_admin ON pipeline_types
  FOR DELETE TO authenticated USING (is_admin());

-- contract_types
CREATE POLICY contract_types_select_authenticated ON contract_types
  FOR SELECT TO authenticated USING (true);
CREATE POLICY contract_types_insert_admin ON contract_types
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY contract_types_update_admin ON contract_types
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY contract_types_delete_admin ON contract_types
  FOR DELETE TO authenticated USING (is_admin());

-- corporate_types
CREATE POLICY corporate_types_select_authenticated ON corporate_types
  FOR SELECT TO authenticated USING (true);
CREATE POLICY corporate_types_insert_admin ON corporate_types
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY corporate_types_update_admin ON corporate_types
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY corporate_types_delete_admin ON corporate_types
  FOR DELETE TO authenticated USING (is_admin());

-- services
CREATE POLICY services_select_authenticated ON services
  FOR SELECT TO authenticated USING (true);
CREATE POLICY services_insert_admin ON services
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY services_update_admin ON services
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY services_delete_admin ON services
  FOR DELETE TO authenticated USING (is_admin());

-- lead_sources
CREATE POLICY lead_sources_select_authenticated ON lead_sources
  FOR SELECT TO authenticated USING (true);
CREATE POLICY lead_sources_insert_admin ON lead_sources
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY lead_sources_update_admin ON lead_sources
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY lead_sources_delete_admin ON lead_sources
  FOR DELETE TO authenticated USING (is_admin());

-- account_types
CREATE POLICY account_types_select_authenticated ON account_types
  FOR SELECT TO authenticated USING (true);
CREATE POLICY account_types_insert_admin ON account_types
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY account_types_update_admin ON account_types
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY account_types_delete_admin ON account_types
  FOR DELETE TO authenticated USING (is_admin());

-- account_statuses
CREATE POLICY account_statuses_select_authenticated ON account_statuses
  FOR SELECT TO authenticated USING (true);
CREATE POLICY account_statuses_insert_admin ON account_statuses
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY account_statuses_update_admin ON account_statuses
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY account_statuses_delete_admin ON account_statuses
  FOR DELETE TO authenticated USING (is_admin());

-- contact_statuses
CREATE POLICY contact_statuses_select_authenticated ON contact_statuses
  FOR SELECT TO authenticated USING (true);
CREATE POLICY contact_statuses_insert_admin ON contact_statuses
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY contact_statuses_update_admin ON contact_statuses
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY contact_statuses_delete_admin ON contact_statuses
  FOR DELETE TO authenticated USING (is_admin());

-- skill_categories
CREATE POLICY skill_categories_select_authenticated ON skill_categories
  FOR SELECT TO authenticated USING (true);
CREATE POLICY skill_categories_insert_admin ON skill_categories
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY skill_categories_update_admin ON skill_categories
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY skill_categories_delete_admin ON skill_categories
  FOR DELETE TO authenticated USING (is_admin());

-- skills
CREATE POLICY skills_select_authenticated ON skills
  FOR SELECT TO authenticated USING (true);
CREATE POLICY skills_insert_admin ON skills
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY skills_update_admin ON skills
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY skills_delete_admin ON skills
  FOR DELETE TO authenticated USING (is_admin());

-- deal_stages
CREATE POLICY deal_stages_select_authenticated ON deal_stages
  FOR SELECT TO authenticated USING (true);
CREATE POLICY deal_stages_insert_admin ON deal_stages
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY deal_stages_update_admin ON deal_stages
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY deal_stages_delete_admin ON deal_stages
  FOR DELETE TO authenticated USING (is_admin());

-- deal_statuses
CREATE POLICY deal_statuses_select_authenticated ON deal_statuses
  FOR SELECT TO authenticated USING (true);
CREATE POLICY deal_statuses_insert_admin ON deal_statuses
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY deal_statuses_update_admin ON deal_statuses
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY deal_statuses_delete_admin ON deal_statuses
  FOR DELETE TO authenticated USING (is_admin());

-- industry_classifications
CREATE POLICY industry_classifications_select_authenticated ON industry_classifications
  FOR SELECT TO authenticated USING (true);
CREATE POLICY industry_classifications_insert_admin ON industry_classifications
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY industry_classifications_update_admin ON industry_classifications
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY industry_classifications_delete_admin ON industry_classifications
  FOR DELETE TO authenticated USING (is_admin());

-- constellation_fortune_telling
CREATE POLICY constellation_fortune_telling_select_authenticated ON constellation_fortune_telling
  FOR SELECT TO authenticated USING (true);
CREATE POLICY constellation_fortune_telling_insert_admin ON constellation_fortune_telling
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY constellation_fortune_telling_update_admin ON constellation_fortune_telling
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY constellation_fortune_telling_delete_admin ON constellation_fortune_telling
  FOR DELETE TO authenticated USING (is_admin());

-- number_diagnosis
CREATE POLICY number_diagnosis_select_authenticated ON number_diagnosis
  FOR SELECT TO authenticated USING (true);
CREATE POLICY number_diagnosis_insert_admin ON number_diagnosis
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY number_diagnosis_update_admin ON number_diagnosis
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY number_diagnosis_delete_admin ON number_diagnosis
  FOR DELETE TO authenticated USING (is_admin());

-- ----------------------------------------------------------------------------
-- 3-4: crm_users RLS ポリシー
-- SELECT: 認証済み全員 / UPDATE: 自分自身 or admin / INSERT: なし / DELETE: admin
-- ----------------------------------------------------------------------------
CREATE POLICY crm_users_select_authenticated ON crm_users
  FOR SELECT TO authenticated USING (true);
CREATE POLICY crm_users_update_self ON crm_users
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR is_admin())
  WITH CHECK (id = auth.uid() OR is_admin());
CREATE POLICY crm_users_delete_admin ON crm_users
  FOR DELETE TO authenticated USING (is_admin());

-- ----------------------------------------------------------------------------
-- 3-5: companies RLS ポリシー
-- SELECT: admin/manager 全件、member は owner のみ
-- INSERT: 認証済み全員
-- UPDATE: admin 全件、member/manager は owner のみ
-- DELETE: admin のみ
-- ----------------------------------------------------------------------------
CREATE POLICY companies_select_manager_admin ON companies
  FOR SELECT TO authenticated
  USING (is_manager_or_above() OR owner_user_id = auth.uid());
CREATE POLICY companies_insert_authenticated ON companies
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY companies_update_owner_admin ON companies
  FOR UPDATE TO authenticated
  USING (is_admin() OR owner_user_id = auth.uid())
  WITH CHECK (is_admin() OR owner_user_id = auth.uid());
CREATE POLICY companies_delete_admin ON companies
  FOR DELETE TO authenticated USING (is_admin());

-- ----------------------------------------------------------------------------
-- 3-6: accounts RLS ポリシー（companies と同パターン）
-- ----------------------------------------------------------------------------
CREATE POLICY accounts_select_manager_admin ON accounts
  FOR SELECT TO authenticated
  USING (is_manager_or_above() OR owner_user_id = auth.uid());
CREATE POLICY accounts_insert_authenticated ON accounts
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY accounts_update_owner_admin ON accounts
  FOR UPDATE TO authenticated
  USING (is_admin() OR owner_user_id = auth.uid())
  WITH CHECK (is_admin() OR owner_user_id = auth.uid());
CREATE POLICY accounts_delete_admin ON accounts
  FOR DELETE TO authenticated USING (is_admin());

-- ----------------------------------------------------------------------------
-- 3-7: contacts RLS ポリシー（companies と同パターン）
-- ----------------------------------------------------------------------------
CREATE POLICY contacts_select_manager_admin ON contacts
  FOR SELECT TO authenticated
  USING (is_manager_or_above() OR owner_user_id = auth.uid());
CREATE POLICY contacts_insert_authenticated ON contacts
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY contacts_update_owner_admin ON contacts
  FOR UPDATE TO authenticated
  USING (is_admin() OR owner_user_id = auth.uid())
  WITH CHECK (is_admin() OR owner_user_id = auth.uid());
CREATE POLICY contacts_delete_admin ON contacts
  FOR DELETE TO authenticated USING (is_admin());

-- ----------------------------------------------------------------------------
-- 3-8: deals RLS ポリシー（companies と同パターン）
-- ----------------------------------------------------------------------------
CREATE POLICY deals_select_manager_admin ON deals
  FOR SELECT TO authenticated
  USING (is_manager_or_above() OR owner_user_id = auth.uid());
CREATE POLICY deals_insert_authenticated ON deals
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY deals_update_owner_admin ON deals
  FOR UPDATE TO authenticated
  USING (is_admin() OR owner_user_id = auth.uid())
  WITH CHECK (is_admin() OR owner_user_id = auth.uid());
CREATE POLICY deals_delete_admin ON deals
  FOR DELETE TO authenticated USING (is_admin());

-- ----------------------------------------------------------------------------
-- 3-9: contracts RLS ポリシー
-- SELECT/INSERT/UPDATE: manager/admin のみ / DELETE: admin のみ
-- ----------------------------------------------------------------------------
CREATE POLICY contracts_select_manager_admin ON contracts
  FOR SELECT TO authenticated USING (is_manager_or_above());
CREATE POLICY contracts_insert_manager_admin ON contracts
  FOR INSERT TO authenticated WITH CHECK (is_manager_or_above());
CREATE POLICY contracts_update_manager_admin ON contracts
  FOR UPDATE TO authenticated
  USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
CREATE POLICY contracts_delete_admin ON contracts
  FOR DELETE TO authenticated USING (is_admin());

-- ----------------------------------------------------------------------------
-- 3-10: talents RLS ポリシー（親コンタクトのアクセス権に従う）
-- ----------------------------------------------------------------------------
CREATE POLICY talents_select_manager_admin ON talents
  FOR SELECT TO authenticated
  USING (
    is_manager_or_above()
    OR EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = talents.contact_id AND c.owner_user_id = auth.uid()
    )
  );
CREATE POLICY talents_insert_authenticated ON talents
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY talents_update_owner_admin ON talents
  FOR UPDATE TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = talents.contact_id AND c.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = talents.contact_id AND c.owner_user_id = auth.uid()
    )
  );
-- DELETE: 不要（CASCADE で親コンタクト削除時に連動）

-- ----------------------------------------------------------------------------
-- 3-11: 従属テーブル（contact_emails, contact_phones, talent_skills, talent_careers）
-- 親テーブルのアクセス権に従う → 認証済みユーザーに全操作を許可
-- ----------------------------------------------------------------------------
CREATE POLICY contact_emails_select_authenticated ON contact_emails
  FOR SELECT TO authenticated USING (true);
CREATE POLICY contact_emails_insert_authenticated ON contact_emails
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY contact_emails_update_authenticated ON contact_emails
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY contact_emails_delete_authenticated ON contact_emails
  FOR DELETE TO authenticated USING (true);

CREATE POLICY contact_phones_select_authenticated ON contact_phones
  FOR SELECT TO authenticated USING (true);
CREATE POLICY contact_phones_insert_authenticated ON contact_phones
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY contact_phones_update_authenticated ON contact_phones
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY contact_phones_delete_authenticated ON contact_phones
  FOR DELETE TO authenticated USING (true);

CREATE POLICY talent_skills_select_authenticated ON talent_skills
  FOR SELECT TO authenticated USING (true);
CREATE POLICY talent_skills_insert_authenticated ON talent_skills
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY talent_skills_update_authenticated ON talent_skills
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY talent_skills_delete_authenticated ON talent_skills
  FOR DELETE TO authenticated USING (true);

CREATE POLICY talent_careers_select_authenticated ON talent_careers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY talent_careers_insert_authenticated ON talent_careers
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY talent_careers_update_authenticated ON talent_careers
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY talent_careers_delete_authenticated ON talent_careers
  FOR DELETE TO authenticated USING (true);

-- ----------------------------------------------------------------------------
-- 3-12: financial_info RLS ポリシー
-- SELECT: manager/admin のみ / INSERT・UPDATE・DELETE: admin のみ
-- ----------------------------------------------------------------------------
CREATE POLICY financial_info_select_manager_admin ON financial_info
  FOR SELECT TO authenticated USING (is_manager_or_above());
CREATE POLICY financial_info_insert_admin ON financial_info
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY financial_info_update_admin ON financial_info
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY financial_info_delete_admin ON financial_info
  FOR DELETE TO authenticated USING (is_admin());

-- ----------------------------------------------------------------------------
-- 3-13: other_addresses（親のアクセス権に従う → 認証済みで許可）
-- ----------------------------------------------------------------------------
CREATE POLICY other_addresses_select_authenticated ON other_addresses
  FOR SELECT TO authenticated USING (true);
CREATE POLICY other_addresses_insert_authenticated ON other_addresses
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY other_addresses_update_authenticated ON other_addresses
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY other_addresses_delete_authenticated ON other_addresses
  FOR DELETE TO authenticated USING (true);

-- ----------------------------------------------------------------------------
-- 3-14: deal_services, account_contacts（認証済みで許可）
-- ----------------------------------------------------------------------------
CREATE POLICY deal_services_select_authenticated ON deal_services
  FOR SELECT TO authenticated USING (true);
CREATE POLICY deal_services_insert_authenticated ON deal_services
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY deal_services_update_authenticated ON deal_services
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY deal_services_delete_authenticated ON deal_services
  FOR DELETE TO authenticated USING (true);

CREATE POLICY account_contacts_select_authenticated ON account_contacts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY account_contacts_insert_authenticated ON account_contacts
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY account_contacts_update_authenticated ON account_contacts
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY account_contacts_delete_authenticated ON account_contacts
  FOR DELETE TO authenticated USING (true);

-- ----------------------------------------------------------------------------
-- 3-15: activity_logs（INSERT + SELECT のみ）
-- ----------------------------------------------------------------------------
CREATE POLICY activity_logs_select_authenticated ON activity_logs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY activity_logs_insert_authenticated ON activity_logs
  FOR INSERT TO authenticated WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 3-16: deal_activities RLS ポリシー
-- SELECT: manager/admin 全件、member は performed_by = auth.uid()
-- INSERT: 認証済み全員
-- UPDATE: admin 全件、member は performed_by = auth.uid()
-- DELETE: admin のみ
-- ----------------------------------------------------------------------------
CREATE POLICY deal_activities_select_manager_admin ON deal_activities
  FOR SELECT TO authenticated
  USING (is_manager_or_above() OR performed_by = auth.uid());
CREATE POLICY deal_activities_insert_authenticated ON deal_activities
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY deal_activities_update_owner_admin ON deal_activities
  FOR UPDATE TO authenticated
  USING (is_admin() OR performed_by = auth.uid())
  WITH CHECK (is_admin() OR performed_by = auth.uid());
CREATE POLICY deal_activities_delete_admin ON deal_activities
  FOR DELETE TO authenticated USING (is_admin());

-- ----------------------------------------------------------------------------
-- 3-17: deal_activity_emails（deal_activities に従う → 認証済みで許可）
-- ----------------------------------------------------------------------------
CREATE POLICY deal_activity_emails_select_authenticated ON deal_activity_emails
  FOR SELECT TO authenticated USING (true);
CREATE POLICY deal_activity_emails_insert_authenticated ON deal_activity_emails
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY deal_activity_emails_update_authenticated ON deal_activity_emails
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY deal_activity_emails_delete_authenticated ON deal_activity_emails
  FOR DELETE TO authenticated USING (true);

-- ----------------------------------------------------------------------------
-- 3-18: 履歴テーブル（SELECT + INSERT のみ）
-- ----------------------------------------------------------------------------
CREATE POLICY deal_stage_histories_select_authenticated ON deal_stage_histories
  FOR SELECT TO authenticated USING (true);
CREATE POLICY deal_stage_histories_insert_authenticated ON deal_stage_histories
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY deal_status_histories_select_authenticated ON deal_status_histories
  FOR SELECT TO authenticated USING (true);
CREATE POLICY deal_status_histories_insert_authenticated ON deal_status_histories
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY company_change_histories_select_authenticated ON company_change_histories
  FOR SELECT TO authenticated USING (true);
CREATE POLICY company_change_histories_insert_authenticated ON company_change_histories
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY account_change_histories_select_authenticated ON account_change_histories
  FOR SELECT TO authenticated USING (true);
CREATE POLICY account_change_histories_insert_authenticated ON account_change_histories
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY contact_change_histories_select_authenticated ON contact_change_histories
  FOR SELECT TO authenticated USING (true);
CREATE POLICY contact_change_histories_insert_authenticated ON contact_change_histories
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY deal_change_histories_select_authenticated ON deal_change_histories
  FOR SELECT TO authenticated USING (true);
CREATE POLICY deal_change_histories_insert_authenticated ON deal_change_histories
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY talent_change_histories_select_authenticated ON talent_change_histories
  FOR SELECT TO authenticated USING (true);
CREATE POLICY talent_change_histories_insert_authenticated ON talent_change_histories
  FOR INSERT TO authenticated WITH CHECK (true);
