-- ============================================================
-- freee 連携: 住所の持ち方の食い違いを直し、取引先コードに事業者情報の UID を入れる
--
-- 背景（2026-08-04 の指摘）:
--   1. 住所の番地・丁目が合わない
--      freee は `street_name1` に「市区町村＋町名＋番地」をまとめて持つが、
--      CRM は `city`（市区町村）と `address_line1`（町名・番地）に分けて持つ。
--      比較を address_line1 だけで行っていたため、**市区町村の分だけ必ず食い違う**。
--      取り込み側も street_name1 を丸ごと address_line1 に入れており、
--      市区町村が番地欄に混ざっていた。
--   2. freee の取引先コードが空
--      どの CRM レコードに対応するのかが freee 側から分からなかった。
--      **事業者情報（companies）の UID** を入れる（取引先は契約成立まで
--      存在せず、多くの相手で空になるため選ばない）。
-- ============================================================

-- ------------------------------------------------------------
-- 1. 市区町村の切り出し
--
-- Eight 取込の TS 実装（src/lib/leads/import-helpers.ts の parseAddress）と
-- **同じ規則**にする。片方だけ直すと取込経路によって住所の入り方が変わる。
--   - 「〜市 / 区 / 町 / 村」までを市区町村とみなす（最短一致）
--   - 「四日市市」「市川市」のように市が連続する地名を取りこぼさない
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION split_japanese_city(p_rest TEXT)
RETURNS TABLE (city TEXT, rest TEXT)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_input TEXT := btrim(COALESCE(p_rest, ''));
  v_city  TEXT;
  v_after TEXT;
BEGIN
  IF v_input = '' THEN
    RETURN QUERY SELECT NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  v_city := (regexp_match(v_input, '^(.+?[市区町村])'))[1];
  IF v_city IS NULL THEN
    -- 市区町村を切り出せない住所はそのまま番地側に残す
    RETURN QUERY SELECT NULL::TEXT, v_input;
    RETURN;
  END IF;

  v_after := substr(v_input, length(v_city) + 1);
  IF left(v_after, 1) = '市' THEN
    v_city := v_city || '市';
    v_after := substr(v_after, 2);
  END IF;

  RETURN QUERY SELECT v_city, NULLIF(btrim(v_after), '');
END;
$$;

COMMENT ON FUNCTION split_japanese_city IS
'「市区町村＋町名番地」から市区町村を切り出す。規則は TS の parseAddress と揃える（片方だけ直さないこと）';

-- ------------------------------------------------------------
-- 2. freee の都道府県コード → 和名
--
-- register_freee_partner_company に配列で埋め込んでいたものを関数にする。
-- 差分の比較でも使うため、2 か所に同じ配列を置かない。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION freee_prefecture_name(p_code SMALLINT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE
    WHEN p_code IS NULL OR p_code < 0 OR p_code > 46 THEN NULL
    ELSE (ARRAY[
      '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県',
      '茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県',
      '新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県',
      '静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県',
      '奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県',
      '徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県',
      '熊本県','大分県','宮崎県','鹿児島県','沖縄県'
    ])[p_code + 1]
  END;
$$;

/** 和名 → freee のコード。CRM から freee へ送るときに使う */
CREATE OR REPLACE FUNCTION freee_prefecture_code(p_name TEXT)
RETURNS SMALLINT
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT (idx - 1)::SMALLINT
    FROM unnest(ARRAY[
      '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県',
      '茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県',
      '新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県',
      '静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県',
      '奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県',
      '徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県',
      '熊本県','大分県','宮崎県','鹿児島県','沖縄県'
    ]) WITH ORDINALITY AS t(name, idx)
   WHERE t.name = btrim(COALESCE(p_name, ''))
   LIMIT 1;
$$;

-- ------------------------------------------------------------
-- 3. 取り込み時に市区町村を分けて入れる
--
-- register_freee_partner_company を差し替える（20260805000001 からの差分は
-- 住所の組み立てと、都道府県の配列を関数へ寄せたところだけ）。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION register_freee_partner_company(
  p_partner_id UUID,
  p_actor      UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  fp           freee_partners%ROWTYPE;
  v_actor      UUID := COALESCE(auth.uid(), p_actor);
  v_name       TEXT;
  v_status_id  UUID;
  v_company_id UUID;
  v_number     VARCHAR(13);
  v_dom        TEXT;
  v_pref       TEXT;
  v_city       TEXT;
  v_line1      TEXT;
BEGIN
  IF NOT COALESCE(is_admin(), FALSE) THEN
    RAISE EXCEPTION '事業者情報の作成は admin だけが行えます';
  END IF;

  SELECT * INTO fp FROM freee_partners WHERE id = p_partner_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'freee 取引先が見つかりません';
  END IF;
  IF fp.link_status IN ('auto', 'confirmed') THEN
    RAISE EXCEPTION '既に紐付け済みです。先に紐付けを解除してください';
  END IF;

  v_name := expand_corporate_abbreviations(COALESCE(fp.long_name, fp.name));

  SELECT id INTO v_status_id FROM company_statuses
   WHERE code = 'unverified' AND deleted_at IS NULL LIMIT 1;
  IF v_status_id IS NULL THEN
    RAISE EXCEPTION 'company_statuses が未投入です';
  END IF;

  v_number := fp.corporate_number;
  IF v_number IS NOT NULL
     AND EXISTS (SELECT 1 FROM companies WHERE corporate_number = v_number) THEN
    v_number := NULL;
  END IF;

  INSERT INTO companies (
    name, name_kana, corporate_type_id, corporate_number,
    invoice_registered, invoice_registration_number,
    phone, company_status_id, owner_user_id, created_by, last_updated_by
  ) VALUES (
    v_name,
    NULLIF(fp.name_kana, ''),
    resolve_corporate_type_id(v_name),
    v_number,
    COALESCE(fp.qualified_invoice_issuer, FALSE),
    CASE WHEN fp.invoice_registration_number IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM companies
                           WHERE invoice_registration_number = fp.invoice_registration_number)
         THEN fp.invoice_registration_number END,
    NULLIF(fp.phone, ''),
    v_status_id,
    v_actor, v_actor, v_actor
  ) RETURNING id INTO v_company_id;

  -- 住所。**freee の street_name1 は「市区町村＋町名＋番地」**なので、
  -- CRM の持ち方（市区町村と番地は別）に合わせて切り分ける
  IF fp.address_zipcode IS NOT NULL
     OR fp.address_street_name1 IS NOT NULL
     OR fp.address_prefecture_code IS NOT NULL THEN
    v_pref := freee_prefecture_name(fp.address_prefecture_code);
    SELECT s.city, s.rest INTO v_city, v_line1
      FROM split_japanese_city(fp.address_street_name1) s;

    PERFORM add_entity_address(
      'company', v_company_id,
      fp.address_zipcode, v_pref,
      v_city,
      v_line1,
      fp.address_street_name2,
      'main', NULL, NULL, NULL, v_actor
    );
  END IF;

  IF fp.email LIKE '%@%' THEN
    v_dom := normalize_domain(split_part(fp.email, '@', 2));
    IF v_dom IS NOT NULL AND NOT is_free_email_domain(v_dom) THEN
      INSERT INTO company_domains (company_id, domain, is_primary, created_by)
      VALUES (v_company_id, v_dom, TRUE, v_actor)
      ON CONFLICT (domain) DO NOTHING;
    END IF;
  END IF;

  UPDATE freee_partners
     SET link_status = 'confirmed',
         company_id  = v_company_id,
         account_id  = NULL,
         linked_at   = now(),
         linked_by   = v_actor
   WHERE id = p_partner_id;

  RETURN v_company_id;
END;
$$;

REVOKE ALL ON FUNCTION register_freee_partner_company(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION register_freee_partner_company(UUID, UUID) TO authenticated;

-- ------------------------------------------------------------
-- 4. 差分の検出をやり直す
--
-- 変更点:
--   - 住所は **CRM の「市区町村＋番地」を連結**して freee の street_name1 と比べる
--   - 都道府県と建物名も比較対象に入れる
--   - 取引先コードを比較対象に入れる（CRM の事業者情報 UID が入っているか）
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
           c.name  AS company_name,
           c.name_kana AS company_name_kana,
           c.phone AS company_phone,
           c.invoice_registration_number AS company_invoice,
           addr.postal_code   AS company_zipcode,
           addr.prefecture    AS company_pref,
           -- **CRM は市区町村と番地が別**。freee の持ち方に合わせて連結する
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
                 SELECT jsonb_build_object('field','code','label','取引先コード',
                          'crm', l.company_id::TEXT, 'freee', l.partner_code)
                  WHERE l.company_id::TEXT IS DISTINCT FROM NULLIF(btrim(COALESCE(l.partner_code,'')),'')
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
                 -- **市区町村と番地をまとめて比べる**（freee は 1 項目、CRM は 2 項目）。
                 -- 空白の有無で差分にしないよう、比較時は空白を落とす
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

-- ------------------------------------------------------------
-- 5. freee → CRM の取り込みに住所を足す
--
-- 住所は entity_addresses にあるので、主住所を書き換える（無ければ作る）。
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
BEGIN
  IF NOT COALESCE(is_admin(), FALSE) THEN
    RAISE EXCEPTION 'freee との同期は admin だけが行えます';
  END IF;

  SELECT * INTO fp FROM freee_partners WHERE id = p_partner_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'freee 取引先が見つかりません'; END IF;
  IF fp.company_id IS NULL THEN RAISE EXCEPTION '事業者情報に紐付いていません'; END IF;

  SELECT * INTO v_company FROM companies WHERE id = fp.company_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION '紐付いている事業者情報が見つかりません'; END IF;

  IF 'name' = ANY (p_fields) THEN
    v_changes := v_changes || jsonb_build_object('name',
      jsonb_build_object('from', v_company.name, 'to', COALESCE(fp.long_name, fp.name)));
    UPDATE companies SET name = expand_corporate_abbreviations(COALESCE(fp.long_name, fp.name)),
                         last_updated_by = v_actor
     WHERE id = fp.company_id;
  END IF;

  IF 'name_kana' = ANY (p_fields) THEN
    v_changes := v_changes || jsonb_build_object('name_kana',
      jsonb_build_object('from', v_company.name_kana, 'to', fp.name_kana));
    UPDATE companies SET name_kana = fp.name_kana, last_updated_by = v_actor
     WHERE id = fp.company_id;
  END IF;

  IF 'phone' = ANY (p_fields) THEN
    v_changes := v_changes || jsonb_build_object('phone',
      jsonb_build_object('from', v_company.phone, 'to', fp.phone));
    UPDATE companies SET phone = fp.phone, last_updated_by = v_actor
     WHERE id = fp.company_id;
  END IF;

  IF 'invoice_registration_number' = ANY (p_fields) THEN
    v_changes := v_changes || jsonb_build_object('invoice_registration_number',
      jsonb_build_object('from', v_company.invoice_registration_number,
                         'to', fp.invoice_registration_number));
    IF fp.invoice_registration_number IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM companies
          WHERE invoice_registration_number = fp.invoice_registration_number
            AND id <> fp.company_id
       ) THEN
      UPDATE companies
         SET invoice_registration_number = fp.invoice_registration_number,
             invoice_registered = COALESCE(fp.qualified_invoice_issuer, invoice_registered),
             last_updated_by = v_actor
       WHERE id = fp.company_id;
    ELSE
      RAISE EXCEPTION 'このインボイス登録番号は別の事業者情報が使っています';
    END IF;
  END IF;

  -- 住所。zipcode / prefecture / street / building のどれかが選ばれていたら主住所を直す
  IF p_fields && ARRAY['zipcode','prefecture','street','building'] THEN
    SELECT ea.address_id INTO v_addr_id
      FROM entity_addresses ea
     WHERE ea.company_id = fp.company_id
     ORDER BY ea.is_primary DESC
     LIMIT 1;

    SELECT s.city, s.rest INTO v_city, v_line1
      FROM split_japanese_city(fp.address_street_name1) s;

    IF v_addr_id IS NULL THEN
      -- 住所がまだ無ければ作る
      PERFORM add_entity_address(
        'company', fp.company_id,
        fp.address_zipcode,
        freee_prefecture_name(fp.address_prefecture_code),
        v_city, v_line1, fp.address_street_name2,
        'main', NULL, NULL, NULL, v_actor
      );
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

    v_changes := v_changes || jsonb_build_object('address',
      jsonb_build_object('from', '（従来の住所）', 'to',
        concat_ws(' ', freee_prefecture_name(fp.address_prefecture_code),
                  fp.address_street_name1, fp.address_street_name2)));
  END IF;

  INSERT INTO freee_sync_logs (freee_partner_id, direction, changes, succeeded, performed_by)
  VALUES (p_partner_id, 'to_crm', v_changes, TRUE, v_actor);

  RETURN v_changes;
END;
$$;

REVOKE ALL ON FUNCTION apply_freee_values_to_crm(UUID, TEXT[], UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_freee_values_to_crm(UUID, TEXT[], UUID) TO authenticated;
