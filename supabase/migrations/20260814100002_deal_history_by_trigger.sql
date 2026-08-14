-- ============================================================
-- ディールのステージ・ステータス履歴をトリガーで記録する（T-0095 / T-0098）
--
-- 背景:
--   `updateDeal` と `moveDealCard` は deals を UPDATE したあとに
--   deal_stage_histories / deal_status_histories を別文で INSERT していた。
--   supabase-js は複数文を単一トランザクションにできないので、
--   **履歴の INSERT だけ失敗すると更新は残って履歴が欠ける**。
--   ステージの滞留日数はこの 2 表が正本なので、集計が実態とずれる。
--
--   同じ書き込みが 2 箇所（更新とカンバンの D&D）にあり、片方だけ直す
--   事故も起きやすい。CLAUDE.md「変更履歴はアプリから INSERT しない」の
--   考え方に合わせ、entity_change_logs と同じくトリガーへ寄せる。
--
-- 方針:
--   - AFTER UPDATE トリガー。deals の更新と同じトランザクションで記録される
--   - **アプリ経由でない更新（service_role / SQL 直接操作）も拾える**
--   - SECURITY DEFINER。記録者は auth.uid()、無ければ last_updated_by
--     （pg_cron や取込ワーカーからの更新でも changed_by は NOT NULL のため）
--   - 記録者が特定できない更新では履歴を書かない。**誰がやったか分からない
--     行を残すより、書かない方がよい**（NOT NULL に嘘の値を入れない）
--   - 併せて 2 表の INSERT ポリシーを落とす。トリガー以外は書けなくする
--
-- 注意:
--   deal_status_histories.stage_id は NOT NULL。ステータスだけ変えたときは
--   更新後のステージを入れる（アプリ側の実装と同じ）。
-- ============================================================

CREATE OR REPLACE FUNCTION log_deal_stage_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := COALESCE(auth.uid(), NEW.last_updated_by);
BEGIN
  -- 記録者が分からない更新は履歴を残さない（changed_by は NOT NULL）
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.deal_stage_id IS DISTINCT FROM OLD.deal_stage_id THEN
    INSERT INTO deal_stage_histories (deal_id, from_stage_id, to_stage_id, changed_by)
    VALUES (NEW.id, OLD.deal_stage_id, NEW.deal_stage_id, v_actor);
  END IF;

  IF NEW.deal_status_id IS DISTINCT FROM OLD.deal_status_id THEN
    INSERT INTO deal_status_histories (deal_id, stage_id, from_status_id, to_status_id, changed_by)
    VALUES (NEW.id, NEW.deal_stage_id, OLD.deal_status_id, NEW.deal_status_id, v_actor);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION log_deal_stage_status_change() IS
  'deals のステージ・ステータス変更を履歴 2 表へ記録する。アプリからの INSERT は行わない（T-0095）';

DROP TRIGGER IF EXISTS trg_deals_stage_status_history ON deals;
CREATE TRIGGER trg_deals_stage_status_history
  AFTER UPDATE ON deals
  FOR EACH ROW
  WHEN (
    OLD.deal_stage_id IS DISTINCT FROM NEW.deal_stage_id
    OR OLD.deal_status_id IS DISTINCT FROM NEW.deal_status_id
  )
  EXECUTE FUNCTION log_deal_stage_status_change();

-- ── 書き込み口を「見られるディールの履歴」に絞る ──────────────────────────
-- INSERT ポリシーが true のままだと、誰でも任意の履歴を足せる（T-0098）。
--
-- **ポリシーを消し切ることはできない。** ディール作成時の初期履歴は
-- `promote_lead_to_deal` と `create_deal_with_lead`（どちらも SECURITY INVOKER）が
-- 書いており、INSERT を許すポリシーが 1 つも無いと昇格と新規作成が丸ごと落ちる。
-- 実際に消して E2E-03 / 04 / 12 / 17 / 18 が落ちた。
-- 初期履歴も含めてトリガーへ寄せる整理は T-0102 に残す。
DROP POLICY IF EXISTS deal_stage_histories_insert_authenticated ON deal_stage_histories;
CREATE POLICY deal_stage_histories_insert ON deal_stage_histories
  FOR INSERT TO authenticated
  WITH CHECK (is_deal_accessible(deal_id));

DROP POLICY IF EXISTS deal_status_histories_insert_authenticated ON deal_status_histories;
CREATE POLICY deal_status_histories_insert ON deal_status_histories
  FOR INSERT TO authenticated
  WITH CHECK (is_deal_accessible(deal_id));
