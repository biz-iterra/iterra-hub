-- ============================================================
-- 商談にリードを紐づける土台（T-0069）
--
--   `deals` に `lead_id` が無く、商談側からリードを辿れなかった。
--   逆引きは `leads.promoted_deal_id` の 1 本だけで、**1 リード 1 商談**しか
--   表せない（2 回目以降の商談をリードに紐づけられない）。
--
--   `deals.lead_id` を**紐づけの正本**にし、`promoted_deal_id` は
--   「最初に紐づいた商談」の派生値へ降格する（次のマイグレーションで
--   トリガーが維持する）。**列は落とさない。** 撤去すると DB オブジェクト 6 個・
--   UI 3 箇所・E2E 4 本に一斉波及するため、降格にとどめて二重管理の実害だけ消す。
--
--   必須条件は `pipeline_types.requires_lead`、「商談を起こしてよい段階」は
--   `lead_stages.is_deal_ready` で表す。**「TQL」「営業」という語を DB に入れない**
--   ので、パイプラインを増やしても、リードカテゴリの呼び名を変えても影響しない。
-- ============================================================

-- ------------------------------------------------------------
-- 1. deals.lead_id
-- ------------------------------------------------------------
ALTER TABLE deals ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id);

COMMENT ON COLUMN deals.lead_id IS
'この商談の元になったリード。**紐づけの正本**。1 リードに複数の商談が下がる。leads.promoted_deal_id は「最初に紐づいた商談」の派生値';

COMMENT ON COLUMN leads.promoted_deal_id IS
'【派生値】最初に紐づいた商談。正本は deals.lead_id で、トリガー sync_lead_promoted_deal が維持する。アプリから書かない';

CREATE INDEX IF NOT EXISTS deals_lead_idx
  ON deals (lead_id)
  WHERE lead_id IS NOT NULL AND deleted_at IS NULL;

-- ------------------------------------------------------------
-- 2. 既存商談の移行
--
--   `promoted_deal_id` は**非 UNIQUE** なので、同じ商談を指すリードが
--   複数ありうる。最古のリードを採る。
-- ------------------------------------------------------------
DO $$
DECLARE
  v_n INTEGER;
BEGIN
  UPDATE deals d
     SET lead_id = x.lead_id
    FROM (
      SELECT DISTINCT ON (promoted_deal_id)
             promoted_deal_id, id AS lead_id
        FROM leads
       WHERE promoted_deal_id IS NOT NULL
         AND deleted_at IS NULL
       ORDER BY promoted_deal_id, created_at
    ) x
   WHERE d.id = x.promoted_deal_id
     AND d.lead_id IS NULL;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE '既存商談にリードを紐づけた: % 件', v_n;
END;
$$;

-- ------------------------------------------------------------
-- 3. 規則を表すフラグ
--
--   **どちらもパイプライン／ステージが持つ「規則」**であって、
--   「どのパイプラインか」「どのステージか」を表す同一性フラグではない。
--   `lead_stages.requires_deal` / `requires_contract` と同じ流儀。
-- ------------------------------------------------------------
ALTER TABLE pipeline_types
  ADD COLUMN IF NOT EXISTS requires_lead BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN pipeline_types.requires_lead IS
'このパイプラインの商談は元になったリードを必須にする。check_deal_lead_requirement が強制する';

ALTER TABLE lead_stages
  ADD COLUMN IF NOT EXISTS is_deal_ready BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN lead_stages.is_deal_ready IS
'この段階のリードは商談を起こしてよい（選定 = TQL 以上）。獲得・育成・Dead は FALSE';

-- ------------------------------------------------------------
-- 4. 役割フラグの適用
--
--   **`apply_master_role_flags()` に足す。** ここが code / slug で名指しして
--   よい唯一の場所で、マイグレーション末尾と seed 末尾の両方から呼ばれる。
--   マイグレーション内で直に `UPDATE ... WHERE slug='...'` を書くと、
--   `db reset` では行がまだ無く 0 行更新になり、静かに空振りする（T-0053）。
--
--   既存の全文に 3 点だけ足したもの。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_master_role_flags()
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

-- 本番はここで当たる。db reset では seed の末尾が同じ関数を呼ぶ
DO $$
DECLARE
  v_result TEXT;
BEGIN
  SELECT apply_master_role_flags() INTO v_result;
  RAISE NOTICE '役割フラグ: %', v_result;
END;
$$;

-- ------------------------------------------------------------
-- 5. 規則の導入前からある「リードの無い商談」を見えるようにする
--
--   既存商談は遡って埋めない（業務判断が要る）。止めもしない。
--   代わりに一覧で見えるようにして、人が画面から紐づけられるようにする。
--   `v_lead_stage_violations` と同じ考え方。
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_deals_without_lead
WITH (security_invoker = true) AS
SELECT d.id            AS deal_id,
       d.deal_code,
       d.name          AS deal_name,
       p.name          AS pipeline_name,
       d.owner_user_id,
       d.created_at
  FROM deals d
  JOIN pipeline_types p ON p.id = d.pipeline_type_id
 WHERE d.deleted_at IS NULL
   AND p.requires_lead
   AND d.lead_id IS NULL;

COMMENT ON VIEW v_deals_without_lead IS
'リードを要求するパイプラインなのに、元になったリードが無い商談。規則の導入前からある行';
