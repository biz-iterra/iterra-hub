-- ============================================================
-- 一括処理の関数だけ実行時間の制限を延ばす
--
-- 症状（2026-08-04、本番）:
--   名刺取込が「canceling statement due to statement timeout」で失敗する。
--
-- 原因:
--   PostgREST は `authenticator` ロールで接続してから `SET ROLE service_role`
--   するため、**service_role で呼んでも `authenticator` の
--   `statement_timeout = 8s` がセッション設定として効く**。
--   RLS を避ける目的で createAdminClient（service_role）に切り替えても、
--   8 秒の壁は消えていなかった。
--
--     authenticated | statement_timeout=8s
--     anon          | statement_timeout=3s
--     service_role  | （設定なし。だが authenticator の 8s を引き継ぐ）
--     authenticator | statement_timeout=8s, lock_timeout=8s
--
-- 対処:
--   関数属性の `SET` は**その関数の実行中だけ**有効なので、
--   一括処理の関数にだけ長い制限を与える。ロールの設定は変えない
--   （通常のクエリは 8 秒で止まってほしい。暴走を許すのは
--   「時間がかかって当然の処理」に限る）。
--
-- 注意:
--   Supabase の HTTP 層（Kong / PostgREST）には別のタイムアウトがあり、
--   1 リクエストが極端に長いと DB が動いていても接続側で切れる。
--   ここでの引き上げは「8 秒の壁」を外すためのもので、
--   無制限に大きな CSV を通せるようにするものではない。
--   1 回の取込が収まらない規模になったら、取込側での分割が必要になる。
-- ============================================================

-- 名刺取込。1 行ごとに事業者・連絡先の名寄せと名刺の記録を行うため、
-- 行数に比例して伸びる
ALTER FUNCTION import_eight_leads(JSONB, JSONB, JSONB, JSONB)
  SET statement_timeout = '240s';

-- 取込バッチ分のスコア再計算。取込の直後に呼ばれる
ALTER FUNCTION recalculate_lead_scores_for_batch(UUID)
  SET statement_timeout = '120s';

-- 問い合わせ取込（D1 連携）。件数は少ないが同じ経路
ALTER FUNCTION import_inquiry_leads(JSONB, JSONB)
  SET statement_timeout = '120s';

-- 全リードのスコア再計算。3,008 件で約 3.9 秒。件数が増えると 8 秒に届く
ALTER FUNCTION recalculate_all_lead_scores()
  SET statement_timeout = '600s';

-- 統合候補の一括検出。全連絡先を総当たりで比較する
ALTER FUNCTION detect_all_contact_merge_candidates()
  SET statement_timeout = '600s';
