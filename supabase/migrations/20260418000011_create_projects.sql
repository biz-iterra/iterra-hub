-- ============================================================
-- Phase A: プロジェクト機能
-- 目的: 複数ディールを業務イニシアチブ単位でグルーピング
-- 追加テーブル:
--   M12 project_statuses             静的マスタ
--   T08 projects                     トランザクション
--   D07 project_members              従属（N:M of project × crm_user）
--   J03 deal_projects                中間（N:M of deal × project）
--   A11 project_change_histories     変更履歴（INSERT ONLY）
-- RLS 方針: 新 3 段階ロール（閲覧全員 / 編集 manager+ / 削除 admin）を先行適用
-- ============================================================

-- ============================================================
-- M12: project_statuses（プロジェクトステータス）
-- ============================================================

CREATE TABLE project_statuses (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        UNIQUE NOT NULL,
  sort_order      INTEGER     NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  deleted_at      TIMESTAMPTZ,
  deleted_by      UUID        REFERENCES crm_users(id),
  deletion_reason TEXT,
  created_by      UUID        NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id),
  last_updated_by UUID        REFERENCES crm_users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_project_statuses_active ON project_statuses(id) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_project_statuses_updated_at
  BEFORE UPDATE ON project_statuses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 初期データ
INSERT INTO project_statuses (id, name, sort_order) VALUES
  ('d1000000-0000-0000-0000-000000000001', '計画中', 1),
  ('d1000000-0000-0000-0000-000000000002', '進行中', 2),
  ('d1000000-0000-0000-0000-000000000003', '保留',   3),
  ('d1000000-0000-0000-0000-000000000004', '完了',   4),
  ('d1000000-0000-0000-0000-000000000005', '中止',   5);

-- RLS
ALTER TABLE project_statuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_statuses_select_authenticated ON project_statuses
  FOR SELECT TO authenticated USING (true);
CREATE POLICY project_statuses_insert_admin ON project_statuses
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY project_statuses_update_admin ON project_statuses
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY project_statuses_delete_admin ON project_statuses
  FOR DELETE TO authenticated USING (is_admin());

-- ============================================================
-- T08: projects（プロジェクト）
-- ============================================================

CREATE TABLE projects (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_code      VARCHAR(10) UNIQUE NOT NULL,
  name              TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description       TEXT        CHECK (description IS NULL OR char_length(description) <= 1000),
  project_status_id UUID        NOT NULL REFERENCES project_statuses(id),
  start_date        DATE,
  end_date          DATE,
  owner_user_id     UUID        REFERENCES crm_users(id),
  internal_memo     TEXT        CHECK (internal_memo IS NULL OR char_length(internal_memo) <= 2000),
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  status_updated_at TIMESTAMPTZ,
  deleted_at        TIMESTAMPTZ,
  deleted_by        UUID        REFERENCES crm_users(id),
  deletion_reason   TEXT,
  created_by        UUID        NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id),
  last_updated_by   UUID        REFERENCES crm_users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_projects_date_range CHECK (
    end_date IS NULL OR start_date IS NULL OR end_date >= start_date
  )
);

CREATE INDEX idx_projects_project_status_id ON projects(project_status_id);
CREATE INDEX idx_projects_owner_user_id     ON projects(owner_user_id);
CREATE INDEX idx_projects_start_date        ON projects(start_date);
CREATE INDEX idx_projects_created_at        ON projects(created_at DESC);
CREATE INDEX idx_projects_active            ON projects(id) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_created_by        ON projects(created_by);

-- project_code 自動採番: PRJ-000001 形式
CREATE OR REPLACE FUNCTION generate_project_code()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(project_code FROM 5) AS INTEGER)), 0) + 1
  INTO next_num FROM projects;
  NEW.project_code = 'PRJ-' || LPAD(next_num::TEXT, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_projects_generate_code
  BEFORE INSERT ON projects
  FOR EACH ROW WHEN (NEW.project_code IS NULL OR NEW.project_code = '')
  EXECUTE FUNCTION generate_project_code();

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: Phase A 方針（閲覧全員 / 編集 manager+ / 削除 admin）
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY projects_select_authenticated ON projects
  FOR SELECT TO authenticated USING (true);
CREATE POLICY projects_insert_manager ON projects
  FOR INSERT TO authenticated WITH CHECK (is_manager_or_above());
CREATE POLICY projects_update_manager ON projects
  FOR UPDATE TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
CREATE POLICY projects_delete_admin ON projects
  FOR DELETE TO authenticated USING (is_admin());

-- ============================================================
-- D07: project_members（プロジェクトメンバー）
-- ============================================================

CREATE TABLE project_members (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES crm_users(id),
  created_by      UUID        NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_project_members UNIQUE (project_id, user_id)
);

CREATE INDEX idx_project_members_project_id ON project_members(project_id);
CREATE INDEX idx_project_members_user_id    ON project_members(user_id);

ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_members_select_authenticated ON project_members
  FOR SELECT TO authenticated USING (true);
CREATE POLICY project_members_insert_manager ON project_members
  FOR INSERT TO authenticated WITH CHECK (is_manager_or_above());
CREATE POLICY project_members_delete_manager ON project_members
  FOR DELETE TO authenticated USING (is_manager_or_above());

-- ============================================================
-- J03: deal_projects（ディール×プロジェクト）
-- ============================================================

CREATE TABLE deal_projects (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id      UUID        NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  project_id   UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by   UUID        NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_deal_projects UNIQUE (deal_id, project_id)
);

CREATE INDEX idx_deal_projects_deal_id    ON deal_projects(deal_id);
CREATE INDEX idx_deal_projects_project_id ON deal_projects(project_id);

ALTER TABLE deal_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY deal_projects_select_authenticated ON deal_projects
  FOR SELECT TO authenticated USING (true);
CREATE POLICY deal_projects_insert_manager ON deal_projects
  FOR INSERT TO authenticated WITH CHECK (is_manager_or_above());
CREATE POLICY deal_projects_delete_manager ON deal_projects
  FOR DELETE TO authenticated USING (is_manager_or_above());

-- ============================================================
-- A11: project_change_histories（プロジェクト変更履歴, INSERT ONLY）
-- ============================================================

CREATE TABLE project_change_histories (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  field_name TEXT        NOT NULL,
  old_value  TEXT,
  new_value  TEXT,
  changed_by UUID        NOT NULL REFERENCES crm_users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_project_change_histories_project_id ON project_change_histories(project_id);
CREATE INDEX idx_project_change_histories_changed_at ON project_change_histories(changed_at DESC);

ALTER TABLE project_change_histories ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_change_histories_select_authenticated ON project_change_histories
  FOR SELECT TO authenticated USING (true);
CREATE POLICY project_change_histories_insert_authenticated ON project_change_histories
  FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================
-- コメント
-- ============================================================

COMMENT ON TABLE  projects                   IS '複数ディールを束ねる業務イニシアチブ（T08）';
COMMENT ON TABLE  project_statuses           IS 'プロジェクトステータス マスタ（M12）';
COMMENT ON TABLE  project_members            IS 'プロジェクトメンバー（D07）。crm_users との N:M';
COMMENT ON TABLE  deal_projects              IS 'ディール × プロジェクト 中間テーブル（J03）';
COMMENT ON TABLE  project_change_histories   IS 'プロジェクト変更履歴（A11）。INSERT ONLY';
