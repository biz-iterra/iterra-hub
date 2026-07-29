-- ============================================================
-- 全マスタテーブルに definition (定義) カラムを追加
-- 既存 description カラムを持つ 3 テーブルはリネーム
-- ============================================================

-- ============================================================
-- RENAME: description → definition
-- 既に definition 化済みの環境でも失敗しないよう条件付きで実行する
-- ============================================================

DO $$
DECLARE
  t TEXT;
BEGIN
  -- M01: pipeline_types / M04: services / M05: lead_sources
  FOREACH t IN ARRAY ARRAY['pipeline_types', 'services', 'lead_sources'] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'description'
    ) THEN
      EXECUTE format('ALTER TABLE %I RENAME COLUMN description TO definition', t);
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- ADD: definition TEXT (NULL 許容)
-- ============================================================

-- M02: contract_types
ALTER TABLE contract_types ADD COLUMN IF NOT EXISTS definition TEXT;

-- M03: corporate_types
ALTER TABLE corporate_types ADD COLUMN IF NOT EXISTS definition TEXT;

-- M06: account_types
ALTER TABLE account_types ADD COLUMN IF NOT EXISTS definition TEXT;

-- M07: account_statuses
ALTER TABLE account_statuses ADD COLUMN IF NOT EXISTS definition TEXT;

-- M08: contact_statuses
ALTER TABLE contact_statuses ADD COLUMN IF NOT EXISTS definition TEXT;

-- M11: company_statuses
ALTER TABLE company_statuses ADD COLUMN IF NOT EXISTS definition TEXT;

-- M22: lead_categories
ALTER TABLE lead_categories ADD COLUMN IF NOT EXISTS definition TEXT;

-- lead_stages
ALTER TABLE lead_stages ADD COLUMN IF NOT EXISTS definition TEXT;

-- lead_statuses
ALTER TABLE lead_statuses ADD COLUMN IF NOT EXISTS definition TEXT;

-- lead_temperatures
ALTER TABLE lead_temperatures ADD COLUMN IF NOT EXISTS definition TEXT;

-- lead_callers は 20260422000013 で廃止済みのため対象外
-- （crm_users に役割統合。ここで ALTER すると廃止後の環境で適用に失敗する）

-- lead_call_statuses
ALTER TABLE lead_call_statuses ADD COLUMN IF NOT EXISTS definition TEXT;

-- lead_large_segments
ALTER TABLE lead_large_segments ADD COLUMN IF NOT EXISTS definition TEXT;

-- lead_small_segments
ALTER TABLE lead_small_segments ADD COLUMN IF NOT EXISTS definition TEXT;

-- M23: lead_activity_types
ALTER TABLE lead_activity_types ADD COLUMN IF NOT EXISTS definition TEXT;

-- project_statuses
ALTER TABLE project_statuses ADD COLUMN IF NOT EXISTS definition TEXT;

-- M09: skill_categories
ALTER TABLE skill_categories ADD COLUMN IF NOT EXISTS definition TEXT;

-- M10: skills
ALTER TABLE skills ADD COLUMN IF NOT EXISTS definition TEXT;

-- S01: deal_stages
ALTER TABLE deal_stages ADD COLUMN IF NOT EXISTS definition TEXT;

-- S02: deal_statuses
ALTER TABLE deal_statuses ADD COLUMN IF NOT EXISTS definition TEXT;
