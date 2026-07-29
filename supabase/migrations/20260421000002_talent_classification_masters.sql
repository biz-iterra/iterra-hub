-- ============================================================
-- タレント分類マスタ拡張
-- - skills テーブル拡張（skill_code / axis / system_tags / note）
-- - talent_skills.proficiency_level を 0-5 に拡張
-- - talent_system_tags（系統マスタ）
-- - talent_grades（グレードマスタ）
-- - talent_grade_requirements（系統×グレード昇格要件）
-- - talent_job_types（職種マスタ）
-- - talent_achievements_master（実績マスタ）
-- - talent_achievements（タレント×実績 junction）
-- ============================================================

-- ============================================================
-- 1. skills テーブル拡張
-- ============================================================

ALTER TABLE skills
  ADD COLUMN IF NOT EXISTS skill_code VARCHAR(8) UNIQUE,
  ADD COLUMN IF NOT EXISTS axis VARCHAR(1) CHECK (axis IN ('T','D','B','M')),
  ADD COLUMN IF NOT EXISTS system_tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS note TEXT;

-- ============================================================
-- 2. talent_skills.proficiency_level を 0-5 に拡張
-- ============================================================

ALTER TABLE talent_skills
  DROP CONSTRAINT IF EXISTS talent_skills_proficiency_level_check;

ALTER TABLE talent_skills
  ADD CONSTRAINT talent_skills_proficiency_level_check
    CHECK (proficiency_level BETWEEN 0 AND 5);

-- ============================================================
-- 3. talent_system_tags（系統マスタ）
-- ============================================================

CREATE TABLE IF NOT EXISTS talent_system_tags (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  system_code        VARCHAR(8)  UNIQUE NOT NULL,
  name               TEXT        NOT NULL,
  definition         TEXT,
  determination_rule JSONB       NOT NULL,
  sort_order         INT         NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE talent_system_tags IS '系統マスタ（G/SP/CO）';
COMMENT ON COLUMN talent_system_tags.system_code IS '系統コード（G/SP/CO）';
COMMENT ON COLUMN talent_system_tags.determination_rule IS '系統判定条件（JSONB）';

-- ============================================================
-- 4. talent_grades（グレードマスタ）
-- ============================================================

CREATE TABLE IF NOT EXISTS talent_grades (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_code       VARCHAR(8)  UNIQUE NOT NULL,
  band             VARCHAR(8)  NOT NULL,
  sort_order       INT         NOT NULL,
  years_min        NUMERIC,
  years_max        NUMERIC,
  expected_role    TEXT,
  evaluation_points TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE talent_grades IS 'グレードマスタ（A1-L4 16段階）';
COMMENT ON COLUMN talent_grades.grade_code IS 'グレードコード（A1/A2/.../L4）';
COMMENT ON COLUMN talent_grades.band IS 'バンドコード（A/P/S/L）';
COMMENT ON COLUMN talent_grades.sort_order IS '昇順ソート（1=最低 16=最高）';

-- ============================================================
-- 5. talent_grade_requirements（系統×グレード昇格要件）
-- ============================================================

CREATE TABLE IF NOT EXISTS talent_grade_requirements (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  system_code           VARCHAR(8)  NOT NULL,
  grade_code            VARCHAR(8)  NOT NULL,
  skill_thresholds      JSONB       NOT NULL,
  required_achievements TEXT[]      NOT NULL DEFAULT '{}',
  sort_order            INT         NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (system_code, grade_code)
);

COMMENT ON TABLE talent_grade_requirements IS '系統×グレード別昇格要件';
COMMENT ON COLUMN talent_grade_requirements.skill_thresholds IS 'スキル閾値（JSONB配列、AND結合）。skill_ids_any_pool="d_co_system_skill_ids" は判定ロジック側で解決';
COMMENT ON COLUMN talent_grade_requirements.required_achievements IS '必要実績コード配列（AND結合）';

-- ============================================================
-- 6. talent_job_types（職種マスタ）
-- ============================================================

CREATE TABLE IF NOT EXISTS talent_job_types (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type_code VARCHAR(32) UNIQUE NOT NULL,
  name          TEXT        NOT NULL,
  category      TEXT,
  rules         JSONB       NOT NULL,
  sort_order    INT         NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE talent_job_types IS '職種マスタ（19種）';
COMMENT ON COLUMN talent_job_types.rules IS '職種判定条件（JSONB配列、AND結合。各要素内のskill_ids_anyはOR結合）';

-- ============================================================
-- 7. talent_achievements_master（実績マスタ）
-- ============================================================

CREATE TABLE IF NOT EXISTS talent_achievements_master (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  achievement_code         VARCHAR(32) UNIQUE NOT NULL,
  name                     TEXT        NOT NULL,
  criteria                 TEXT,
  quantitative_threshold   JSONB,
  sort_order               INT         NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE talent_achievements_master IS '実績マスタ（グレード昇格要件用）';
COMMENT ON COLUMN talent_achievements_master.quantitative_threshold IS '定量条件（JSONB、任意）';

-- ============================================================
-- 8. talent_achievements（タレント×実績 junction）
-- ============================================================

CREATE TABLE IF NOT EXISTS talent_achievements (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_id        UUID        NOT NULL REFERENCES talents(id) ON DELETE CASCADE,
  achievement_code VARCHAR(32) NOT NULL REFERENCES talent_achievements_master(achievement_code),
  achieved_at      DATE,
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (talent_id, achievement_code)
);

COMMENT ON TABLE talent_achievements IS 'タレント×実績';
COMMENT ON COLUMN talent_achievements.achievement_code IS '実績コード（talent_achievements_master.achievement_code FK）';

-- ============================================================
-- 9. updated_at トリガー
-- ============================================================

CREATE TRIGGER trg_talent_system_tags_updated_at
  BEFORE UPDATE ON talent_system_tags
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_talent_grades_updated_at
  BEFORE UPDATE ON talent_grades
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_talent_grade_requirements_updated_at
  BEFORE UPDATE ON talent_grade_requirements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_talent_job_types_updated_at
  BEFORE UPDATE ON talent_job_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_talent_achievements_master_updated_at
  BEFORE UPDATE ON talent_achievements_master
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_talent_achievements_updated_at
  BEFORE UPDATE ON talent_achievements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 10. RLS 有効化
-- ============================================================

ALTER TABLE talent_system_tags       ENABLE ROW LEVEL SECURITY;
ALTER TABLE talent_grades            ENABLE ROW LEVEL SECURITY;
ALTER TABLE talent_grade_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE talent_job_types         ENABLE ROW LEVEL SECURITY;
ALTER TABLE talent_achievements_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE talent_achievements      ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 11. RLS ポリシー — マスタ系（SELECT 認証済み全員 / CUD admin のみ）
-- ============================================================

-- talent_system_tags
CREATE POLICY talent_system_tags_select ON talent_system_tags
  FOR SELECT TO authenticated USING (true);
CREATE POLICY talent_system_tags_insert ON talent_system_tags
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY talent_system_tags_update ON talent_system_tags
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY talent_system_tags_delete ON talent_system_tags
  FOR DELETE TO authenticated USING (is_admin());

-- talent_grades
CREATE POLICY talent_grades_select ON talent_grades
  FOR SELECT TO authenticated USING (true);
CREATE POLICY talent_grades_insert ON talent_grades
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY talent_grades_update ON talent_grades
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY talent_grades_delete ON talent_grades
  FOR DELETE TO authenticated USING (is_admin());

-- talent_grade_requirements
CREATE POLICY talent_grade_requirements_select ON talent_grade_requirements
  FOR SELECT TO authenticated USING (true);
CREATE POLICY talent_grade_requirements_insert ON talent_grade_requirements
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY talent_grade_requirements_update ON talent_grade_requirements
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY talent_grade_requirements_delete ON talent_grade_requirements
  FOR DELETE TO authenticated USING (is_admin());

-- talent_job_types
CREATE POLICY talent_job_types_select ON talent_job_types
  FOR SELECT TO authenticated USING (true);
CREATE POLICY talent_job_types_insert ON talent_job_types
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY talent_job_types_update ON talent_job_types
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY talent_job_types_delete ON talent_job_types
  FOR DELETE TO authenticated USING (is_admin());

-- talent_achievements_master
CREATE POLICY talent_achievements_master_select ON talent_achievements_master
  FOR SELECT TO authenticated USING (true);
CREATE POLICY talent_achievements_master_insert ON talent_achievements_master
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY talent_achievements_master_update ON talent_achievements_master
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY talent_achievements_master_delete ON talent_achievements_master
  FOR DELETE TO authenticated USING (is_admin());

-- ============================================================
-- 12. RLS ポリシー — talent_achievements（従属テーブル）
-- SELECT/INSERT: manager/admin 全件 or member は自身の talent のもの
-- UPDATE/DELETE: admin or 自身の talent のもの
-- ============================================================

CREATE POLICY talent_achievements_select ON talent_achievements
  FOR SELECT TO authenticated
  USING (
    is_manager_or_above()
    OR EXISTS (
      SELECT 1 FROM talents t WHERE t.id = talent_achievements.talent_id
        AND EXISTS (
          SELECT 1 FROM contacts c WHERE c.id = t.contact_id AND c.owner_user_id = auth.uid()
        )
    )
  );

CREATE POLICY talent_achievements_insert ON talent_achievements
  FOR INSERT TO authenticated
  WITH CHECK (
    is_manager_or_above()
    OR EXISTS (
      SELECT 1 FROM talents t WHERE t.id = talent_achievements.talent_id
        AND EXISTS (
          SELECT 1 FROM contacts c WHERE c.id = t.contact_id AND c.owner_user_id = auth.uid()
        )
    )
  );

CREATE POLICY talent_achievements_update ON talent_achievements
  FOR UPDATE TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM talents t WHERE t.id = talent_achievements.talent_id
        AND EXISTS (
          SELECT 1 FROM contacts c WHERE c.id = t.contact_id AND c.owner_user_id = auth.uid()
        )
    )
  )
  WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM talents t WHERE t.id = talent_achievements.talent_id
        AND EXISTS (
          SELECT 1 FROM contacts c WHERE c.id = t.contact_id AND c.owner_user_id = auth.uid()
        )
    )
  );

CREATE POLICY talent_achievements_delete ON talent_achievements
  FOR DELETE TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM talents t WHERE t.id = talent_achievements.talent_id
        AND EXISTS (
          SELECT 1 FROM contacts c WHERE c.id = t.contact_id AND c.owner_user_id = auth.uid()
        )
    )
  );
