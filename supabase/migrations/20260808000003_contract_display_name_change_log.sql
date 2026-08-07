-- ============================================================
-- 自動生成の契約名を変更履歴から外し、既存行を埋める（T-0068）
--
--   `contract_display_name` は締結日・契約書名・契約種別・金額から
--   組み立てた**派生値**。差分に残すと、材料をひとつ直すたびに
--   「金額」と「契約名」の 2 行が並んで見えることになる。
--   何が変わったかは材料の側で分かるので、生成結果は記録しない。
--   同じ判断の前例: 20260728000003（スコア等の自動計算を除外）
--
--   あわせて、変更履歴に残す「対象の名前」を自動生成の契約名にする。
--   契約書名は未入力がありうるが、契約名は契約コードを必ず含むので空にならない。
-- ============================================================

-- ------------------------------------------------------------
-- 1. 対象の名前に自動生成の契約名を優先させる
--
--   `contract_name`（契約書名）より前に置く。人が書名を入れていなくても
--   `CTR-000123` の形で必ず特定できる。
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
    p_row ->> 'contract_display_name',
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
'変更履歴に残す「対象の名前」。テーブルごとに名前の列が違うので順に見る。契約は自動生成の契約名を優先する';

-- ------------------------------------------------------------
-- 2. 差分から除外する
--
--   20260805000026 の実装をそのまま踏襲し、v_ignored に 1 つ足すだけ。
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
    'temperature_id',
    -- 締結日・契約書名・契約種別・金額から組み立てた派生値（T-0068）。
    -- 材料の側に差分が出るので、これも記録すると同じ変更が 2 行に見える
    'contract_display_name'
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
'変更履歴の記録。論理削除は SOFT_DELETE として区別し、対象の名前（_name）も残す。派生値（スコア・自動生成の契約名）は差分に含めない';

-- ------------------------------------------------------------
-- 3. 既存の契約に契約名を埋める
--
--   **除外を入れた後に流すこと。** 先に流すと全契約分の差分が履歴に積まれる。
--   contract_display_name を NULL にすると BEFORE トリガーが組み立て直す。
--
--   論理削除済みの行も対象にする（一覧や履歴に出るため）。
--   SET に deleted_at / deal_id を含めないので、
--   紐づけ解除のガードも取引先ステータスの再判定も発火しない。
-- ------------------------------------------------------------
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT refresh_contract_display_names() INTO v_count;
  RAISE NOTICE '契約名を組み立てた: % 件', v_count;
END;
$$;

-- 過去の entity_change_logs の `_name` は書き換えない。
-- **当時その名前で操作した**という記録なので、後から塗り替えない
