-- ============================================================
-- 統一変更履歴 entity_change_logs + 汎用トリガー
--
-- 背景:
--   変更履歴は Server Action からの手動 INSERT で記録していたため、
--   service_role クライアント経由・SQL 直接操作・将来のバッチ/外部連携では残らなかった。
--   また記録形式が field_name/old_value/new_value 系と changes JSON 系に分かれ、
--   leads / contracts / campaigns には履歴テーブル自体が存在しなかった。
--
-- 方針:
--   1 テーブルに集約し、AFTER トリガーで経路によらず必ず記録する。
--   既存の *_change_histories は過去データとして残す（新規書き込みはしない）。
-- ============================================================

CREATE TABLE IF NOT EXISTS entity_change_logs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name     TEXT        NOT NULL,
  record_id      UUID        NOT NULL,
  operation      TEXT        NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  -- UPDATE: { "カラム名": { "old": ..., "new": ... } }
  -- INSERT/DELETE: { "_row": {行全体} }
  changed_fields JSONB       NOT NULL,
  -- 実行ユーザー。NULL = セッション情報を持たない経路（SQL 直接操作・バッチ等）
  changed_by     UUID        REFERENCES crm_users(id),
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  entity_change_logs IS '全エンティティ共通の変更履歴（トリガーで自動記録・追記のみ）';
COMMENT ON COLUMN entity_change_logs.changed_by IS '実行ユーザー。NULL はセッション情報を持たない経路からの変更を示す';

CREATE INDEX IF NOT EXISTS idx_entity_change_logs_record
  ON entity_change_logs (table_name, record_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_entity_change_logs_changed_at
  ON entity_change_logs (changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_entity_change_logs_changed_by
  ON entity_change_logs (changed_by);

-- ============================================================
-- 汎用トリガー関数
-- ============================================================

CREATE OR REPLACE FUNCTION log_entity_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER            -- RLS に阻まれず必ず記録する
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old     JSONB;
  v_new     JSONB;
  v_changes JSONB := '{}'::jsonb;
  v_key     TEXT;
  -- 差分として意味を持たない列は記録しない
  v_ignored TEXT[] := ARRAY['updated_at', 'last_updated_by'];
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

  -- 実質的な変更がなければ記録しない（保存ボタンの空打ち等）
  IF v_changes = '{}'::jsonb THEN
    RETURN NULL;
  END IF;

  INSERT INTO entity_change_logs (table_name, record_id, operation, changed_fields, changed_by)
  VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', v_changes, auth.uid());

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION log_entity_change IS
  'entity_change_logs へ変更を記録する汎用 AFTER トリガー関数';

-- ============================================================
-- 対象テーブルへの適用
-- 機微情報を含む financial_info は履歴に平文で残さないため対象外とする
-- ============================================================

DO $$
DECLARE
  t TEXT;
  targets TEXT[] := ARRAY[
    'companies', 'accounts', 'contacts', 'deals', 'contracts',
    'talents', 'projects', 'leads', 'campaigns'
  ];
BEGIN
  FOREACH t IN ARRAY targets LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_change_log ON %I', t, t);
      EXECUTE format(
        'CREATE TRIGGER trg_%s_change_log
           AFTER INSERT OR UPDATE OR DELETE ON %I
           FOR EACH ROW EXECUTE FUNCTION log_entity_change()',
        t, t
      );
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- RLS
--   参照: manager 以上（監査目的）。member は自分が変更した分のみ
--   書き込み: ポリシーを作らない = アプリからの直接 INSERT/UPDATE/DELETE は不可。
--             記録は SECURITY DEFINER のトリガーのみが行う（改ざん防止）
-- ============================================================

ALTER TABLE entity_change_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY entity_change_logs_select ON entity_change_logs
  FOR SELECT TO authenticated
  USING (is_manager_or_above() OR changed_by = auth.uid());
