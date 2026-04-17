-- ============================================================
-- 03: 構造化マスタ (S01-S03)
-- ============================================================

-- S01: ディールステージ
CREATE TABLE deal_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_type_id UUID NOT NULL REFERENCES pipeline_types(id),
  name TEXT NOT NULL,
  current_situation TEXT,
  required_action TEXT,
  customer_situation TEXT,
  transition_condition TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pipeline_type_id, name)
);

-- S02: ディールステータス
CREATE TABLE deal_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  pipeline_type_id UUID NOT NULL REFERENCES pipeline_types(id),
  deal_stage_id UUID REFERENCES deal_stages(id),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pipeline_type_id, deal_stage_id, name)
);

-- S03: 産業分類
CREATE TABLE industry_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  major_code VARCHAR(2) NOT NULL,
  major_name TEXT NOT NULL,
  middle_code VARCHAR(3),
  middle_name TEXT,
  minor_code VARCHAR(4),
  minor_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (middle_code IS NOT NULL OR minor_code IS NULL),
  CHECK ((middle_code IS NULL) = (middle_name IS NULL)),
  CHECK ((minor_code IS NULL) = (minor_name IS NULL))
);

CREATE UNIQUE INDEX idx_industry_classifications_code
  ON industry_classifications (major_code, COALESCE(middle_code, ''), COALESCE(minor_code, ''));
