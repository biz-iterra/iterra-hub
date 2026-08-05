-- ============================================================
-- 名称・カナの入り先を揃え、敬称の既定を「様」にする
--
-- 依頼（2026-08-05）:
--   ① 会社名は freee の**基本情報の「名前」と書類の「正式名称」の両方**へ入れる
--   ② フリガナは**正式名称（カナ）**へ入れる
--   ③ 担当者の敬称が未設定なら「様」にする
--
-- ① が「バラついている」原因:
--   送信は name と long_name の両方へ入れていたが、**差分の検出が
--   `COALESCE(long_name, name)` を見ていた**。long_name だけが空のとき、
--   name が一致していれば差分にならず、正式名称が空のまま残り続けていた。
--   → **両方を CRM の会社名と比べ、どちらかが違えば差分として出す。**
--
-- ② について（2026-08-05 に確認）:
--   freee の画面には「名前（ふりがな）」と「正式名称（カナ）」の 2 欄があるが、
--   **API のカナ系フィールドは `name_kana`（カナ名称）1 つだけ**。
--   `shortcut1` / `shortcut2` は画面にも別の欄として存在する別物なので流用しない。
--   したがって連携できるのは「正式名称（カナ）」のみ。
--   **「名前（ふりがな）」は API から設定できない**（freee の画面で人が入れる）。
--
-- ③ `default_title` は「御中 / 様 / (空白)」の 3 択（API の仕様）。
--   CRM に対応する項目は無いので、**未設定のときだけ**既定の「様」を提案する。
--   既に「御中」等が入っていれば触らない。
-- ============================================================

-- ------------------------------------------------------------
-- 敬称の既定値。**TS 側（src/lib/freee/payload.ts の DEFAULT_TITLE）と対で持つ**。
-- 片方だけ直すと、差分画面が提案する値と実際に送る値が食い違う。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION freee_default_title() RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$ SELECT '様'::TEXT $$;

COMMENT ON FUNCTION freee_default_title IS
'敬称の既定値。freee は「御中 / 様 / (空白)」の 3 択。TS 側の DEFAULT_TITLE と揃えること';

REVOKE ALL ON FUNCTION freee_default_title() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION freee_default_title() TO authenticated;

CREATE OR REPLACE FUNCTION detect_freee_partner_diffs(p_freee_company_id BIGINT)
RETURNS TABLE (
  partner_id    UUID,
  company_id    UUID,
  partner_name  TEXT,
  company_name  TEXT,
  diffs         JSONB
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH linked AS (
    SELECT fp.id AS partner_id, fp.name AS partner_name, fp.long_name, fp.name_kana,
           fp.phone, fp.code AS partner_code, fp.invoice_registration_number,
           fp.org_code, fp.contact_name, fp.email AS partner_email,
           fp.qualified_invoice_issuer, fp.default_title,
           fp.address_zipcode,
           freee_prefecture_name(fp.address_prefecture_code) AS freee_pref,
           fp.address_street_name1, fp.address_street_name2,
           fp.bank_name, fp.branch_name, fp.account_number, fp.long_account_name,
           freee_account_type_to_crm(fp.account_type) AS freee_account_type,
           c.id AS company_id, c.company_code, c.name AS company_name,
           c.name_kana AS company_name_kana, c.phone AS company_phone,
           c.invoice_registration_number AS company_invoice,
           c.invoice_registered,
           -- 法人格が「個人事業主」なら個人（2）、それ以外は法人（1）。
           -- 未設定は判定しない（NULL のまま比較対象から外れる）
           CASE WHEN ctype.name IS NULL THEN NULL
                WHEN ctype.name = '個人事業主' THEN 2 ELSE 1 END AS crm_org_code,
           company_primary_contact_name(c.id)  AS crm_contact_name,
           company_primary_contact_email(c.id) AS crm_contact_email,
           addr.postal_code AS company_zipcode, addr.prefecture AS company_pref,
           NULLIF(btrim(COALESCE(addr.city,'') || COALESCE(addr.address_line1,'')),'') AS company_street,
           addr.address_line2 AS company_building,
           fin.bank_name AS crm_bank_name, fin.branch_name AS crm_branch_name,
           fin.account_number AS crm_account_number, fin.account_holder AS crm_account_holder,
           fin.account_type AS crm_account_type
      FROM freee_partners fp
      JOIN companies c ON c.id = fp.company_id AND c.deleted_at IS NULL
      LEFT JOIN corporate_types ctype ON ctype.id = c.corporate_type_id
      LEFT JOIN LATERAL (
        SELECT a.postal_code, a.prefecture, a.city, a.address_line1, a.address_line2
          FROM entity_addresses ea JOIN addresses a ON a.id = ea.address_id
         WHERE ea.company_id = c.id ORDER BY ea.is_primary DESC LIMIT 1
      ) addr ON TRUE
      LEFT JOIN LATERAL (
        SELECT f.bank_name, f.branch_name, f.account_number, f.account_holder, f.account_type
          FROM financial_info f
         WHERE f.company_id = c.id AND f.deleted_at IS NULL
         ORDER BY f.is_primary DESC LIMIT 1
      ) fin ON TRUE
     WHERE fp.freee_company_id = p_freee_company_id
       AND fp.link_status IN ('auto','confirmed')
       AND fp.freee_deleted_at IS NULL
  ),
  compared AS (
    SELECT l.partner_id, l.company_id, l.partner_name, l.company_name,
           (
             SELECT jsonb_agg(d) FROM (
               -- 名称は**基本情報の「名前」と書類の「正式名称」の両方**を揃える。
               -- どちらかが違えば差分にする（正式名称が空のまま残るのを防ぐ）
               SELECT jsonb_build_object('field','name','label','名称（名前・正式名称）',
                 'crm', l.company_name,
                 'freee',
                 CASE WHEN NULLIF(btrim(COALESCE(l.long_name,'')),'')
                        IS DISTINCT FROM NULLIF(btrim(l.partner_name),'')
                      THEN l.partner_name || ' / 正式名称: '
                           || COALESCE(NULLIF(btrim(COALESCE(l.long_name,'')),''), '（未設定）')
                      ELSE l.partner_name END) AS d
                WHERE NULLIF(btrim(l.company_name),'') IS DISTINCT FROM NULLIF(btrim(l.partner_name),'')
                   OR NULLIF(btrim(l.company_name),'')
                      IS DISTINCT FROM NULLIF(btrim(COALESCE(l.long_name,'')),'')
               UNION ALL
               -- **カナは「正式名称（カナ）」に入る。**「名前（ふりがな）」は
               -- API に項目が無く、ここからは設定できない（§26.8.1）
               SELECT jsonb_build_object('field','name_kana','label','カナ（正式名称）',
                 'crm', l.company_name_kana, 'freee', l.name_kana)
                WHERE NULLIF(btrim(COALESCE(l.company_name_kana,'')),'')
                      IS DISTINCT FROM NULLIF(btrim(COALESCE(l.name_kana,'')),'')
               UNION ALL
               SELECT jsonb_build_object('field','phone','label','電話番号',
                 'crm', l.company_phone, 'freee', l.phone)
                WHERE NULLIF(regexp_replace(COALESCE(l.company_phone,''),'[^0-9]','','g'),'')
                      IS DISTINCT FROM NULLIF(regexp_replace(COALESCE(l.phone,''),'[^0-9]','','g'),'')
               UNION ALL
               SELECT jsonb_build_object('field','invoice_registration_number','label','インボイス番号',
                 'crm', l.company_invoice, 'freee', l.invoice_registration_number)
                WHERE NULLIF(btrim(COALESCE(l.company_invoice,'')),'')
                      IS DISTINCT FROM NULLIF(btrim(COALESCE(l.invoice_registration_number,'')),'')
               UNION ALL
               -- 適格請求書発行事業者（該当する / 該当しない）
               SELECT jsonb_build_object('field','qualified_invoice_issuer','label','適格請求書発行事業者',
                 'crm', CASE WHEN l.invoice_registered THEN '該当する' ELSE '該当しない' END,
                 'freee', CASE WHEN l.qualified_invoice_issuer THEN '該当する' ELSE '該当しない' END)
                WHERE COALESCE(l.invoice_registered, FALSE)
                      IS DISTINCT FROM COALESCE(l.qualified_invoice_issuer, FALSE)
               UNION ALL
               -- **敬称は未設定のときだけ既定の「様」を提案する。**
               -- CRM に項目は無い。「御中」等が既に入っていれば触らない
               SELECT jsonb_build_object('field','default_title','label','敬称',
                 'crm', freee_default_title(), 'freee', '（未設定）')
                WHERE NULLIF(btrim(COALESCE(l.default_title,'')),'') IS NULL
               UNION ALL
               -- 法人 / 個人。CRM の法人格が未設定のときは比べない
               SELECT jsonb_build_object('field','org_code','label','法人 / 個人',
                 'crm', CASE l.crm_org_code WHEN 1 THEN '法人' WHEN 2 THEN '個人' END,
                 'freee', CASE l.org_code WHEN 1 THEN '法人' WHEN 2 THEN '個人' END)
                WHERE l.crm_org_code IS NOT NULL
                  AND l.crm_org_code IS DISTINCT FROM l.org_code
               UNION ALL
               -- 担当者名（姓・ミドル名・名を続けたもの）
               SELECT jsonb_build_object('field','contact_name','label','担当者名',
                 'crm', l.crm_contact_name, 'freee', l.contact_name)
                WHERE NULLIF(btrim(COALESCE(l.crm_contact_name,'')),'')
                      IS DISTINCT FROM NULLIF(btrim(COALESCE(l.contact_name,'')),'')
               UNION ALL
               SELECT jsonb_build_object('field','email','label','担当者メール',
                 'crm', l.crm_contact_email, 'freee', l.partner_email)
                WHERE NULLIF(lower(btrim(COALESCE(l.crm_contact_email,''))),'')
                      IS DISTINCT FROM NULLIF(lower(btrim(COALESCE(l.partner_email,''))),'')
               UNION ALL
               SELECT jsonb_build_object('field','code','label','取引先コード',
                 'crm', l.company_code, 'freee', l.partner_code)
                WHERE NULLIF(btrim(COALESCE(l.company_code,'')),'')
                      IS DISTINCT FROM NULLIF(btrim(COALESCE(l.partner_code,'')),'')
               UNION ALL
               SELECT jsonb_build_object('field','zipcode','label','郵便番号',
                 'crm', l.company_zipcode, 'freee', l.address_zipcode)
                WHERE NULLIF(regexp_replace(COALESCE(l.company_zipcode,''),'[^0-9]','','g'),'')
                      IS DISTINCT FROM NULLIF(regexp_replace(COALESCE(l.address_zipcode,''),'[^0-9]','','g'),'')
               UNION ALL
               SELECT jsonb_build_object('field','prefecture','label','都道府県',
                 'crm', l.company_pref, 'freee', l.freee_pref)
                WHERE NULLIF(btrim(COALESCE(l.company_pref,'')),'')
                      IS DISTINCT FROM NULLIF(btrim(COALESCE(l.freee_pref,'')),'')
               UNION ALL
               SELECT jsonb_build_object('field','street','label','市区町村・番地',
                 'crm', l.company_street, 'freee', l.address_street_name1)
                WHERE NULLIF(regexp_replace(COALESCE(l.company_street,''),'[[:space:]　]','','g'),'')
                      IS DISTINCT FROM
                      NULLIF(regexp_replace(COALESCE(l.address_street_name1,''),'[[:space:]　]','','g'),'')
               UNION ALL
               SELECT jsonb_build_object('field','building','label','建物名',
                 'crm', l.company_building, 'freee', l.address_street_name2)
                WHERE NULLIF(btrim(COALESCE(l.company_building,'')),'')
                      IS DISTINCT FROM NULLIF(btrim(COALESCE(l.address_street_name2,'')),'')
               UNION ALL
               -- 口座情報。CRM は financial_info の主口座を見る
               SELECT jsonb_build_object('field','bank_name','label','銀行名',
                 'crm', l.crm_bank_name, 'freee', l.bank_name)
                WHERE NULLIF(btrim(COALESCE(l.crm_bank_name,'')),'')
                      IS DISTINCT FROM NULLIF(btrim(COALESCE(l.bank_name,'')),'')
               UNION ALL
               SELECT jsonb_build_object('field','branch_name','label','支店名',
                 'crm', l.crm_branch_name, 'freee', l.branch_name)
                WHERE NULLIF(btrim(COALESCE(l.crm_branch_name,'')),'')
                      IS DISTINCT FROM NULLIF(btrim(COALESCE(l.branch_name,'')),'')
               UNION ALL
               SELECT jsonb_build_object('field','account_number','label','口座番号',
                 'crm', l.crm_account_number, 'freee', l.account_number)
                WHERE NULLIF(regexp_replace(COALESCE(l.crm_account_number,''),'[^0-9]','','g'),'')
                      IS DISTINCT FROM NULLIF(regexp_replace(COALESCE(l.account_number,''),'[^0-9]','','g'),'')
               UNION ALL
               SELECT jsonb_build_object('field','account_holder','label','口座名義',
                 'crm', l.crm_account_holder, 'freee', l.long_account_name)
                WHERE NULLIF(btrim(COALESCE(l.crm_account_holder,'')),'')
                      IS DISTINCT FROM NULLIF(btrim(COALESCE(l.long_account_name,'')),'')
               UNION ALL
               SELECT jsonb_build_object('field','account_type','label','口座種別',
                 'crm', l.crm_account_type, 'freee', l.freee_account_type)
                WHERE NULLIF(btrim(COALESCE(l.crm_account_type,'')),'')
                      IS DISTINCT FROM NULLIF(btrim(COALESCE(l.freee_account_type,'')),'')
             ) x
           ) AS diffs
      FROM linked l
  )
  SELECT c.partner_id, c.company_id, c.partner_name, c.company_name, c.diffs
    FROM compared c
   WHERE c.diffs IS NOT NULL
   ORDER BY c.company_name;
END;
$$;

COMMENT ON FUNCTION detect_freee_partner_diffs IS
'CRM と freee の項目ごとの差分。名称は基本情報の名前と正式名称の両方を見る。敬称は未設定のときだけ既定値を提案する';

REVOKE ALL ON FUNCTION detect_freee_partner_diffs(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION detect_freee_partner_diffs(BIGINT) TO authenticated;

-- ------------------------------------------------------------
-- 敬称は freee → CRM へ取り込めない（CRM に項目が無い）。
--
-- **無言で無視しない。** 取引先コードで同じ穴を作っており（分岐が無く、
-- 選んでも何も起きないまま成功として記録されていた。20260805000014）、
-- 同じことを繰り返さないよう明示的に落とす。
-- ------------------------------------------------------------
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

  -- 事業者コードは採番した値。**無言で無視せず落とす**（選べてしまった経路を塞ぐ）
  IF 'code' = ANY (p_fields) THEN
    RAISE EXCEPTION '事業者コードは CRM が自動で採番します。freee の値では上書きできません';
  END IF;

  -- 敬称は freee にしかない項目（CRM に持たない）
  IF 'default_title' = ANY (p_fields) THEN
    RAISE EXCEPTION '敬称は freee 側だけの項目です。CRM へは取り込めません';
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

COMMENT ON FUNCTION apply_freee_values_to_crm IS
'freee → CRM の取り込み。担当者名・メール・事業者コード・敬称は受け付けない（CRM が正本 or CRM に項目が無い）';

REVOKE ALL ON FUNCTION apply_freee_values_to_crm(UUID, TEXT[], UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_freee_values_to_crm(UUID, TEXT[], UUID) TO authenticated;
