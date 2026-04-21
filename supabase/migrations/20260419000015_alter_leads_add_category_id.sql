-- ============================================================
-- leads.category_id カラム追加
-- lead_categories(id) への FK。NULL 許容（未分類リード可）
-- ============================================================

ALTER TABLE leads
  ADD COLUMN category_id UUID REFERENCES lead_categories(id);

CREATE INDEX idx_leads_category ON leads(category_id)
  WHERE deleted_at IS NULL AND category_id IS NOT NULL;

COMMENT ON COLUMN leads.category_id IS
  'リードカテゴリ（M22 lead_categories FK）。NULL=未分類';
