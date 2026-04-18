-- ============================================================
-- インサイドセールス専用マスタ（5テーブル）
-- 目的: パイプライン slug='inside_sales' 向けの拡張に必要なマスタを整備する
-- 対象:
--   M13 inside_sales_phases         : フェーズ（ホット/ウォーム/コールド）
--   M14 inside_sales_large_segments : 大セグメント
--   M15 inside_sales_small_segments : 小セグメント（M14に従属）
--   M16 inside_sales_call_statuses  : 架電ステータス
--   M17 inside_sales_callers        : 架電担当者（crm_users とは別管理。社外委託対応）
-- 方針: すべて code UK を持たせ、CSV取込のキーとして使用する
-- ============================================================

-- ------------------------------------------------------------
-- M13: inside_sales_phases
-- ------------------------------------------------------------
CREATE TABLE inside_sales_phases (
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
  CONSTRAINT chk_inside_sales_phases_code_format CHECK (code ~ '^[a-z][a-z0-9_]{0,31}$'),
  CONSTRAINT chk_inside_sales_phases_color_format CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT chk_inside_sales_phases_name_length CHECK (char_length(name) BETWEEN 1 AND 50)
);

CREATE INDEX idx_inside_sales_phases_active ON inside_sales_phases(id) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_inside_sales_phases_updated_at
  BEFORE UPDATE ON inside_sales_phases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE inside_sales_phases IS 'インサイドセールス固有フェーズ（deal_stages.phase_id の参照先）';

-- ------------------------------------------------------------
-- M14: inside_sales_large_segments
-- ------------------------------------------------------------
CREATE TABLE inside_sales_large_segments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code            VARCHAR(32) UNIQUE NOT NULL,
  name            TEXT        NOT NULL,
  sort_order      INTEGER     NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  deleted_at      TIMESTAMPTZ,
  deleted_by      UUID        REFERENCES crm_users(id),
  deletion_reason TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_inside_sales_large_segments_code_format CHECK (code ~ '^[a-z][a-z0-9_]{0,31}$'),
  CONSTRAINT chk_inside_sales_large_segments_name_length CHECK (char_length(name) BETWEEN 1 AND 100)
);

CREATE INDEX idx_inside_sales_large_segments_active ON inside_sales_large_segments(id) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_inside_sales_large_segments_updated_at
  BEFORE UPDATE ON inside_sales_large_segments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE inside_sales_large_segments IS 'インサイドセールス 大セグメント';

-- ------------------------------------------------------------
-- M15: inside_sales_small_segments
-- ------------------------------------------------------------
CREATE TABLE inside_sales_small_segments (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  large_segment_id  UUID        NOT NULL REFERENCES inside_sales_large_segments(id),
  code              VARCHAR(32) NOT NULL,
  name              TEXT        NOT NULL,
  sort_order        INTEGER     NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  deleted_at        TIMESTAMPTZ,
  deleted_by        UUID        REFERENCES crm_users(id),
  deletion_reason   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_inside_sales_small_segments_code UNIQUE (large_segment_id, code),
  CONSTRAINT chk_inside_sales_small_segments_code_format CHECK (code ~ '^[a-z][a-z0-9_]{0,31}$'),
  CONSTRAINT chk_inside_sales_small_segments_name_length CHECK (char_length(name) BETWEEN 1 AND 100)
);

CREATE INDEX idx_inside_sales_small_segments_large ON inside_sales_small_segments(large_segment_id);
CREATE INDEX idx_inside_sales_small_segments_active ON inside_sales_small_segments(id) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_inside_sales_small_segments_updated_at
  BEFORE UPDATE ON inside_sales_small_segments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE inside_sales_small_segments IS 'インサイドセールス 小セグメント（大セグメントに従属）';

-- ------------------------------------------------------------
-- M16: inside_sales_call_statuses
-- ------------------------------------------------------------
CREATE TABLE inside_sales_call_statuses (
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
  CONSTRAINT chk_inside_sales_call_statuses_code_format CHECK (code ~ '^[a-z][a-z0-9_]{0,31}$'),
  CONSTRAINT chk_inside_sales_call_statuses_color_format CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT chk_inside_sales_call_statuses_name_length CHECK (char_length(name) BETWEEN 1 AND 50)
);

CREATE INDEX idx_inside_sales_call_statuses_active ON inside_sales_call_statuses(id) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_inside_sales_call_statuses_updated_at
  BEFORE UPDATE ON inside_sales_call_statuses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE inside_sales_call_statuses IS 'インサイドセールス 架電ステータス';

-- ------------------------------------------------------------
-- M17: inside_sales_callers（架電担当者）
-- crm_users とは別管理。社外BPO等の委託先も登録可能
-- ------------------------------------------------------------
CREATE TABLE inside_sales_callers (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code            VARCHAR(32) UNIQUE NOT NULL,
  name            TEXT        NOT NULL,
  caller_type     TEXT        NOT NULL CHECK (caller_type IN ('internal', 'external')),
  organization    TEXT,
  email           VARCHAR(255),
  phone           VARCHAR(20),
  linked_user_id  UUID        REFERENCES crm_users(id),
  note            TEXT,
  deleted_at      TIMESTAMPTZ,
  deleted_by      UUID        REFERENCES crm_users(id),
  deletion_reason TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_inside_sales_callers_code_format CHECK (code ~ '^[a-z0-9][a-z0-9_-]{0,31}$'),
  CONSTRAINT chk_inside_sales_callers_name_length CHECK (char_length(name) BETWEEN 1 AND 100),
  CONSTRAINT chk_inside_sales_callers_organization_length CHECK (organization IS NULL OR char_length(organization) <= 100),
  CONSTRAINT chk_inside_sales_callers_note_length CHECK (note IS NULL OR char_length(note) <= 500),
  CONSTRAINT chk_inside_sales_callers_email_format CHECK (email IS NULL OR email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- external は linked_user_id を持たない
  CONSTRAINT chk_inside_sales_callers_linked_user CHECK (
    caller_type = 'internal' OR linked_user_id IS NULL
  )
);

CREATE INDEX idx_inside_sales_callers_active ON inside_sales_callers(id) WHERE deleted_at IS NULL;
CREATE INDEX idx_inside_sales_callers_linked_user ON inside_sales_callers(linked_user_id) WHERE linked_user_id IS NOT NULL;

CREATE TRIGGER trg_inside_sales_callers_updated_at
  BEFORE UPDATE ON inside_sales_callers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE inside_sales_callers IS 'インサイドセールス 架電担当者マスタ（社内/社外）';
COMMENT ON COLUMN inside_sales_callers.caller_type IS 'internal=社内 / external=社外BPO等';
COMMENT ON COLUMN inside_sales_callers.linked_user_id IS 'internal のとき任意で crm_users と紐付け';

-- ============================================================
-- RLS: 5マスタともマスタ標準パターン（SELECT=認証全員 / CUD=admin）
-- ============================================================

ALTER TABLE inside_sales_phases         ENABLE ROW LEVEL SECURITY;
ALTER TABLE inside_sales_large_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE inside_sales_small_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE inside_sales_call_statuses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE inside_sales_callers        ENABLE ROW LEVEL SECURITY;

CREATE POLICY inside_sales_phases_select_authenticated ON inside_sales_phases
  FOR SELECT TO authenticated USING (true);
CREATE POLICY inside_sales_phases_insert_admin ON inside_sales_phases
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY inside_sales_phases_update_admin ON inside_sales_phases
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY inside_sales_phases_delete_admin ON inside_sales_phases
  FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY inside_sales_large_segments_select_authenticated ON inside_sales_large_segments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY inside_sales_large_segments_insert_admin ON inside_sales_large_segments
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY inside_sales_large_segments_update_admin ON inside_sales_large_segments
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY inside_sales_large_segments_delete_admin ON inside_sales_large_segments
  FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY inside_sales_small_segments_select_authenticated ON inside_sales_small_segments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY inside_sales_small_segments_insert_admin ON inside_sales_small_segments
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY inside_sales_small_segments_update_admin ON inside_sales_small_segments
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY inside_sales_small_segments_delete_admin ON inside_sales_small_segments
  FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY inside_sales_call_statuses_select_authenticated ON inside_sales_call_statuses
  FOR SELECT TO authenticated USING (true);
CREATE POLICY inside_sales_call_statuses_insert_admin ON inside_sales_call_statuses
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY inside_sales_call_statuses_update_admin ON inside_sales_call_statuses
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY inside_sales_call_statuses_delete_admin ON inside_sales_call_statuses
  FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY inside_sales_callers_select_authenticated ON inside_sales_callers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY inside_sales_callers_insert_admin ON inside_sales_callers
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY inside_sales_callers_update_admin ON inside_sales_callers
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY inside_sales_callers_delete_admin ON inside_sales_callers
  FOR DELETE TO authenticated USING (is_admin());
