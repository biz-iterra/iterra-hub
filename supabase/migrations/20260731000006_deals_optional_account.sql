-- ============================================================
-- 商談を取引先なしで作れるようにする
--
-- 背景:
--   取引先（Account）は「契約主体」なので、契約が決まるまで作らない運用に変える。
--   従来は deals.account_id が NOT NULL で、昇格時に必ず Account を作っていた。
--
-- 相手先の持ち方:
--   account_id を外すだけだと「誰との商談か」が画面から消えるため、
--   法人情報・連絡先への参照を商談自身に持たせる。
--   契約時に Account が作られたら account_id が埋まり、以降はそちらが主になる。
--
--     契約前: company_id / contact_id で相手を示す
--     契約後: account_id が主、company_id / contact_id は経緯として残る
-- ============================================================

ALTER TABLE deals ALTER COLUMN account_id DROP NOT NULL;

ALTER TABLE deals ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE deals ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id);

CREATE INDEX IF NOT EXISTS deals_company_idx ON deals(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS deals_contact_idx ON deals(contact_id) WHERE contact_id IS NOT NULL;

COMMENT ON COLUMN deals.account_id IS '取引先。契約成立時に作られるため、契約前は NULL';
COMMENT ON COLUMN deals.company_id IS '相手法人。取引先が未作成の間の相手先を示す';
COMMENT ON COLUMN deals.contact_id IS '相手担当者。取引先が未作成の間の相手先を示す';

-- 相手が誰も特定できない商談は作らせない。
-- account / company / contact のいずれか 1 つは必須にする
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_counterparty_check;
ALTER TABLE deals ADD CONSTRAINT deals_counterparty_check
  CHECK (account_id IS NOT NULL OR company_id IS NOT NULL OR contact_id IS NOT NULL);

-- ============================================================
-- Lead → Deal 昇格から Account 作成を外す
--
-- 変更点（20260728000001 / 20260729000002 からの差分）:
--   - Company / Contact は取込時に作られたものを使う。無い場合だけ作る
--   - Account と account_contacts は作らない（契約時に作る）
--   - Deal には company_id / contact_id を持たせる
--
-- 引数を減らすと呼び出し側の変更が大きいので、p_company / p_contact /
-- p_account は互換のため残す。p_account は無視する。
-- ============================================================
CREATE OR REPLACE FUNCTION promote_lead_to_deal(
  p_lead_id       UUID,
  p_company       JSONB,   -- NULL = 個人昇格（Company を作らない）
  p_contact       JSONB,
  p_contact_email TEXT,    -- NULL 可
  p_contact_phone TEXT,    -- NULL 可
  p_account       JSONB,   -- 互換のため受け取るが使わない（Account は契約時に作る）
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

  -- ── 1. Company ────────────────────────────────────────────────────────────
  -- 取込時に作られていればそれを使う。名刺由来のリードは基本ここで確定する
  v_company_id := v_lead.company_id;

  IF v_company_id IS NULL AND p_company IS NOT NULL THEN
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
  v_contact_id := v_lead.contact_id;

  IF v_contact_id IS NULL THEN
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

    -- ── 3. 連絡先（新規作成した場合のみ）──────────────────────────────────
    -- 既存 Contact には取込時に登録済みなので触らない
    IF p_contact_email IS NOT NULL THEN
      INSERT INTO contact_emails (contact_id, email, label, is_primary, created_by, last_updated_by)
      VALUES (v_contact_id, p_contact_email, 'work', TRUE, v_user_id, v_user_id);
    END IF;

    IF p_contact_phone IS NOT NULL THEN
      INSERT INTO contact_phones (contact_id, phone, label, is_primary, created_by, last_updated_by)
      VALUES (v_contact_id, p_contact_phone, 'work', TRUE, v_user_id, v_user_id);
    END IF;
  END IF;

  -- 法人の代表者が未設定なら、この連絡先を代表として立てる
  IF v_company_id IS NOT NULL AND v_contact_id IS NOT NULL THEN
    UPDATE companies
       SET primary_contact_id = v_contact_id
     WHERE id = v_company_id
       AND primary_contact_id IS NULL;
  END IF;

  -- ── 4. Deal（取引先なし）──────────────────────────────────────────────────
  -- Account は契約成立時に作る。ここでは相手を company / contact で示す
  INSERT INTO deals (
    name, pipeline_type_id, deal_stage_id, deal_status_id,
    account_id, company_id, contact_id,
    owner_user_id, created_by, last_updated_by
  )
  SELECT
    d.name, d.pipeline_type_id, d.deal_stage_id, d.deal_status_id,
    NULL, v_company_id, v_contact_id,
    d.owner_user_id, d.created_by, d.last_updated_by
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

  -- ── 5. Lead の promoted_* を更新 ──────────────────────────────────────────
  -- promoted_account_id は契約時まで NULL のまま
  UPDATE leads
     SET promoted_deal_id    = v_deal_id,
         promoted_company_id = v_company_id,
         promoted_contact_id = v_contact_id,
         company_id          = COALESCE(company_id, v_company_id),
         contact_id          = COALESCE(contact_id, v_contact_id),
         last_updated_by     = v_user_id
   WHERE id = p_lead_id;

  -- ── 6. Deal のステージ／ステータス初回履歴 ────────────────────────────────
  INSERT INTO deal_stage_histories (deal_id, from_stage_id, to_stage_id, changed_by)
  VALUES (v_deal_id, NULL, v_stage_id, v_user_id);

  INSERT INTO deal_status_histories (deal_id, stage_id, from_status_id, to_status_id, changed_by)
  VALUES (v_deal_id, v_stage_id, NULL, v_status_id, v_user_id);

  RETURN jsonb_build_object(
    'deal_id',    v_deal_id,
    'company_id', v_company_id,
    'contact_id', v_contact_id,
    'account_id', NULL
  );
END;
$$;

COMMENT ON FUNCTION promote_lead_to_deal IS
  'Lead → Deal 昇格。取引先（Account）は作らない（契約成立時に作る）。Company / Contact は取込済みのものを引き継ぐ';
