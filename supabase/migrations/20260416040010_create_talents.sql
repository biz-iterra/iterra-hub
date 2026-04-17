-- ============================================================
-- T07: talents（タレント）
-- ============================================================
CREATE TABLE talents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL UNIQUE REFERENCES contacts(id) ON DELETE CASCADE,
  personality_memo TEXT,
  custom_strengths TEXT,
  custom_weaknesses TEXT,
  aptitude_notes TEXT,
  overall_assessment TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE talents IS 'タレント（人材特性情報）';
COMMENT ON COLUMN talents.contact_id IS 'コンタクト（1:1）';
COMMENT ON COLUMN talents.personality_memo IS '性格メモ';
COMMENT ON COLUMN talents.custom_strengths IS '強み';
COMMENT ON COLUMN talents.custom_weaknesses IS '弱み';
COMMENT ON COLUMN talents.aptitude_notes IS '適性メモ';
COMMENT ON COLUMN talents.overall_assessment IS '総合評価';

-- ============================================================
-- D05: talent_skills（タレント×スキル）
-- ============================================================
CREATE TABLE talent_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_id UUID NOT NULL REFERENCES talents(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id),
  proficiency_level SMALLINT NOT NULL DEFAULT 1 CHECK (proficiency_level BETWEEN 1 AND 5),
  years_experience SMALLINT CHECK (years_experience >= 0),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_talent_skills UNIQUE (talent_id, skill_id)
);

COMMENT ON TABLE talent_skills IS 'タレント×スキル';
COMMENT ON COLUMN talent_skills.talent_id IS 'タレント';
COMMENT ON COLUMN talent_skills.skill_id IS 'スキル';
COMMENT ON COLUMN talent_skills.proficiency_level IS '習熟度（1-5）';
COMMENT ON COLUMN talent_skills.years_experience IS '経験年数';
COMMENT ON COLUMN talent_skills.note IS '備考';

-- ============================================================
-- D06: talent_careers（タレント経歴）
-- ============================================================
CREATE TABLE talent_careers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_id UUID NOT NULL REFERENCES talents(id) ON DELETE CASCADE,
  career_type TEXT NOT NULL CHECK (career_type IN ('work', 'education', 'certification')),
  organization TEXT NOT NULL,
  title TEXT,
  description TEXT,
  start_date DATE,
  end_date DATE,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_talent_careers_date_range CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
  CONSTRAINT chk_talent_careers_current CHECK (is_current = FALSE OR end_date IS NULL)
);

COMMENT ON TABLE talent_careers IS 'タレント経歴';
COMMENT ON COLUMN talent_careers.talent_id IS 'タレント';
COMMENT ON COLUMN talent_careers.career_type IS '経歴種別（work/education/certification）';
COMMENT ON COLUMN talent_careers.organization IS '組織名';
COMMENT ON COLUMN talent_careers.title IS '役職・学位など';
COMMENT ON COLUMN talent_careers.description IS '説明';
COMMENT ON COLUMN talent_careers.start_date IS '開始日';
COMMENT ON COLUMN talent_careers.end_date IS '終了日';
COMMENT ON COLUMN talent_careers.is_current IS '現在も継続中';
COMMENT ON COLUMN talent_careers.sort_order IS '表示順';
