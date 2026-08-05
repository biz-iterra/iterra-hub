-- ============================================================
-- 変更履歴に「何を操作したか」を残す
--
-- 削除の記録は `deleted_at` / `deleted_by` しか変わらないため、
-- 一覧の変更内容が空（—）になり、**何を消したのか分からなかった**。
-- 履歴として一番知りたい情報が欠けている。
--
-- 対象レコードの名前を記録時に一緒に残す（後から JOIN しなくてよい。
-- 論理削除された行や、物理削除された行でも追える）。
-- ============================================================

-- ------------------------------------------------------------
-- 1. 行から「人が見て分かる名前」を取り出す
--
-- テーブルごとに名前の列が違うので、代表的なものを順に見る。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION entity_display_name(p_row JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT NULLIF(btrim(COALESCE(
    p_row ->> 'name',
    p_row ->> 'lead_name',
    p_row ->> 'contract_name',
    p_row ->> 'project_name',
    NULLIF(btrim(COALESCE(p_row ->> 'last_name', '') || ' ' ||
                 COALESCE(p_row ->> 'first_name', '')), ''),
    p_row ->> 'company_name',
    p_row ->> 'email',
    p_row ->> 'phone',
    p_row ->> 'full_name',
    ''
  )), '');
$$;

COMMENT ON FUNCTION entity_display_name IS
'変更履歴に残す「対象の名前」。テーブルごとに名前の列が違うので順に見る';

-- ------------------------------------------------------------
-- 2. 記録時に名前を含める
--
-- 変更したのは `_name` を足すところだけ。差分の抽出は元のまま。
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
  v_name    TEXT;
  v_ignored TEXT[] := ARRAY[
    'updated_at',
    'last_updated_by',
    'score',
    'score_updated_at',
    'temperature_id'
  ];
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO entity_change_logs (table_name, record_id, operation, changed_fields, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT',
            jsonb_build_object('_row', to_jsonb(NEW),
                               '_name', entity_display_name(to_jsonb(NEW))),
            auth.uid());
    RETURN NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO entity_change_logs (table_name, record_id, operation, changed_fields, changed_by)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE',
            jsonb_build_object('_row', to_jsonb(OLD),
                               '_name', entity_display_name(to_jsonb(OLD))),
            auth.uid());
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

  v_op := CASE
    WHEN v_changes ? 'deleted_at' AND (v_new ->> 'deleted_at') IS NOT NULL THEN 'SOFT_DELETE'
    WHEN v_changes ? 'deleted_at' AND (v_old ->> 'deleted_at') IS NOT NULL THEN 'RESTORE'
    ELSE 'UPDATE'
  END;

  -- **何を操作したかを必ず残す。** 削除は deleted_at しか変わらないため、
  -- これが無いと一覧の変更内容が空になり、対象が分からない
  v_name := entity_display_name(v_new);
  IF v_name IS NOT NULL THEN
    v_changes := v_changes || jsonb_build_object('_name', v_name);
  END IF;

  INSERT INTO entity_change_logs (table_name, record_id, operation, changed_fields, changed_by)
  VALUES (TG_TABLE_NAME, NEW.id, v_op, v_changes, auth.uid());
  RETURN NULL;
END;
$function$;

COMMENT ON FUNCTION log_entity_change IS
'変更履歴の記録。論理削除は SOFT_DELETE として区別し、対象の名前（_name）も残す';

-- ------------------------------------------------------------
-- 3. 過去の記録にも名前を埋める
--
-- 対象が論理削除されていても行は残っているので引ける
-- （物理削除済みのものは埋められない。そのまま「—」になる）。
-- ------------------------------------------------------------
DO $$
DECLARE
  r       RECORD;
  v_total INTEGER := 0;
  v_n     INTEGER;
BEGIN
  FOR r IN
    SELECT DISTINCT l.table_name
      FROM entity_change_logs l
     WHERE NOT (l.changed_fields ? '_name')
       AND EXISTS (
         SELECT 1 FROM information_schema.tables t
          WHERE t.table_schema = 'public' AND t.table_name = l.table_name
       )
  LOOP
    EXECUTE format($f$
      UPDATE entity_change_logs l
         SET changed_fields = l.changed_fields
             || jsonb_build_object('_name', entity_display_name(to_jsonb(e)))
        FROM %I e
       WHERE e.id = l.record_id
         AND l.table_name = %L
         AND NOT (l.changed_fields ? '_name')
         AND entity_display_name(to_jsonb(e)) IS NOT NULL
    $f$, r.table_name, r.table_name);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
  END LOOP;

  RAISE NOTICE '過去の履歴 % 件に対象名を埋めた', v_total;
END $$;
