-- ============================================================
-- v_leads_with_category に security_invoker を付ける
--
-- PostgreSQL のビューは既定で**ビュー所有者の権限**で基底テーブルを読む。
-- 所有者は postgres（superuser）なので、`security_invoker` を付けない限り
-- ビュー越しの参照では基底テーブルの RLS が一切効かない。
--
-- 実測（member = a0…03、leads の主担当でも副担当でもない）:
--   SELECT count(*) FROM leads                  -> 0 件（RLS が正しく効く）
--   SELECT count(*) FROM v_leads_with_category  -> 3,008 件（**全件見えていた**）
--
-- `/leads` 一覧の Server Action（`getLeads`）は認証チェックだけを行い、
-- 可視範囲は RLS に委ねる設計なので、これがそのままアクセス制御の穴になっていた。
-- member ロールが他人の担当リードを全件閲覧できる状態
-- （CLAUDE.md「leads: manager 以上 or 主担当 or 副担当」に反する）。
--
-- 同じ public スキーマの `activity_feed` には `security_invoker=true` が付いており、
-- このビューだけ付け忘れていた（20260419000008 で作成、20260419000011 /
-- 20260422000013 等で再作成された際にも引き継がれなかった）。
--
-- 今後ビューを追加・再作成するときは必ず `WITH (security_invoker = true)` を付けること。
-- RLS のあるテーブルを読むビューでこれを省くと、ポリシーを書いていても無効になる。
-- ============================================================

ALTER VIEW public.v_leads_with_category SET (security_invoker = true);

COMMENT ON VIEW public.v_leads_with_category IS
  'リード一覧用（カテゴリを都度算出）。security_invoker=true で基底テーブルの RLS を呼び出し元に適用する';

-- 付け忘れの再発を検出する。RLS のあるテーブルを読むビューで
-- security_invoker が無いものが残っていたら警告する
DO $$
DECLARE v_missing text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO v_missing
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind = 'v'
     AND NOT COALESCE(
       (SELECT option_value::boolean
          FROM pg_options_to_table(c.reloptions)
         WHERE option_name = 'security_invoker'), false);

  IF v_missing IS NOT NULL THEN
    RAISE WARNING 'security_invoker が未設定のビュー: %（基底テーブルの RLS が効かない）', v_missing;
  END IF;
END $$;
