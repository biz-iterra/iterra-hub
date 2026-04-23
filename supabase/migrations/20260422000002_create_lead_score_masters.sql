-- ============================================================
-- Lead スコアリング刷新 Phase 2: 3新マスタ作成
--   M24 lead_company_sizes          : 企業規模マスタ
--   M25 lead_customer_activity_types: 顧客行動タイプマスタ
--   M26 lead_score_rules            : 加点ルールマスタ
-- ============================================================

-- ------------------------------------------------------------
-- M24: lead_company_sizes（企業規模マスタ）
-- 資本金優先・従業員数フォールバックで自動判定（Phase 3 のトリガで設定）
-- ------------------------------------------------------------
CREATE TABLE lead_company_sizes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code            VARCHAR(32) NOT NULL UNIQUE,
  name            TEXT        NOT NULL,
  min_employees   INT,
  max_employees   INT,
  min_capital     NUMERIC,
  max_capital     NUMERIC,
  sort_order      INT         NOT NULL DEFAULT 0,
  deleted_at      TIMESTAMPTZ,
  deleted_by      UUID        REFERENCES crm_users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_lead_company_sizes_code_format
    CHECK (code ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT chk_lead_company_sizes_name_length
    CHECK (char_length(name) BETWEEN 1 AND 100),
  CONSTRAINT chk_lead_company_sizes_employee_range
    CHECK (min_employees IS NULL OR max_employees IS NULL OR min_employees <= max_employees),
  CONSTRAINT chk_lead_company_sizes_capital_range
    CHECK (min_capital IS NULL OR max_capital IS NULL OR min_capital <= max_capital)
);

CREATE INDEX idx_lead_company_sizes_active
  ON lead_company_sizes(sort_order) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_lead_company_sizes_updated_at
  BEFORE UPDATE ON lead_company_sizes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE lead_company_sizes
  IS 'リード企業規模マスタ。資本金優先・従業員数フォールバックで自動判定（Phase 3 のトリガで設定）';
COMMENT ON COLUMN lead_company_sizes.min_capital
  IS '資本金（円）下限。NULL=制限なし';
COMMENT ON COLUMN lead_company_sizes.max_capital
  IS '資本金（円）上限。NULL=制限なし';
COMMENT ON COLUMN lead_company_sizes.min_employees
  IS '従業員数 下限。NULL=制限なし';
COMMENT ON COLUMN lead_company_sizes.max_employees
  IS '従業員数 上限。NULL=制限なし';

-- ------------------------------------------------------------
-- M25: lead_customer_activity_types（顧客行動タイプマスタ）
-- イベント参加・資料DL等、顧客側の行動ログ種別
-- ------------------------------------------------------------
CREATE TABLE lead_customer_activity_types (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code         VARCHAR(32) NOT NULL UNIQUE,
  name         TEXT        NOT NULL,
  description  TEXT,
  sort_order   INT         NOT NULL DEFAULT 0,
  deleted_at   TIMESTAMPTZ,
  deleted_by   UUID        REFERENCES crm_users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_lead_customer_activity_types_code_format
    CHECK (code ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT chk_lead_customer_activity_types_name_length
    CHECK (char_length(name) BETWEEN 1 AND 100),
  CONSTRAINT chk_lead_customer_activity_types_description_length
    CHECK (description IS NULL OR char_length(description) <= 500)
);

CREATE INDEX idx_lead_customer_activity_types_active
  ON lead_customer_activity_types(sort_order) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_lead_customer_activity_types_updated_at
  BEFORE UPDATE ON lead_customer_activity_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE lead_customer_activity_types
  IS 'リード顧客行動タイプマスタ（イベント参加・資料DL等、顧客側の行動ログ種別）';

-- ------------------------------------------------------------
-- M26: lead_score_rules（加点ルールマスタ）
-- category / condition_type / condition_value_id の組で加点条件を定義
-- ------------------------------------------------------------
CREATE TABLE lead_score_rules (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  category             VARCHAR(32) NOT NULL,
  condition_type       VARCHAR(32) NOT NULL,
  condition_value_id   UUID,
  condition_value_text TEXT,
  score_delta          INT         NOT NULL,
  description          TEXT,
  sort_order           INT         NOT NULL DEFAULT 0,
  deleted_at           TIMESTAMPTZ,
  deleted_by           UUID        REFERENCES crm_users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_lead_score_rules_category
    CHECK (category IN ('attribute','interest','stage','status','activity')),
  CONSTRAINT chk_lead_score_rules_condition_type
    CHECK (condition_type IN (
      'company_size','large_segment','small_segment','lead_source',
      'stage','status','call_status','activity_type','customer_activity_type'
    )),
  CONSTRAINT chk_lead_score_rules_score_delta
    CHECK (score_delta BETWEEN 0 AND 100),
  CONSTRAINT chk_lead_score_rules_description_length
    CHECK (description IS NULL OR char_length(description) <= 300)
);

CREATE INDEX idx_lead_score_rules_active
  ON lead_score_rules(sort_order) WHERE deleted_at IS NULL;
CREATE INDEX idx_lead_score_rules_category
  ON lead_score_rules(category) WHERE deleted_at IS NULL;
CREATE INDEX idx_lead_score_rules_condition_type
  ON lead_score_rules(condition_type) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_lead_score_rules_updated_at
  BEFORE UPDATE ON lead_score_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE lead_score_rules
  IS 'リード加点ルールマスタ。category/condition_type/condition_value_id の組で加点条件を定義。is_active は使わず deleted_at で論理削除';
COMMENT ON COLUMN lead_score_rules.condition_value_id
  IS '多態参照のため FK は張らない。参照先マスタ削除時は算出時にスキップ+警告ログ';
COMMENT ON COLUMN lead_score_rules.condition_value_text
  IS '将来拡張用（現在未使用）';

-- ============================================================
-- RLS: 3マスタともマスタ標準パターン（SELECT=認証全員 / CUD=admin）
-- ============================================================

ALTER TABLE lead_company_sizes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_customer_activity_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_score_rules             ENABLE ROW LEVEL SECURITY;

-- lead_company_sizes
CREATE POLICY lead_company_sizes_select_authenticated ON lead_company_sizes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY lead_company_sizes_insert_admin ON lead_company_sizes
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY lead_company_sizes_update_admin ON lead_company_sizes
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY lead_company_sizes_delete_admin ON lead_company_sizes
  FOR DELETE TO authenticated USING (is_admin());

-- lead_customer_activity_types
CREATE POLICY lead_customer_activity_types_select_authenticated ON lead_customer_activity_types
  FOR SELECT TO authenticated USING (true);
CREATE POLICY lead_customer_activity_types_insert_admin ON lead_customer_activity_types
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY lead_customer_activity_types_update_admin ON lead_customer_activity_types
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY lead_customer_activity_types_delete_admin ON lead_customer_activity_types
  FOR DELETE TO authenticated USING (is_admin());

-- lead_score_rules
CREATE POLICY lead_score_rules_select_authenticated ON lead_score_rules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY lead_score_rules_insert_admin ON lead_score_rules
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY lead_score_rules_update_admin ON lead_score_rules
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY lead_score_rules_delete_admin ON lead_score_rules
  FOR DELETE TO authenticated USING (is_admin());
