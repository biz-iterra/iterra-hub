-- ============================================================
-- 変更履歴の取りこぼしを埋め、論理削除を「削除」として記録する
--
-- 経緯（2026-08-05。利用者の指摘）:
--   「ログの記載も取りこぼしているように見える」
--
--   実際、トリガーが付いていたのは 9 テーブルだけだった:
--     accounts / campaigns / companies / contacts / contracts /
--     deals / leads / projects / talents
--
--   **マスタが 1 つも記録されていなかった。** 今日問題になった
--   「誰がステータスやステージを消したか / 既定を変えたか」がまったく追えない。
--   連絡手段（メール・電話）・名刺・住所といった子テーブルも同様。
--
-- 併せて **論理削除を「削除」として記録する**。今までは
-- `deleted_at` が入った UPDATE として残っており、一覧では「更新」に見えていた。
-- ============================================================

-- ------------------------------------------------------------
-- 1. 論理削除を DELETE として記録する
--
-- 変更したのはここだけ。差分の抽出そのものは元のまま。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_entity_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_old     JSONB;
  v_new     JSONB;
  v_changes JSONB := '{}'::jsonb;
  v_key     TEXT;
  v_op      TEXT;
  -- 差分として意味を持たない列（監査値・自動計算による派生値）
  v_ignored TEXT[] := ARRAY[
    'updated_at',
    'last_updated_by',
    -- スコアリング由来の派生値。recalculate_lead_score が自動更新する
    'score',
    'score_updated_at',
    'temperature_id'
  ];
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO entity_change_logs (table_name, record_id, operation, changed_fields, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', jsonb_build_object('_row', to_jsonb(NEW)), auth.uid());
    RETURN NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO entity_change_logs (table_name, record_id, operation, changed_fields, changed_by)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', jsonb_build_object('_row', to_jsonb(OLD)), auth.uid());
    RETURN NULL;
  END IF;

  v_old := to_jsonb(OLD);
  v_new := to_jsonb(NEW);

  FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
    IF NOT (v_key = ANY (v_ignored))
       AND (v_old -> v_key) IS DISTINCT FROM (v_new -> v_key) THEN
      v_changes := v_changes || jsonb_build_object(
        v_key,
        jsonb_build_object('old', v_old -> v_key, 'new', v_new -> v_key)
      );
    END IF;
  END LOOP;

  IF v_changes = '{}'::jsonb THEN
    RETURN NULL;
  END IF;

  -- **論理削除は「削除」として残す。** deleted_at が入った UPDATE のままだと
  -- 一覧で「更新」に見え、消した操作を探せない（2026-08-05 の指摘）。
  -- 復活（deleted_at を戻す）は RESTORE として区別する
  v_op := CASE
    WHEN v_changes ? 'deleted_at' AND (v_new ->> 'deleted_at') IS NOT NULL THEN 'SOFT_DELETE'
    WHEN v_changes ? 'deleted_at' AND (v_old ->> 'deleted_at') IS NOT NULL THEN 'RESTORE'
    ELSE 'UPDATE'
  END;

  INSERT INTO entity_change_logs (table_name, record_id, operation, changed_fields, changed_by)
  VALUES (TG_TABLE_NAME, NEW.id, v_op, v_changes, auth.uid());
  RETURN NULL;
END;
$function$;

COMMENT ON FUNCTION log_entity_change IS
'変更履歴の記録。論理削除は SOFT_DELETE、復活は RESTORE として区別する';

-- 既存の CHECK 制約が operation を 3 種に限っている場合に備えて広げる
DO $$
DECLARE
  v_con TEXT;
BEGIN
  SELECT conname INTO v_con
    FROM pg_constraint
   WHERE conrelid = 'entity_change_logs'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%operation%';

  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE entity_change_logs DROP CONSTRAINT %I', v_con);
  END IF;
END $$;

ALTER TABLE entity_change_logs
  ADD CONSTRAINT entity_change_logs_operation_check
  CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE', 'SOFT_DELETE', 'RESTORE'));

-- ------------------------------------------------------------
-- 2. 記録対象を広げる
--
-- **マスタと子テーブルを足す。** 対象は「id 列を持ち、人が変更しうる」テーブル。
-- 履歴そのもの（entity_change_logs / 各種 histories）と、
-- 自動生成されるだけのもの（ジョブ・ログ・トークン）は除く。
-- ------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  v_added INTEGER := 0;
BEGIN
  FOR r IN
    SELECT c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       -- id 列を持つ（トリガーが NEW.id を参照するため必須）
       AND EXISTS (
         SELECT 1 FROM information_schema.columns col
          WHERE col.table_schema = 'public'
            AND col.table_name = c.relname
            AND col.column_name = 'id'
       )
       -- まだトリガーが無い
       AND NOT EXISTS (
         SELECT 1 FROM pg_trigger t
          WHERE t.tgrelid = c.oid
            AND NOT t.tgisinternal
            AND t.tgname LIKE '%change_log%'
       )
       -- 除外: 履歴・ログ・ジョブ・連携の内部状態
       AND c.relname NOT IN (
         'entity_change_logs',
         'contact_change_histories',
         'lead_activities',                -- 履歴テーブル（INSERT ONLY）
         'lead_customer_activities',
         'deal_activities',
         'freee_sync_logs',
         'google_contact_sync_logs',
         'import_jobs',
         'lead_import_batches',
         'email_messages',
         'email_message_contacts',
         'gmail_connections',
         'freee_connections',
         'freee_partners',
         'google_contact_connections',
         'google_contacts',
         'google_contact_links',
         'lead_score_breakdowns'           -- スコアの内訳（自動計算）
       )
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%s_change_log
         AFTER INSERT OR UPDATE OR DELETE ON %I
         FOR EACH ROW EXECUTE FUNCTION log_entity_change()',
      r.table_name, r.table_name
    );
    v_added := v_added + 1;
  END LOOP;

  RAISE NOTICE '変更履歴の対象に % テーブルを追加した', v_added;
END $$;
