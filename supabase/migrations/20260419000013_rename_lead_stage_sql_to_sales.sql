-- ============================================================
-- lead_stages.slug: 'sql' → 'sales' に rename
-- 理由: カテゴリマスタ（M22）とステージ名の衝突回避、業務呼称統一
-- ============================================================

UPDATE lead_stages
  SET slug = 'sales', name = 'Sales'
  WHERE slug = 'sql';

COMMENT ON COLUMN lead_stages.slug IS
  'ステージ識別子。generation/nurturing/qualification/sales/opportunity/customer/dead';
