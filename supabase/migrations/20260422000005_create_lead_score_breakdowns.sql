-- ============================================================
-- D10 lead_score_breakdowns（スコア算出内訳）
-- RLS: SELECT は is_lead_accessible 委譲、INSERT/UPDATE/DELETE は service_role のみ（ポリシー未定義）
-- ============================================================

CREATE TABLE lead_score_breakdowns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  rule_id           UUID NOT NULL REFERENCES lead_score_rules(id) ON DELETE CASCADE,
  score_delta       INT  NOT NULL,
  applied_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_lead_score_breakdowns_lead_rule UNIQUE (lead_id, rule_id),
  CONSTRAINT chk_lead_score_breakdowns_score_delta
    CHECK (score_delta BETWEEN 0 AND 100)
);

CREATE INDEX idx_lead_score_breakdowns_lead
  ON lead_score_breakdowns(lead_id);
CREATE INDEX idx_lead_score_breakdowns_rule
  ON lead_score_breakdowns(rule_id);

COMMENT ON TABLE lead_score_breakdowns IS 'リードスコア算出内訳（D10）。recalculate_lead_score 実行時に upsert。営業がスコア根拠を確認するため';
COMMENT ON COLUMN lead_score_breakdowns.applied_at IS '最後にこのルールで加点された時刻';

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE lead_score_breakdowns ENABLE ROW LEVEL SECURITY;

-- SELECT のみ許可（is_lead_accessible 委譲）
CREATE POLICY lead_score_breakdowns_select ON lead_score_breakdowns
  FOR SELECT TO authenticated
  USING (is_lead_accessible(lead_id));

-- INSERT/UPDATE/DELETE は authenticated 用ポリシー未定義
-- → RLS 有効化でポリシー未定義 = 拒否
-- → createAdminClient (service_role) は RLS バイパスのため書ける
