-- ============================================================
-- RLS 述語の引数なし関数を InitPlan 化する
--
-- `auth.uid()` / `is_admin()` / `is_manager_or_above()` を裸で書くと、
-- プランナは行ごとに評価する必要があると判断し、全行で関数を呼ぶ。
-- スカラーサブクエリで包むと InitPlan になり、クエリ全体で 1 回になる。
-- いずれも引数なしの STABLE 関数なので、1 回に減らしても結果は変わらない。
--
-- 実測（leads 3,008 件・admin ユーザー・ローカル）:
--   一覧 30 件   108ms → 5.5ms
--   件数カウント  90ms → 4.4ms
--
-- 対象は public スキーマの全ポリシー（205 件が該当）。
-- 引数ありの関数（is_lead_accessible(lead_id) など行の値に依存するもの）は
-- 包むと意味が変わるため対象外。空括弧のパターンだけを置換する。
--
-- 参考: Supabase の RLS パフォーマンスガイドが推奨している定石
-- ============================================================

DO $$
DECLARE
  r            RECORD;
  v_qual       TEXT;
  v_check      TEXT;
  v_sql        TEXT;
  v_changed    INTEGER := 0;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
      FROM pg_policies
     WHERE schemaname = 'public'
       AND (coalesce(qual, '') || ' ' || coalesce(with_check, ''))
           ~ '(auth\.uid\(\)|is_admin\(\)|is_manager_or_above\(\))'
  LOOP
    -- \m は単語の先頭。schema 修飾された呼び出しは存在しないことを確認済み
    v_qual := r.qual;
    v_check := r.with_check;

    IF v_qual IS NOT NULL THEN
      v_qual := regexp_replace(v_qual, '\mauth\.uid\(\)', '(SELECT auth.uid())', 'g');
      v_qual := regexp_replace(v_qual, '\mis_admin\(\)', '(SELECT is_admin())', 'g');
      v_qual := regexp_replace(v_qual, '\mis_manager_or_above\(\)', '(SELECT is_manager_or_above())', 'g');
    END IF;

    IF v_check IS NOT NULL THEN
      v_check := regexp_replace(v_check, '\mauth\.uid\(\)', '(SELECT auth.uid())', 'g');
      v_check := regexp_replace(v_check, '\mis_admin\(\)', '(SELECT is_admin())', 'g');
      v_check := regexp_replace(v_check, '\mis_manager_or_above\(\)', '(SELECT is_manager_or_above())', 'g');
    END IF;

    v_sql := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    IF v_qual IS NOT NULL THEN
      v_sql := v_sql || format(' USING (%s)', v_qual);
    END IF;
    IF v_check IS NOT NULL THEN
      v_sql := v_sql || format(' WITH CHECK (%s)', v_check);
    END IF;

    EXECUTE v_sql;
    v_changed := v_changed + 1;
  END LOOP;

  RAISE NOTICE '[rls_initplan] % 件のポリシーを書き換えた', v_changed;

  -- 置換漏れが無いことを確認する。1 件でも残っていれば移行を失敗させて気づけるようにする。
  -- Postgres の正規表現に後読みが無いので、呼び出しの総数と「SELECT で包まれた数」を
  -- 数えて突き合わせる（差があれば裸の呼び出しが残っている）
  SELECT count(*) INTO v_changed
    FROM pg_policies p,
         LATERAL (
           SELECT
             (SELECT count(*) FROM regexp_matches(
                coalesce(p.qual,'') || ' ' || coalesce(p.with_check,''),
                '(auth\.uid\(\)|is_admin\(\)|is_manager_or_above\(\))', 'g')) AS total,
             (SELECT count(*) FROM regexp_matches(
                coalesce(p.qual,'') || ' ' || coalesce(p.with_check,''),
                'SELECT (auth\.uid\(\)|is_admin\(\)|is_manager_or_above\(\))', 'g')) AS wrapped
         ) c
   WHERE p.schemaname = 'public'
     AND c.total <> c.wrapped;

  IF v_changed > 0 THEN
    RAISE EXCEPTION '[rls_initplan] 包まれていない呼び出しが % 件のポリシーに残っている', v_changed;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 一覧の既定並び順に索引を足す
--
-- 一覧はどれも created_at の降順で 30 件ずつ返す。索引が無いと
-- 全件をソートしてから捨てることになる。論理削除済みは一覧に出ないので
-- 部分索引にして、索引自体も小さく保つ。
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_leads_created_at_desc
  ON leads (created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_created_at_desc
  ON contacts (created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_accounts_created_at_desc
  ON accounts (created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_deals_created_at_desc
  ON deals (created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_created_at_desc
  ON projects (created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at_desc
  ON campaigns (created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contracts_created_at_desc
  ON contracts (created_at DESC) WHERE deleted_at IS NULL;
