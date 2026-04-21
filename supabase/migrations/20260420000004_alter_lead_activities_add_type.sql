ALTER TABLE lead_activities
  ADD COLUMN activity_type_id UUID REFERENCES lead_activity_types(id);

CREATE INDEX idx_lead_activities_activity_type ON lead_activities(activity_type_id)
  WHERE activity_type_id IS NOT NULL;

COMMENT ON COLUMN lead_activities.activity_type_id IS
  '対応種別（M23 lead_activity_types FK）。NULL=未分類';
