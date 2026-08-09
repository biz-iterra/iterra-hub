-- ============================================================
-- 連絡先の新規作成に SNS・チャットも載せる（T-0026）
--
-- 背景:
--   T-0024 でメール・電話・住所は create_contact_with_details() に載ったが、
--   SNS・チャットは「選んだサービスで入力欄が変わるため別途設計が要る」として
--   対象外にした（20260805000003 のコメント、docs/database-design.md § 25.1）。
--
-- 方針:
--   - contact_social_accounts は「サービスごとに何を入れるか変わる」だけで、
--     書き込み自体はメール・電話と同じ形（配列 → 1 件ずつ INSERT）で済む。
--     入力欄の出し分けは TS 側（ContactSocialAccountsDraft）の責務
--   - PostgreSQL は引数の個数が変わると CREATE OR REPLACE FUNCTION では
--     置き換えにならず別オーバーロードとして増える（実機で確認済み）。
--     旧シグネチャを DROP してから作り直す
-- ============================================================

DROP FUNCTION IF EXISTS create_contact_with_details(JSONB, JSONB, JSONB, JSONB, UUID);

CREATE OR REPLACE FUNCTION create_contact_with_details(
  p_contact         JSONB,
  p_emails          JSONB DEFAULT '[]'::JSONB,
  p_phones          JSONB DEFAULT '[]'::JSONB,
  p_address         JSONB DEFAULT NULL,
  p_account_id      UUID DEFAULT NULL,
  -- SNS・チャット。各要素: { service_id, account_id, workspace, display_name }
  -- サービスごとの必須欄（ワークスペース等）の検査は TS 側（Zod + サービスマスタ参照）で行う
  p_social_accounts JSONB DEFAULT '[]'::JSONB
) RETURNS UUID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor      UUID := auth.uid();
  v_contact_id UUID;
  v_row        JSONB;
  v_idx        INTEGER := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION '認証が必要です';
  END IF;

  -- ── 1. 連絡先本体 ────────────────────────────────────────────────────────
  INSERT INTO contacts (
    last_name, middle_name, first_name,
    last_name_kana, middle_name_kana, first_name_kana,
    contact_status_id, contact_type, company_id,
    department, job_title, birth_date, blood_type,
    potential_number, constellation_id, lead_source_id,
    line_user_id, internal_memo, website_url,
    owner_user_id, created_by, last_updated_by
  )
  SELECT
    c.last_name, c.middle_name, c.first_name,
    c.last_name_kana, c.middle_name_kana, c.first_name_kana,
    c.contact_status_id, c.contact_type, c.company_id,
    c.department, c.job_title, c.birth_date, c.blood_type,
    c.potential_number, c.constellation_id, c.lead_source_id,
    c.line_user_id, c.internal_memo, c.website_url,
    COALESCE(c.owner_user_id, v_actor), v_actor, v_actor
  FROM jsonb_to_record(p_contact) AS c(
    last_name         TEXT,
    middle_name       TEXT,
    first_name        TEXT,
    last_name_kana    TEXT,
    middle_name_kana  TEXT,
    first_name_kana   TEXT,
    contact_status_id UUID,
    contact_type      TEXT,
    company_id        UUID,
    department        TEXT,
    job_title         TEXT,
    birth_date        DATE,
    blood_type        TEXT,
    potential_number  SMALLINT,
    constellation_id  UUID,
    lead_source_id    UUID,
    line_user_id      TEXT,
    internal_memo     TEXT,
    website_url       TEXT,
    owner_user_id     UUID
  )
  RETURNING id INTO v_contact_id;

  -- ── 2. メール ────────────────────────────────────────────────────────────
  -- 主連絡先の指定が無ければ先頭を主にする。`is_primary` が複数立つと
  -- 表示側がどれを出すか決められないため、ここで 1 つに絞る
  FOR v_row IN SELECT * FROM jsonb_array_elements(COALESCE(p_emails, '[]'::JSONB))
  LOOP
    v_idx := v_idx + 1;
    INSERT INTO contact_emails (contact_id, email, label, is_primary, created_by, last_updated_by)
    VALUES (
      v_contact_id,
      v_row ->> 'email',
      COALESCE(NULLIF(v_row ->> 'label', ''), 'work'),
      COALESCE((v_row ->> 'is_primary')::BOOLEAN, v_idx = 1),
      v_actor, v_actor
    );
  END LOOP;

  -- ── 3. 電話 ──────────────────────────────────────────────────────────────
  v_idx := 0;
  FOR v_row IN SELECT * FROM jsonb_array_elements(COALESCE(p_phones, '[]'::JSONB))
  LOOP
    v_idx := v_idx + 1;
    INSERT INTO contact_phones (contact_id, phone, label, is_primary, created_by, last_updated_by)
    VALUES (
      v_contact_id,
      v_row ->> 'phone',
      COALESCE(NULLIF(v_row ->> 'label', ''), 'work'),
      COALESCE((v_row ->> 'is_primary')::BOOLEAN, v_idx = 1),
      v_actor, v_actor
    );
  END LOOP;

  -- ── 4. 住所（あれば）──────────────────────────────────────────────────────
  IF p_address IS NOT NULL AND (
       COALESCE(p_address ->> 'postal_code', '') <> ''
    OR COALESCE(p_address ->> 'prefecture', '') <> ''
    OR COALESCE(p_address ->> 'city', '') <> ''
    OR COALESCE(p_address ->> 'address_line1', '') <> ''
  ) THEN
    PERFORM add_entity_address(
      'contact', v_contact_id,
      p_address ->> 'postal_code',
      p_address ->> 'prefecture',
      p_address ->> 'city',
      p_address ->> 'address_line1',
      p_address ->> 'address_line2',
      COALESCE(NULLIF(p_address ->> 'label', ''), 'main'),
      NULL, NULL, NULL, v_actor
    );
  END IF;

  -- ── 5. 取引先への紐づけ（指定があれば）────────────────────────────────────
  IF p_account_id IS NOT NULL THEN
    INSERT INTO account_contacts (account_id, contact_id, role, created_by)
    VALUES (p_account_id, v_contact_id, 'other', v_actor)
    ON CONFLICT (account_id, contact_id) DO NOTHING;
  END IF;

  -- ── 6. SNS・チャット（あれば）──────────────────────────────────────────────
  -- 一意制約（contact_id, service_id, account_id, workspace）は個別の連絡口の
  -- テーブルと同じ。同じ相手を二重に入れようとすると全体がロールバックされる
  -- （単一トランザクションなので他の書き込みも巻き戻る）
  FOR v_row IN SELECT * FROM jsonb_array_elements(COALESCE(p_social_accounts, '[]'::JSONB))
  LOOP
    INSERT INTO contact_social_accounts (
      contact_id, service_id, account_id, workspace, display_name,
      created_by, last_updated_by
    )
    VALUES (
      v_contact_id,
      (v_row ->> 'service_id')::UUID,
      v_row ->> 'account_id',
      NULLIF(v_row ->> 'workspace', ''),
      NULLIF(v_row ->> 'display_name', ''),
      v_actor, v_actor
    );
  END LOOP;

  RETURN v_contact_id;
END;
$$;

COMMENT ON FUNCTION create_contact_with_details IS
'連絡先と連絡手段・住所・SNS/チャットを単一トランザクションで作る。値の整形は呼び出し側（Server Action）の責務。SECURITY INVOKER なので RLS がそのまま効く';

REVOKE ALL ON FUNCTION create_contact_with_details(JSONB, JSONB, JSONB, JSONB, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_contact_with_details(JSONB, JSONB, JSONB, JSONB, UUID, JSONB) TO authenticated;
