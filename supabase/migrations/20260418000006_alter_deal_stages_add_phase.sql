-- ============================================================
-- S01 拡張: deal_stages に phase_id を追加
-- 目的: パイプライン単位の「フェーズ」を導入し、stageをグルーピングする
-- 方針:
--   - phase_id は UUID NULL。DB層では FK を張らない（パイプラインごとに専用のフェーズマスタを持つため）
--   - アプリ層で pipeline_type.slug をキーに対応する <slug>_phases テーブルを解決して整合性を検証する
--   - 既存の deal_stages は初期 NULL のまま。各パイプラインのフェーズ定義が完了してから割当
-- ============================================================

ALTER TABLE deal_stages
  ADD COLUMN phase_id UUID;

COMMENT ON COLUMN deal_stages.phase_id IS 'パイプライン固有のフェーズID（各 <slug>_phases テーブルを参照。DB FKなし、アプリ層で整合性検証）';

CREATE INDEX idx_deal_stages_phase_id ON deal_stages(phase_id) WHERE phase_id IS NOT NULL;
