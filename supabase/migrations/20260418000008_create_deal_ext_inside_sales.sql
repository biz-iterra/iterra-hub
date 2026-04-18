-- ============================================================
-- パイプライン拡張: インサイドセールス
--   EX01 deal_ext_inside_sales       : 1:1 拡張本体
--   EX02 deal_ext_inside_sales_calls : 1:N 架電記録
-- 共通部品:
--   FN  is_deal_accessible(deal_id)  : RLS 用アクセス権判定
--   VW  v_account_current_phase      : account × pipeline の現在フェーズ派生ビュー
-- ============================================================

-- ------------------------------------------------------------
-- 共通関数: is_deal_accessible
-- 各拡張テーブルの RLS から参照する。親 deal のオーナーシップに従う
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_deal_accessible(p_deal_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM deals d
    WHERE d.id = p_deal_id
      AND d.deleted_at IS NULL
      AND (is_manager_or_above() OR d.owner_user_id = auth.uid())
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION is_deal_accessible(UUID) IS 'deal拡張テーブルのRLS共通判定。親dealが生きていてオーナー/マネージャー以上ならアクセス可';

-- ------------------------------------------------------------
-- EX01: deal_ext_inside_sales（1:1拡張本体）
-- ------------------------------------------------------------
CREATE TABLE deal_ext_inside_sales (
  deal_id                UUID        PRIMARY KEY REFERENCES deals(id) ON DELETE CASCADE,
  large_segment_id       UUID        REFERENCES inside_sales_large_segments(id),
  small_segment_id       UUID        REFERENCES inside_sales_small_segments(id),
  prospect_company_name  TEXT,
  url                    TEXT,
  phone                  VARCHAR(20),
  primary_caller_id      UUID        REFERENCES inside_sales_callers(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_deal_ext_inside_sales_company_length CHECK (
    prospect_company_name IS NULL OR char_length(prospect_company_name) BETWEEN 1 AND 200
  ),
  CONSTRAINT chk_deal_ext_inside_sales_url_length CHECK (url IS NULL OR char_length(url) <= 500)
);

CREATE INDEX idx_deal_ext_inside_sales_large_segment ON deal_ext_inside_sales(large_segment_id);
CREATE INDEX idx_deal_ext_inside_sales_small_segment ON deal_ext_inside_sales(small_segment_id);
CREATE INDEX idx_deal_ext_inside_sales_primary_caller ON deal_ext_inside_sales(primary_caller_id);

CREATE TRIGGER trg_deal_ext_inside_sales_updated_at
  BEFORE UPDATE ON deal_ext_inside_sales
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE deal_ext_inside_sales IS 'インサイドセールスパイプライン固有の拡張カラム（deal 1:1）';
COMMENT ON COLUMN deal_ext_inside_sales.prospect_company_name IS '企業名。NULL の場合はアプリ層で個人Account扱いとして解釈';
COMMENT ON COLUMN deal_ext_inside_sales.primary_caller_id IS '主架電担当者。各架電回の担当は deal_ext_inside_sales_calls.caller_id に別途記録';

-- ------------------------------------------------------------
-- EX02: deal_ext_inside_sales_calls（1:N架電記録）
-- ------------------------------------------------------------
CREATE TABLE deal_ext_inside_sales_calls (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id         UUID        NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  call_number     SMALLINT    NOT NULL CHECK (call_number >= 1),
  called_on       DATE        NOT NULL,
  called_at_time  TIME,
  call_status_id  UUID        NOT NULL REFERENCES inside_sales_call_statuses(id),
  caller_id       UUID        NOT NULL REFERENCES inside_sales_callers(id),
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_deal_ext_inside_sales_calls_number UNIQUE (deal_id, call_number),
  CONSTRAINT chk_deal_ext_inside_sales_calls_note_length CHECK (note IS NULL OR char_length(note) <= 1000)
);

CREATE INDEX idx_deal_ext_inside_sales_calls_deal_date ON deal_ext_inside_sales_calls(deal_id, called_on DESC);
CREATE INDEX idx_deal_ext_inside_sales_calls_caller ON deal_ext_inside_sales_calls(caller_id);
CREATE INDEX idx_deal_ext_inside_sales_calls_status ON deal_ext_inside_sales_calls(call_status_id);

CREATE TRIGGER trg_deal_ext_inside_sales_calls_updated_at
  BEFORE UPDATE ON deal_ext_inside_sales_calls
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE deal_ext_inside_sales_calls IS 'インサイドセールス 架電記録（deal 1:N、回次無制限）';
COMMENT ON COLUMN deal_ext_inside_sales_calls.call_number IS '架電回次。アプリ層で「既存max+1」採番。削除時のgap許容';

-- ------------------------------------------------------------
-- RLS: 両拡張テーブルとも is_deal_accessible に委譲
-- ------------------------------------------------------------
ALTER TABLE deal_ext_inside_sales       ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_ext_inside_sales_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY deal_ext_inside_sales_select ON deal_ext_inside_sales
  FOR SELECT TO authenticated USING (is_deal_accessible(deal_id));
CREATE POLICY deal_ext_inside_sales_insert ON deal_ext_inside_sales
  FOR INSERT TO authenticated WITH CHECK (is_deal_accessible(deal_id));
CREATE POLICY deal_ext_inside_sales_update ON deal_ext_inside_sales
  FOR UPDATE TO authenticated
  USING (is_deal_accessible(deal_id)) WITH CHECK (is_deal_accessible(deal_id));
CREATE POLICY deal_ext_inside_sales_delete ON deal_ext_inside_sales
  FOR DELETE TO authenticated USING (is_deal_accessible(deal_id));

CREATE POLICY deal_ext_inside_sales_calls_select ON deal_ext_inside_sales_calls
  FOR SELECT TO authenticated USING (is_deal_accessible(deal_id));
CREATE POLICY deal_ext_inside_sales_calls_insert ON deal_ext_inside_sales_calls
  FOR INSERT TO authenticated WITH CHECK (is_deal_accessible(deal_id));
CREATE POLICY deal_ext_inside_sales_calls_update ON deal_ext_inside_sales_calls
  FOR UPDATE TO authenticated
  USING (is_deal_accessible(deal_id)) WITH CHECK (is_deal_accessible(deal_id));
CREATE POLICY deal_ext_inside_sales_calls_delete ON deal_ext_inside_sales_calls
  FOR DELETE TO authenticated USING (is_deal_accessible(deal_id));

-- ------------------------------------------------------------
-- VIEW: v_account_current_phase
-- account × pipeline ごとの「現在のフェーズ」を deals から派生
-- 集約ルール: closed でない deal のうち、stage_updated_at が最新のものを代表とする
-- ------------------------------------------------------------
CREATE VIEW v_account_current_phase AS
SELECT DISTINCT ON (d.account_id, d.pipeline_type_id)
  d.account_id,
  d.pipeline_type_id,
  s.phase_id,
  d.id AS leading_deal_id,
  d.stage_updated_at
FROM deals d
JOIN deal_stages s ON d.deal_stage_id = s.id
WHERE d.deleted_at IS NULL
  AND d.closed_at IS NULL
ORDER BY
  d.account_id,
  d.pipeline_type_id,
  d.stage_updated_at DESC NULLS LAST,
  d.updated_at DESC;

COMMENT ON VIEW v_account_current_phase IS 'account × pipeline の現在フェーズ派生ビュー。phase_idの名前/色解決はUI層でpipeline_slug→<slug>_phasesで行う';
