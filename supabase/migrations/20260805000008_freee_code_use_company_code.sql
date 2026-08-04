-- ============================================================
-- freee の取引先コードに入れるものを、事業者情報の UUID から
-- 事業者コード（CMP-000001）へ変える
--
-- 背景（2026-08-04）:
--   20260805000007 で `companies.id`（UUID）を入れるようにしたが、
--   **freee の取引先コードは会計担当が画面で見る項目**で、36 文字の UUID は
--   読めない。`company_code` は UNIQUE 制約があり CRM の画面にも出ているため、
--   突き合わせるときに人が辿れる。
--
--   識別子は 2 つしかない（`id` = UUID、`company_code` = CMP-000001）。
--   「UID」という別の列は無い。
-- ============================================================

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
    SELECT fp.id   AS partner_id,
           fp.name AS partner_name,
           fp.long_name,
           fp.name_kana,
           fp.phone,
           fp.code AS partner_code,
           fp.invoice_registration_number,
           fp.address_zipcode,
           freee_prefecture_name(fp.address_prefecture_code) AS freee_pref,
           fp.address_street_name1,
           fp.address_street_name2,
           c.id    AS company_id,
           c.company_code,
           c.name  AS company_name,
           c.name_kana AS company_name_kana,
           c.phone AS company_phone,
           c.invoice_registration_number AS company_invoice,
           addr.postal_code   AS company_zipcode,
           addr.prefecture    AS company_pref,
           NULLIF(btrim(COALESCE(addr.city, '') || COALESCE(addr.address_line1, '')), '')
             AS company_street,
           addr.address_line2 AS company_building
      FROM freee_partners fp
      JOIN companies c ON c.id = fp.company_id AND c.deleted_at IS NULL
      LEFT JOIN LATERAL (
        SELECT a.postal_code, a.prefecture, a.city, a.address_line1, a.address_line2
          FROM entity_addresses ea
          JOIN addresses a ON a.id = ea.address_id
         WHERE ea.company_id = c.id
         ORDER BY ea.is_primary DESC
         LIMIT 1
      ) addr ON TRUE
     WHERE fp.freee_company_id = p_freee_company_id
       AND fp.link_status IN ('auto', 'confirmed')
       AND fp.freee_deleted_at IS NULL
  ),
  compared AS (
    SELECT l.partner_id, l.company_id, l.partner_name, l.company_name,
           (
             SELECT jsonb_agg(d)
               FROM (
                 SELECT jsonb_build_object('field','name','label','名称',
                          'crm', l.company_name, 'freee', COALESCE(l.long_name, l.partner_name)) AS d
                  WHERE NULLIF(btrim(l.company_name), '')
                        IS DISTINCT FROM NULLIF(btrim(COALESCE(l.long_name, l.partner_name)), '')
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
                 -- **事業者コード（CMP-000001）を入れる。** UUID は人が読めない
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
