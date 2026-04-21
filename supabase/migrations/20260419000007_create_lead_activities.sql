-- ============================================================
-- D08 lead_activities（リード架電記録）
-- Lead に紐づく架電記録。deal_ext_inside_sales_calls の Lead 版
-- ============================================================

CREATE TABLE lead_activities (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  call_number     SMALLINT    NOT NULL CHECK (call_number >= 1),
  called_on       DATE        NOT NULL,
  called_at_time  TIME,
  call_status_id  UUID        NOT NULL REFERENCES lead_call_statuses(id),
  caller_id       UUID        NOT NULL REFERENCES lead_callers(id),
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_lead_activities_call_number UNIQUE (lead_id, call_number),
  CONSTRAINT chk_lead_activities_note_length
    CHECK (note IS NULL OR char_length(note) <= 1000)
);

CREATE INDEX idx_lead_activities_lead_date ON lead_activities(lead_id, called_on DESC);
CREATE INDEX idx_lead_activities_caller    ON lead_activities(caller_id);
CREATE INDEX idx_lead_activities_status    ON lead_activities(call_status_id);

COMMENT ON TABLE lead_activities IS 'リード架電記録（D08）。call_number は lead 単位での回次（gap 許容）';
COMMENT ON COLUMN lead_activities.call_number IS '架電回次。アプリ層で「既存max+1」採番。削除時のgap許容';

-- ============================================================
-- RLS: 親 lead のアクセス権に委譲（is_lead_accessible）
-- INSERT ONLY（UPDATE/DELETE は通常禁止。論理的に履歴は不変）
-- ただし admin のみ削除可能とする（誤記録の修正対応）
-- ============================================================

ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY lead_activities_select ON lead_activities
  FOR SELECT TO authenticated USING (is_lead_accessible(lead_id));

CREATE POLICY lead_activities_insert ON lead_activities
  FOR INSERT TO authenticated WITH CHECK (is_lead_accessible(lead_id));

-- 管理者のみ削除可能（誤記録の修正。通常は禁止）
CREATE POLICY lead_activities_delete_admin ON lead_activities
  FOR DELETE TO authenticated USING (is_admin());
