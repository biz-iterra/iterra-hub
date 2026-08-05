-- ============================================================
-- マスタのスラッグ／コードを自動採番にする
--
-- 依頼（2026-08-05）:
--   「編集できるスラッグ設定を廃止し、裏側で自動採番してほしい（運用が楽）」
--
-- 前提: 20260805000018 で**判定に使っていた参照をすべて意味のある列へ移した**。
-- コードはもう「slug = 'generation'」のような引き方をしていないので、
-- 値が何であっても機能は変わらない。
--
-- 列そのものは残す。外部連携の突合や、過去に発行した値の追跡に使えるため。
-- **人が編集する項目ではなくなった**（画面から入力欄を外す）。
--
-- 既存の値は書き換えない。**意味のある値が入っているものを壊す理由が無い**し、
-- 手順書や過去ログに出てくる値と食い違うと調査のときに混乱する。
-- ============================================================

-- ------------------------------------------------------------
-- ランダムな識別子を作る
--
-- 衝突しない・短い・URL などに入れても安全な形にする。
-- 先頭に接頭辞を付けるのは、DB を直接見たときに**どのテーブルの値か**が
-- 分かるようにするため（人が読むのはここまでで、意味は持たせない）。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_master_slug(p_prefix TEXT)
RETURNS TEXT
LANGUAGE sql
VOLATILE
SET search_path = public, pg_temp
AS $$
  -- gen_random_uuid の 16 進から 12 桁。約 2.8 × 10^14 通りあり、
  -- マスタの行数（数十）では実質衝突しない
  SELECT p_prefix || '_' || substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 12);
$$;

COMMENT ON FUNCTION generate_master_slug IS
'マスタのスラッグ／コードの自動採番。人が編集しない前提の値（20260805000019）';

-- ------------------------------------------------------------
-- 採番トリガー
--
-- **未入力のときだけ**入れる。seed や移行スクリプトが明示した値は尊重する
-- （01-masters.sql は意味のある slug を指定しており、それを壊さない）。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_master_slug_if_blank()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prefix TEXT := TG_ARGV[0];
  v_column TEXT := TG_ARGV[1];  -- 'slug' か 'code'
  v_value  TEXT;
BEGIN
  EXECUTE format('SELECT ($1).%I', v_column) INTO v_value USING NEW;
  IF NULLIF(btrim(COALESCE(v_value, '')), '') IS NULL THEN
    NEW := jsonb_populate_record(
      NEW,
      to_jsonb(NEW) || jsonb_build_object(v_column, generate_master_slug(v_prefix))
    );
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION set_master_slug_if_blank IS
'スラッグ／コードが未入力なら自動採番する。明示された値は尊重する';

-- slug を持つマスタ
CREATE TRIGGER trg_lead_stages_slug
  BEFORE INSERT ON lead_stages
  FOR EACH ROW EXECUTE FUNCTION set_master_slug_if_blank('stage', 'slug');
CREATE TRIGGER trg_lead_sources_slug
  BEFORE INSERT ON lead_sources
  FOR EACH ROW EXECUTE FUNCTION set_master_slug_if_blank('source', 'slug');
CREATE TRIGGER trg_account_types_slug
  BEFORE INSERT ON account_types
  FOR EACH ROW EXECUTE FUNCTION set_master_slug_if_blank('atype', 'slug');
CREATE TRIGGER trg_pipeline_types_slug
  BEFORE INSERT ON pipeline_types
  FOR EACH ROW EXECUTE FUNCTION set_master_slug_if_blank('pipeline', 'slug');

-- code を持つマスタ
CREATE TRIGGER trg_lead_statuses_code
  BEFORE INSERT ON lead_statuses
  FOR EACH ROW EXECUTE FUNCTION set_master_slug_if_blank('status', 'code');
CREATE TRIGGER trg_lead_categories_code
  BEFORE INSERT ON lead_categories
  FOR EACH ROW EXECUTE FUNCTION set_master_slug_if_blank('category', 'code');
CREATE TRIGGER trg_lead_temperatures_code
  BEFORE INSERT ON lead_temperatures
  FOR EACH ROW EXECUTE FUNCTION set_master_slug_if_blank('temp', 'code');

-- ------------------------------------------------------------
-- NOT NULL 制約を落とす
--
-- 画面から入力欄を外すため、アプリは値を送らなくなる。
-- トリガーが必ず埋めるが、**制約の順序に依存しない形**にしておく。
-- ------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT table_name, column_name
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND is_nullable = 'NO'
       AND (
         (table_name IN ('lead_stages','lead_sources','account_types','pipeline_types')
          AND column_name = 'slug')
         OR (table_name IN ('lead_statuses','lead_categories','lead_temperatures')
             AND column_name = 'code')
       )
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP NOT NULL', r.table_name, r.column_name);
  END LOOP;
END $$;
