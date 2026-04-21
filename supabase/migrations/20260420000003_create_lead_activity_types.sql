-- ============================================================
-- M23: lead_activity_types（対応種別マスタ）
-- Lead アクティビティの種別（コール/メール/面談/メモ/その他）
-- RLS: 標準マスタパターン（SELECT=認証全員 / CUD=admin）
-- ============================================================

CREATE TABLE lead_activity_types (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code            VARCHAR(32) UNIQUE NOT NULL,
  name            TEXT        NOT NULL,
  color           VARCHAR(7),
  sort_order      INTEGER     NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  deleted_at      TIMESTAMPTZ,
  deleted_by      UUID        REFERENCES crm_users(id),
  deletion_reason TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_lead_activity_types_code_format
    CHECK (code ~ '^[a-z][a-z0-9_]{0,31}$'),
  CONSTRAINT chk_lead_activity_types_color_format
    CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT chk_lead_activity_types_name_length
    CHECK (char_length(name) BETWEEN 1 AND 50)
);

CREATE INDEX idx_lead_activity_types_active ON lead_activity_types(sort_order)
  WHERE deleted_at IS NULL;

CREATE TRIGGER trg_lead_activity_types_updated_at
  BEFORE UPDATE ON lead_activity_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE lead_activity_types IS
  'リードアクティビティ種別マスタ（M23）。コール/メール/面談/メモ/その他';

ALTER TABLE lead_activity_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY lead_activity_types_select_authenticated ON lead_activity_types
  FOR SELECT TO authenticated USING (true);
CREATE POLICY lead_activity_types_insert_admin ON lead_activity_types
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY lead_activity_types_update_admin ON lead_activity_types
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY lead_activity_types_delete_admin ON lead_activity_types
  FOR DELETE TO authenticated USING (is_admin());
