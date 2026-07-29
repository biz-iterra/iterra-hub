-- ============================================================
-- 変更履歴からスコア派生値を除外する
--
-- 背景:
--   leads へのスコア自動計算（recalculate_lead_score）が INSERT/UPDATE 直後に
--   score / temperature_id を書き換えるため、entity_change_logs に
--   人の操作ではない UPDATE が大量に記録されていた。
--   実測: leads 3,008 件の投入で INSERT 3,008 + UPDATE 3,008 = 6,016 件。
--   さらに週次 pg_cron の全件再計算ごとに 3,000 件超が積み増される。
--
-- 対応:
--   score / temperature_id / score_updated_at を差分の対象外とする。
--   これらだけが変わった UPDATE は「変更なし」と判定され記録されない。
--   他のカラムと同時に変わった場合は、その他のカラムのみが記録される。
--
--   スコアの推移そのものは lead_score_breakdowns が保持しているため、
--   監査情報が失われるわけではない。
-- ============================================================

CREATE OR REPLACE FUNCTION log_entity_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old     JSONB;
  v_new     JSONB;
  v_changes JSONB := '{}'::jsonb;
  v_key     TEXT;
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

  -- UPDATE: 変化した列だけを抽出する
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

  -- 実質的な変更がなければ記録しない（保存ボタンの空打ち・スコア再計算のみ等）
  IF v_changes = '{}'::jsonb THEN
    RETURN NULL;
  END IF;

  INSERT INTO entity_change_logs (table_name, record_id, operation, changed_fields, changed_by)
  VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', v_changes, auth.uid());

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION log_entity_change IS
  'entity_change_logs へ変更を記録する汎用 AFTER トリガー関数。監査値とスコア派生値は差分対象外';
