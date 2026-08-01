-- ============================================================
-- 電話番号の種別判定
--
-- 日本の番号計画では**市内局番の先頭は 2〜9**（0 と 1 は特番・事業者識別に予約）。
-- そのため 3 桁目が 0 になるのは市外局番が 0X0 形式のものだけで、
-- 固定電話と確実に区別できる。
--
--   020 … M2M・ポケベル跡地
--   050 … IP 電話
--   060 … FMC（ほぼ未使用）
--   070 / 080 / 090 … 携帯・PHS
--
-- **人物同定のキーには携帯（070/080/090）だけを使う。**
-- 050 は会社の代表番号としても使われるため、同じ番号を共有する社内の別人を
-- 同一人物と誤判定してしまう。誤統合は元に戻せないので狭く保つ。
-- ============================================================

CREATE OR REPLACE FUNCTION phone_line_type(p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_digits TEXT := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
BEGIN
  IF v_digits = '' THEN
    RETURN 'unknown';
  END IF;

  -- 携帯・PHS。11 桁
  IF v_digits ~ '^0[789]0[0-9]{8}$' THEN
    RETURN 'mobile';
  END IF;

  -- IP 電話。11 桁。個人にも会社にも割り当てられる
  IF v_digits ~ '^050[0-9]{8}$' THEN
    RETURN 'ip';
  END IF;

  -- フリーダイヤル・ナビダイヤル等。会社の窓口であって個人には紐づかない
  IF v_digits ~ '^(0120|0800|0570)[0-9]+$' THEN
    RETURN 'toll_free';
  END IF;

  -- 020 / 060。実務ではほぼ出ないが、固定ではないので分けておく
  IF v_digits ~ '^0[0-9]0[0-9]+$' THEN
    RETURN 'other_non_landline';
  END IF;

  -- 0 始まりで上に当たらないもの。市内局番が 2〜9 で始まる固定電話
  IF v_digits ~ '^0[0-9]{8,9}$' THEN
    RETURN 'landline';
  END IF;

  RETURN 'unknown';
END;
$$;

COMMENT ON FUNCTION phone_line_type(TEXT) IS
  '電話番号の種別。mobile / ip / toll_free / other_non_landline / landline / unknown。3 桁目が 0 なら非固定（市内局番は 2〜9 で始まるため）';

-- ------------------------------------------------------------
-- 同定のキーに使えるか。**携帯だけ true。**
-- 050 を含めない理由は上のコメントのとおり
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_mobile_phone(p_phone TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT phone_line_type(p_phone) = 'mobile';
$$;

COMMENT ON FUNCTION is_mobile_phone(TEXT) IS
  '携帯番号（070/080/090）か。人物同定のキーに使えるかの判定。IP 電話は共有されうるため含めない';

-- ------------------------------------------------------------
-- 名刺の電話にラベルを付けるときの既定値
--
--   mobile                  → mobile
--   ip / other_non_landline → other（固定でも携帯でもない）
--   toll_free / landline    → work
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION default_phone_label(p_phone TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE phone_line_type(p_phone)
    WHEN 'mobile' THEN 'mobile'
    WHEN 'ip' THEN 'other'
    WHEN 'other_non_landline' THEN 'other'
    ELSE 'work'
  END;
$$;

-- ------------------------------------------------------------
-- 既存データのラベルを付け直す
--
-- これまでは「携帯でなければ work」だったため、IP 電話が会社の固定電話として
-- 記録されている。人が手で直したラベル（home / fax）は尊重して触らない
-- ------------------------------------------------------------
UPDATE contact_phones
   SET label = default_phone_label(phone)
 WHERE label IN ('work', 'mobile')
   AND label <> default_phone_label(phone);

-- ------------------------------------------------------------
-- 連絡先の解決でも新しいラベル判定を使う
-- （差分はラベルの決め方のみ。同定ロジックは 20260801000002 と同じ）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION resolve_or_create_contact(
  p_company_id     UUID,
  p_last_name      TEXT,
  p_first_name     TEXT,
  p_department     TEXT,
  p_job_title      TEXT,
  p_email          TEXT,
  p_phone          TEXT,
  p_owner_user_id  UUID,
  p_lead_source_id UUID,
  p_actor          UUID
) RETURNS UUID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
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
    SELECT id INTO v_status_id FROM contact_statuses
     WHERE name = '見込み' AND deleted_at IS NULL LIMIT 1;
    IF v_status_id IS NULL THEN
      SELECT id INTO v_status_id FROM contact_statuses
       WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;
    END IF;
    IF v_status_id IS NULL THEN
      RAISE EXCEPTION 'contact_statuses が未投入です';
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
$$;
