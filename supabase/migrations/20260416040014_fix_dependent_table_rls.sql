-- ============================================================
-- 従属テーブル RLS ポリシー強化
-- 親テーブルの owner_user_id に基づくアクセス制御へ変更
-- ============================================================

-- ============================================================
-- 1. contact_emails — 親 contacts.owner_user_id ベース
-- ============================================================

DROP POLICY IF EXISTS contact_emails_select_authenticated ON contact_emails;
DROP POLICY IF EXISTS contact_emails_insert_authenticated ON contact_emails;
DROP POLICY IF EXISTS contact_emails_update_authenticated ON contact_emails;
DROP POLICY IF EXISTS contact_emails_delete_authenticated ON contact_emails;

CREATE POLICY contact_emails_select ON contact_emails
  FOR SELECT TO authenticated
  USING (
    is_manager_or_above()
    OR EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_emails.contact_id AND c.owner_user_id = auth.uid())
  );

CREATE POLICY contact_emails_insert ON contact_emails
  FOR INSERT TO authenticated
  WITH CHECK (
    is_manager_or_above()
    OR EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_emails.contact_id AND c.owner_user_id = auth.uid())
  );

CREATE POLICY contact_emails_update ON contact_emails
  FOR UPDATE TO authenticated
  USING (
    is_admin()
    OR EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_emails.contact_id AND c.owner_user_id = auth.uid())
  )
  WITH CHECK (
    is_admin()
    OR EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_emails.contact_id AND c.owner_user_id = auth.uid())
  );

CREATE POLICY contact_emails_delete ON contact_emails
  FOR DELETE TO authenticated
  USING (
    is_admin()
    OR EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_emails.contact_id AND c.owner_user_id = auth.uid())
  );

-- ============================================================
-- 2. contact_phones — 親 contacts.owner_user_id ベース
-- ============================================================

DROP POLICY IF EXISTS contact_phones_select_authenticated ON contact_phones;
DROP POLICY IF EXISTS contact_phones_insert_authenticated ON contact_phones;
DROP POLICY IF EXISTS contact_phones_update_authenticated ON contact_phones;
DROP POLICY IF EXISTS contact_phones_delete_authenticated ON contact_phones;

CREATE POLICY contact_phones_select ON contact_phones
  FOR SELECT TO authenticated
  USING (
    is_manager_or_above()
    OR EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_phones.contact_id AND c.owner_user_id = auth.uid())
  );

CREATE POLICY contact_phones_insert ON contact_phones
  FOR INSERT TO authenticated
  WITH CHECK (
    is_manager_or_above()
    OR EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_phones.contact_id AND c.owner_user_id = auth.uid())
  );

CREATE POLICY contact_phones_update ON contact_phones
  FOR UPDATE TO authenticated
  USING (
    is_admin()
    OR EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_phones.contact_id AND c.owner_user_id = auth.uid())
  )
  WITH CHECK (
    is_admin()
    OR EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_phones.contact_id AND c.owner_user_id = auth.uid())
  );

CREATE POLICY contact_phones_delete ON contact_phones
  FOR DELETE TO authenticated
  USING (
    is_admin()
    OR EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_phones.contact_id AND c.owner_user_id = auth.uid())
  );

-- ============================================================
-- 3. talent_skills — 親 talents → contacts.owner_user_id ベース
-- ============================================================

DROP POLICY IF EXISTS talent_skills_select_authenticated ON talent_skills;
DROP POLICY IF EXISTS talent_skills_insert_authenticated ON talent_skills;
DROP POLICY IF EXISTS talent_skills_update_authenticated ON talent_skills;
DROP POLICY IF EXISTS talent_skills_delete_authenticated ON talent_skills;

CREATE POLICY talent_skills_select ON talent_skills
  FOR SELECT TO authenticated
  USING (
    is_manager_or_above()
    OR EXISTS (
      SELECT 1 FROM talents t
      JOIN contacts c ON c.id = t.contact_id
      WHERE t.id = talent_skills.talent_id AND c.owner_user_id = auth.uid()
    )
  );

CREATE POLICY talent_skills_insert ON talent_skills
  FOR INSERT TO authenticated
  WITH CHECK (
    is_manager_or_above()
    OR EXISTS (
      SELECT 1 FROM talents t
      JOIN contacts c ON c.id = t.contact_id
      WHERE t.id = talent_skills.talent_id AND c.owner_user_id = auth.uid()
    )
  );

CREATE POLICY talent_skills_update ON talent_skills
  FOR UPDATE TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM talents t
      JOIN contacts c ON c.id = t.contact_id
      WHERE t.id = talent_skills.talent_id AND c.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM talents t
      JOIN contacts c ON c.id = t.contact_id
      WHERE t.id = talent_skills.talent_id AND c.owner_user_id = auth.uid()
    )
  );

CREATE POLICY talent_skills_delete ON talent_skills
  FOR DELETE TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM talents t
      JOIN contacts c ON c.id = t.contact_id
      WHERE t.id = talent_skills.talent_id AND c.owner_user_id = auth.uid()
    )
  );

-- ============================================================
-- 4. talent_careers — 親 talents → contacts.owner_user_id ベース
-- ============================================================

DROP POLICY IF EXISTS talent_careers_select_authenticated ON talent_careers;
DROP POLICY IF EXISTS talent_careers_insert_authenticated ON talent_careers;
DROP POLICY IF EXISTS talent_careers_update_authenticated ON talent_careers;
DROP POLICY IF EXISTS talent_careers_delete_authenticated ON talent_careers;

CREATE POLICY talent_careers_select ON talent_careers
  FOR SELECT TO authenticated
  USING (
    is_manager_or_above()
    OR EXISTS (
      SELECT 1 FROM talents t
      JOIN contacts c ON c.id = t.contact_id
      WHERE t.id = talent_careers.talent_id AND c.owner_user_id = auth.uid()
    )
  );

CREATE POLICY talent_careers_insert ON talent_careers
  FOR INSERT TO authenticated
  WITH CHECK (
    is_manager_or_above()
    OR EXISTS (
      SELECT 1 FROM talents t
      JOIN contacts c ON c.id = t.contact_id
      WHERE t.id = talent_careers.talent_id AND c.owner_user_id = auth.uid()
    )
  );

CREATE POLICY talent_careers_update ON talent_careers
  FOR UPDATE TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM talents t
      JOIN contacts c ON c.id = t.contact_id
      WHERE t.id = talent_careers.talent_id AND c.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM talents t
      JOIN contacts c ON c.id = t.contact_id
      WHERE t.id = talent_careers.talent_id AND c.owner_user_id = auth.uid()
    )
  );

CREATE POLICY talent_careers_delete ON talent_careers
  FOR DELETE TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM talents t
      JOIN contacts c ON c.id = t.contact_id
      WHERE t.id = talent_careers.talent_id AND c.owner_user_id = auth.uid()
    )
  );

-- ============================================================
-- 5. deal_services — 親 deals.owner_user_id ベース
-- ============================================================

DROP POLICY IF EXISTS deal_services_select_authenticated ON deal_services;
DROP POLICY IF EXISTS deal_services_insert_authenticated ON deal_services;
DROP POLICY IF EXISTS deal_services_update_authenticated ON deal_services;
DROP POLICY IF EXISTS deal_services_delete_authenticated ON deal_services;

CREATE POLICY deal_services_select ON deal_services
  FOR SELECT TO authenticated
  USING (
    is_manager_or_above()
    OR EXISTS (SELECT 1 FROM deals d WHERE d.id = deal_services.deal_id AND d.owner_user_id = auth.uid())
  );

CREATE POLICY deal_services_insert ON deal_services
  FOR INSERT TO authenticated
  WITH CHECK (
    is_manager_or_above()
    OR EXISTS (SELECT 1 FROM deals d WHERE d.id = deal_services.deal_id AND d.owner_user_id = auth.uid())
  );

CREATE POLICY deal_services_update ON deal_services
  FOR UPDATE TO authenticated
  USING (
    is_admin()
    OR EXISTS (SELECT 1 FROM deals d WHERE d.id = deal_services.deal_id AND d.owner_user_id = auth.uid())
  )
  WITH CHECK (
    is_admin()
    OR EXISTS (SELECT 1 FROM deals d WHERE d.id = deal_services.deal_id AND d.owner_user_id = auth.uid())
  );

CREATE POLICY deal_services_delete ON deal_services
  FOR DELETE TO authenticated
  USING (
    is_admin()
    OR EXISTS (SELECT 1 FROM deals d WHERE d.id = deal_services.deal_id AND d.owner_user_id = auth.uid())
  );

-- ============================================================
-- 6. account_contacts — 親 accounts.owner_user_id ベース
-- ============================================================

DROP POLICY IF EXISTS account_contacts_select_authenticated ON account_contacts;
DROP POLICY IF EXISTS account_contacts_insert_authenticated ON account_contacts;
DROP POLICY IF EXISTS account_contacts_update_authenticated ON account_contacts;
DROP POLICY IF EXISTS account_contacts_delete_authenticated ON account_contacts;

CREATE POLICY account_contacts_select ON account_contacts
  FOR SELECT TO authenticated
  USING (
    is_manager_or_above()
    OR EXISTS (SELECT 1 FROM accounts a WHERE a.id = account_contacts.account_id AND a.owner_user_id = auth.uid())
  );

CREATE POLICY account_contacts_insert ON account_contacts
  FOR INSERT TO authenticated
  WITH CHECK (
    is_manager_or_above()
    OR EXISTS (SELECT 1 FROM accounts a WHERE a.id = account_contacts.account_id AND a.owner_user_id = auth.uid())
  );

CREATE POLICY account_contacts_update ON account_contacts
  FOR UPDATE TO authenticated
  USING (
    is_admin()
    OR EXISTS (SELECT 1 FROM accounts a WHERE a.id = account_contacts.account_id AND a.owner_user_id = auth.uid())
  )
  WITH CHECK (
    is_admin()
    OR EXISTS (SELECT 1 FROM accounts a WHERE a.id = account_contacts.account_id AND a.owner_user_id = auth.uid())
  );

CREATE POLICY account_contacts_delete ON account_contacts
  FOR DELETE TO authenticated
  USING (
    is_admin()
    OR EXISTS (SELECT 1 FROM accounts a WHERE a.id = account_contacts.account_id AND a.owner_user_id = auth.uid())
  );
