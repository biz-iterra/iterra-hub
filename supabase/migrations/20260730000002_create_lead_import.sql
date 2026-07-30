-- ============================================================
-- リード取込の記録
--
-- 目的:
--   1. 冪等性 — 同じ名刺を二重に取り込まない
--   2. 生データの保持 — 取込時にマッピングしなかった列も失わない
--   3. 監査 — 誰がいつ何件取り込んだか
--
-- 「取り込む項目が増えるたびに leads へカラムを追加する」のを避けるため、
-- CSV の 1 行をそのまま raw (jsonb) に保持する。後から必要になった項目は
-- 再エクスポートせずに raw から backfill できる。
--
-- raw は「出典の記録」であり業務データの置き場ではない。検索・フィルタ・
-- スコアリングの対象になると判明した項目は正規カラムへ昇格させる。
-- ============================================================

CREATE TABLE lead_import_batches (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- lead_sources.slug と対応させる（'eight' 等）
  source_slug    TEXT NOT NULL,
  file_name      TEXT NOT NULL,
  -- 実際にデコードに成功した文字コード。Eight は Shift_JIS(cp932) を出力する
  encoding       TEXT NOT NULL,
  row_count      INTEGER NOT NULL,
  created_count  INTEGER NOT NULL DEFAULT 0,
  updated_count  INTEGER NOT NULL DEFAULT 0,
  skipped_count  INTEGER NOT NULL DEFAULT 0,
  error_count    INTEGER NOT NULL DEFAULT 0,
  imported_by    UUID NOT NULL REFERENCES crm_users(id),
  imported_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE lead_import_batches IS 'リード取込の実行単位。取込元・件数・実行者を記録する';

CREATE TABLE lead_import_records (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id     UUID NOT NULL REFERENCES lead_import_batches(id) ON DELETE CASCADE,
  -- 作成/更新された lead。エラー行・スキップ行は NULL
  lead_id      UUID REFERENCES leads(id),
  -- CSV 上の行番号（1 = ヘッダの次）。エラー報告で行を特定するため
  row_number   INTEGER NOT NULL,
  external_key TEXT,
  -- CSV 1 行を列名 → 値で保持
  raw          JSONB NOT NULL,
  outcome      TEXT NOT NULL CHECK (outcome IN ('created', 'updated', 'skipped', 'error')),
  error_reason TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE lead_import_records IS 'CSV 1 行ごとの取込結果と生データ。未マッピング項目の backfill 元になる';
COMMENT ON COLUMN lead_import_records.raw IS '出典の記録。業務データの置き場としては使わない';

CREATE INDEX lead_import_records_batch_idx ON lead_import_records(batch_id);
CREATE INDEX lead_import_records_lead_idx  ON lead_import_records(lead_id) WHERE lead_id IS NOT NULL;

-- ------------------------------------------------------------
-- 冪等性キー
--
-- Eight の CSV に安定した一意 ID が無いため、アプリ側で生成する。
--   1. e-mail があれば 'eight:mail:<正規化アドレス>'
--   2. 無ければ 'eight:hash:<sha256(正規化会社名|姓|名) の先頭 16 桁>'
--
-- 実データ 922 行の内訳: メール由来 710 / ハッシュ由来 92
-- ------------------------------------------------------------
ALTER TABLE leads ADD COLUMN source_external_key TEXT;

COMMENT ON COLUMN leads.source_external_key IS '取込元での一意キー。再取込時の重複判定に使う';

-- 論理削除済みは対象外にする。削除したリードを再取込できるようにするため
CREATE UNIQUE INDEX leads_source_external_key_uniq
  ON leads(source_external_key)
  WHERE source_external_key IS NOT NULL AND deleted_at IS NULL;

-- ------------------------------------------------------------
-- RLS
--
-- raw には名刺の全項目（個人情報）が入るため admin のみ参照可とする。
-- 書き込みは service_role（RLS バイパス）から行うので INSERT ポリシーは作らない。
-- Server Action 側で admin チェックを必ず先に通すこと。
-- ------------------------------------------------------------
ALTER TABLE lead_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_import_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY lead_import_batches_select ON lead_import_batches
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY lead_import_records_select ON lead_import_records
  FOR SELECT TO authenticated
  USING (is_admin());
