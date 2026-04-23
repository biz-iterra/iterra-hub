-- ============================================================
-- Lead スコアリング刷新 Phase 3: leads 列追加 + 企業規模判定トリガ + backfill
--   1. leads: employee_count / capital / company_size_id 追加
--   2. score CHECK 強化（0-100 に上限設定）
--   3. resolve_lead_company_size 関数作成
--   4. BEFORE INSERT/UPDATE トリガで company_size_id を自動設定
--   5. 既存行 backfill（no-op UPDATE）
-- ============================================================

-- ------------------------------------------------------------
-- 1-1. 列追加
-- ------------------------------------------------------------
ALTER TABLE leads
  ADD COLUMN employee_count  INT,
  ADD COLUMN capital         NUMERIC,
  ADD COLUMN company_size_id UUID REFERENCES lead_company_sizes(id);

-- CHECK 制約（employee_count >= 0、capital >= 0）
ALTER TABLE leads
  ADD CONSTRAINT chk_leads_employee_count_nonneg
    CHECK (employee_count IS NULL OR employee_count >= 0),
  ADD CONSTRAINT chk_leads_capital_nonneg
    CHECK (capital IS NULL OR capital >= 0);

-- score CHECK 強化（既存は score >= 0 のみ → 0-100 に）
ALTER TABLE leads DROP CONSTRAINT chk_leads_score_range;
ALTER TABLE leads ADD CONSTRAINT chk_leads_score_range
  CHECK (score IS NULL OR (score >= 0 AND score <= 100));

CREATE INDEX idx_leads_company_size ON leads(company_size_id)
  WHERE deleted_at IS NULL AND company_size_id IS NOT NULL;

COMMENT ON COLUMN leads.employee_count IS '従業員数（判定用。スコア算出では company_size_id 経由で参照）';
COMMENT ON COLUMN leads.capital IS '資本金（円、判定用）';
COMMENT ON COLUMN leads.company_size_id IS '企業規模（lead_company_sizes FK）。トリガで自動判定、手動入力不可';

-- ------------------------------------------------------------
-- 1-2. 判定関数
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION resolve_lead_company_size(
  p_capital NUMERIC,
  p_employee_count INT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_size_id UUID;
BEGIN
  -- 資本金優先: capital が NULL でなければ資本金レンジで判定
  IF p_capital IS NOT NULL THEN
    SELECT id INTO v_size_id
    FROM lead_company_sizes
    WHERE deleted_at IS NULL
      AND (min_capital IS NULL OR p_capital >= min_capital)
      AND (max_capital IS NULL OR p_capital <= max_capital)
    ORDER BY sort_order ASC
    LIMIT 1;

    IF v_size_id IS NOT NULL THEN
      RETURN v_size_id;
    END IF;
  END IF;

  -- 資本金 NULL または該当なし → 従業員数でフォールバック
  IF p_employee_count IS NOT NULL THEN
    SELECT id INTO v_size_id
    FROM lead_company_sizes
    WHERE deleted_at IS NULL
      AND (min_employees IS NULL OR p_employee_count >= min_employees)
      AND (max_employees IS NULL OR p_employee_count <= max_employees)
    ORDER BY sort_order ASC
    LIMIT 1;
  END IF;

  RETURN v_size_id;
END;
$$;

COMMENT ON FUNCTION resolve_lead_company_size IS '企業規模判定。資本金優先、NULL/該当なしで従業員数フォールバック。該当なしは NULL';

-- ------------------------------------------------------------
-- 1-3. トリガ関数 + トリガ
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_leads_set_company_size()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- アプリから company_size_id が渡されても無視（自動判定で上書き）
  NEW.company_size_id := resolve_lead_company_size(NEW.capital, NEW.employee_count);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trg_leads_set_company_size IS 'leads INSERT/UPDATE 時に company_size_id を自動設定（手動入力無視）';

CREATE TRIGGER trg_leads_company_size_before_insert
  BEFORE INSERT ON leads
  FOR EACH ROW
  EXECUTE FUNCTION trg_leads_set_company_size();

CREATE TRIGGER trg_leads_company_size_before_update
  BEFORE UPDATE ON leads
  FOR EACH ROW
  WHEN (OLD.capital IS DISTINCT FROM NEW.capital
     OR OLD.employee_count IS DISTINCT FROM NEW.employee_count
     OR OLD.company_size_id IS DISTINCT FROM NEW.company_size_id)
  EXECUTE FUNCTION trg_leads_set_company_size();

-- ------------------------------------------------------------
-- 1-4. 既存行 backfill（no-op UPDATE でトリガを発火確認）
-- 現時点では capital/employee_count が NULL のため company_size_id も NULL になる。
-- 将来 capital/employee_count 投入後も再判定されるよう、トリガが正しく機能することを確認する意図。
-- ------------------------------------------------------------
UPDATE leads SET updated_at = updated_at WHERE deleted_at IS NULL;
