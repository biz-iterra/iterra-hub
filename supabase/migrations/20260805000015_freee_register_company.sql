-- ============================================================
-- CRM にあって freee に無い事業者を freee へ登録できるようにする
--
-- 依頼（2026-08-05）:
--   freee 連携画面に「連携する事業者を追加する」を置き、CRM 側から freee の
--   取引先を作る。**取引先コードで名寄せしたい。**
--
-- 取引先コードが名寄せに効く理由:
--   インボイス番号・法人番号は「同じ番号なら同じ会社のはず」という推定だが、
--   `companies.company_code`（CMP-000001, UNIQUE）は **CRM 自身が振った値**で
--   推定が要らない。よって突合の優先順位は
--     取引先コード > インボイス番号 > 法人番号
--   ただしコードは freee の画面で人が自由に入れられるので、
--   **該当する事業者が無いコードは無視して次のキーへ回す**。
--
-- 取引先コードを入れられるのは**新規登録（POST）のときだけ**（§26.8）。
-- 既存の相手に後から入れる API は無い。この機能で作った相手は以後コードで
-- 確実に突合できる。
-- ============================================================

-- ------------------------------------------------------------
-- 1. 自動紐付けに取引先コードを足す
--
-- 変更点は「コード一致を最優先で見る」ことと、
-- **既に別の取引先が紐付いている事業者を二重に紐付けない**こと。
-- （freee_partners.company_id に UNIQUE 制約は無く、放っておくと同じ事業者に
--   複数の freee 取引先がぶら下がる）
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

  -- 自動紐付け。**取引先コード → インボイス番号 → 法人番号**の順に見る
  FOR r IN
    SELECT fp.id, fp.code, fp.invoice_registration_number, fp.corporate_number
      FROM freee_partners fp
     WHERE fp.freee_company_id = p_freee_company_id
       AND fp.link_status = 'unlinked'
       AND (fp.code IS NOT NULL
            OR fp.invoice_registration_number IS NOT NULL
            OR fp.corporate_number IS NOT NULL)
  LOOP
    v_company_id := NULL;

    -- ① 取引先コード。CRM が採番した値なので推定が要らない。
    --    形が合っていても該当が無ければ（人が別用途で使った値）次のキーへ
    IF r.code IS NOT NULL THEN
      SELECT c.id INTO v_company_id FROM companies c
       WHERE c.company_code = btrim(r.code)
         AND c.deleted_at IS NULL
       LIMIT 1;
    END IF;

    IF v_company_id IS NULL AND r.invoice_registration_number IS NOT NULL THEN
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

    -- **既に別の取引先が紐付いている事業者には繋がない。**
    -- 1 つの事業者に複数の freee 取引先がぶら下がると、差分画面が同じ相手を
    -- 何度も出し、どちらへ書いたのか分からなくなる
    IF v_company_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM freee_partners o
                    WHERE o.company_id = v_company_id
                      AND o.id <> r.id
                      AND o.link_status IN ('auto', 'confirmed')) THEN
      v_company_id := NULL;
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

COMMENT ON FUNCTION upsert_freee_partners IS
'freee 取引先のミラー更新と自動紐付け（取引先コード → インボイス番号 → 法人番号の順）';

ALTER FUNCTION upsert_freee_partners(BIGINT, JSONB, BOOLEAN)
  SET statement_timeout = '120s';
REVOKE ALL ON FUNCTION upsert_freee_partners(BIGINT, JSONB, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_freee_partners(BIGINT, JSONB, BOOLEAN) TO service_role;

-- ------------------------------------------------------------
-- 2. freee に無い事業者の一覧（登録の対象を選ぶ画面用）
--
-- 「無い」は**紐付いていない**で判断する。freee 側にあっても紐付いていなければ
-- 候補として出し、画面で類似の取引先を確認させる（二重登録を防ぐため）。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION list_companies_without_freee_partner(
  p_search TEXT    DEFAULT NULL,
  p_limit  INTEGER DEFAULT 30,
  p_offset INTEGER DEFAULT 0
) RETURNS TABLE (
  company_id                  UUID,
  company_code                TEXT,
  name                        TEXT,
  name_kana                   TEXT,
  phone                       TEXT,
  invoice_registration_number TEXT,
  corporate_type              TEXT,
  total_count                 BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pattern TEXT := CASE WHEN NULLIF(btrim(COALESCE(p_search, '')), '') IS NULL
                         THEN NULL ELSE '%' || btrim(p_search) || '%' END;
BEGIN
  IF NOT COALESCE(is_admin(), FALSE) THEN
    RAISE EXCEPTION 'freee 連携の操作は admin だけが行えます';
  END IF;

  RETURN QUERY
  -- **VARCHAR の列は TEXT へキャストする。** RETURNS TABLE の宣言と型が
  -- 1 文字でも違うと「structure of query does not match function result type」で
  -- 実行時に落ちる（company_code = varchar(10) / phone = varchar(20) /
  -- invoice_registration_number = varchar(14)）
  SELECT c.id, c.company_code::TEXT, c.name, c.name_kana, c.phone::TEXT,
         c.invoice_registration_number::TEXT, ct.name,
         count(*) OVER () AS total_count
    FROM companies c
    LEFT JOIN corporate_types ct ON ct.id = c.corporate_type_id
   WHERE c.deleted_at IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM freee_partners fp
        WHERE fp.company_id = c.id
          AND fp.link_status IN ('auto', 'confirmed')
          AND fp.freee_deleted_at IS NULL
     )
     AND (v_pattern IS NULL
          OR c.name ILIKE v_pattern
          OR c.name_kana ILIKE v_pattern
          OR c.company_code ILIKE v_pattern)
   ORDER BY c.name
   LIMIT GREATEST(p_limit, 1) OFFSET GREATEST(p_offset, 0);
END;
$$;

COMMENT ON FUNCTION list_companies_without_freee_partner IS
'freee と紐付いていない事業者情報。「連携する事業者を追加する」の対象一覧';

REVOKE ALL ON FUNCTION list_companies_without_freee_partner(TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_companies_without_freee_partner(TEXT, INTEGER, INTEGER) TO authenticated;

-- ------------------------------------------------------------
-- 3. 逆向きの候補提示（事業者 → freee 取引先）
--
-- **freee は取引先名の重複を許す**（だから取引先コードが導入された）。
-- 確認せずに作ると、表記ゆれで同じ相手が 2 つできる。
-- detect_freee_partner_candidates の対になる関数。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION detect_freee_candidates_for_company(p_company_id UUID)
RETURNS TABLE (
  partner_id       UUID,
  freee_partner_id BIGINT,
  partner_name     TEXT,
  partner_code     TEXT,
  reason           TEXT,
  detail           JSONB
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  c      companies%ROWTYPE;
  v_norm TEXT;
  v_tel  TEXT;
BEGIN
  SELECT * INTO c FROM companies WHERE id = p_company_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_norm := normalize_company_name(c.name);
  v_tel  := NULLIF(regexp_replace(COALESCE(c.phone, ''), '[^0-9]', '', 'g'), '');

  RETURN QUERY
  SELECT fp.id, fp.freee_partner_id, COALESCE(fp.long_name, fp.name), fp.code,
         m.reason,
         jsonb_build_object(
           'invoice_registration_number', fp.invoice_registration_number,
           'phone', fp.phone,
           'link_status', fp.link_status
         )
    FROM (
      -- 同じ取引先が複数の理由で当たるので 1 件 1 行にし、最も強い理由を示す
      SELECT DISTINCT ON (u.pid) u.pid, u.reason, u.prio
        FROM (
          -- インボイス番号一致。ここが当たれば同一とみなしてよい
          SELECT p1.id AS pid, 'invoice'::TEXT AS reason, 1 AS prio
            FROM freee_partners p1
           WHERE c.invoice_registration_number IS NOT NULL
             AND p1.invoice_registration_number = c.invoice_registration_number
          UNION
          -- 名称の正規化一致（略記の展開・空白除去は既存関数に任せる）
          SELECT p2.id, 'name', 2
            FROM freee_partners p2
           WHERE v_norm IS NOT NULL
             AND normalize_company_name(COALESCE(p2.long_name, p2.name)) = v_norm
          UNION
          -- 電話番号一致（数字のみで比較）
          SELECT p3.id, 'phone', 3
            FROM freee_partners p3
           WHERE v_tel IS NOT NULL
             AND regexp_replace(COALESCE(p3.phone, ''), '[^0-9]', '', 'g') = v_tel
        ) u
       ORDER BY u.pid, u.prio
    ) m
    JOIN freee_partners fp ON fp.id = m.pid AND fp.freee_deleted_at IS NULL
   ORDER BY m.prio, COALESCE(fp.long_name, fp.name);
END;
$$;

COMMENT ON FUNCTION detect_freee_candidates_for_company IS
'事業者情報に似た freee 取引先（インボイス番号・名称・電話）。二重登録を防ぐための提示で、自動確定には使わない';

REVOKE ALL ON FUNCTION detect_freee_candidates_for_company(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION detect_freee_candidates_for_company(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 4. freee へ送る値を 1 か所で集める
--
-- 差分検出（detect_freee_partner_diffs）が見ているのと**同じ集約**にする。
-- ここがずれると、登録した直後に差分が出る。
-- 都道府県コードと口座種別の変換は TS 側で行う（§26.11 の対応表は
-- 取り込み = DB / 送信 = TS で分かれている）。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_company_freee_source(p_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c       companies%ROWTYPE;
  v_type  TEXT;
  v_addr  RECORD;
  v_fin   RECORD;
BEGIN
  IF NOT COALESCE(is_admin(), FALSE) THEN
    RAISE EXCEPTION 'freee 連携の操作は admin だけが行えます';
  END IF;

  SELECT * INTO c FROM companies WHERE id = p_company_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION '事業者情報が見つかりません';
  END IF;

  SELECT ct.name INTO v_type FROM corporate_types ct WHERE ct.id = c.corporate_type_id;

  SELECT a.postal_code, a.prefecture, a.city, a.address_line1, a.address_line2
    INTO v_addr
    FROM entity_addresses ea JOIN addresses a ON a.id = ea.address_id
   WHERE ea.company_id = c.id ORDER BY ea.is_primary DESC LIMIT 1;

  SELECT f.bank_name, f.branch_name, f.account_number, f.account_holder, f.account_type
    INTO v_fin
    FROM financial_info f
   WHERE f.company_id = c.id AND f.deleted_at IS NULL
   ORDER BY f.is_primary DESC LIMIT 1;

  RETURN jsonb_build_object(
    'company_id',   c.id,
    'company_code', c.company_code,
    'name',         c.name,
    'name_kana',    c.name_kana,
    'phone',        c.phone,
    'invoice_registration_number', c.invoice_registration_number,
    'invoice_registered', COALESCE(c.invoice_registered, FALSE),
    -- 法人格が「個人事業主」なら個人（2）、それ以外は法人（1）。未設定は送らない
    'org_code', CASE WHEN v_type IS NULL THEN NULL
                     WHEN v_type = '個人事業主' THEN 2 ELSE 1 END,
    'contact_name',  company_primary_contact_name(c.id),
    'contact_email', company_primary_contact_email(c.id),
    'zipcode',    v_addr.postal_code,
    'prefecture', v_addr.prefecture,
    -- **CRM は市区町村と番地が別、freee は 1 項目**（§26.7）
    'street',     NULLIF(btrim(COALESCE(v_addr.city, '') || COALESCE(v_addr.address_line1, '')), ''),
    'building',   v_addr.address_line2,
    'bank_name',      v_fin.bank_name,
    'branch_name',    v_fin.branch_name,
    'account_number', v_fin.account_number,
    'account_holder', v_fin.account_holder,
    'account_type',   v_fin.account_type
  );
END;
$$;

COMMENT ON FUNCTION get_company_freee_source IS
'freee へ新規登録するときに送る値一式。差分検出と同じ集約にすること（ずれると登録直後に差分が出る）';

REVOKE ALL ON FUNCTION get_company_freee_source(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_company_freee_source(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 5. 登録した取引先をミラーへ入れて紐付けまで済ませる
--
-- **1 つの関数にまとめる。** supabase-js は複数文を 1 トランザクションに
-- できないため、アプリ側で「ミラー登録 → 紐付け → ログ」と順に呼ぶと
-- 途中で失敗したときに中途半端な状態が残る（データ整合性の規約）。
--
-- 呼ぶのは freee への POST が成功した**後**。service_role から呼ぶので
-- auth.uid() は当てにできず、実行者は p_actor で受け取る。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION link_created_freee_partner(
  p_freee_company_id BIGINT,
  p_row              JSONB,
  p_company_id       UUID,
  p_actor            UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_partner_id UUID;
  v_account_id UUID;
  v_cnt        INTEGER;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION '紐付ける事業者情報を指定してください';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM companies WHERE id = p_company_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION '事業者情報が見つかりません';
  END IF;

  -- ミラーへ入れる。既に同じ freee_partner_id があれば上書きする
  PERFORM upsert_freee_partners(p_freee_company_id, jsonb_build_array(p_row), FALSE);

  SELECT id INTO v_partner_id FROM freee_partners
   WHERE freee_company_id = p_freee_company_id
     AND freee_partner_id = (p_row ->> 'freee_partner_id')::BIGINT;
  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION '登録した取引先をミラーに保存できませんでした';
  END IF;

  -- 取引先（Account）は 1 つに定まるときだけ埋める（契約成立で作られる。§16）
  SELECT count(*), min(a.id::TEXT)::UUID INTO v_cnt, v_account_id
    FROM accounts a WHERE a.company_id = p_company_id AND a.deleted_at IS NULL;

  UPDATE freee_partners
     SET link_status = 'confirmed',
         company_id  = p_company_id,
         account_id  = CASE WHEN v_cnt = 1 THEN v_account_id END,
         linked_at   = now(),
         linked_by   = p_actor
   WHERE id = v_partner_id;

  INSERT INTO freee_sync_logs (freee_partner_id, direction, changes, succeeded, performed_by)
  VALUES (v_partner_id, 'to_freee',
          jsonb_build_object('created', jsonb_build_object(
            'from', NULL, 'to', COALESCE(p_row ->> 'name', ''))),
          TRUE, p_actor);

  RETURN v_partner_id;
END;
$$;

COMMENT ON FUNCTION link_created_freee_partner IS
'freee へ新規登録した取引先をミラーへ入れ、確定済みとして事業者情報に紐付ける（POST 成功後に呼ぶ）';

REVOKE ALL ON FUNCTION link_created_freee_partner(BIGINT, JSONB, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION link_created_freee_partner(BIGINT, JSONB, UUID, UUID) TO service_role;
