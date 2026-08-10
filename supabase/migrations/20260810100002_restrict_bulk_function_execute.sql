-- ============================================================
-- バルク系 DB 関数を PostgREST の直接呼び出しから塞ぐ（T-0085）
--
-- 全件を総当たりする 3 つの関数は、関数レベルの権限が既定のまま
-- （PUBLIC に EXECUTE）だった。書き込みの中身は各テーブルの RLS が
-- 守るものの、**認証済みなら誰でも PostgREST 経由で起動できる**。
-- 重い処理を任意に走らせられる状態は、それ自体が負荷の口になる。
--
-- 正規の入口はいずれもジョブ方式（docs/database-design.md § 27）で、
-- 権限は投入側（admin_bulk_jobs / lead_import_jobs の RLS + Server Action）で
-- 完結している。関数を直接呼ぶのは
--   - pg_cron のワーカー（process_admin_bulk_jobs / process_lead_import_jobs。
--     SECURITY DEFINER・所有者 postgres なので EXECUTE は所有者権限で通る）
--   - 週次 cron（recalculate_lead_scores_weekly。postgres ロールで実行）
--   - service_role のスクリプト（scripts/verify-eight-import.mts）
-- の 3 経路だけで、authenticated から `.rpc()` する箇所は src/ に無い
-- （2026-08-10 時点で grep 済み）。
--
-- 記録: docs/database-design.md § 27.4
-- ============================================================

-- ------------------------------------------------------------
-- 1. 統合候補の一括検出（内側の関数）
--
-- 入口の detect_all_contact_merge_candidates() / detect_contact_merge_candidates()
-- はどちらも SECURITY DEFINER・所有者 postgres なので、そこからの呼び出しは
-- 所有者の権限で通る（権限判定は入口側が持つ）。ワーカーは
-- record_contact_merge_candidates(NULL) を直接呼ぶが、こちらも
-- SECURITY DEFINER の process_admin_bulk_jobs() の内側なので影響しない
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION record_contact_merge_candidates(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_contact_merge_candidates(UUID) TO service_role;

-- ------------------------------------------------------------
-- 2. 全 Lead スコアの再計算
--
-- 週次 pg_cron（§11.12.7）と admin_bulk_jobs のワーカーから呼ばれる。
-- 1 件版の recalculate_lead_score(UUID) は名刺取込後の反映などで
-- 使うため対象にしない（軽く、件数が増えても壁にならない）
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION recalculate_all_lead_scores() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION recalculate_all_lead_scores() TO service_role;

-- ------------------------------------------------------------
-- 3. Eight 名刺 CSV の取込
--
-- **こちらは SECURITY INVOKER**。所有者 postgres の
-- process_lead_import_jobs()（SECURITY DEFINER）から呼ばれるため
-- EXECUTE は所有者権限で通る。service_role へ残すのは
-- scripts/verify-eight-import.mts が直接叩くため
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION import_eight_leads(JSONB, JSONB, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION import_eight_leads(JSONB, JSONB, JSONB, JSONB) TO service_role;
