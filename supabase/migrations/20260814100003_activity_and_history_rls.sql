-- ============================================================
-- ディールの活動・履歴テーブルの参照範囲を親に合わせる（T-0097 / T-0098 / T-0101）
--
-- 全体監査（2026-08-14）で見つかった 3 件。
--
-- 1. deal_activities の SELECT が「記録者本人 or manager 以上」だった（T-0097）
--    ディール本体は owner_user_id で見えるのに、活動だけ本人にしか見えない。
--    **担当を引き継いだ member には前任者の記録が見えない。**
--    リード側（lead_activities）は is_lead_accessible(lead_id) で親に合わせて
--    あり、こちらだけ揃っていなかった。利用者判断でディールに合わせる。
--
-- 2. 履歴テーブルの INSERT が true で、誰でも任意の履歴を足せた（T-0098）
--    account / company / contact / deal の *_change_histories 4 表は
--    **1 行も入っておらず、コードからの参照も無い**（entity_change_logs へ
--    置き換わった名残）。書き込み口を塞ぎ、参照も entity_change_logs と
--    同じ範囲（manager 以上 or 本人）へ揃える。
--    テーブル自体は落とさない。使っていないことの確認は取れているが、
--    復旧できない操作をこの作業で混ぜない。
--
-- 3. deal_activity_emails が SELECT / INSERT / UPDATE / DELETE すべて true（T-0101）
--    ディールの活動に紐づくメール（件名・相手・日時）。親の deal_activities は
--    絞ってあるのにこちらは素通しで、**見られないディールのメール情報が読める**。
--    親に合わせる。
--
-- 方針:
--   引数なしの関数はスカラーサブクエリで包む（.claude/rules/rls-performance.md）。
--   is_deal_accessible(deal_id) は行の値に依存するので包まない。
-- ============================================================

-- ── 1. ディールの活動をディールに合わせる ────────────────────────────────
DROP POLICY IF EXISTS deal_activities_select_manager_admin ON deal_activities;
CREATE POLICY deal_activities_select ON deal_activities
  FOR SELECT TO authenticated
  USING (is_deal_accessible(deal_id));

-- 書き込みは「見られるディールに対してだけ」に絞る。
-- 以前は INSERT が true で、参照できないディールにも記録を足せた
DROP POLICY IF EXISTS deal_activities_insert_authenticated ON deal_activities;
CREATE POLICY deal_activities_insert ON deal_activities
  FOR INSERT TO authenticated
  WITH CHECK (is_deal_accessible(deal_id));

-- 更新は従来どおり「記録者本人 or admin」。他人の対応内容は書き換えさせない
-- （lead_activities は caller 本人と manager 以上に許しているが、
--  そちらは last_edited_at / last_edited_by_user_id で証跡を残す作りになっている。
--  deal_activities に同じ列は無いので、範囲を広げない）

-- ── 2. 使われていない変更履歴 4 表 ───────────────────────────────────────
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'account_change_histories',
    'company_change_histories',
    'contact_change_histories',
    'deal_change_histories'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert_authenticated', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select_authenticated', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING ((SELECT is_manager_or_above()))',
      t || '_select', t
    );
  END LOOP;
END;
$$;

COMMENT ON TABLE account_change_histories IS
  '未使用。変更履歴は entity_change_logs が正本（20260728000002）。書き込み口は閉じてある（T-0098）';
COMMENT ON TABLE company_change_histories IS
  '未使用。変更履歴は entity_change_logs が正本（20260728000002）。書き込み口は閉じてある（T-0098）';
COMMENT ON TABLE contact_change_histories IS
  '未使用。変更履歴は entity_change_logs が正本（20260728000002）。書き込み口は閉じてある（T-0098）';
COMMENT ON TABLE deal_change_histories IS
  '未使用。変更履歴は entity_change_logs が正本（20260728000002）。書き込み口は閉じてある（T-0098）';

-- ── 2b. ステージ・ステータス履歴の参照もディールに合わせる ───────────────
-- 本体が owner_user_id で絞られているのに、滞留履歴だけ全員に見えていた。
-- 書き込み口は 20260814100002 でトリガーだけにしてある
DROP POLICY IF EXISTS deal_stage_histories_select_authenticated ON deal_stage_histories;
CREATE POLICY deal_stage_histories_select ON deal_stage_histories
  FOR SELECT TO authenticated
  USING (is_deal_accessible(deal_id));

DROP POLICY IF EXISTS deal_status_histories_select_authenticated ON deal_status_histories;
CREATE POLICY deal_status_histories_select ON deal_status_histories
  FOR SELECT TO authenticated
  USING (is_deal_accessible(deal_id));

-- ── 3. 活動に紐づくメールを親に合わせる ──────────────────────────────────
DROP POLICY IF EXISTS deal_activity_emails_select_authenticated ON deal_activity_emails;
DROP POLICY IF EXISTS deal_activity_emails_insert_authenticated ON deal_activity_emails;
DROP POLICY IF EXISTS deal_activity_emails_update_authenticated ON deal_activity_emails;
DROP POLICY IF EXISTS deal_activity_emails_delete_authenticated ON deal_activity_emails;

CREATE POLICY deal_activity_emails_select ON deal_activity_emails
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM deal_activities a
     WHERE a.id = deal_activity_emails.deal_activity_id
       AND is_deal_accessible(a.deal_id)
  ));

CREATE POLICY deal_activity_emails_insert ON deal_activity_emails
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM deal_activities a
     WHERE a.id = deal_activity_emails.deal_activity_id
       AND is_deal_accessible(a.deal_id)
  ));

CREATE POLICY deal_activity_emails_update ON deal_activity_emails
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM deal_activities a
     WHERE a.id = deal_activity_emails.deal_activity_id
       AND ((SELECT is_admin()) OR a.performed_by = (SELECT auth.uid()))
  ));

CREATE POLICY deal_activity_emails_delete ON deal_activity_emails
  FOR DELETE TO authenticated
  USING ((SELECT is_admin()));
