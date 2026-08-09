-- ============================================================
-- 昇格でも既存の事業者情報へ寄せる（T-0071）
--
--   **昇格経路だけが名寄せを通っていなかった。** 名刺取込・問い合わせ取込・
--   遡及バックフィルはどれも `resolve_or_create_company()` を通して
--   既存の事業者を再利用するのに、`promote_lead_to_deal` は
--   リードに `company_id` が無いとき**無条件 INSERT** していた。
--
--   その結果、
--     ・同じ会社のリードを手で作って昇格すると事業者が二重にできる
--     ・法人番号が既存と当たると `unique_violation` で昇格ごと落ちる
--   という状態だった（アプリ側の事前チェックが先に弾いていたので、
--   利用者には「同一企業への昇格はできません」と見えていた）。
--
--   名寄せを通せば「事業者 1 : リード N」が昇格経路でも成立する。
--
--   あわせて `deals.lead_id` を埋める（T-0069。紐づけの正本）。
--
--   **シグネチャは変えない。** 呼び出し側（src/actions/leads.ts）の
--   変更を最小にするため。
-- ============================================================

CREATE OR REPLACE FUNCTION promote_lead_to_deal(
  p_lead_id       UUID,
  p_company       JSONB,
  p_contact       JSONB,
  p_contact_email TEXT,
  p_contact_phone TEXT,
  p_account       JSONB,
  p_deal          JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id    UUID := auth.uid();
  v_lead       leads%ROWTYPE;
  v_company_id UUID;
  v_contact_id UUID;
  v_deal_id    UUID;
  v_stage_id   UUID;
  v_status_id  UUID;
  v_c          RECORD;
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
    SELECT * INTO v_c
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
      );

    -- **名寄せを通す。** 法人番号 → メールドメイン → 住所+名称 → 名称 の順に
    -- 既存を探し、無ければ作る。取込経路と同じ関数を使う（規則を二重に持たない）
    v_company_id := resolve_or_create_company(
      v_c.name,
      p_contact_email,
      v_c.phone,
      v_c.website_url,
      COALESCE(v_c.owner_user_id, v_lead.owner_user_id),
      COALESCE(v_c.lead_source_id, v_lead.lead_source_id),
      v_user_id,
      v_c.corporate_number,
      v_lead.address_id
    );

    -- 名寄せが扱わない項目は**空欄だけ補う**。
    -- 既存の事業者に寄ったとき、そちらの値を上書きしてはいけない
    IF v_company_id IS NOT NULL THEN
      UPDATE companies
         SET name_kana           = COALESCE(name_kana, v_c.name_kana),
             representative_name = COALESCE(representative_name, v_c.representative_name),
             company_status_id   = COALESCE(company_status_id, v_c.company_status_id),
             last_updated_by     = v_user_id
       WHERE id = v_company_id
         AND (name_kana IS NULL OR representative_name IS NULL OR company_status_id IS NULL);
    END IF;
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
  -- Account は契約成立時に作る。ここでは相手を company / contact で示す。
  -- **lead_id が紐づけの正本**（T-0069）
  INSERT INTO deals (
    name, pipeline_type_id, deal_stage_id, deal_status_id,
    account_id, company_id, contact_id, lead_id,
    owner_user_id, created_by, last_updated_by
  )
  SELECT
    d.name, d.pipeline_type_id, d.deal_stage_id, d.deal_status_id,
    NULL, v_company_id, v_contact_id, p_lead_id,
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

  -- ── 5. Lead の紐づけを更新 ────────────────────────────────────────────────
  -- `promoted_deal_id` はトリガー sync_lead_promoted_deal が入れるので触らない
  -- （派生値。正本は deals.lead_id）。promoted_account_id は契約時まで NULL
  UPDATE leads
     SET promoted_company_id = v_company_id,
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
$function$;

COMMENT ON FUNCTION promote_lead_to_deal IS
'リードをディールへ昇格させる。事業者情報は resolve_or_create_company で名寄せし、既存があれば再利用する（事業者 1 : リード N）。deals.lead_id を埋める';
