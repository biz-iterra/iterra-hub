-- ============================================================
-- リードステージ・ステータス・温度感・スコアリングルール マスタ
--   M18 lead_stages          : ステージ（7段階）
--   M19 lead_statuses        : ステータス（stage_id FK、ステージごと）
--   M20 lead_temperatures    : 温度感マスタ（hot/warm/cold）
--   M21 lead_scoring_rules   : スコア→温度感 変換ルール
-- ============================================================

-- ------------------------------------------------------------
-- M20: lead_temperatures（温度感）
-- M19 の FK 先になるため先に作成
-- ------------------------------------------------------------
CREATE TABLE lead_temperatures (
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
  CONSTRAINT chk_lead_temperatures_code_format
    CHECK (code ~ '^[a-z][a-z0-9_]{0,31}$'),
  CONSTRAINT chk_lead_temperatures_color_format
    CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT chk_lead_temperatures_name_length
    CHECK (char_length(name) BETWEEN 1 AND 50)
);

CREATE INDEX idx_lead_temperatures_active ON lead_temperatures(id) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_lead_temperatures_updated_at
  BEFORE UPDATE ON lead_temperatures
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE lead_temperatures IS 'リード温度感マスタ（hot/warm/cold）。score から自動判定するための参照マスタ';

-- ------------------------------------------------------------
-- M18: lead_stages（リードステージ）
-- ------------------------------------------------------------
CREATE TABLE lead_stages (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                  VARCHAR(32) UNIQUE NOT NULL,
  name                  TEXT        NOT NULL,
  sort_order            INTEGER     NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_terminal           BOOLEAN     NOT NULL DEFAULT FALSE,
  auto_promote_to_deal  BOOLEAN     NOT NULL DEFAULT FALSE,
  deleted_at            TIMESTAMPTZ,
  deleted_by            UUID        REFERENCES crm_users(id),
  deletion_reason       TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_lead_stages_slug_format
    CHECK (slug ~ '^[a-z][a-z0-9_]{0,31}$'),
  CONSTRAINT chk_lead_stages_name_length
    CHECK (char_length(name) BETWEEN 1 AND 100),
  -- auto_promote_to_deal が true のとき is_terminal は false でなければならない
  CONSTRAINT chk_lead_stages_promote_not_terminal
    CHECK (NOT (auto_promote_to_deal = TRUE AND is_terminal = TRUE))
);

CREATE INDEX idx_lead_stages_active ON lead_stages(sort_order) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_lead_stages_updated_at
  BEFORE UPDATE ON lead_stages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE lead_stages IS 'リードステージ（7段階: 獲得/育成/選定/SQL/Opportunity/Customer/Dead）';
COMMENT ON COLUMN lead_stages.is_terminal IS 'Customer/Dead のときtrue。端末ステージは自動昇格しない';
COMMENT ON COLUMN lead_stages.auto_promote_to_deal IS 'opportunity ステージのみtrue。Lead→Deal昇格をトリガーする';

-- ------------------------------------------------------------
-- M19: lead_statuses（リードステータス）
-- stage_id FK NOT NULL、UNIQUE(stage_id, code)
-- ------------------------------------------------------------
CREATE TABLE lead_statuses (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id        UUID        NOT NULL REFERENCES lead_stages(id),
  code            VARCHAR(32) NOT NULL,
  name            TEXT        NOT NULL,
  sort_order      INTEGER     NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  deleted_at      TIMESTAMPTZ,
  deleted_by      UUID        REFERENCES crm_users(id),
  deletion_reason TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_lead_statuses_stage_code UNIQUE (stage_id, code),
  CONSTRAINT chk_lead_statuses_code_format
    CHECK (code ~ '^[a-z][a-z0-9_]{0,31}$'),
  CONSTRAINT chk_lead_statuses_name_length
    CHECK (char_length(name) BETWEEN 1 AND 100)
);

CREATE INDEX idx_lead_statuses_stage ON lead_statuses(stage_id);
CREATE INDEX idx_lead_statuses_active ON lead_statuses(stage_id, sort_order) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_lead_statuses_updated_at
  BEFORE UPDATE ON lead_statuses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE lead_statuses IS 'リードステータス（ステージに従属、UNIQUE(stage_id, code)）';

-- ------------------------------------------------------------
-- M21: lead_scoring_rules（スコアリングルール）
-- score範囲 → temperature_id のマッピング
-- ------------------------------------------------------------
CREATE TABLE lead_scoring_rules (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  temperature_id  UUID        NOT NULL REFERENCES lead_temperatures(id),
  min_score       NUMERIC     NOT NULL,
  max_score       NUMERIC,  -- NULL = 上限なし（hot: 80+）
  sort_order      INTEGER     NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  deleted_at      TIMESTAMPTZ,
  deleted_by      UUID        REFERENCES crm_users(id),
  deletion_reason TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_lead_scoring_rules_score_range
    CHECK (max_score IS NULL OR max_score >= min_score)
);

CREATE INDEX idx_lead_scoring_rules_active ON lead_scoring_rules(sort_order) WHERE deleted_at IS NULL;
CREATE INDEX idx_lead_scoring_rules_temperature ON lead_scoring_rules(temperature_id);

CREATE TRIGGER trg_lead_scoring_rules_updated_at
  BEFORE UPDATE ON lead_scoring_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE lead_scoring_rules IS 'スコア範囲→温度感マッピングルール。Server Actionでscore更新時に参照してtemperature_idを設定する';
COMMENT ON COLUMN lead_scoring_rules.max_score IS 'NULL の場合は上限なし（例: hot は 80 以上）';

-- ============================================================
-- RLS: 4マスタともマスタ標準パターン（SELECT=認証全員 / CUD=admin）
-- ============================================================

ALTER TABLE lead_stages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_statuses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_temperatures    ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_scoring_rules   ENABLE ROW LEVEL SECURITY;

-- lead_stages
CREATE POLICY lead_stages_select_authenticated ON lead_stages
  FOR SELECT TO authenticated USING (true);
CREATE POLICY lead_stages_insert_admin ON lead_stages
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY lead_stages_update_admin ON lead_stages
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY lead_stages_delete_admin ON lead_stages
  FOR DELETE TO authenticated USING (is_admin());

-- lead_statuses
CREATE POLICY lead_statuses_select_authenticated ON lead_statuses
  FOR SELECT TO authenticated USING (true);
CREATE POLICY lead_statuses_insert_admin ON lead_statuses
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY lead_statuses_update_admin ON lead_statuses
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY lead_statuses_delete_admin ON lead_statuses
  FOR DELETE TO authenticated USING (is_admin());

-- lead_temperatures
CREATE POLICY lead_temperatures_select_authenticated ON lead_temperatures
  FOR SELECT TO authenticated USING (true);
CREATE POLICY lead_temperatures_insert_admin ON lead_temperatures
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY lead_temperatures_update_admin ON lead_temperatures
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY lead_temperatures_delete_admin ON lead_temperatures
  FOR DELETE TO authenticated USING (is_admin());

-- lead_scoring_rules
CREATE POLICY lead_scoring_rules_select_authenticated ON lead_scoring_rules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY lead_scoring_rules_insert_admin ON lead_scoring_rules
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY lead_scoring_rules_update_admin ON lead_scoring_rules
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY lead_scoring_rules_delete_admin ON lead_scoring_rules
  FOR DELETE TO authenticated USING (is_admin());
