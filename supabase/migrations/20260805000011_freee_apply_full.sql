-- ============================================================
-- 追加した項目を freee → CRM へ取り込めるようにする
--
-- 対象: 適格請求書発行事業者 / 法人・個人 / 口座情報。
-- 「取り込む」で人が選んだものだけを書く（自動では動かない）。
--
-- **担当者名とメールは取り込まない。** freee は氏名を 1 項目で持ち、
-- 姓とミドル名と名の切れ目が分からない。連絡先を書き換えると別人に
-- なりかねないため、この 2 つは CRM → freee の一方向にする。
-- ============================================================

CREATE OR REPLACE FUNCTION apply_freee_values_to_crm(
  p_partner_id UUID,
  p_fields     TEXT[],
  p_actor      UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  fp         freee_partners%ROWTYPE;
  v_actor    UUID := COALESCE(auth.uid(), p_actor);
  v_changes  JSONB := '{}'::JSONB;
  v_company  companies%ROWTYPE;
  v_addr_id  UUID;
  v_city     TEXT;
  v_line1    TEXT;
  v_fin_id   UUID;
  v_type     TEXT;
BEGIN
  IF NOT COALESCE(is_admin(), FALSE) THEN
    RAISE EXCEPTION 'freee との同期は admin だけが行えます';
  END IF;

  SELECT * INTO fp FROM freee_partners WHERE id = p_partner_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'freee 取引先が見つかりません'; END IF;
  IF fp.company_id IS NULL THEN RAISE EXCEPTION '事業者情報に紐付いていません'; END IF;

  SELECT * INTO v_company FROM companies WHERE id = fp.company_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION '紐付いている事業者情報が見つかりません'; END IF;

  -- 担当者名・メールは CRM が正本。freee 側の値では上書きしない
  IF p_fields && ARRAY['contact_name', 'email'] THEN
    RAISE EXCEPTION '担当者名とメールは CRM が正本です。freee 側の値は取り込めません（連絡先の画面で直してください）';
  END IF;

  IF 'name' = ANY (p_fields) THEN
    v_changes := v_changes || jsonb_build_object('name',
      jsonb_build_object('from', v_company.name, 'to', COALESCE(fp.long_name, fp.name)));
    UPDATE companies SET name = expand_corporate_abbreviations(COALESCE(fp.long_name, fp.name)),
                         last_updated_by = v_actor WHERE id = fp.company_id;
  END IF;

  IF 'name_kana' = ANY (p_fields) THEN
    v_changes := v_changes || jsonb_build_object('name_kana',
      jsonb_build_object('from', v_company.name_kana, 'to', fp.name_kana));
    UPDATE companies SET name_kana = fp.name_kana, last_updated_by = v_actor WHERE id = fp.company_id;
  END IF;

  IF 'phone' = ANY (p_fields) THEN
    v_changes := v_changes || jsonb_build_object('phone',
      jsonb_build_object('from', v_company.phone, 'to', fp.phone));
    UPDATE companies SET phone = fp.phone, last_updated_by = v_actor WHERE id = fp.company_id;
  END IF;

  -- インボイス番号と適格フラグは**必ず一緒に動かす**。
  -- CHECK 制約（chk_companies_invoice）が「該当する なら番号あり」を要求するため、
  -- 片方だけ入れると落ちる
  IF p_fields && ARRAY['invoice_registration_number', 'qualified_invoice_issuer'] THEN
    IF fp.invoice_registration_number IS NOT NULL
       AND EXISTS (SELECT 1 FROM companies
                    WHERE invoice_registration_number = fp.invoice_registration_number
                      AND id <> fp.company_id) THEN
      RAISE EXCEPTION 'このインボイス登録番号は別の事業者情報が使っています';
    END IF;
    IF COALESCE(fp.qualified_invoice_issuer, FALSE) AND fp.invoice_registration_number IS NULL THEN
      RAISE EXCEPTION '適格請求書発行事業者に「該当する」を入れるには登録番号が要ります（freee 側の番号が空です）';
    END IF;

    v_changes := v_changes || jsonb_build_object('invoice',
      jsonb_build_object('from', v_company.invoice_registration_number,
                         'to', fp.invoice_registration_number));
    UPDATE companies
       SET invoice_registration_number = fp.invoice_registration_number,
           invoice_registered = COALESCE(fp.qualified_invoice_issuer, FALSE),
           last_updated_by = v_actor
     WHERE id = fp.company_id;
  END IF;

  -- 法人 / 個人。freee の org_code（1: 法人 / 2: 個人）を法人格へ寄せる。
  -- 個人なら「個人事業主」、法人なら名称から判定（判定できなければ触らない）
  IF 'org_code' = ANY (p_fields) THEN
    IF fp.org_code = 2 THEN
      UPDATE companies
         SET corporate_type_id = (SELECT id FROM corporate_types
                                   WHERE name = '個人事業主' AND deleted_at IS NULL LIMIT 1),
             last_updated_by = v_actor
       WHERE id = fp.company_id;
      v_changes := v_changes || jsonb_build_object('org_code',
        jsonb_build_object('from', '法人', 'to', '個人'));
    ELSIF fp.org_code = 1 THEN
      UPDATE companies
         SET corporate_type_id = COALESCE(
               resolve_corporate_type_id(COALESCE(fp.long_name, fp.name)), corporate_type_id),
             last_updated_by = v_actor
       WHERE id = fp.company_id;
      v_changes := v_changes || jsonb_build_object('org_code',
        jsonb_build_object('from', '個人', 'to', '法人'));
    END IF;
  END IF;

  -- 住所
  IF p_fields && ARRAY['zipcode', 'prefecture', 'street', 'building'] THEN
    SELECT ea.address_id INTO v_addr_id FROM entity_addresses ea
     WHERE ea.company_id = fp.company_id ORDER BY ea.is_primary DESC LIMIT 1;
    SELECT s.city, s.rest INTO v_city, v_line1 FROM split_japanese_city(fp.address_street_name1) s;

    IF v_addr_id IS NULL THEN
      PERFORM add_entity_address('company', fp.company_id, fp.address_zipcode,
        freee_prefecture_name(fp.address_prefecture_code), v_city, v_line1,
        fp.address_street_name2, 'main', NULL, NULL, NULL, v_actor);
    ELSE
      UPDATE addresses SET
        postal_code   = CASE WHEN 'zipcode'    = ANY (p_fields) THEN fp.address_zipcode ELSE postal_code END,
        prefecture    = CASE WHEN 'prefecture' = ANY (p_fields)
                             THEN freee_prefecture_name(fp.address_prefecture_code) ELSE prefecture END,
        city          = CASE WHEN 'street'     = ANY (p_fields) THEN v_city ELSE city END,
        address_line1 = CASE WHEN 'street'     = ANY (p_fields) THEN v_line1 ELSE address_line1 END,
        address_line2 = CASE WHEN 'building'   = ANY (p_fields) THEN fp.address_street_name2 ELSE address_line2 END,
        last_updated_by = v_actor
       WHERE id = v_addr_id;
    END IF;
    v_changes := v_changes || jsonb_build_object('address', jsonb_build_object('from', '（従来の住所）',
      'to', concat_ws(' ', freee_prefecture_name(fp.address_prefecture_code),
                      fp.address_street_name1, fp.address_street_name2)));
  END IF;

  -- 口座情報。CRM は financial_info の主口座を見る（無ければ作る）
  IF p_fields && ARRAY['bank_name', 'branch_name', 'account_number', 'account_holder', 'account_type'] THEN
    v_type := freee_account_type_to_crm(fp.account_type);

    SELECT f.id INTO v_fin_id FROM financial_info f
     WHERE f.company_id = fp.company_id AND f.deleted_at IS NULL
     ORDER BY f.is_primary DESC LIMIT 1;

    IF v_fin_id IS NULL THEN
      INSERT INTO financial_info (company_id, bank_name, branch_name, account_type,
                                  account_number, account_holder, is_primary, created_by, last_updated_by)
      VALUES (fp.company_id, fp.bank_name, fp.branch_name, COALESCE(v_type, 'ordinary'),
              fp.account_number, fp.long_account_name, TRUE, v_actor, v_actor);
    ELSE
      UPDATE financial_info SET
        bank_name      = CASE WHEN 'bank_name'      = ANY (p_fields) THEN fp.bank_name ELSE bank_name END,
        branch_name    = CASE WHEN 'branch_name'    = ANY (p_fields) THEN fp.branch_name ELSE branch_name END,
        account_number = CASE WHEN 'account_number' = ANY (p_fields) THEN fp.account_number ELSE account_number END,
        account_holder = CASE WHEN 'account_holder' = ANY (p_fields) THEN fp.long_account_name ELSE account_holder END,
        -- 納税準備預金など CRM に無い種別は NULL になる。そのときは現状を保つ
        account_type   = CASE WHEN 'account_type'   = ANY (p_fields) AND v_type IS NOT NULL
                              THEN v_type ELSE account_type END,
        last_updated_by = v_actor
       WHERE id = v_fin_id;
    END IF;

    v_changes := v_changes || jsonb_build_object('bank_account',
      jsonb_build_object('from', '（従来の口座）',
        'to', concat_ws(' ', fp.bank_name, fp.branch_name, fp.account_number)));
  END IF;

  INSERT INTO freee_sync_logs (freee_partner_id, direction, changes, succeeded, performed_by)
  VALUES (p_partner_id, 'to_crm', v_changes, TRUE, v_actor);

  RETURN v_changes;
END;
$$;

REVOKE ALL ON FUNCTION apply_freee_values_to_crm(UUID, TEXT[], UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_freee_values_to_crm(UUID, TEXT[], UUID) TO authenticated;
