-- ============================================================
-- M22 campaigns（キャンペーンマスタ）
-- J04  lead_campaigns（Lead×Campaign 中間テーブル）
-- 注意: シナリオ機能は将来対応。scenario 関連カラムは一切追加しない
-- ============================================================

-- ------------------------------------------------------------
-- M22: campaigns
-- ------------------------------------------------------------
CREATE TABLE campaigns (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        NOT NULL,
  type            TEXT        NOT NULL CHECK (type IN ('generation', 'nurturing', 'qualification')),
  description     TEXT,
  start_date      DATE,
  end_date        DATE,
  status          TEXT        NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'active', 'paused', 'completed', 'cancelled')),
  deleted_at      TIMESTAMPTZ,
  deleted_by      UUID        REFERENCES crm_users(id),
  deletion_reason TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_campaigns_name_length
    CHECK (char_length(name) BETWEEN 1 AND 200),
  CONSTRAINT chk_campaigns_description_length
    CHECK (description IS NULL OR char_length(description) <= 1000),
  CONSTRAINT chk_campaigns_date_range
    CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE INDEX idx_campaigns_type   ON campaigns(type) WHERE deleted_at IS NULL;
CREATE INDEX idx_campaigns_status ON campaigns(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_campaigns_active ON campaigns(start_date, end_date) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE campaigns IS 'キャンペーンマスタ（generation/nurturing/qualification 3種）';
COMMENT ON COLUMN campaigns.type IS 'generation=獲得施策 / nurturing=育成施策 / qualification=選定施策';
COMMENT ON COLUMN campaigns.status IS 'draft=下書き / active=実施中 / paused=一時停止 / completed=完了 / cancelled=中止';

-- ============================================================
-- RLS
-- campaigns: SELECT=認証全員、CUD=manager以上（マスタ性質だが営業Mgが作成可能）
-- lead_campaigns は leads 作成後（20260419000006）で定義する
-- ============================================================

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY campaigns_select_authenticated ON campaigns
  FOR SELECT TO authenticated USING (true);
CREATE POLICY campaigns_insert_manager ON campaigns
  FOR INSERT TO authenticated WITH CHECK (is_manager_or_above());
CREATE POLICY campaigns_update_manager ON campaigns
  FOR UPDATE TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
CREATE POLICY campaigns_delete_manager ON campaigns
  FOR DELETE TO authenticated USING (is_manager_or_above());
