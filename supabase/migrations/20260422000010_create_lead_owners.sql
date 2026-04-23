-- ============================================================
-- T10 lead_owners（リード副担当中間テーブル）
-- 主担当: leads.owner_user_id（既存、残置）
-- 副担当: このテーブルで管理
-- Phase 10b-1
-- ============================================================

CREATE TABLE lead_owners (
  lead_id     UUID         NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id     UUID         NOT NULL REFERENCES crm_users(id) ON DELETE RESTRICT,
  assigned_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (lead_id, user_id)
);

CREATE INDEX idx_lead_owners_user ON lead_owners(user_id);

COMMENT ON TABLE lead_owners IS 'リード副担当中間テーブル（T10）。主担当は leads.owner_user_id で保持、副担当のみこのテーブルで管理';
COMMENT ON COLUMN lead_owners.lead_id IS '対象リード';
COMMENT ON COLUMN lead_owners.user_id IS '副担当のCRMユーザー。owner_user_id と重複してもOK（業務上は重複しないよう UI でガード）';

-- ------------------------------------------------------------
-- is_lead_accessible ヘルパー関数更新
-- 副担当（lead_owners）への所属チェックを追加
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_lead_accessible(p_lead_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM leads l
    WHERE l.id = p_lead_id
      AND l.deleted_at IS NULL
      AND (
        is_manager_or_above()
        OR l.owner_user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM lead_owners lo
          WHERE lo.lead_id = l.id AND lo.user_id = auth.uid()
        )
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION is_lead_accessible(UUID) IS 'lead拡張テーブルのRLS共通判定。親leadが生きていてオーナー/副担当/マネージャー以上ならアクセス可（Phase 10b-1 で lead_owners チェック追加）';

-- ------------------------------------------------------------
-- leads RLS ポリシー更新
-- select/update: 主担当 + 副担当（lead_owners）どちらでも可
-- delete: 主担当 + manager/admin のみ（副担当は削除不可）
-- ------------------------------------------------------------
DROP POLICY IF EXISTS leads_select ON leads;
DROP POLICY IF EXISTS leads_update ON leads;
DROP POLICY IF EXISTS leads_delete ON leads;

CREATE POLICY leads_select ON leads
  FOR SELECT TO authenticated
  USING (
    is_manager_or_above()
    OR owner_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM lead_owners lo WHERE lo.lead_id = leads.id AND lo.user_id = auth.uid())
  );

CREATE POLICY leads_update ON leads
  FOR UPDATE TO authenticated
  USING (
    is_manager_or_above()
    OR owner_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM lead_owners lo WHERE lo.lead_id = leads.id AND lo.user_id = auth.uid())
  )
  WITH CHECK (
    is_manager_or_above()
    OR owner_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM lead_owners lo WHERE lo.lead_id = leads.id AND lo.user_id = auth.uid())
  );

CREATE POLICY leads_delete ON leads
  FOR DELETE TO authenticated
  USING (
    is_manager_or_above()
    OR owner_user_id = auth.uid()
  );

-- ------------------------------------------------------------
-- lead_owners 自体の RLS
-- UPDATE なし（user_id/lead_id 変更不要、追加削除で対応）
-- ------------------------------------------------------------
ALTER TABLE lead_owners ENABLE ROW LEVEL SECURITY;

CREATE POLICY lead_owners_select ON lead_owners
  FOR SELECT TO authenticated
  USING (is_lead_accessible(lead_id));

CREATE POLICY lead_owners_insert ON lead_owners
  FOR INSERT TO authenticated
  WITH CHECK (is_lead_accessible(lead_id));

CREATE POLICY lead_owners_delete ON lead_owners
  FOR DELETE TO authenticated
  USING (is_lead_accessible(lead_id));
