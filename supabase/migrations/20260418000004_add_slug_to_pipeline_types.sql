-- ============================================================
-- M01 拡張: pipeline_types に slug を追加
-- 目的: パイプラインごとのUI拡張・拡張テーブル解決のプログラムキーとして使用する
-- 方針: VARCHAR(32) UK NN。既存3件は 'sales' / 'procurement' / 'outsourcing' でバックフィル
-- ============================================================

ALTER TABLE pipeline_types
  ADD COLUMN slug VARCHAR(32);

COMMENT ON COLUMN pipeline_types.slug IS 'パイプライン識別子（アプリ層で拡張テーブル／UIコンポーネントを解決するキー）';

-- 既存データのバックフィル（seed.sql の順序に一致）
UPDATE pipeline_types SET slug = 'sales'       WHERE id = 'b0000000-0000-0000-0000-000000000001';
UPDATE pipeline_types SET slug = 'procurement' WHERE id = 'b0000000-0000-0000-0000-000000000002';
UPDATE pipeline_types SET slug = 'outsourcing' WHERE id = 'b0000000-0000-0000-0000-000000000003';

-- 残レコードがあれば name をスラッグ化して埋める（日本語名では不適切なので最終手段）
UPDATE pipeline_types SET slug = 'pipeline_' || replace(id::text, '-', '') WHERE slug IS NULL;

ALTER TABLE pipeline_types
  ALTER COLUMN slug SET NOT NULL,
  ADD CONSTRAINT uq_pipeline_types_slug UNIQUE (slug),
  ADD CONSTRAINT chk_pipeline_types_slug_format CHECK (slug ~ '^[a-z][a-z0-9_]{0,31}$');
