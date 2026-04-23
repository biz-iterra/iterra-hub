-- ============================================================
-- Lead スコアリング刷新 Phase 6: 週次全件再計算バッチ
-- ============================================================
-- 前提: 20260422000006 で recalculate_lead_score(UUID) RETURNS INT 作成済み
--       20260417000002 で pg_cron 拡張有効化済み
-- ============================================================

-- ============================================================
-- Part 1: recalculate_all_lead_scores() 関数
-- ============================================================

CREATE OR REPLACE FUNCTION recalculate_all_lead_scores()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r          RECORD;
  v_count    INT  := 0;
  v_size_id  UUID;
BEGIN
  -- statement_timeout 対策（cron 実行時のみ無効化）
  SET LOCAL statement_timeout = 0;

  FOR r IN
    SELECT id, capital, employee_count, company_size_id
      FROM leads
     WHERE deleted_at IS NULL
  LOOP
    -- 企業規模の再判定（マスタ変更があれば反映）
    v_size_id := resolve_lead_company_size(r.capital, r.employee_count);
    IF v_size_id IS DISTINCT FROM r.company_size_id THEN
      UPDATE leads SET company_size_id = v_size_id WHERE id = r.id;
    END IF;

    -- スコア再計算
    PERFORM recalculate_lead_score(r.id);
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE '[recalculate_all_lead_scores] % リードの再計算を完了', v_count;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION recalculate_all_lead_scores IS
'全 Lead スコア再計算（pg_cron 週次バッチ）。JST 日曜 03:00 = UTC 土曜 18:00 に実行。1 Lead ごとに resolve_lead_company_size → company_size_id 更新（変動時のみ）+ recalculate_lead_score を実行';

-- ============================================================
-- Part 2: pg_cron 週次ジョブ登録（冪等性確保）
-- ============================================================

-- 既存 job があれば削除してから登録し直す
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'recalculate_lead_scores_weekly'
  ) THEN
    PERFORM cron.unschedule('recalculate_lead_scores_weekly');
  END IF;
END $$;

-- JST 日曜 03:00 = UTC 土曜 18:00
-- cron 書式: 分 時 日 月 曜日  (曜日 0=日, 6=土)
SELECT cron.schedule(
  'recalculate_lead_scores_weekly',
  '0 18 * * 6',
  $$SELECT recalculate_all_lead_scores();$$
);
