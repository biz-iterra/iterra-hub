-- ============================================================
-- 04: 占いマスタ (R01-R02)
-- ============================================================

-- R01: 星座占い
CREATE TABLE constellation_fortune_telling (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sort_number INTEGER UNIQUE NOT NULL CHECK (sort_number BETWEEN 1 AND 12),
  month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
  boundary_day SMALLINT NOT NULL CHECK (boundary_day BETWEEN 1 AND 31),
  constellation TEXT UNIQUE NOT NULL,
  element TEXT NOT NULL CHECK (element IN ('火','地','風','水')),
  element_description TEXT,
  nature TEXT,
  nature_description TEXT,
  keywords TEXT,
  strengths TEXT,
  weaknesses TEXT,
  characteristics TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- R02: 数秘診断
CREATE TABLE number_diagnosis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number INTEGER UNIQUE NOT NULL CHECK (number BETWEEN 1 AND 60),
  animal_no SMALLINT,
  animal TEXT,
  character TEXT,
  rhythm_no SMALLINT,
  rhythm TEXT,
  classification_no SMALLINT,
  three_classification TEXT,
  circulation TEXT,
  center TEXT,
  outlook TEXT,
  axis TEXT,
  orientation TEXT,
  potential TEXT,
  dominant_brain TEXT,
  brain_characteristics TEXT,
  strong_area TEXT,
  priority TEXT,
  type TEXT,
  judgment_criteria TEXT,
  strengths TEXT,
  weaknesses TEXT,
  count SMALLINT,
  frequency TEXT,
  character_image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
