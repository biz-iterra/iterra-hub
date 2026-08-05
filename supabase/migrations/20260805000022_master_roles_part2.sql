-- ============================================================
-- 名指しをやめた 8 関数を差し替える
--
-- 20260805000021 で足した役割フラグを使う形に書き換えた。
-- **変更したのは「どの行を引くか」だけ**で、処理そのものは元のまま
-- （既存の定義を pg_get_functiondef で取り出し、条件だけ機械置換した）。
--
-- | 関数 | 元の名指し | 置き換え |
-- |---|---|---|
-- | resolve_account_status | code = 'active'/'churned'/'prospect' | is_active_default ほか |
-- | resolve_or_create_company | code = 'unverified' | is_new_default |
-- | register_freee_partner_company | 同上 | 同上 |
-- | resolve_or_create_contact | name = 'アクティブ' | is_new_default |
-- | approve_email_contact_candidate | 同上 | 同上 |
-- | ensure_account_on_contract | 同上 | is_active_default |
-- | apply_freee_values_to_crm | name = '個人事業主' | is_sole_proprietor |
-- | detect_freee_partner_diffs | 同上 | 同上 |
--
-- **name での名指しは改名しただけで壊れる**（マスタ管理で名前は自由に変えられる）。
-- フラグに移したことで、表示名を業務に合わせて変えても動き続ける。
-- ============================================================

-- ---- resolve_account_status ----
CREATE OR REPLACE FUNCTION public.resolve_account_status(p_account_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_has_active   BOOLEAN;
  v_has_any      BOOLEAN;
  v_has_sales_lead BOOLEAN;
  v_status_id    UUID;
BEGIN
  -- 期間内の契約。end_date が無いものは継続中として扱う
  -- （解約日が入っていれば、その日を過ぎた時点で終了）
  SELECT EXISTS (
    SELECT 1
      FROM contracts c
      JOIN deals d ON d.id = c.deal_id
     WHERE d.account_id = p_account_id
       AND c.deleted_at IS NULL
       AND (c.start_date IS NULL OR c.start_date <= CURRENT_DATE)
       AND (c.end_date IS NULL OR c.end_date >= CURRENT_DATE)
       AND (c.cancellation_date IS NULL OR c.cancellation_date > CURRENT_DATE)
  ) INTO v_has_active;

  SELECT EXISTS (
    SELECT 1
      FROM contracts c
      JOIN deals d ON d.id = c.deal_id
     WHERE d.account_id = p_account_id
       AND c.deleted_at IS NULL
  ) INTO v_has_any;

  IF v_has_active THEN
    SELECT id INTO v_status_id FROM account_statuses WHERE is_active_default;
  ELSIF v_has_any THEN
    -- 契約はあったが今は生きていない
    SELECT id INTO v_status_id FROM account_statuses WHERE is_churned_default;
  ELSE
    -- 契約が無い。リードが Sales 以降（requires_deal なステージ）まで
    -- 進んでいれば見込みとする（§24 のステージ要件と同じ基準を使う）
    SELECT EXISTS (
      SELECT 1
        FROM leads l
        JOIN lead_stages s ON s.id = l.stage_id
       WHERE l.deleted_at IS NULL
         AND s.requires_deal
         AND l.promoted_account_id = p_account_id
    ) INTO v_has_sales_lead;

    IF v_has_sales_lead THEN
      SELECT id INTO v_status_id FROM account_statuses WHERE is_prospect_default;
    END IF;
  END IF;

  -- 決められないときは現状維持（NULL を返して呼び出し側に判断させない）
  IF v_status_id IS NULL THEN
    SELECT account_status_id INTO v_status_id FROM accounts WHERE id = p_account_id;
  END IF;

  UPDATE accounts
     SET account_status_id = v_status_id
   WHERE id = p_account_id
     AND account_status_id IS DISTINCT FROM v_status_id;

  RETURN v_status_id;
END;
$function$;

-- ---- resolve_or_create_company ----
CREATE OR REPLACE FUNCTION public.resolve_or_create_company(p_company_name text, p_email text, p_phone text, p_url text, p_owner_user_id uuid, p_lead_source_id uuid, p_actor uuid, p_corporate_number text DEFAULT NULL::text, p_address_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_domain     TEXT := normalize_domain(p_email);
  v_norm       TEXT := normalize_company_name(p_company_name);
  v_number     TEXT := NULLIF(regexp_replace(COALESCE(p_corporate_number, ''), '[^0-9]', '', 'g'), '');
  v_name       TEXT := expand_corporate_abbreviations(p_company_name);
  v_addr_key   TEXT;
  v_usable_dom BOOLEAN;
  v_id         UUID;
  v_status_id  UUID;
BEGIN
  -- 法人番号は 13 桁。桁が違うものは番号として扱わない
  IF v_number IS NOT NULL AND length(v_number) <> 13 THEN
    v_number := NULL;
  END IF;

  IF p_address_id IS NOT NULL THEN
    SELECT normalize_address_key(a.postal_code, a.prefecture, a.city, a.address_line1)
      INTO v_addr_key
      FROM addresses a WHERE a.id = p_address_id;
  END IF;

  -- フリーメールは個人アドレスなので法人の識別に使えない
  v_usable_dom := v_domain IS NOT NULL AND NOT is_free_email_domain(v_domain);

  -- 1. 法人番号一致。法的に一意なので単独で確定してよい
  IF v_number IS NOT NULL THEN
    SELECT id INTO v_id
      FROM companies
     WHERE corporate_number = v_number
       AND deleted_at IS NULL
     LIMIT 1;
  END IF;

  -- 2. ドメイン一致
  IF v_id IS NULL AND v_usable_dom THEN
    SELECT cd.company_id INTO v_id
      FROM company_domains cd
      JOIN companies c ON c.id = cd.company_id AND c.deleted_at IS NULL
     WHERE cd.domain = v_domain
     LIMIT 1;
  END IF;

  -- 3. 住所 + 会社名の一致。
  --    住所だけで決めない。雑居ビルやレンタルオフィスには何社も入っており、
  --    同じ番地というだけで別会社に寄せると取り返しがつかない
  IF v_id IS NULL AND v_norm IS NOT NULL AND v_addr_key IS NOT NULL THEN
    SELECT c.id INTO v_id
      FROM companies c
      JOIN entity_addresses ea ON ea.company_id = c.id
      JOIN addresses a ON a.id = ea.address_id
     WHERE c.deleted_at IS NULL
       AND normalize_company_name(c.name) = v_norm
       AND normalize_address_key(a.postal_code, a.prefecture, a.city, a.address_line1) = v_addr_key
     ORDER BY c.created_at
     LIMIT 1;
  END IF;

  -- 4. 会社名一致。複数該当したら最も古いものを採る
  IF v_id IS NULL AND v_norm IS NOT NULL THEN
    SELECT id INTO v_id
      FROM companies
     WHERE normalize_company_name(name) = v_norm
       AND deleted_at IS NULL
     ORDER BY created_at
     LIMIT 1;
  END IF;

  -- 5. 新規作成。会社名が無ければ法人は作らない（ドメインだけでは社名を決められない）
  IF v_id IS NULL THEN
    IF v_norm IS NULL THEN
      RETURN NULL;
    END IF;

    -- 名刺から作った法人は実在確認をしていないので「未確認」から始める
    SELECT id INTO v_status_id FROM company_statuses
     WHERE is_new_default AND deleted_at IS NULL LIMIT 1;
    IF v_status_id IS NULL THEN
      SELECT id INTO v_status_id FROM company_statuses
       WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;
    END IF;
    IF v_status_id IS NULL THEN
      RAISE EXCEPTION 'company_statuses が未投入です';
    END IF;

    -- 論理削除済みの法人が同じ番号を持つことがある（UNIQUE は削除状態を見ない）。
    -- ここまで来たのは生きている法人に無かったということなので、番号は付けずに作る
    IF v_number IS NOT NULL
       AND EXISTS (SELECT 1 FROM companies WHERE corporate_number = v_number) THEN
      v_number := NULL;
    END IF;

    INSERT INTO companies (
      name, corporate_type_id, corporate_number, phone, website_url,
      company_status_id, lead_source_id, owner_user_id, created_by, last_updated_by
    ) VALUES (
      v_name, resolve_corporate_type_id(v_name), v_number,
      NULLIF(btrim(COALESCE(p_phone, '')), ''),
      NULLIF(btrim(COALESCE(p_url, '')), ''), v_status_id,
      p_lead_source_id, p_owner_user_id, p_actor, p_actor
    ) RETURNING id INTO v_id;

    -- 住所が分かっていれば主住所として残す。次からは住所でも名寄せできる
    IF p_address_id IS NOT NULL THEN
      INSERT INTO entity_addresses (
        address_id, company_id, label, is_primary, created_by, last_updated_by
      ) VALUES (p_address_id, v_id, 'main', TRUE, p_actor, p_actor);
    END IF;
  END IF;

  -- ドメインを法人に紐付ける。以降の取込がこの法人に寄るようにする。
  -- 既に他社へ登録済みなら握りつぶす（先に登録された方を正とする）
  IF v_usable_dom THEN
    INSERT INTO company_domains (company_id, domain, is_primary, created_by, last_updated_by)
    VALUES (
      v_id, v_domain,
      NOT EXISTS (SELECT 1 FROM company_domains WHERE company_id = v_id),
      p_actor, p_actor
    )
    ON CONFLICT (domain) DO NOTHING;
  END IF;

  RETURN v_id;
END;
$function$;

-- ---- register_freee_partner_company ----
CREATE OR REPLACE FUNCTION public.register_freee_partner_company(p_partner_id uuid, p_actor uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
   WHERE is_new_default AND deleted_at IS NULL LIMIT 1;
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
$function$;

-- ---- resolve_or_create_contact ----
CREATE OR REPLACE FUNCTION public.resolve_or_create_contact(p_company_id uuid, p_last_name text, p_first_name text, p_department text, p_job_title text, p_email text, p_phone text, p_owner_user_id uuid, p_lead_source_id uuid, p_actor uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id        UUID;
  v_status_id UUID;
  v_last      TEXT := NULLIF(btrim(COALESCE(p_last_name, '')), '');
  v_first     TEXT := COALESCE(NULLIF(btrim(COALESCE(p_first_name, '')), ''), '');
  v_email     TEXT := NULLIF(btrim(COALESCE(p_email, '')), '');
  v_phone     TEXT := NULLIF(btrim(COALESCE(p_phone, '')), '');
  v_digits    TEXT;
BEGIN
  -- 姓が取れない行は人物として成立しないので連絡先を作らない
  IF v_last IS NULL THEN
    RETURN NULL;
  END IF;

  -- P1. メール一致。同一人物の判定として最も確実
  IF v_email IS NOT NULL THEN
    SELECT c.id INTO v_id
      FROM contacts c
      JOIN contact_emails e ON e.contact_id = c.id
     WHERE lower(e.email) = lower(v_email)
       AND c.deleted_at IS NULL
     LIMIT 1;
  END IF;

  -- P2. 携帯番号 + 姓一致。会社もメールも変わる転職を跨げる
  IF v_id IS NULL AND v_phone IS NOT NULL AND is_mobile_phone(v_phone) THEN
    v_digits := regexp_replace(v_phone, '[^0-9]', '', 'g');
    SELECT c.id INTO v_id
      FROM contacts c
      JOIN contact_phones p ON p.contact_id = c.id
     WHERE regexp_replace(p.phone, '[^0-9]', '', 'g') = v_digits
       AND is_mobile_phone(p.phone)
       AND c.last_name = v_last
       AND c.deleted_at IS NULL
     ORDER BY c.created_at
     LIMIT 1;
  END IF;

  -- P3. 会社 × 姓名一致
  IF v_id IS NULL AND p_company_id IS NOT NULL THEN
    SELECT id INTO v_id
      FROM contacts
     WHERE company_id = p_company_id
       AND last_name = v_last
       AND COALESCE(first_name, '') = v_first
       AND deleted_at IS NULL
     ORDER BY created_at
     LIMIT 1;
  END IF;

  IF v_id IS NULL THEN
    -- 名刺交換した相手は連絡先としては有効なので「アクティブ」で作る。
    -- 営業上の進度は Lead 側（lead_statuses）が持つ（20260731000009）。
    --
    -- 「アクティブ」が見つからない場合は非決定的な別ステータスへ
    -- フォールバックせず、その場で失敗させる。マスタが壊れたまま
    -- 誤ったステータスで連絡先を作り続けるほうが気づきにくく危険なため
    SELECT id INTO v_status_id FROM contact_statuses
     WHERE is_new_default AND deleted_at IS NULL LIMIT 1;
    IF v_status_id IS NULL THEN
      RAISE EXCEPTION 'contact_statuses の「アクティブ」が見つかりません。マスタを確認してください';
    END IF;

    INSERT INTO contacts (
      last_name, first_name, department, job_title,
      contact_type, company_id, contact_status_id,
      lead_source_id, owner_user_id, created_by, last_updated_by
    ) VALUES (
      v_last, v_first,
      NULLIF(btrim(COALESCE(p_department, '')), ''),
      NULLIF(btrim(COALESCE(p_job_title, '')), ''),
      -- 法人に紐付かない名刺は所属不明として other にする
      -- （employee は company_id 必須という規約があるため）
      CASE WHEN p_company_id IS NOT NULL THEN 'employee' ELSE 'other' END,
      p_company_id, v_status_id,
      p_lead_source_id, p_owner_user_id, p_actor, p_actor
    ) RETURNING id INTO v_id;
  END IF;

  -- メール・電話は空欄補完ではなく追加。転職後の新アドレスを足しても
  -- 旧アドレスは残す（過去のやり取りの参照先を壊さないため）
  IF v_email IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM contact_emails WHERE contact_id = v_id AND lower(email) = lower(v_email)
  ) THEN
    INSERT INTO contact_emails (contact_id, email, label, is_primary, created_by, last_updated_by)
    VALUES (
      v_id, v_email, 'work',
      NOT EXISTS (SELECT 1 FROM contact_emails WHERE contact_id = v_id),
      p_actor, p_actor
    );
  END IF;

  IF v_phone IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM contact_phones WHERE contact_id = v_id AND phone = v_phone
  ) THEN
    INSERT INTO contact_phones (contact_id, phone, label, is_primary, created_by, last_updated_by)
    VALUES (
      v_id, v_phone,
      default_phone_label(v_phone),
      NOT EXISTS (SELECT 1 FROM contact_phones WHERE contact_id = v_id),
      p_actor, p_actor
    );
  END IF;

  RETURN v_id;
END;
$function$;

-- ---- approve_email_contact_candidate ----
CREATE OR REPLACE FUNCTION public.approve_email_contact_candidate(p_candidate_id uuid, p_last_name text, p_first_name text DEFAULT ''::text, p_company_id uuid DEFAULT NULL::uuid, p_owner_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor      UUID := auth.uid();
  v_candidate  email_contact_candidates%ROWTYPE;
  v_contact_id UUID;
  v_status_id  UUID;
  v_linked     INTEGER;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION '認証が必要です';
  END IF;

  -- SECURITY DEFINER で RLS をバイパスするため、
  -- email_contact_candidates の SELECT ポリシーと同じ条件をここで課す
  IF NOT is_manager_or_above() THEN
    RAISE EXCEPTION '連絡先候補の承認には manager 以上の権限が必要です';
  END IF;

  SELECT * INTO v_candidate
    FROM email_contact_candidates
   WHERE id = p_candidate_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '候補が見つかりません';
  END IF;
  IF v_candidate.status <> 'pending' THEN
    RAISE EXCEPTION 'この候補は既に処理済みです';
  END IF;

  -- 承認の間に別経路で連絡先が作られていれば、それを使う
  v_contact_id := find_contact_by_email(v_candidate.email_address);

  IF v_contact_id IS NULL THEN
    SELECT id INTO v_status_id FROM contact_statuses
     WHERE is_new_default AND deleted_at IS NULL LIMIT 1;
    IF v_status_id IS NULL THEN
      SELECT id INTO v_status_id FROM contact_statuses
       WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;
    END IF;

    INSERT INTO contacts (
      last_name, first_name, contact_type, company_id,
      contact_status_id, owner_user_id, created_by, last_updated_by
    ) VALUES (
      COALESCE(NULLIF(btrim(p_last_name), ''), v_candidate.email_address),
      COALESCE(NULLIF(btrim(p_first_name), ''), ''),
      CASE WHEN p_company_id IS NOT NULL THEN 'employee' ELSE 'other' END,
      p_company_id, v_status_id,
      COALESCE(p_owner_user_id, v_actor), v_actor, v_actor
    ) RETURNING id INTO v_contact_id;

    INSERT INTO contact_emails (contact_id, email, label, is_primary, created_by, last_updated_by)
    VALUES (v_contact_id, v_candidate.email_address, 'work', TRUE, v_actor, v_actor);
  END IF;

  -- 過去のメールを遡って紐づける。
  -- from / to / cc のどれで登場したかは email_messages 側の列から判定する
  INSERT INTO email_message_contacts (message_id, contact_id, role)
  SELECT m.id, v_contact_id,
         CASE
           WHEN m.from_email = v_candidate.email_address THEN 'from'
           WHEN v_candidate.email_address = ANY(m.to_emails) THEN 'to'
           ELSE 'cc'
         END
    FROM email_messages m
   WHERE m.from_email = v_candidate.email_address
      OR v_candidate.email_address = ANY(m.to_emails)
      OR v_candidate.email_address = ANY(m.cc_emails)
  ON CONFLICT (message_id, contact_id, role) DO NOTHING;

  GET DIAGNOSTICS v_linked = ROW_COUNT;

  UPDATE email_contact_candidates
     SET status      = 'registered',
         contact_id  = v_contact_id,
         resolved_at = now(),
         resolved_by = v_actor
   WHERE id = p_candidate_id;

  RAISE NOTICE '候補承認: 連絡先 % に過去メール % 件を紐付け', v_contact_id, v_linked;

  RETURN v_contact_id;
END;
$function$;

-- ---- ensure_account_on_contract ----
CREATE OR REPLACE FUNCTION public.ensure_account_on_contract()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_deal       deals%ROWTYPE;
  v_company    companies%ROWTYPE;
  v_contact    contacts%ROWTYPE;
  v_account_id UUID;
  v_type_id    UUID;
  v_status_id  UUID;
  v_role_id    UUID;
  v_name       TEXT;
  v_actor      UUID := COALESCE(auth.uid(), NEW.created_by, NEW.registered_by);
BEGIN
  IF NEW.deal_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_deal FROM deals WHERE id = NEW.deal_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_account_id := v_deal.account_id;

  -- ── 取引先が未作成なら作る ────────────────────────────────────────────────
  IF v_account_id IS NULL THEN
    IF v_deal.company_id IS NOT NULL THEN
      SELECT * INTO v_company FROM companies WHERE id = v_deal.company_id;
    END IF;
    IF v_deal.contact_id IS NOT NULL THEN
      SELECT * INTO v_contact FROM contacts WHERE id = v_deal.contact_id;
    END IF;

    -- 取引先名は法人名を優先し、個人取引なら担当者名を使う
    v_name := COALESCE(
      v_company.name,
      NULLIF(btrim(COALESCE(v_contact.last_name, '') || ' ' || COALESCE(v_contact.first_name, '')), ''),
      v_deal.name
    );

    IF v_name IS NULL THEN
      -- 相手を特定できないまま取引先は作れない。契約自体は成立させる
      RETURN NEW;
    END IF;

    -- **スラッグで引かない。** どの種別を使うかはマスタの設定が持つ
    -- （20260805000020）。法人か個人事業主かで分ける
    IF v_deal.company_id IS NOT NULL THEN
      SELECT id INTO v_type_id FROM account_types
       WHERE is_company_default AND deleted_at IS NULL LIMIT 1;
    ELSE
      SELECT id INTO v_type_id FROM account_types
       WHERE is_sole_proprietor_default AND deleted_at IS NULL LIMIT 1;
    END IF;

    SELECT id INTO v_status_id FROM account_statuses
     WHERE is_active_default AND deleted_at IS NULL LIMIT 1;
    IF v_status_id IS NULL THEN
      SELECT id INTO v_status_id FROM account_statuses
       WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;
    END IF;
    IF v_status_id IS NULL THEN
      RAISE EXCEPTION 'account_statuses が未投入です';
    END IF;

    INSERT INTO accounts (
      name, company_id, account_type_id, account_status_id,
      lead_source_id, owner_user_id, created_by
    ) VALUES (
      v_name, v_deal.company_id, v_type_id, v_status_id,
      v_company.lead_source_id, COALESCE(v_deal.owner_user_id, v_actor), v_actor
    ) RETURNING id INTO v_account_id;

    -- 商談の相手担当者をそのまま取引先の主担当にする
    IF v_deal.contact_id IS NOT NULL THEN
      INSERT INTO account_contacts (account_id, contact_id, role)
      VALUES (v_account_id, v_deal.contact_id, 'primary')
      ON CONFLICT (account_id, contact_id) DO NOTHING;
    END IF;

    UPDATE deals SET account_id = v_account_id WHERE id = v_deal.id;

    -- 昇格元のリードにも取引先を記録する（リードから辿れるようにする）
    UPDATE leads
       SET promoted_account_id = v_account_id
     WHERE promoted_deal_id = v_deal.id
       AND promoted_account_id IS NULL;
  END IF;

  -- ── 区分の付与 ────────────────────────────────────────────────────────────
  -- 取引先が既にあった場合もここは通す。
  -- 顧客として登録済みの相手と仕入れ契約を結べば「顧客 + 仕入れ先」になる
  SELECT id INTO v_role_id FROM account_role_types
   WHERE pipeline_type_id = v_deal.pipeline_type_id
     AND deleted_at IS NULL
   LIMIT 1;

  IF v_role_id IS NOT NULL AND v_account_id IS NOT NULL THEN
    INSERT INTO account_roles (account_id, role_type_id, assigned_by_contract, created_by)
    VALUES (v_account_id, v_role_id, TRUE, v_actor)
    ON CONFLICT (account_id, role_type_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- ---- apply_freee_values_to_crm ----
CREATE OR REPLACE FUNCTION public.apply_freee_values_to_crm(p_partner_id uuid, p_fields text[], p_actor uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
                                   WHERE is_sole_proprietor AND deleted_at IS NULL LIMIT 1),
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
$function$;

-- ---- detect_freee_partner_diffs ----
CREATE OR REPLACE FUNCTION public.detect_freee_partner_diffs(p_freee_company_id bigint)
 RETURNS TABLE(partner_id uuid, company_id uuid, partner_name text, company_name text, diffs jsonb)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
                WHEN ctype.is_sole_proprietor THEN 2 ELSE 1 END AS crm_org_code,
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
$function$;
