-- ============================================================
-- 名刺の記録と、人物同定への携帯番号の追加
--
-- 設計: docs/contact-identity.md § 4, § 5
-- ============================================================

-- ------------------------------------------------------------
-- 携帯番号の判定
--
-- 代表電話で人物を同定すると同じ会社の全員が一致してしまうため、
-- 携帯番号に限って同定のキーに使う。転職しても携帯は変わらないので、
-- **日付に頼らずに同一人物を追える**数少ない手掛かりになる。
-- 表記揺れ（ハイフン・全角）を吸収するので入力は正規化前でよい。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_mobile_phone(p_phone TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g') ~ '^0[789]0[0-9]{8}$';
$$;

COMMENT ON FUNCTION is_mobile_phone(TEXT) IS
  '日本の携帯番号（070/080/090 + 8 桁）か。人物同定のキーに使えるかの判定';

-- 数字だけに正規化した番号で引けるようにする（同定 P2 の照合用）
CREATE INDEX idx_contact_phones_digits
  ON contact_phones ((regexp_replace(phone, '[^0-9]', '', 'g')));

-- ------------------------------------------------------------
-- 人物の同定に携帯番号を加える
--
--   P1 メール一致
--   P2 携帯番号一致 + 姓一致   ← 追加
--   P3 会社 × 姓名一致
--
-- 姓名だけが一致する組は自動で同一人物にしない（統合候補に回す）。
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
      CASE WHEN is_mobile_phone(v_phone) THEN 'mobile' ELSE 'work' END,
      NOT EXISTS (SELECT 1 FROM contact_phones WHERE contact_id = v_id),
      p_actor, p_actor
    );
  END IF;

  RETURN v_id;
END;
$$;

-- ------------------------------------------------------------
-- 名刺を記録する
--
-- メール・電話の行に紐づけて名刺を残す。所属（会社・部署・役職）は
-- 名刺の属性であり、**連絡先の現在の所属は書き換えない**。
-- 書き換えるのは apply_business_card_as_current（人の操作）だけ。
--
-- 例外は「連絡先の現在の所属が、この名刺と同じ会社のとき」。
-- その名刺が現在の所属を表しているので、採用済みの印だけ付ける
-- （値は同じなので上書きは起きない）。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_business_card(
  p_contact_id          UUID,
  p_company_id          UUID,
  p_company_name_raw    TEXT,
  p_department          TEXT,
  p_job_title           TEXT,
  p_email               TEXT,
  p_phone               TEXT,
  p_address_id          UUID DEFAULT NULL,
  p_source              TEXT DEFAULT 'manual',
  p_source_external_key TEXT DEFAULT NULL,
  p_registered_on       DATE DEFAULT NULL,
  p_actor               UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_card_id  UUID;
  v_email_id UUID;
  v_phone_id UUID;
  v_dept     TEXT := NULLIF(btrim(COALESCE(p_department, '')), '');
  v_title    TEXT := NULLIF(btrim(COALESCE(p_job_title, '')), '');
  v_raw      TEXT := NULLIF(btrim(COALESCE(p_company_name_raw, '')), '');
  v_email    TEXT := NULLIF(btrim(COALESCE(p_email, '')), '');
  v_phone    TEXT := NULLIF(btrim(COALESCE(p_phone, '')), '');
BEGIN
  IF p_contact_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 会社が分からない名刺は所属の記録にならない
  IF p_company_id IS NULL AND v_raw IS NULL THEN
    RETURN NULL;
  END IF;

  -- この名刺の連絡手段。resolve_or_create_contact が既に行を作っている
  IF v_email IS NOT NULL THEN
    SELECT id INTO v_email_id FROM contact_emails
     WHERE contact_id = p_contact_id AND lower(email) = lower(v_email) LIMIT 1;
  END IF;
  IF v_phone IS NOT NULL THEN
    SELECT id INTO v_phone_id FROM contact_phones
     WHERE contact_id = p_contact_id AND phone = v_phone LIMIT 1;
  END IF;

  -- 同じ名刺が既にあれば内容を更新する（再取込で増やさない）
  IF p_source_external_key IS NOT NULL THEN
    SELECT id INTO v_card_id FROM business_cards
     WHERE source = p_source AND source_external_key = p_source_external_key;
  END IF;

  IF v_card_id IS NULL THEN
    INSERT INTO business_cards (
      contact_id, contact_email_id, contact_phone_id,
      company_id, company_name_raw, department, job_title, address_id,
      source, source_external_key, source_registered_on,
      created_by, last_updated_by
    ) VALUES (
      p_contact_id, v_email_id, v_phone_id,
      p_company_id, v_raw, v_dept, v_title, p_address_id,
      p_source, p_source_external_key, p_registered_on,
      p_actor, p_actor
    ) RETURNING id INTO v_card_id;
  ELSE
    UPDATE business_cards SET
      contact_id       = p_contact_id,
      contact_email_id = COALESCE(v_email_id, contact_email_id),
      contact_phone_id = COALESCE(v_phone_id, contact_phone_id),
      company_id       = COALESCE(p_company_id, company_id),
      company_name_raw = COALESCE(v_raw, company_name_raw),
      department       = COALESCE(v_dept, department),
      job_title        = COALESCE(v_title, job_title),
      address_id       = COALESCE(p_address_id, address_id),
      source_registered_on = COALESCE(p_registered_on, source_registered_on),
      last_updated_by  = p_actor
    WHERE id = v_card_id;
  END IF;

  -- 現在の所属と同じ会社なら、この名刺が今の所属を表しているとみなして印を付ける。
  -- 値は同じなので上書きにはならない
  IF NOT EXISTS (
    SELECT 1 FROM business_cards WHERE contact_id = p_contact_id AND is_primary
  ) AND EXISTS (
    SELECT 1 FROM contacts
     WHERE id = p_contact_id AND company_id IS NOT DISTINCT FROM p_company_id
  ) THEN
    UPDATE business_cards SET is_primary = TRUE WHERE id = v_card_id;
  END IF;

  RETURN v_card_id;
END;
$$;

COMMENT ON FUNCTION record_business_card IS
  '名刺を記録する。連絡先の現在の所属は書き換えない（切り替えは人の操作で apply_business_card_as_current を呼ぶ）';
