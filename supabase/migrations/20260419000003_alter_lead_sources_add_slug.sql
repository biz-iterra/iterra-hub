-- ============================================================
-- M05 lead_sources: slug カラム追加 + 既存レコード バックフィル + DM レコード追加
-- 目的:
--   - CSV取込・Lead作成時のプログラムキーとして slug を使用する
--   - lead_sources に code カラムは既存でなかったため slug として追加
-- ============================================================

-- slug カラム追加（一時的に NULL 許容）
ALTER TABLE lead_sources
  ADD COLUMN IF NOT EXISTS slug VARCHAR(32);

-- 既存レコードの slug バックフィル（name での完全一致）
UPDATE lead_sources SET slug = 'tele_appo'  WHERE name = 'テレアポ'         AND slug IS NULL;
UPDATE lead_sources SET slug = 'web_form'   WHERE name = 'Web問い合わせ'    AND slug IS NULL;
UPDATE lead_sources SET slug = 'referral'   WHERE name = '紹介'             AND slug IS NULL;
UPDATE lead_sources SET slug = 'event'      WHERE name = '展示会・セミナー' AND slug IS NULL;
UPDATE lead_sources SET slug = 'sns'        WHERE name = 'SNS'              AND slug IS NULL;
UPDATE lead_sources SET slug = 'line'       WHERE name = 'LINE'             AND slug IS NULL;
UPDATE lead_sources SET slug = 'other'      WHERE name = 'その他'           AND slug IS NULL;

-- slug を NOT NULL + UNIQUE + format CHECK 制約に変更
-- Note: DM レコードの追加は seed.sql 側で行う（マイグレーションで INSERT するとseed時に重複する）
-- まず CHECK 制約を追加（NULL も通過させてから後で NOT NULL 化）
ALTER TABLE lead_sources
  ADD CONSTRAINT chk_lead_sources_slug_format
  CHECK (slug IS NULL OR slug ~ '^[a-z][a-z0-9_]{0,31}$');

ALTER TABLE lead_sources
  ADD CONSTRAINT uq_lead_sources_slug UNIQUE (slug);

-- バックフィル後に NOT NULL 化
ALTER TABLE lead_sources
  ALTER COLUMN slug SET NOT NULL;
