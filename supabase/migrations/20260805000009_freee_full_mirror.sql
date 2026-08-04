-- ============================================================
-- freee 取引先のミラーを全項目に広げ、CRM に正本がある項目を同期対象に足す
--
-- 背景（2026-08-04 の指摘）:
--   freee の取引先は 25 項目（＋ネスト）あるのに、取り込んでいたのは 16 項目、
--   同期していたのは 9 項目だった。何が繋がっていて何が繋がっていないのかを
--   洗い出したうえで、次の方針に決めた。
--
-- 方針:
--   - **freee にしかない項目はミラー（freee_partners）に取り込むだけ。**
--     CRM に正本が無いものを companies へ持たせても二重管理になる
--     （支払条件・請求条件・書類送付・ショートカット・敬称・振込関係）
--   - **CRM に正本がある項目は差分同期の対象にする**
--     （法人/個人・担当者名・担当者メール・インボイス適格・口座情報）
--   - 口座情報は CRM の `financial_info` とほぼ 1 対 1 で対応する。
--     **振込に直結する情報**なので、二重管理を残さない
-- ============================================================

-- ------------------------------------------------------------
-- 1. ミラーの拡張
-- ------------------------------------------------------------
ALTER TABLE freee_partners
  -- 検索用ショートカット・敬称
  ADD COLUMN IF NOT EXISTS shortcut1                  TEXT,
  ADD COLUMN IF NOT EXISTS shortcut2                  TEXT,
  ADD COLUMN IF NOT EXISTS default_title              TEXT,
  -- 一括振込ファイル用
  ADD COLUMN IF NOT EXISTS payer_walletable_id        BIGINT,
  ADD COLUMN IF NOT EXISTS transfer_fee_handling_side TEXT,
  -- 請求書の送付方法
  ADD COLUMN IF NOT EXISTS doc_sending_method         TEXT,
  -- 口座（partner_bank_account_attributes）
  ADD COLUMN IF NOT EXISTS bank_name                  TEXT,
  ADD COLUMN IF NOT EXISTS bank_name_kana             TEXT,
  ADD COLUMN IF NOT EXISTS bank_code                  TEXT,
  ADD COLUMN IF NOT EXISTS branch_name                TEXT,
  ADD COLUMN IF NOT EXISTS branch_kana                TEXT,
  ADD COLUMN IF NOT EXISTS branch_code                TEXT,
  ADD COLUMN IF NOT EXISTS account_type               TEXT,
  ADD COLUMN IF NOT EXISTS account_number             TEXT,
  ADD COLUMN IF NOT EXISTS account_name               TEXT,
  ADD COLUMN IF NOT EXISTS long_account_name          TEXT,
  -- 支払条件（payment_term_attributes）
  ADD COLUMN IF NOT EXISTS payment_cutoff_day         SMALLINT,
  ADD COLUMN IF NOT EXISTS payment_additional_months  SMALLINT,
  ADD COLUMN IF NOT EXISTS payment_fixed_day          SMALLINT,
  -- 請求条件（invoice_payment_term_attributes）
  ADD COLUMN IF NOT EXISTS invoice_cutoff_day         SMALLINT,
  ADD COLUMN IF NOT EXISTS invoice_additional_months  SMALLINT,
  ADD COLUMN IF NOT EXISTS invoice_fixed_day          SMALLINT;

COMMENT ON COLUMN freee_partners.account_type IS
'freee の口座種別（ordinary: 普通 / checking: 当座 / earmarked: 納税準備 / savings: 貯蓄）。CRM は ordinary / current / savings なので変換が要る';
COMMENT ON COLUMN freee_partners.payment_cutoff_day IS
'締日。29〜31 の月末指定は 32 で表す（freee の仕様）';

-- ------------------------------------------------------------
-- 2. 取り込みを全項目に広げる
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION upsert_freee_partners(
  p_freee_company_id BIGINT,
  p_rows             JSONB,
  p_full             BOOLEAN DEFAULT FALSE
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row          JSONB;
  v_upserted     INTEGER := 0;
  v_auto_linked  INTEGER := 0;
  v_marked       INTEGER := 0;
  v_seen_ids     BIGINT[] := '{}';
  r              RECORD;
  v_company_id   UUID;
  v_account_id   UUID;
  v_account_cnt  INTEGER;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(COALESCE(p_rows, '[]'::JSONB))
  LOOP
    INSERT INTO freee_partners (
      freee_company_id, freee_partner_id,
      name, code, long_name, name_kana, org_code, country_code,
      phone, contact_name, email,
      qualified_invoice_issuer, invoice_registration_number,
      address_zipcode, address_prefecture_code, address_street_name1, address_street_name2,
      available, freee_update_date, synced_at,
      shortcut1, shortcut2, default_title,
      payer_walletable_id, transfer_fee_handling_side, doc_sending_method,
      bank_name, bank_name_kana, bank_code, branch_name, branch_kana, branch_code,
      account_type, account_number, account_name, long_account_name,
      payment_cutoff_day, payment_additional_months, payment_fixed_day,
      invoice_cutoff_day, invoice_additional_months, invoice_fixed_day
    ) VALUES (
      p_freee_company_id,
      (v_row ->> 'freee_partner_id')::BIGINT,
      v_row ->> 'name',
      NULLIF(v_row ->> 'code', ''),
      NULLIF(v_row ->> 'long_name', ''),
      NULLIF(v_row ->> 'name_kana', ''),
      (v_row ->> 'org_code')::SMALLINT,
      NULLIF(v_row ->> 'country_code', ''),
      NULLIF(v_row ->> 'phone', ''),
      NULLIF(v_row ->> 'contact_name', ''),
      NULLIF(v_row ->> 'email', ''),
      (v_row ->> 'qualified_invoice_issuer')::BOOLEAN,
      NULLIF(v_row ->> 'invoice_registration_number', ''),
      NULLIF(v_row ->> 'address_zipcode', ''),
      (v_row ->> 'address_prefecture_code')::SMALLINT,
      NULLIF(v_row ->> 'address_street_name1', ''),
      NULLIF(v_row ->> 'address_street_name2', ''),
      COALESCE((v_row ->> 'available')::BOOLEAN, TRUE),
      (v_row ->> 'freee_update_date')::DATE,
      now(),
      NULLIF(v_row ->> 'shortcut1', ''),
      NULLIF(v_row ->> 'shortcut2', ''),
      NULLIF(v_row ->> 'default_title', ''),
      (v_row ->> 'payer_walletable_id')::BIGINT,
      NULLIF(v_row ->> 'transfer_fee_handling_side', ''),
      NULLIF(v_row ->> 'doc_sending_method', ''),
      NULLIF(v_row ->> 'bank_name', ''),
      NULLIF(v_row ->> 'bank_name_kana', ''),
      NULLIF(v_row ->> 'bank_code', ''),
      NULLIF(v_row ->> 'branch_name', ''),
      NULLIF(v_row ->> 'branch_kana', ''),
      NULLIF(v_row ->> 'branch_code', ''),
      NULLIF(v_row ->> 'account_type', ''),
      NULLIF(v_row ->> 'account_number', ''),
      NULLIF(v_row ->> 'account_name', ''),
      NULLIF(v_row ->> 'long_account_name', ''),
      (v_row ->> 'payment_cutoff_day')::SMALLINT,
      (v_row ->> 'payment_additional_months')::SMALLINT,
      (v_row ->> 'payment_fixed_day')::SMALLINT,
      (v_row ->> 'invoice_cutoff_day')::SMALLINT,
      (v_row ->> 'invoice_additional_months')::SMALLINT,
      (v_row ->> 'invoice_fixed_day')::SMALLINT
    )
    ON CONFLICT (freee_company_id, freee_partner_id) DO UPDATE SET
      name                        = EXCLUDED.name,
      code                        = EXCLUDED.code,
      long_name                   = EXCLUDED.long_name,
      name_kana                   = EXCLUDED.name_kana,
      org_code                    = EXCLUDED.org_code,
      country_code                = EXCLUDED.country_code,
      phone                       = EXCLUDED.phone,
      contact_name                = EXCLUDED.contact_name,
      email                       = EXCLUDED.email,
      qualified_invoice_issuer    = EXCLUDED.qualified_invoice_issuer,
      invoice_registration_number = EXCLUDED.invoice_registration_number,
      address_zipcode             = EXCLUDED.address_zipcode,
      address_prefecture_code     = EXCLUDED.address_prefecture_code,
      address_street_name1        = EXCLUDED.address_street_name1,
      address_street_name2        = EXCLUDED.address_street_name2,
      available                   = EXCLUDED.available,
      freee_update_date           = EXCLUDED.freee_update_date,
      shortcut1                   = EXCLUDED.shortcut1,
      shortcut2                   = EXCLUDED.shortcut2,
      default_title               = EXCLUDED.default_title,
      payer_walletable_id         = EXCLUDED.payer_walletable_id,
      transfer_fee_handling_side  = EXCLUDED.transfer_fee_handling_side,
      doc_sending_method          = EXCLUDED.doc_sending_method,
      bank_name                   = EXCLUDED.bank_name,
      bank_name_kana              = EXCLUDED.bank_name_kana,
      bank_code                   = EXCLUDED.bank_code,
      branch_name                 = EXCLUDED.branch_name,
      branch_kana                 = EXCLUDED.branch_kana,
      branch_code                 = EXCLUDED.branch_code,
      account_type                = EXCLUDED.account_type,
      account_number              = EXCLUDED.account_number,
      account_name                = EXCLUDED.account_name,
      long_account_name           = EXCLUDED.long_account_name,
      payment_cutoff_day          = EXCLUDED.payment_cutoff_day,
      payment_additional_months   = EXCLUDED.payment_additional_months,
      payment_fixed_day           = EXCLUDED.payment_fixed_day,
      invoice_cutoff_day          = EXCLUDED.invoice_cutoff_day,
      invoice_additional_months   = EXCLUDED.invoice_additional_months,
      invoice_fixed_day           = EXCLUDED.invoice_fixed_day,
      freee_deleted_at            = NULL,
      synced_at                   = now();

    v_upserted := v_upserted + 1;
    v_seen_ids := v_seen_ids || (v_row ->> 'freee_partner_id')::BIGINT;
  END LOOP;

  -- 自動紐付け（インボイス番号一致のみ）は従来どおり
  FOR r IN
    SELECT fp.id, fp.invoice_registration_number, fp.corporate_number
      FROM freee_partners fp
     WHERE fp.freee_company_id = p_freee_company_id
       AND fp.link_status = 'unlinked'
       AND (fp.invoice_registration_number IS NOT NULL OR fp.corporate_number IS NOT NULL)
  LOOP
    v_company_id := NULL;

    IF r.invoice_registration_number IS NOT NULL THEN
      SELECT c.id INTO v_company_id FROM companies c
       WHERE c.invoice_registration_number = r.invoice_registration_number
         AND c.deleted_at IS NULL
       LIMIT 1;
    END IF;

    IF v_company_id IS NULL AND r.corporate_number IS NOT NULL THEN
      SELECT c.id INTO v_company_id FROM companies c
       WHERE c.corporate_number = r.corporate_number
         AND c.invoice_registration_number IS NULL
         AND c.deleted_at IS NULL
       LIMIT 1;
    END IF;

    IF v_company_id IS NOT NULL THEN
      SELECT count(*), min(a.id::TEXT)::UUID
        INTO v_account_cnt, v_account_id
        FROM accounts a
       WHERE a.company_id = v_company_id AND a.deleted_at IS NULL;

      UPDATE freee_partners
         SET link_status = 'auto',
             company_id  = v_company_id,
             account_id  = CASE WHEN v_account_cnt = 1 THEN v_account_id END,
             linked_at   = now(),
             linked_by   = NULL
       WHERE id = r.id;
      v_auto_linked := v_auto_linked + 1;
    END IF;
  END LOOP;

  IF p_full THEN
    UPDATE freee_partners
       SET freee_deleted_at = now()
     WHERE freee_company_id = p_freee_company_id
       AND freee_deleted_at IS NULL
       AND NOT (freee_partner_id = ANY (v_seen_ids));
    GET DIAGNOSTICS v_marked = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'upserted', v_upserted,
    'auto_linked', v_auto_linked,
    'marked_deleted', v_marked
  );
END;
$$;

ALTER FUNCTION upsert_freee_partners(BIGINT, JSONB, BOOLEAN)
  SET statement_timeout = '120s';
REVOKE ALL ON FUNCTION upsert_freee_partners(BIGINT, JSONB, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_freee_partners(BIGINT, JSONB, BOOLEAN) TO service_role;

-- ------------------------------------------------------------
-- 3. 口座種別の対応
--
-- freee: ordinary / checking / earmarked / savings
-- CRM  : ordinary / current / savings
-- 当座は freee が checking、CRM が current。納税準備預金は CRM に無い
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION freee_account_type_to_crm(p_type TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE btrim(COALESCE(p_type, ''))
    WHEN 'ordinary'  THEN 'ordinary'
    WHEN 'checking'  THEN 'current'
    WHEN 'savings'   THEN 'savings'
    -- earmarked（納税準備預金）は CRM に該当が無い。普通預金として扱わず落とす
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION crm_account_type_to_freee(p_type TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE btrim(COALESCE(p_type, ''))
    WHEN 'ordinary' THEN 'ordinary'
    WHEN 'current'  THEN 'checking'
    WHEN 'savings'  THEN 'savings'
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION freee_account_type_to_crm IS
'freee の口座種別を CRM の値へ。当座は checking→current。納税準備預金は CRM に無いので NULL';
