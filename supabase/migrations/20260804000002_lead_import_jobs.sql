-- ============================================================
-- 名刺取込をジョブ方式（非同期）にする
--
-- 背景:
--   数千行の取込を 1 回の HTTP リクエストの中で処理していたため、
--   制限に当たるたびに回避策を足してきた。
--     1. RLS 経由が重い          → service_role へ（実際は 8s の壁は消えていなかった）
--     2. statement_timeout = 8s  → 一括処理の関数だけ延長（20260804000001）
--     3. **次は HTTP 層のタイムアウト**（Cloudflare の約 100 秒）。
--        これは DB 側の設定では外せない。本番で
--        「An unexpected response was received from the server」に至った
--
--   同期実行のままでは行数が増えるたびに再発する。取込を「投入」と「実行」に分け、
--   実行は pg_cron のワーカーが行う。画面は状態をポーリングする。
--
-- 設計:
--   - 投入: Server Action が CSV を解析し、結果を JSONB のままジョブへ入れて即座に返す
--   - 実行: pg_cron が queued を拾い、既存の import_eight_leads をそのまま呼ぶ
--           （取込ロジックは変えない。呼ぶ場所だけ移す）
--   - 参照: 画面はジョブの status を見る。ブラウザを閉じても実行は続く
--
--   ワーカーは 1 回の起動で 1 件だけ処理する。長いトランザクションを避け、
--   失敗したジョブが後続を止めないようにするため。
-- ============================================================

-- ------------------------------------------------------------
-- 1. ジョブ表
-- ------------------------------------------------------------

CREATE TABLE lead_import_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 取込元の情報（lead_import_batches に渡す値）
  source_slug   TEXT NOT NULL,
  file_name     TEXT NOT NULL,
  encoding      TEXT NOT NULL,
  row_count     INTEGER NOT NULL DEFAULT 0,

  -- 解析済みの取込内容。import_eight_leads の引数をそのまま持つ
  payload       JSONB NOT NULL,
  errors        JSONB NOT NULL DEFAULT '[]'::JSONB,
  defaults      JSONB NOT NULL,

  status        TEXT NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  -- 再実行した回数。無限に走り続けないための歯止めにも使う
  attempts      INTEGER NOT NULL DEFAULT 0,

  requested_by  UUID NOT NULL REFERENCES crm_users(id),
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ,

  -- 結果（succeeded のとき埋まる）
  batch_id               UUID REFERENCES lead_import_batches(id),
  created_count          INTEGER,
  updated_count          INTEGER,
  error_count            INTEGER,
  card_count             INTEGER,
  merge_candidate_count  INTEGER,

  -- 失敗の理由。**利用者に見せる前に必ずアプリ側で日本語へ直す**
  -- （docs/error-messages.md §4。ここには原文が入る）
  error_message TEXT
);

COMMENT ON TABLE lead_import_jobs IS
'名刺取込のジョブ。投入（Server Action）と実行（pg_cron ワーカー）を分けて、HTTP のタイムアウトから切り離す';
COMMENT ON COLUMN lead_import_jobs.payload IS
'import_eight_leads の p_leads。CSV を解析した結果をそのまま持つ';
COMMENT ON COLUMN lead_import_jobs.error_message IS
'失敗理由の原文。画面に出す前に toUserMessage() を通すこと';

-- 待ち行列の取り出しに使う。queued だけを見るので部分インデックスにする
CREATE INDEX idx_lead_import_jobs_queued
  ON lead_import_jobs (requested_at)
  WHERE status = 'queued';

CREATE INDEX idx_lead_import_jobs_requested_by
  ON lead_import_jobs (requested_by, requested_at DESC);

-- ------------------------------------------------------------
-- 2. RLS（admin のみ。取込自体が admin 専用の業務）
-- ------------------------------------------------------------

ALTER TABLE lead_import_jobs ENABLE ROW LEVEL SECURITY;

-- 引数なしの関数はスカラーサブクエリで包む（CLAUDE.md「RLS ポリシーの書き方（性能）」）
CREATE POLICY lead_import_jobs_select ON lead_import_jobs
  FOR SELECT TO authenticated
  USING ((SELECT is_admin()));

CREATE POLICY lead_import_jobs_insert ON lead_import_jobs
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT is_admin()));

-- 状態の書き換えはワーカー（SECURITY DEFINER）だけが行う。
-- 利用者に UPDATE を許すと、実行中のジョブを queued に戻すような操作ができてしまう
CREATE POLICY lead_import_jobs_delete ON lead_import_jobs
  FOR DELETE TO authenticated
  USING ((SELECT is_admin()));

-- ------------------------------------------------------------
-- 3. ワーカー
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION process_lead_import_jobs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job    lead_import_jobs%ROWTYPE;
  v_result JSONB;
BEGIN
  -- cron からの実行なので時間制限を外す（HTTP の経路には乗らない）
  SET LOCAL statement_timeout = 0;

  -- 1 回の起動で 1 件だけ。SKIP LOCKED で多重起動しても二重処理にならない
  SELECT * INTO v_job
    FROM lead_import_jobs
   WHERE status = 'queued'
   ORDER BY requested_at
   FOR UPDATE SKIP LOCKED
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  UPDATE lead_import_jobs
     SET status = 'running', started_at = now(), attempts = attempts + 1
   WHERE id = v_job.id;

  BEGIN
    v_result := import_eight_leads(
      jsonb_build_object(
        'source_slug', v_job.source_slug,
        'file_name',   v_job.file_name,
        'encoding',    v_job.encoding,
        'row_count',   v_job.row_count,
        'imported_by', v_job.requested_by
      ),
      v_job.payload,
      v_job.errors,
      v_job.defaults
    );

    -- スコアはこのバッチ分だけ計算する（全件は週次の cron が担う）。
    -- 失敗しても取込自体は成立しているので、ここでは止めない
    BEGIN
      PERFORM recalculate_lead_scores_for_batch((v_result ->> 'batch_id')::UUID);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[process_lead_import_jobs] スコア再計算に失敗: %', SQLERRM;
    END;

    UPDATE lead_import_jobs
       SET status                = 'succeeded',
           finished_at           = now(),
           batch_id              = (v_result ->> 'batch_id')::UUID,
           created_count         = (v_result ->> 'created_count')::INTEGER,
           updated_count         = (v_result ->> 'updated_count')::INTEGER,
           error_count           = (v_result ->> 'error_count')::INTEGER,
           card_count            = COALESCE((v_result ->> 'card_count')::INTEGER, 0),
           merge_candidate_count = COALESCE((v_result ->> 'merge_candidate_count')::INTEGER, 0)
     WHERE id = v_job.id;

  EXCEPTION WHEN OTHERS THEN
    -- import_eight_leads の中の変更はここまで巻き戻る（中途半端な取込を残さない）。
    -- status の書き換えは EXCEPTION ブロックの外なので残る
    UPDATE lead_import_jobs
       SET status = 'failed', finished_at = now(), error_message = SQLERRM
     WHERE id = v_job.id;
    RAISE WARNING '[process_lead_import_jobs] ジョブ % が失敗: %', v_job.id, SQLERRM;
  END;

  RETURN 1;
END;
$$;

COMMENT ON FUNCTION process_lead_import_jobs IS
'名刺取込ジョブを 1 件処理する（pg_cron から毎分実行）。SKIP LOCKED により多重起動でも二重処理しない';

REVOKE ALL ON FUNCTION process_lead_import_jobs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION process_lead_import_jobs() TO postgres;

-- ------------------------------------------------------------
-- 4. pg_cron へ登録（冪等）
-- ------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process_lead_import_jobs') THEN
    PERFORM cron.unschedule('process_lead_import_jobs');
  END IF;

  PERFORM cron.schedule(
    'process_lead_import_jobs',
    '* * * * *',            -- 毎分。取込は月次の業務なので、この粒度で足りる
    $cron$SELECT process_lead_import_jobs();$cron$
  );
END $$;
