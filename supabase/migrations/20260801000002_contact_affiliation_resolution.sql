-- ============================================================
-- 連絡先の同定に携帯番号を加え、所属変更（転職・異動）を反映する
--
-- 設計: docs/contact-identity.md § 4, § 5
-- ============================================================

-- ------------------------------------------------------------
-- 携帯番号の判定
--
-- 代表電話で人物を同定すると同じ会社の全員が一致してしまうため、
-- 携帯番号に限って同定のキーに使う。
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

-- 数字だけに正規化した番号で引けるようにする（P2 の照合用）
CREATE INDEX idx_contact_phones_digits
  ON contact_phones ((regexp_replace(phone, '[^0-9]', '', 'g')));

-- ------------------------------------------------------------
-- 所属の反映
--
-- 名刺の所属（B）と現在の所属（A）を突き合わせ、時系列で整合させる。
-- 戻り値で呼び出し側が「転職」「異動」を区別できるようにする。
--
--   unchanged     所属に変化なし
--   created       初めての所属
--   transferred   転職（会社が変わった）
--   reassigned    異動（同じ会社で部署・役職が変わった）
--   history_only  古い名刺・日付不明。履歴には残すが現在の所属は動かさない
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION apply_contact_affiliation(
  p_contact_id       UUID,
  p_company_id       UUID,
  p_company_name_raw TEXT,
  p_department       TEXT,
  p_job_title        TEXT,
  p_exchanged_on     DATE,
  p_source           TEXT DEFAULT 'business_card',
  p_source_record_id UUID DEFAULT NULL,
  p_actor            UUID DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current    contact_affiliations%ROWTYPE;
  v_dept       TEXT := NULLIF(btrim(COALESCE(p_department, '')), '');
  v_title      TEXT := NULLIF(btrim(COALESCE(p_job_title, '')), '');
  v_raw        TEXT := NULLIF(btrim(COALESCE(p_company_name_raw, '')), '');
  v_same       BOOLEAN;
  v_moved      BOOLEAN;
  v_contact    contacts%ROWTYPE;
BEGIN
  IF p_contact_id IS NULL THEN
    RETURN 'unchanged';
  END IF;

  -- 会社を特定できず会社名も無い名刺は所属として成立しない
  IF p_company_id IS NULL AND v_raw IS NULL THEN
    RETURN 'unchanged';
  END IF;

  SELECT * INTO v_current
    FROM contact_affiliations
   WHERE contact_id = p_contact_id AND is_current;

  -- ── 初めての所属 ──
  IF NOT FOUND THEN
    INSERT INTO contact_affiliations (
      contact_id, company_id, company_name_raw, department, job_title,
      started_on, is_current, source, source_record_id, created_by, last_updated_by
    ) VALUES (
      p_contact_id, p_company_id, v_raw, v_dept, v_title,
      p_exchanged_on, TRUE, p_source, p_source_record_id, p_actor, p_actor
    );
    PERFORM sync_contact_current_affiliation(p_contact_id);
    RETURN 'created';
  END IF;

  -- ── 同じ所属か ──
  v_same := v_current.company_id IS NOT DISTINCT FROM p_company_id
        AND (
          p_company_id IS NOT NULL
          OR v_current.company_name_raw IS NOT DISTINCT FROM v_raw
        )
        AND v_current.department IS NOT DISTINCT FROM v_dept
        AND v_current.job_title  IS NOT DISTINCT FROM v_title;

  IF v_same THEN
    -- より古い在籍日が判明したら開始日を早める（在籍期間の精度が上がる）
    IF p_exchanged_on IS NOT NULL
       AND (v_current.started_on IS NULL OR p_exchanged_on < v_current.started_on) THEN
      UPDATE contact_affiliations
         SET started_on = p_exchanged_on, last_updated_by = p_actor
       WHERE id = v_current.id;
    END IF;
    RETURN 'unchanged';
  END IF;

  -- ── 日付が無い / 古い名刺は履歴にだけ残す ──
  -- 名刺は交換日順に届くとは限らない。古い名刺で現在の所属を巻き戻さない
  IF p_exchanged_on IS NULL
     OR (v_current.started_on IS NOT NULL AND p_exchanged_on <= v_current.started_on) THEN
    INSERT INTO contact_affiliations (
      contact_id, company_id, company_name_raw, department, job_title,
      started_on, ended_on, is_current, source, source_record_id, created_by, last_updated_by
    ) VALUES (
      p_contact_id, p_company_id, v_raw, v_dept, v_title,
      p_exchanged_on,
      CASE
        WHEN v_current.started_on IS NULL THEN NULL
        -- 現所属の開始前日まで在籍していたとみなす。開始日を下回らないようにする
        WHEN p_exchanged_on IS NOT NULL AND p_exchanged_on > v_current.started_on - 1
          THEN p_exchanged_on
        ELSE v_current.started_on - 1
      END,
      FALSE, p_source, p_source_record_id, p_actor, p_actor
    );
    RETURN 'history_only';
  END IF;

  -- ── 所属変更 ──
  -- 一意インデックス（is_current は 1 人 1 行）があるため、先に現所属を閉じる
  v_moved := v_current.company_id IS DISTINCT FROM p_company_id;

  UPDATE contact_affiliations
     SET is_current = FALSE,
         ended_on = GREATEST(p_exchanged_on - 1, COALESCE(started_on, p_exchanged_on - 1)),
         last_updated_by = p_actor
   WHERE id = v_current.id;

  INSERT INTO contact_affiliations (
    contact_id, company_id, company_name_raw, department, job_title,
    started_on, is_current, source, source_record_id, created_by, last_updated_by
  ) VALUES (
    p_contact_id, p_company_id, v_raw, v_dept, v_title,
    p_exchanged_on, TRUE, p_source, p_source_record_id, p_actor, p_actor
  );

  PERFORM sync_contact_current_affiliation(p_contact_id);

  RETURN CASE WHEN v_moved THEN 'transferred' ELSE 'reassigned' END;
END;
$$;

COMMENT ON FUNCTION apply_contact_affiliation IS
  '名刺の所属を contact_affiliations へ反映する。戻り値: unchanged / created / transferred / reassigned / history_only';

-- ------------------------------------------------------------
-- contacts のキャッシュ同期
--
-- contacts.company_id / department / job_title は is_current の写し。
-- ここ以外から書き換えないこと（docs/contact-identity.md § 3.2）。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_contact_current_affiliation(p_contact_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_aff     contact_affiliations%ROWTYPE;
  v_contact contacts%ROWTYPE;
BEGIN
  SELECT * INTO v_aff
    FROM contact_affiliations
   WHERE contact_id = p_contact_id AND is_current;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT * INTO v_contact FROM contacts WHERE id = p_contact_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE contacts
     SET company_id = v_aff.company_id,
         department = v_aff.department,
         job_title  = v_aff.job_title,
         -- 代表者は代表者のまま。所属先が付いた一般社員だけ employee にする
         contact_type = CASE
           WHEN v_contact.contact_type = 'corporate_rep' THEN v_contact.contact_type
           WHEN v_aff.company_id IS NOT NULL THEN 'employee'
           ELSE v_contact.contact_type
         END
   WHERE id = p_contact_id;
END;
$$;

-- ------------------------------------------------------------
-- 人物の同定に携帯番号を加える
--
--   P1 メール一致
--   P2 携帯番号一致 + 姓一致   ← 追加。転職しても携帯は変わらない
--   P3 会社 × 姓名一致
--
-- 所属の反映はこの関数では行わない（apply_contact_affiliation の責務）。
-- ここは「人を見つける・作る」ことに専念する。
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

  -- P2. 携帯番号 + 姓一致。会社が変わっても追随できる
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
  -- 旧アドレスは残す（過去のメール履歴の参照先を壊さないため）
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
