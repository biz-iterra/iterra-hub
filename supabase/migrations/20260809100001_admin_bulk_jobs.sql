-- ============================================================
-- 統合候補の一括検出と全件スコア再計算をジョブ方式にする（T-0020）
--
-- 背景:
--   名刺取込（20260804000002）と同じ理由。この 2 つも全件を総当たりで処理する
--   ため件数に比例して伸び、現状は関数だけ statement_timeout を延長して
--   凌いでいる（`20260804000001`）。8 秒の壁は外れていても、HTTP 層の
--   タイムアウト（Cloudflare の約 100 秒）は DB 側の設定では外せない。
--   件数が増えれば同じ場所で本番が止まる構造なので、実行を HTTP の外へ移す。
--
-- 設計:
--   名刺取込のジョブ表（lead_import_jobs）と同じ形を踏襲する。
--   この 2 つは入力（payload）を持たない「全件を洗い直すだけ」の操作なので、
--   1 つの表に job_type で束ねる（表・ワーカー・cron 登録を 2 重に持たない）。
--
--   - 投入: Server Action が admin_bulk_jobs へ 1 件 INSERT して即座に返す
--   - 実行: pg_cron が毎分 process_admin_bulk_jobs を起動し、
--           job_type に応じて既存の関数をそのまま呼ぶ（判定ロジックは変えない）
--   - 参照: 画面はジョブの status をポーリングする。閉じても実行は続く
--
--   ワーカーは 1 回の起動で 1 件だけ処理する（lead_import_jobs と同じ理由）。
-- ============================================================

-- ------------------------------------------------------------
-- 1. ジョブ表
-- ------------------------------------------------------------

CREATE TABLE admin_bulk_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 'contact_merge_detection' : 統合候補の一括検出（manager 以上）
  -- 'lead_score_recalc'       : 全 Lead のスコア再計算（admin のみ）
  job_type      TEXT NOT NULL CHECK (job_type IN ('contact_merge_detection', 'lead_score_recalc')),

  status        TEXT NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  -- 再実行した回数。無限に走り続けないための歯止めにも使う
  attempts      INTEGER NOT NULL DEFAULT 0,

  requested_by  UUID NOT NULL REFERENCES crm_users(id),
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ,

  -- 結果件数（succeeded のとき埋まる）。job_type によって意味が変わる:
  --   contact_merge_detection → 新たに挙がった統合候補の件数
  --   lead_score_recalc       → 再計算した Lead 件数
  result_count  INTEGER,

  -- 失敗の理由。**利用者に見せる前に必ずアプリ側で日本語へ直す**
  -- （docs/error-messages.md §4。ここには原文が入る）
  error_message TEXT
);

COMMENT ON TABLE admin_bulk_jobs IS
'管理者向けの全件洗い直しジョブ（統合候補の一括検出／全 Lead スコア再計算）。投入（Server Action）と実行（pg_cron ワーカー）を分けて、HTTP のタイムアウトから切り離す';
COMMENT ON COLUMN admin_bulk_jobs.job_type IS
'contact_merge_detection = 統合候補の一括検出 / lead_score_recalc = 全 Lead スコア再計算';
COMMENT ON COLUMN admin_bulk_jobs.result_count IS
'job_type ごとに意味が変わる結果件数。検出なら新規候補数、再計算なら処理した Lead 数';
COMMENT ON COLUMN admin_bulk_jobs.error_message IS
'失敗理由の原文。画面に出す前に toUserMessage() を通すこと';

-- 待ち行列の取り出しに使う。queued だけを見るので部分インデックスにする
CREATE INDEX idx_admin_bulk_jobs_queued
  ON admin_bulk_jobs (requested_at)
  WHERE status = 'queued';

-- 画面が「この種別の実行中・待ちジョブ」を取り直すために使う
CREATE INDEX idx_admin_bulk_jobs_type_requested_at
  ON admin_bulk_jobs (job_type, requested_at DESC);

-- ------------------------------------------------------------
-- 2. RLS
--
-- job_type によって必要な権限が違う（検出は manager 以上、再計算は admin のみ。
-- docs/database-design.md §11.12.7 / §21.5 と同じ区分）。
-- 引数なし関数は CLAUDE.md の規約どおりスカラーサブクエリで包む。
-- ------------------------------------------------------------

ALTER TABLE admin_bulk_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_bulk_jobs_select ON admin_bulk_jobs
  FOR SELECT TO authenticated
  USING (
    (job_type = 'contact_merge_detection' AND (SELECT is_manager_or_above()))
    OR (job_type = 'lead_score_recalc' AND (SELECT is_admin()))
  );

CREATE POLICY admin_bulk_jobs_insert ON admin_bulk_jobs
  FOR INSERT TO authenticated
  WITH CHECK (
    (job_type = 'contact_merge_detection' AND (SELECT is_manager_or_above()))
    OR (job_type = 'lead_score_recalc' AND (SELECT is_admin()))
  );

-- 状態の書き換えはワーカー（SECURITY DEFINER、postgres は RLS をバイパスする）だけが行う。
-- 利用者に UPDATE を許すと、実行中のジョブを queued に戻せてしまう（lead_import_jobs と同じ理由）
CREATE POLICY admin_bulk_jobs_delete ON admin_bulk_jobs
  FOR DELETE TO authenticated
  USING ((SELECT is_admin()));

-- ------------------------------------------------------------
-- 3. ワーカー
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION process_admin_bulk_jobs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job    admin_bulk_jobs%ROWTYPE;
  v_result INTEGER;
BEGIN
  -- cron からの実行なので時間制限を外す（HTTP の経路には乗らない）
  SET LOCAL statement_timeout = 0;

  -- 1 回の起動で 1 件だけ。SKIP LOCKED で多重起動しても二重処理にならない
  SELECT * INTO v_job
    FROM admin_bulk_jobs
   WHERE status = 'queued'
   ORDER BY requested_at
   FOR UPDATE SKIP LOCKED
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  UPDATE admin_bulk_jobs
     SET status = 'running', started_at = now(), attempts = attempts + 1
   WHERE id = v_job.id;

  BEGIN
    -- 権限確認は投入側（RLS の INSERT ポリシー + Server Action）で終えている。
    -- ここでは cron 実行のため auth.uid() が無く、is_manager_or_above() 等の
    -- ロール判定関数はそのままでは使えない。判定ロジックを持つ入口関数
    -- （detect_all_contact_merge_candidates など）ではなく、判定を含まない
    -- 内側の関数を直接呼ぶ（lead_import_jobs が import_eight_leads を
    -- 直接呼ぶのと同じ扱い）
    CASE v_job.job_type
      WHEN 'contact_merge_detection' THEN
        v_result := record_contact_merge_candidates(NULL);
      WHEN 'lead_score_recalc' THEN
        v_result := recalculate_all_lead_scores();
      ELSE
        RAISE EXCEPTION '未知のジョブ種別です: %', v_job.job_type;
    END CASE;

    UPDATE admin_bulk_jobs
       SET status = 'succeeded', finished_at = now(), result_count = v_result
     WHERE id = v_job.id;

  EXCEPTION WHEN OTHERS THEN
    -- ここまでの変更はロールバックされる（中途半端な状態を残さない）。
    -- status の書き換えは EXCEPTION ブロックの外なので残る
    UPDATE admin_bulk_jobs
       SET status = 'failed', finished_at = now(), error_message = SQLERRM
     WHERE id = v_job.id;
    RAISE WARNING '[process_admin_bulk_jobs] ジョブ % (%) が失敗: %', v_job.id, v_job.job_type, SQLERRM;
  END;

  RETURN 1;
END;
$$;

COMMENT ON FUNCTION process_admin_bulk_jobs IS
'admin_bulk_jobs を 1 件処理する（pg_cron から毎分実行）。SKIP LOCKED により多重起動でも二重処理しない';

REVOKE ALL ON FUNCTION process_admin_bulk_jobs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION process_admin_bulk_jobs() TO postgres;

-- ------------------------------------------------------------
-- 4. pg_cron へ登録（冪等）
-- ------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process_admin_bulk_jobs') THEN
    PERFORM cron.unschedule('process_admin_bulk_jobs');
  END IF;

  PERFORM cron.schedule(
    'process_admin_bulk_jobs',
    '* * * * *',            -- 毎分。どちらも棚卸し的な操作なので、この粒度で足りる
    $cron$SELECT process_admin_bulk_jobs();$cron$
  );
END $$;
