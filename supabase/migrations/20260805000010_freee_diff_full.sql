-- ============================================================
-- CRM に正本がある項目を差分同期の対象に足す
--
-- 追加するもの（2026-08-04 の指示）:
--   - 法人 / 個人（freee: org_code ↔ CRM: 法人格）
--   - 担当者名（freee: contact_name ↔ CRM: 主担当の氏名）
--     **ID ではなく姓・ミドル名・名を続けた文字列**を入れる
--   - 担当者メール（freee: email ↔ 主担当の主メール）
--   - 適格請求書発行事業者（freee: qualified_invoice_issuer ↔ CRM: invoice_registered）
--   - 口座情報（freee: partner_bank_account_attributes ↔ CRM: financial_info）
--
-- 法人番号は freee 側に項目が無いため対象外。CRM では法人格が法人のときだけ
-- 入力できる（§22.2.1）。代表者・FAX も freee に対応項目が無い。
-- ============================================================

-- 主担当の氏名。**姓・ミドル名・名をこの順で続ける**（freee は 1 項目）
CREATE OR REPLACE FUNCTION company_primary_contact_name(p_company_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT NULLIF(
    btrim(
      concat_ws(' ',
        NULLIF(btrim(COALESCE(ct.last_name, '')), ''),
        NULLIF(btrim(COALESCE(ct.middle_name, '')), ''),
        NULLIF(btrim(COALESCE(ct.first_name, '')), '')
      )
    ), '')
    FROM companies c
    JOIN contacts ct ON ct.id = c.primary_contact_id AND ct.deleted_at IS NULL
   WHERE c.id = p_company_id;
$$;

COMMENT ON FUNCTION company_primary_contact_name IS
'freee の contact_name へ渡す担当者名。姓・ミドル名・名を続けた文字列（ID ではない）';

/** 主担当の主メール。freee の email と対応する */
CREATE OR REPLACE FUNCTION company_primary_contact_email(p_company_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT ce.email
    FROM companies c
    JOIN contacts ct ON ct.id = c.primary_contact_id AND ct.deleted_at IS NULL
    JOIN contact_emails ce ON ce.contact_id = ct.id
   WHERE c.id = p_company_id
   ORDER BY ce.is_primary DESC
   LIMIT 1;
$$;

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
           fp.qualified_invoice_issuer,
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
               SELECT jsonb_build_object('field','name','label','名称',
                 'crm', l.company_name, 'freee', COALESCE(l.long_name, l.partner_name)) AS d
                WHERE NULLIF(btrim(l.company_name),'')
                      IS DISTINCT FROM NULLIF(btrim(COALESCE(l.long_name, l.partner_name)),'')
               UNION ALL
               SELECT jsonb_build_object('field','name_kana','label','カナ',
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

REVOKE ALL ON FUNCTION detect_freee_partner_diffs(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION detect_freee_partner_diffs(BIGINT) TO authenticated;
