-- ============================================================
-- leads.status_id を NULL 許容に変更（Phase C バグ修正）
--
-- 設計書 §11.3 の通り、Opportunity ステージにはステータスが
-- 定義されていない。Deal 昇格トリガー用ステージであるため
-- status_id は NULL で良い。
-- NOT NULL 制約により Opportunity 遷移時に保存エラーが発生して
-- いたため、制約を DROP する。
-- ============================================================

ALTER TABLE leads ALTER COLUMN status_id DROP NOT NULL;

COMMENT ON COLUMN leads.status_id IS 'ステージ内の状態（M19 lead_statuses FK）。auto_promote_to_deal=true のステージ（Opportunity等）では NULL 許容';
