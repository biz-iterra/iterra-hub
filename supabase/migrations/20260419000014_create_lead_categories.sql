-- ============================================================
-- M22: lead_categories（リードカテゴリ）
-- Lead の分類軸をステージから独立させたマスタ
-- 既定4種: inquiry / mql / tql / sql
-- RLS: 標準マスタパターン（SELECT=認証全員 / CUD=admin）
-- ============================================================

CREATE TABLE lead_categories (
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
  CONSTRAINT chk_lead_categories_code_format
    CHECK (code ~ '^[a-z][a-z0-9_]{0,31}$'),
  CONSTRAINT chk_lead_categories_color_format
    CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT chk_lead_categories_name_length
    CHECK (char_length(name) BETWEEN 1 AND 50)
);

CREATE INDEX idx_lead_categories_active ON lead_categories(sort_order)
  WHERE deleted_at IS NULL;

CREATE TRIGGER trg_lead_categories_updated_at
  BEFORE UPDATE ON lead_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE lead_categories IS
  'リードカテゴリマスタ（M22）。Inquiry/MQL/TQL/SQL など。Lead.category_id で参照';

ALTER TABLE lead_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY lead_categories_select_authenticated ON lead_categories
  FOR SELECT TO authenticated USING (true);
CREATE POLICY lead_categories_insert_admin ON lead_categories
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY lead_categories_update_admin ON lead_categories
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY lead_categories_delete_admin ON lead_categories
  FOR DELETE TO authenticated USING (is_admin());
