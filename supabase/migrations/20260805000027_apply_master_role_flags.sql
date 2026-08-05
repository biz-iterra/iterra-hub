-- ============================================================
-- 役割フラグの設定を 1 箇所にまとめ、何度でも実行できるようにする
--
-- 発覚（2026-08-05。本番反映前の `db reset` 検証で）:
--   まっさらな DB に流すと **役割フラグが 1 つも立たない**。
--   `db reset` は「マイグレーション → seed」の順で走るため、
--   マイグレーション内の `UPDATE ... WHERE code = '...'` の時点では
--   マスタの行がまだ存在せず、**全部 0 行更新になる**。
--   エラーは出ない。seed 投入後に取引先を作ろうとして初めて
--   「既定が設定されていません」で止まって気づく。
--
--   本番は既にマスタがあるので当たる。**つまりローカルと本番で
--   DB の状態が食い違う。** 検証したつもりが検証になっていない。
--
-- 対応: フラグ設定を関数にまとめ、seed の末尾からも呼ぶ。
--   何度実行しても同じ結果になる（冪等）ので、
--   **本番でフラグが空振りしていた場合の復旧手段にもなる**。
--
-- 名指しの値（code / slug / name）はここが唯一の置き場所。
-- 増やすときはこの関数だけを直す。
-- ============================================================

CREATE OR REPLACE FUNCTION apply_master_role_flags()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_missing TEXT[] := ARRAY[]::TEXT[];
  v_n       INTEGER;
BEGIN
  -- --------------------------------------------------------
  -- リードステージ
  -- --------------------------------------------------------
  UPDATE lead_stages SET requires_deal = TRUE
   WHERE slug IN ('sales', 'opportunity', 'customer') AND NOT requires_deal;

  UPDATE lead_stages SET requires_contract = TRUE
   WHERE slug = 'customer' AND NOT requires_contract;

  UPDATE lead_stages SET auto_promote_to_deal = TRUE
   WHERE slug = 'sales' AND NOT auto_promote_to_deal;

  UPDATE lead_stages SET is_inquiry_default = TRUE
   WHERE slug = 'generation' AND NOT is_inquiry_default;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 AND NOT EXISTS (
    SELECT 1 FROM lead_stages WHERE is_inquiry_default AND deleted_at IS NULL
  ) THEN v_missing := v_missing || 'lead_stages.is_inquiry_default'::TEXT; END IF;

  UPDATE lead_stages SET is_qualification = TRUE
   WHERE slug = 'qualification' AND NOT is_qualification;

  -- --------------------------------------------------------
  -- リードの流入元
  -- --------------------------------------------------------
  UPDATE lead_sources SET is_inquiry_default = TRUE
   WHERE slug = 'web_form' AND NOT is_inquiry_default;
  UPDATE lead_sources SET is_inbound_inquiry = TRUE
   WHERE slug = 'web_form' AND NOT is_inbound_inquiry;
  UPDATE lead_sources SET is_card_import_default = TRUE
   WHERE slug = 'eight' AND NOT is_card_import_default;

  -- --------------------------------------------------------
  -- 取引先の種別・ステータス
  -- --------------------------------------------------------
  UPDATE account_types SET requires_corporate_fields = TRUE
   WHERE slug IN ('corporate', 'government') AND NOT requires_corporate_fields;
  UPDATE account_types SET is_company_default = TRUE
   WHERE slug = 'corporate' AND NOT is_company_default;
  UPDATE account_types SET is_sole_proprietor_default = TRUE
   WHERE slug = 'sole_proprietor' AND NOT is_sole_proprietor_default;

  UPDATE account_statuses SET is_active_default = TRUE
   WHERE code = 'active' AND NOT is_active_default;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 AND NOT EXISTS (
    SELECT 1 FROM account_statuses WHERE is_active_default AND deleted_at IS NULL
  ) THEN v_missing := v_missing || 'account_statuses.is_active_default'::TEXT; END IF;

  UPDATE account_statuses SET is_churned_default = TRUE
   WHERE code = 'churned' AND NOT is_churned_default;
  UPDATE account_statuses SET is_prospect_default = TRUE
   WHERE code = 'prospect' AND NOT is_prospect_default;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 AND NOT EXISTS (
    SELECT 1 FROM account_statuses WHERE is_prospect_default AND deleted_at IS NULL
  ) THEN v_missing := v_missing || 'account_statuses.is_prospect_default'::TEXT; END IF;

  -- --------------------------------------------------------
  -- 事業者・連絡先
  -- --------------------------------------------------------
  UPDATE company_statuses SET is_new_default = TRUE
   WHERE code = 'unverified' AND NOT is_new_default;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 AND NOT EXISTS (
    SELECT 1 FROM company_statuses WHERE is_new_default AND deleted_at IS NULL
  ) THEN v_missing := v_missing || 'company_statuses.is_new_default'::TEXT; END IF;

  UPDATE contact_statuses SET is_new_default = TRUE
   WHERE name = 'アクティブ' AND NOT is_new_default;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 AND NOT EXISTS (
    SELECT 1 FROM contact_statuses WHERE is_new_default AND deleted_at IS NULL
  ) THEN v_missing := v_missing || 'contact_statuses.is_new_default'::TEXT; END IF;

  UPDATE corporate_types SET is_sole_proprietor = TRUE
   WHERE name = '個人事業主' AND NOT is_sole_proprietor;

  -- --------------------------------------------------------
  -- リードのカテゴリ・ステータス・活動種別
  -- --------------------------------------------------------
  UPDATE lead_categories SET progress_view = 'inquiry'  WHERE code = 'inquiry'  AND progress_view IS DISTINCT FROM 'inquiry';
  UPDATE lead_categories SET progress_view = 'inbound'  WHERE code = 'mql'      AND progress_view IS DISTINCT FROM 'inbound';
  UPDATE lead_categories SET progress_view = 'outbound' WHERE code = 'tql'      AND progress_view IS DISTINCT FROM 'outbound';
  UPDATE lead_categories SET is_sales_qualified = TRUE  WHERE code = 'sql'      AND NOT is_sales_qualified;

  UPDATE lead_statuses SET is_inquiry_initial = TRUE
   WHERE code = 'not_started' AND NOT is_inquiry_initial;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 AND NOT EXISTS (
    SELECT 1 FROM lead_statuses WHERE is_inquiry_initial AND deleted_at IS NULL
  ) THEN v_missing := v_missing || 'lead_statuses.is_inquiry_initial'::TEXT; END IF;

  UPDATE lead_statuses SET is_card_import_initial = TRUE
   WHERE code = 'card_exchanged' AND NOT is_card_import_initial;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 AND NOT EXISTS (
    SELECT 1 FROM lead_statuses WHERE is_card_import_initial AND deleted_at IS NULL
  ) THEN v_missing := v_missing || 'lead_statuses.is_card_import_initial'::TEXT; END IF;

  UPDATE lead_activity_types SET is_card_exchange = TRUE
   WHERE code = 'card_exchange' AND NOT is_card_exchange;
  UPDATE lead_call_statuses SET is_card_exchange = TRUE
   WHERE code = 'card_exchange' AND NOT is_card_exchange;
  UPDATE lead_customer_activity_types SET is_form_submit = TRUE
   WHERE code = 'form_submit' AND NOT is_form_submit;

  -- --------------------------------------------------------
  -- パイプライン
  -- --------------------------------------------------------
  UPDATE pipeline_types SET is_default = TRUE
   WHERE slug = 'sales' AND NOT is_default;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 AND NOT EXISTS (
    SELECT 1 FROM pipeline_types WHERE is_default AND deleted_at IS NULL
  ) THEN v_missing := v_missing || 'pipeline_types.is_default'::TEXT; END IF;

  -- --------------------------------------------------------
  -- システム必須（役割を持つ行は消させない）
  --
  -- **役割フラグを立てた「後」に判定する。** 順序を入れ替えると
  -- 必須の印が付かず、消せてしまう
  -- --------------------------------------------------------
  UPDATE account_statuses SET is_system_required = TRUE
   WHERE (is_active_default OR is_churned_default OR is_prospect_default)
     AND NOT is_system_required;
  UPDATE company_statuses SET is_system_required = TRUE
   WHERE is_new_default AND NOT is_system_required;
  UPDATE contact_statuses SET is_system_required = TRUE
   WHERE is_new_default AND NOT is_system_required;
  UPDATE corporate_types SET is_system_required = TRUE
   WHERE is_sole_proprietor AND NOT is_system_required;
  UPDATE lead_activity_types SET is_system_required = TRUE
   WHERE is_card_exchange AND NOT is_system_required;
  UPDATE lead_call_statuses SET is_system_required = TRUE
   WHERE is_card_exchange AND NOT is_system_required;
  UPDATE lead_customer_activity_types SET is_system_required = TRUE
   WHERE is_form_submit AND NOT is_system_required;
  UPDATE lead_statuses SET is_system_required = TRUE
   WHERE (is_inquiry_initial OR is_card_import_initial) AND NOT is_system_required;
  UPDATE lead_categories SET is_system_required = TRUE
   WHERE deleted_at IS NULL AND NOT is_system_required;
  UPDATE lead_stages SET is_system_required = TRUE
   WHERE deleted_at IS NULL AND NOT is_system_required
     AND (requires_deal OR requires_contract OR is_terminal
          OR auto_promote_to_deal OR is_inquiry_default OR is_qualification);
  UPDATE account_types SET is_system_required = TRUE
   WHERE deleted_at IS NULL AND NOT is_system_required
     AND (is_company_default OR is_sole_proprietor_default);
  UPDATE pipeline_types SET is_system_required = TRUE
   WHERE is_default AND NOT is_system_required;

  IF array_length(v_missing, 1) > 0 THEN
    RETURN '未設定: ' || array_to_string(v_missing, ', ');
  END IF;
  RETURN 'すべて設定済み';
END;
$$;

COMMENT ON FUNCTION apply_master_role_flags IS
'マスタの役割フラグを設定する（冪等）。seed の末尾と、本番で空振りした際の復旧に使う';

-- 本番はマスタが入っているのでここで当たる。
-- ローカルの `db reset` では 0 行のまま通り、seed の末尾で改めて当たる
DO $$
DECLARE v_result TEXT;
BEGIN
  SELECT apply_master_role_flags() INTO v_result;
  RAISE NOTICE '役割フラグ: %', v_result;
END $$;
