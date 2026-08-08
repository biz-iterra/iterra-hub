-- ============================================================
-- パイプラインごとの画面と、仕入れ・業務委託のステージ（T-0073 / T-0074）
--
--   利用者の判断: 商談（セールス）と仕入れ・業務委託は性質が異なるので
--   画面を分ける。
--
--     営業     → セールス       /sales
--     仕入れ   → プロキュアメント /procurement
--     業務委託 → パートナーシップ /partnership
--
--   **仕入れ・業務委託はステージもステータスも 0 件だった。**
--   seed にあるのは営業だけで、選ぶとカンバンが列ゼロになり、
--   ステージ・ステータスが必須の商談は作れない。画面を分ける前に埋める。
-- ============================================================

-- ------------------------------------------------------------
-- 1. 画面とパイプラインの対応
--
--   **slug では引かない。** `20260805000019` で自動採番になり
--   「引くな」とされている。`lead_categories.progress_view` と同じ形で
--   「どの画面に出すか」を持たせる。
--
--   画面を増やすときは CHECK に足す（列は増やさない）。
-- ------------------------------------------------------------
ALTER TABLE pipeline_types
  ADD COLUMN IF NOT EXISTS screen_key TEXT
    CHECK (screen_key IN ('sales', 'procurement', 'partnership'));

COMMENT ON COLUMN pipeline_types.screen_key IS
'このパイプラインを出す画面（/sales /procurement /partnership）。NULL なら専用画面を持たない';

-- 1 画面につき 1 パイプライン
CREATE UNIQUE INDEX IF NOT EXISTS uq_pipeline_types_screen_key
  ON pipeline_types (screen_key)
  WHERE screen_key IS NOT NULL AND deleted_at IS NULL;

-- ------------------------------------------------------------
-- 2. 仕入れ・業務委託のステージとステータス
--
--   **マイグレーションと seed の両方に書く。** seed は `db reset` でしか
--   走らず、本番はマイグレーションでしか当たらない（T-0053 の型）。
--   ここは `ON CONFLICT DO NOTHING` で冪等にする。
--
--   UUID は seed と同じ固定値。定義側で固定するのは既存の流儀
--   （参照側で UUID を直書きしないのとは別の話）。
-- ------------------------------------------------------------
-- **関数にして `apply_master_role_flags()` から呼ぶ。**
--   `db reset` は「マイグレーション → seed」の順なので、マイグレーションの
--   本文で INSERT すると **pipeline_types の行がまだ無く外部キー違反**になる
--   （T-0053 と同じ構造）。冪等な関数にして、マイグレーション末尾と
--   seed 末尾の両方から呼ばれる入口に繋ぐ。
CREATE OR REPLACE FUNCTION ensure_pipeline_stages()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $stages$
DECLARE
  v_n INTEGER := 0;
  v_added INTEGER;
BEGIN
  -- パイプラインがまだ無ければ何もしない（seed の後に呼ばれれば入る）
  IF NOT EXISTS (
    SELECT 1 FROM pipeline_types
     WHERE id IN ('b0000000-0000-0000-0000-000000000002',
                  'b0000000-0000-0000-0000-000000000003')
  ) THEN
    RETURN 'パイプライン未投入のためスキップ';
  END IF;

  INSERT INTO deal_stages (id, pipeline_type_id, name, current_situation, required_action, sort_order) VALUES
    -- 仕入れ（プロキュアメント）
    ('f2000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', '候補',       '仕入れ先の候補として把握している', '扱う商材と条件のあたりを付ける', 1),
    ('f2000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', '問い合わせ', '先方へ問い合わせ済み',             '担当者と要件をすり合わせる',     2),
    ('f2000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002', '見積り',     '見積りを受領した',                 '価格・納期・数量を検討する',     3),
    ('f2000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000002', '交渉',       '条件を交渉している',               '取引条件を確定させる',           4),
    ('f2000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000002', '発注',       '発注済み',                         '納品・検収を待つ',               5),
    ('f2000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000002', '完了',       '取引が完了した',                   '支払いまで完了させる',           6),
    -- 業務委託（パートナーシップ）
    ('f3000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', '候補',       '委託先の候補として把握している',   'できることと稼働の見込みを掴む', 1),
    ('f3000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000003', '打診',       '先方へ打診済み',                   '案件の内容と関心を確かめる',     2),
    ('f3000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000003', '条件調整',   '報酬・期間・範囲を調整している',   '双方が合意できる条件にまとめる', 3),
    ('f3000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000003', '契約',       '契約手続き中',                     '契約を締結する',                 4),
    ('f3000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000003', '稼働',       '稼働している',                     '進行と品質を見る',               5),
    ('f3000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000003', '完了',       '委託が完了した',                   '検収と支払いを完了させる',       6)
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_added = ROW_COUNT;
  v_n := v_n + v_added;

  INSERT INTO deal_statuses (id, name, pipeline_type_id, deal_stage_id, sort_order) VALUES
    -- 仕入れ
    ('f4000000-0000-0000-0000-000000000001', '未接触',     'b0000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000001', 1),
    ('f4000000-0000-0000-0000-000000000002', '情報収集中', 'b0000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000001', 2),
    ('f4000000-0000-0000-0000-000000000003', '回答待ち',   'b0000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000002', 1),
    ('f4000000-0000-0000-0000-000000000004', '比較中',     'b0000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000003', 1),
    ('f4000000-0000-0000-0000-000000000005', '交渉中',     'b0000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000004', 1),
    ('f4000000-0000-0000-0000-000000000006', '発注済み',   'b0000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000005', 1),
    ('f4000000-0000-0000-0000-000000000007', '納品済み',   'b0000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000006', 1),
    ('f4000000-0000-0000-0000-000000000008', '見送り',     'b0000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000006', 2),
    -- 業務委託
    ('f5000000-0000-0000-0000-000000000001', '未接触',     'b0000000-0000-0000-0000-000000000003', 'f3000000-0000-0000-0000-000000000001', 1),
    ('f5000000-0000-0000-0000-000000000002', '情報収集中', 'b0000000-0000-0000-0000-000000000003', 'f3000000-0000-0000-0000-000000000001', 2),
    ('f5000000-0000-0000-0000-000000000003', '回答待ち',   'b0000000-0000-0000-0000-000000000003', 'f3000000-0000-0000-0000-000000000002', 1),
    ('f5000000-0000-0000-0000-000000000004', '調整中',     'b0000000-0000-0000-0000-000000000003', 'f3000000-0000-0000-0000-000000000003', 1),
    ('f5000000-0000-0000-0000-000000000005', '締結手続き中','b0000000-0000-0000-0000-000000000003', 'f3000000-0000-0000-0000-000000000004', 1),
    ('f5000000-0000-0000-0000-000000000006', '稼働中',     'b0000000-0000-0000-0000-000000000003', 'f3000000-0000-0000-0000-000000000005', 1),
    ('f5000000-0000-0000-0000-000000000007', '検収済み',   'b0000000-0000-0000-0000-000000000003', 'f3000000-0000-0000-0000-000000000006', 1),
    ('f5000000-0000-0000-0000-000000000008', '見送り',     'b0000000-0000-0000-0000-000000000003', 'f3000000-0000-0000-0000-000000000006', 2)
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_added = ROW_COUNT;
  v_n := v_n + v_added;

  RETURN 'ステージ・ステータスを ' || v_n || ' 件追加';
END;
$stages$;

COMMENT ON FUNCTION ensure_pipeline_stages IS
'仕入れ・業務委託のステージとステータスを冪等に投入する。apply_master_role_flags から呼ばれ、db reset でも本番でも当たる';

-- ------------------------------------------------------------
-- 3. 画面の割り当て
--
--   **`apply_master_role_flags()` に足す。** ここが code / slug で
--   名指ししてよい唯一の場所で、マイグレーション末尾と seed 末尾の
--   両方から呼ばれる。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION apply_pipeline_screen_keys()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_missing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  UPDATE pipeline_types SET screen_key = 'sales'
   WHERE slug = 'sales' AND screen_key IS DISTINCT FROM 'sales';
  UPDATE pipeline_types SET screen_key = 'procurement'
   WHERE slug = 'procurement' AND screen_key IS DISTINCT FROM 'procurement';
  UPDATE pipeline_types SET screen_key = 'partnership'
   WHERE slug = 'outsourcing' AND screen_key IS DISTINCT FROM 'partnership';

  -- **slug は「業務委託」= outsourcing のまま。** 画面名（パートナーシップ）と
  -- 内部名がずれるが、slug を書き換えると account_role_types の対応や
  -- 過去のマイグレーションの前提が崩れる（UI 表示名と内部名を分ける方針）
  IF NOT EXISTS (SELECT 1 FROM pipeline_types WHERE screen_key = 'sales' AND deleted_at IS NULL) THEN
    v_missing := v_missing || 'pipeline_types.screen_key=sales'::TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pipeline_types WHERE screen_key = 'procurement' AND deleted_at IS NULL) THEN
    v_missing := v_missing || 'pipeline_types.screen_key=procurement'::TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pipeline_types WHERE screen_key = 'partnership' AND deleted_at IS NULL) THEN
    v_missing := v_missing || 'pipeline_types.screen_key=partnership'::TEXT;
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RETURN '未設定: ' || array_to_string(v_missing, ', ');
  END IF;
  RETURN 'すべて設定済み';
END;
$$;

COMMENT ON FUNCTION apply_pipeline_screen_keys IS
'パイプラインに画面（screen_key）を割り当てる。apply_master_role_flags から呼ばれ、マイグレーションと seed の両方で当たる';

-- ------------------------------------------------------------
-- 4. 役割フラグの適用を 2 段にする
--
--   `apply_master_role_flags()` は**マイグレーション末尾と seed 末尾の
--   両方から呼ばれる唯一の入口**。ここに画面の割り当てを繋ぐと
--   `db reset` でも本番でも当たる（T-0053 の型）。
--
--   既存の中身は `apply_master_role_flags_core()` へ移し、
--   入口は 2 つを呼ぶだけにする。次に役割フラグを足すときは
--   `_core` の方を書き換える。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION apply_master_role_flags_core()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- 商談を起こしてよい段階（選定 = TQL 以上）。
  -- **新しい名指しを増やさず既存フラグから導く。** Dead が自動で外れるのが効く
  UPDATE lead_stages SET is_deal_ready = TRUE
   WHERE (is_qualification OR requires_deal) AND NOT is_deal_ready;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 AND NOT EXISTS (
    SELECT 1 FROM lead_stages WHERE is_deal_ready AND deleted_at IS NULL
  ) THEN v_missing := v_missing || 'lead_stages.is_deal_ready'::TEXT; END IF;

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

  -- セールスの商談は元になったリードを必須にする（T-0069）
  UPDATE pipeline_types SET requires_lead = TRUE
   WHERE slug = 'sales' AND NOT requires_lead;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 AND NOT EXISTS (
    SELECT 1 FROM pipeline_types WHERE requires_lead AND deleted_at IS NULL
  ) THEN v_missing := v_missing || 'pipeline_types.requires_lead'::TEXT; END IF;
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
          OR auto_promote_to_deal OR is_inquiry_default OR is_qualification
          OR is_deal_ready);
  UPDATE account_types SET is_system_required = TRUE
   WHERE deleted_at IS NULL AND NOT is_system_required
     AND (is_company_default OR is_sole_proprietor_default);
  UPDATE pipeline_types SET is_system_required = TRUE
   WHERE (is_default OR requires_lead) AND NOT is_system_required;

  IF array_length(v_missing, 1) > 0 THEN
    RETURN '未設定: ' || array_to_string(v_missing, ', ');
  END IF;
  RETURN 'すべて設定済み';
END;
$function$;

CREATE OR REPLACE FUNCTION apply_master_role_flags()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $outer$
DECLARE
  v_flags   TEXT;
  v_screens TEXT;
BEGIN
  SELECT apply_master_role_flags_core() INTO v_flags;
  -- **順序が要る。** ステージを入れてから画面を割り当てる
  PERFORM ensure_pipeline_stages();
  SELECT apply_pipeline_screen_keys()   INTO v_screens;

  IF v_flags = 'すべて設定済み' AND v_screens = 'すべて設定済み' THEN
    RETURN 'すべて設定済み';
  END IF;
  RETURN btrim(
    CASE WHEN v_flags   <> 'すべて設定済み' THEN v_flags   || ' / ' ELSE '' END ||
    CASE WHEN v_screens <> 'すべて設定済み' THEN v_screens          ELSE '' END,
    ' /'
  );
END;
$outer$;

DO $$
DECLARE
  v_result TEXT;
BEGIN
  SELECT apply_master_role_flags() INTO v_result;
  RAISE NOTICE 'マスタの役割・画面: %', v_result;
END;
$$;
