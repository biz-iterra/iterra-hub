-- ============================================================
-- Lead → Deal 昇格を単一トランザクションで実行する関数
--
-- 背景:
--   従来は Server Action が Company → Contact → Account → Deal を順に INSERT し、
--   失敗時は手書きの補償処理（DELETE）で巻き戻していた。
--   補償自体の失敗や実行中断（関数タイムアウト・デプロイ・異常終了）で
--   中途半端なデータが残る構造だったため、DB 関数に集約して原子性を担保する。
--
-- 設計:
--   - 値の整形（姓名分割・URL の転記先分岐・フォールバック）は TS 側に残し、
--     本関数は JSONB を受け取って INSERT するだけに徹する
--   - lead 行を FOR UPDATE でロックし、同時実行による二重昇格を防ぐ
--   - SECURITY INVOKER（既定）。呼び出しユーザーの RLS がそのまま効く
-- ============================================================

CREATE OR REPLACE FUNCTION promote_lead_to_deal(
  p_lead_id       UUID,
  p_company       JSONB,   -- NULL = 個人昇格（Company を作らない）
  p_contact       JSONB,
  p_contact_email TEXT,    -- NULL 可
  p_contact_phone TEXT,    -- NULL 可
  p_account       JSONB,
  p_deal          JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id    UUID := auth.uid();
  v_lead       leads%ROWTYPE;
  v_company_id UUID;
  v_contact_id UUID;
  v_account_id UUID;
  v_deal_id    UUID;
  v_stage_id   UUID;
  v_status_id  UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '認証が必要です';
  END IF;

  -- ── 対象 Lead をロックして取得（二重昇格の同時実行を防ぐ）──────────────────
  SELECT * INTO v_lead
    FROM leads
   WHERE id = p_lead_id
     AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'リードが見つかりません';
  END IF;

  IF v_lead.promoted_deal_id IS NOT NULL THEN
    RAISE EXCEPTION 'このリードはすでに Deal に昇格済みです';
  END IF;

  -- ── 1. Company（法人のみ）────────────────────────────────────────────────
  IF p_company IS NOT NULL THEN
    BEGIN
      INSERT INTO companies (
        name, name_kana, representative_name, corporate_number, phone,
        website_url, lead_source_id, owner_user_id, company_status_id,
        created_by, last_updated_by
      )
      SELECT
        c.name, c.name_kana, c.representative_name, c.corporate_number, c.phone,
        c.website_url, c.lead_source_id, c.owner_user_id, c.company_status_id,
        c.created_by, c.last_updated_by
      FROM jsonb_to_record(p_company) AS c(
        name                TEXT,
        name_kana           TEXT,
        representative_name TEXT,
        corporate_number    TEXT,
        phone               TEXT,
        website_url         TEXT,
        lead_source_id      UUID,
        owner_user_id       UUID,
        company_status_id   UUID,
        created_by          UUID,
        last_updated_by     UUID
      )
      RETURNING id INTO v_company_id;
    EXCEPTION WHEN unique_violation THEN
      -- 事前チェックをすり抜けた同時実行ケース（companies.corporate_number は UNIQUE）
      RAISE EXCEPTION '[corporate_number] 法人番号 % の企業が既に登録されています', v_lead.corporate_number;
    END;
  END IF;

  -- ── 2. Contact ────────────────────────────────────────────────────────────
  INSERT INTO contacts (
    last_name, middle_name, first_name,
    last_name_kana, middle_name_kana, first_name_kana,
    department, job_title, contact_type, company_id, website_url,
    contact_status_id, lead_source_id, owner_user_id,
    created_by, last_updated_by
  )
  SELECT
    ct.last_name, ct.middle_name, ct.first_name,
    ct.last_name_kana, ct.middle_name_kana, ct.first_name_kana,
    ct.department, ct.job_title, ct.contact_type, v_company_id, ct.website_url,
    ct.contact_status_id, ct.lead_source_id, ct.owner_user_id,
    ct.created_by, ct.last_updated_by
  FROM jsonb_to_record(p_contact) AS ct(
    last_name         TEXT,
    middle_name       TEXT,
    first_name        TEXT,
    last_name_kana    TEXT,
    middle_name_kana  TEXT,
    first_name_kana   TEXT,
    department        TEXT,
    job_title         TEXT,
    contact_type      TEXT,
    website_url       TEXT,
    contact_status_id UUID,
    lead_source_id    UUID,
    owner_user_id     UUID,
    created_by        UUID,
    last_updated_by   UUID
  )
  RETURNING id INTO v_contact_id;

  -- 法人は代表者として Company に紐付ける
  IF v_company_id IS NOT NULL THEN
    UPDATE companies
       SET primary_contact_id = v_contact_id
     WHERE id = v_company_id;
  END IF;

  -- ── 3. 連絡先（任意）──────────────────────────────────────────────────────
  IF p_contact_email IS NOT NULL THEN
    INSERT INTO contact_emails (contact_id, email, label, is_primary, created_by, last_updated_by)
    VALUES (v_contact_id, p_contact_email, 'work', TRUE, v_user_id, v_user_id);
  END IF;

  IF p_contact_phone IS NOT NULL THEN
    INSERT INTO contact_phones (contact_id, phone, label, is_primary, created_by, last_updated_by)
    VALUES (v_contact_id, p_contact_phone, 'work', TRUE, v_user_id, v_user_id);
  END IF;

  -- ── 4. Account ────────────────────────────────────────────────────────────
  INSERT INTO accounts (
    name, account_type_id, account_status_id, company_id,
    lead_source_id, owner_user_id, created_by
  )
  SELECT
    a.name, a.account_type_id, a.account_status_id, v_company_id,
    a.lead_source_id, a.owner_user_id, a.created_by
  FROM jsonb_to_record(p_account) AS a(
    name              TEXT,
    account_type_id   UUID,
    account_status_id UUID,
    lead_source_id    UUID,
    owner_user_id     UUID,
    created_by        UUID
  )
  RETURNING id INTO v_account_id;

  -- ── 5. account_contacts ───────────────────────────────────────────────────
  INSERT INTO account_contacts (account_id, contact_id, role)
  VALUES (v_account_id, v_contact_id, 'primary');

  -- ── 6. Deal ───────────────────────────────────────────────────────────────
  INSERT INTO deals (
    name, pipeline_type_id, deal_stage_id, deal_status_id,
    account_id, owner_user_id, created_by, last_updated_by
  )
  SELECT
    d.name, d.pipeline_type_id, d.deal_stage_id, d.deal_status_id,
    v_account_id, d.owner_user_id, d.created_by, d.last_updated_by
  FROM jsonb_to_record(p_deal) AS d(
    name             TEXT,
    pipeline_type_id UUID,
    deal_stage_id    UUID,
    deal_status_id   UUID,
    owner_user_id    UUID,
    created_by       UUID,
    last_updated_by  UUID
  )
  RETURNING id, deal_stage_id, deal_status_id
       INTO v_deal_id, v_stage_id, v_status_id;

  -- ── 7. Lead の promoted_* を更新 ──────────────────────────────────────────
  UPDATE leads
     SET promoted_deal_id    = v_deal_id,
         promoted_company_id = v_company_id,
         promoted_contact_id = v_contact_id,
         promoted_account_id = v_account_id,
         last_updated_by     = v_user_id
   WHERE id = p_lead_id;

  -- ── 8. Deal のステージ／ステータス初回履歴 ────────────────────────────────
  INSERT INTO deal_stage_histories (deal_id, from_stage_id, to_stage_id, changed_by)
  VALUES (v_deal_id, NULL, v_stage_id, v_user_id);

  -- deal_status_histories.stage_id は NOT NULL（どのステージ時点の変更かを保持する）。
  -- 旧 Server Action 実装はこれを渡しておらず、戻り値も検査していなかったため
  -- ステータス履歴が記録されないまま握り潰されていた。
  INSERT INTO deal_status_histories (deal_id, stage_id, from_status_id, to_status_id, changed_by)
  VALUES (v_deal_id, v_stage_id, NULL, v_status_id, v_user_id);

  RETURN jsonb_build_object(
    'deal_id',    v_deal_id,
    'company_id', v_company_id,
    'contact_id', v_contact_id,
    'account_id', v_account_id
  );
END;
$$;

COMMENT ON FUNCTION promote_lead_to_deal IS
  'Lead → Deal 昇格を単一トランザクションで実行する。値の整形は呼び出し側（Server Action）の責務。';

REVOKE ALL ON FUNCTION promote_lead_to_deal FROM PUBLIC;
GRANT EXECUTE ON FUNCTION promote_lead_to_deal TO authenticated;
