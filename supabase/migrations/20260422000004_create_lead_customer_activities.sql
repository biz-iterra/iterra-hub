-- ============================================================
-- D09 lead_customer_activities（顧客行動ログ／手動入力）
-- ============================================================

CREATE TABLE lead_customer_activities (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  activity_type_id  UUID NOT NULL REFERENCES lead_customer_activity_types(id),
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  detail            TEXT,
  source            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        UUID REFERENCES crm_users(id),
  last_updated_by   UUID REFERENCES crm_users(id),
  CONSTRAINT chk_lead_customer_activities_detail_length
    CHECK (detail IS NULL OR char_length(detail) <= 2000),
  CONSTRAINT chk_lead_customer_activities_source_length
    CHECK (source IS NULL OR char_length(source) <= 200)
);

CREATE INDEX idx_lead_customer_activities_lead_date
  ON lead_customer_activities(lead_id, occurred_at DESC);
CREATE INDEX idx_lead_customer_activities_type
  ON lead_customer_activities(activity_type_id);

CREATE TRIGGER trg_lead_customer_activities_updated_at
  BEFORE UPDATE ON lead_customer_activities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE lead_customer_activities IS 'リード顧客行動ログ（D09）。顧客側の行動（イベント参加/資料DL等）を手動入力で記録';
COMMENT ON COLUMN lead_customer_activities.source IS '行動の由来（例: Peatix / manual / HubSpot）。将来の外部連携用';

-- ============================================================
-- RLS（is_lead_accessible 委譲、DELETE のみ admin）
-- ============================================================

ALTER TABLE lead_customer_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY lead_customer_activities_select ON lead_customer_activities
  FOR SELECT TO authenticated
  USING (is_lead_accessible(lead_id));

CREATE POLICY lead_customer_activities_insert ON lead_customer_activities
  FOR INSERT TO authenticated
  WITH CHECK (is_lead_accessible(lead_id));

CREATE POLICY lead_customer_activities_update ON lead_customer_activities
  FOR UPDATE TO authenticated
  USING (is_lead_accessible(lead_id))
  WITH CHECK (is_lead_accessible(lead_id));

CREATE POLICY lead_customer_activities_delete_admin ON lead_customer_activities
  FOR DELETE TO authenticated
  USING (is_admin());
