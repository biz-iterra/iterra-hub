-- ============================================================
-- freee の口座種別「未設定」を CRM と同じ土俵で比べる
--
-- **freee は口座種別に NULL を持てない。** 画面で何も選ばなくても
-- API は `ordinary`（普通預金）を返す。つまり freee 側の `ordinary` は
-- 「普通預金と決めた」ではなく「未設定、または普通預金」を意味する。
--
-- 一方 CRM（`financial_info.account_type`）は NULL を取れる。素で比べると
-- **どちらも未設定なのに差分として出る**（2026-08-06 に利用者が指摘）。
-- 38 件の突合で毎回この 1 行が並び、本当に直すべき差分が埋もれる。
--
-- 対処は**比較の土俵を揃えること**にした。CRM のデータに `ordinary` を
-- 書き込む案は採らない。**freee の `ordinary` は情報を持っていない**ので、
-- それを根拠に CRM へ「普通預金」と書くのは推測を事実にしてしまう。
--
-- 揃えても取りこぼしは出ない:
--   freee=当座  / CRM=未設定 → 当座 vs 普通  → 差分として出る（正しい）
--   freee=普通  / CRM=貯蓄   → 普通 vs 貯蓄  → 差分として出る（正しい）
--   freee=普通  / CRM=未設定 → 普通 vs 普通  → 出ない（これが今回の狙い）
-- ============================================================

-- ------------------------------------------------------------
-- 口座種別の既定。**未設定は普通預金として扱う**（freee に合わせる）。
--
-- TS 側にも同じ規則を `src/lib/freee/account-type.ts` に置いてある。
-- **片方だけ直さないこと**（会社名の略記展開と同じ約束）。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION normalize_account_type(p_type TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(NULLIF(btrim(COALESCE(p_type, '')), ''), 'ordinary');
$fn$;

COMMENT ON FUNCTION normalize_account_type IS
'口座種別の比較用の正規化。未設定は ordinary（普通預金）として扱う。freee が未設定を持てないため';

REVOKE ALL ON FUNCTION normalize_account_type(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION normalize_account_type(TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 差分検出を貼り直す（変更は口座種別の比較 1 か所だけ）
-- ------------------------------------------------------------
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
               -- **freee は口座種別に未設定を持てない。** 何も入れていなくても
               -- `ordinary`（普通）が返るため、CRM の未設定と素で比べると
               -- 「どちらも未設定」なのに差分として出る（2026-08-06 の指摘）。
               -- 両側を normalize_account_type で揃えてから比べる
               SELECT jsonb_build_object('field','account_type','label','口座種別',
                 'crm', l.crm_account_type, 'freee', l.freee_account_type)
                WHERE normalize_account_type(l.crm_account_type)
                      IS DISTINCT FROM normalize_account_type(l.freee_account_type)
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
'CRM と freee の項目ごとの差分。名称は基本情報の名前と正式名称の両方を見る。敬称は未設定のときだけ既定値を提案する。口座種別は未設定を普通預金として揃えてから比べる';

REVOKE ALL ON FUNCTION detect_freee_partner_diffs(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION detect_freee_partner_diffs(BIGINT) TO authenticated;

-- ------------------------------------------------------------
-- 既に「口座種別」だけの差分として並んでいる行があっても、
-- この関数は都度計算するので後始末は要らない（保存された差分は無い）。
-- ------------------------------------------------------------
DO $mig$
BEGIN
  RAISE NOTICE '口座種別: 未設定を普通預金として比べるようにした';
END $mig$;
