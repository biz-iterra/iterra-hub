-- ============================================================
-- 名刺取込で business_cards を記録する
--
-- 変更点（20260731000004 からの差分）:
--   - 連絡先を解決したあと record_business_card を呼び、名刺をメール・電話の
--     行に紐づけて残す
--   - 姓名しか一致しない組を統合候補として記録する
--   - 戻り値に card_count / merge_candidate_count を足す
--
-- **連絡先の現在の所属（会社・部署・役職）は書き換えない。**
-- Eight の「名刺交換日」は利用者が Eight にデータを登録した日であり、
-- 在籍期間でも名刺情報の変更日でもないため、日付を根拠に所属を
-- 切り替えることをしない。切り替えは人が名刺を選んで行う
-- （apply_business_card_as_current）。docs/contact-identity.md § 5
-- ============================================================

CREATE OR REPLACE FUNCTION import_eight_leads(
  p_batch    JSONB,
  p_leads    JSONB,
  p_errors   JSONB,
  p_defaults JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch_id       UUID;
  v_imported_by    UUID := (p_batch ->> 'imported_by')::UUID;
  v_stage_id       UUID := (p_defaults ->> 'stage_id')::UUID;
  v_status_id      UUID := (p_defaults ->> 'status_id')::UUID;
  v_source_id      UUID := (p_defaults ->> 'lead_source_id')::UUID;
  v_activity_type  UUID := (p_defaults ->> 'activity_type_id')::UUID;
  v_call_status_id UUID := (p_defaults ->> 'call_status_id')::UUID;
  v_owner_id       UUID := (p_defaults ->> 'owner_user_id')::UUID;

  v_item           JSONB;
  v_lead           JSONB;
  v_addr           JSONB;
  v_act            JSONB;
  v_raw_row        JSONB;
  v_err            JSONB;

  v_existing_id    UUID;
  v_lead_id        UUID;
  v_address_id     UUID;
  v_call_number    INTEGER;

  -- 法人・連絡先の解決に使う。CSV の値ではなく確定後の leads 行を見る
  -- （既存 Lead は CRM 側で入力済みの値の方が正しいため）
  v_lead_row       leads%ROWTYPE;
  v_company_id     UUID;
  v_contact_id     UUID;

  -- 名刺の記録
  v_card_id          UUID;
  v_registered_on    DATE;
  -- 連絡先を今回紐付けたか。統合候補の検出を走らせる判断に使う
  v_contact_was_null BOOLEAN;

  v_created     INTEGER := 0;
  v_updated     INTEGER := 0;
  v_skipped     INTEGER := 0;
  v_error       INTEGER := 0;
  v_cards       INTEGER := 0;
  v_candidates  INTEGER := 0;
BEGIN
  IF v_imported_by IS NULL THEN
    RAISE EXCEPTION 'imported_by が指定されていません';
  END IF;
  IF v_stage_id IS NULL OR v_status_id IS NULL OR v_source_id IS NULL THEN
    RAISE EXCEPTION 'ステージ / ステータス / リードソースの既定値が解決できていません';
  END IF;
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION '担当者が指定されていません';
  END IF;
  -- lead_activities.call_status_id は NOT NULL。名刺交換用の値が必要
  IF v_activity_type IS NULL OR v_call_status_id IS NULL THEN
    RAISE EXCEPTION '対応種別 / 通電状況の既定値が解決できていません';
  END IF;

  -- ── バッチ ────────────────────────────────────────────────────────────────
  INSERT INTO lead_import_batches (
    source_slug, file_name, encoding, row_count, imported_by
  ) VALUES (
    p_batch ->> 'source_slug',
    p_batch ->> 'file_name',
    p_batch ->> 'encoding',
    (p_batch ->> 'row_count')::INTEGER,
    v_imported_by
  ) RETURNING id INTO v_batch_id;

  -- ── Lead ごとの処理 ───────────────────────────────────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_leads, '[]'::JSONB))
  LOOP
    v_lead := v_item -> 'lead';
    v_addr := v_item -> 'address';

    -- 既存 Lead を外部キーで探す。論理削除済みは対象外（再取込を許す）
    SELECT id INTO v_existing_id
      FROM leads
     WHERE source_external_key = (v_item ->> 'external_key')
       AND deleted_at IS NULL;

    -- Eight へ登録した日。**在籍期間ではない**ので所属の順序には使わない。
    -- 複数回登録されていれば最後のものを名刺の記録日として持つ
    SELECT MAX((a ->> 'exchanged_on')::DATE) INTO v_registered_on
      FROM jsonb_array_elements(COALESCE(v_item -> 'activities', '[]'::JSONB)) a
     WHERE NULLIF(a ->> 'exchanged_on', '') IS NOT NULL;

    -- 住所。値が何も無ければ作らない
    v_address_id := NULL;
    IF v_addr IS NOT NULL AND (
         COALESCE(v_addr ->> 'postal_code', '') <> ''
      OR COALESCE(v_addr ->> 'raw_text', '')    <> ''
    ) THEN
      INSERT INTO addresses (
        postal_code, prefecture, city, address_line1, address_line2, raw_text,
        created_by, last_updated_by
      ) VALUES (
        NULLIF(v_addr ->> 'postal_code', ''),
        NULLIF(v_addr ->> 'prefecture', ''),
        NULLIF(v_addr ->> 'city', ''),
        NULLIF(v_addr ->> 'address_line1', ''),
        NULLIF(v_addr ->> 'address_line2', ''),
        NULLIF(v_addr ->> 'raw_text', ''),
        v_imported_by, v_imported_by
      ) RETURNING id INTO v_address_id;
    END IF;

    IF v_existing_id IS NULL THEN
      -- ── 新規作成 ──
      INSERT INTO leads (
        lead_name, company_name,
        contact_last_name, contact_first_name,
        contact_department, contact_job_title,
        contact_email, contact_phone, company_phone, url,
        stage_id, status_id, lead_source_id, owner_user_id,
        address_id, source_external_key,
        created_by, last_updated_by
      ) VALUES (
        v_lead ->> 'lead_name',
        NULLIF(v_lead ->> 'company_name', ''),
        NULLIF(v_lead ->> 'contact_last_name', ''),
        NULLIF(v_lead ->> 'contact_first_name', ''),
        NULLIF(v_lead ->> 'contact_department', ''),
        NULLIF(v_lead ->> 'contact_job_title', ''),
        NULLIF(v_lead ->> 'contact_email', ''),
        NULLIF(v_lead ->> 'contact_phone', ''),
        NULLIF(v_lead ->> 'company_phone', ''),
        NULLIF(v_lead ->> 'url', ''),
        v_stage_id, v_status_id, v_source_id, v_owner_id,
        v_address_id, v_item ->> 'external_key',
        v_imported_by, v_imported_by
      ) RETURNING id INTO v_lead_id;

      v_created := v_created + 1;
    ELSE
      -- ── 既存を補完（空欄のみ）──
      -- CRM 側で入力・修正された値を名刺の値で上書きしないため COALESCE の
      -- 左に既存値を置く。ステージ / ステータス / 担当者は運用中の状態なので触らない。
      v_lead_id := v_existing_id;

      UPDATE leads SET
        company_name       = COALESCE(company_name,       NULLIF(v_lead ->> 'company_name', '')),
        contact_last_name  = COALESCE(contact_last_name,  NULLIF(v_lead ->> 'contact_last_name', '')),
        contact_first_name = COALESCE(contact_first_name, NULLIF(v_lead ->> 'contact_first_name', '')),
        contact_department = COALESCE(contact_department, NULLIF(v_lead ->> 'contact_department', '')),
        contact_job_title  = COALESCE(contact_job_title,  NULLIF(v_lead ->> 'contact_job_title', '')),
        contact_email      = COALESCE(contact_email,      NULLIF(v_lead ->> 'contact_email', '')),
        contact_phone      = COALESCE(contact_phone,      NULLIF(v_lead ->> 'contact_phone', '')),
        company_phone      = COALESCE(company_phone,      NULLIF(v_lead ->> 'company_phone', '')),
        url                = COALESCE(url,                NULLIF(v_lead ->> 'url', '')),
        address_id         = COALESCE(address_id,         v_address_id),
        -- 手入力で作られた Lead に後から名刺が届いた場合にキーを紐付ける
        source_external_key = COALESCE(source_external_key, v_item ->> 'external_key'),
        last_updated_by    = v_imported_by
      WHERE id = v_lead_id;

      v_updated := v_updated + 1;

      -- 既存 Lead が住所を持っていて新しい住所を使わなかった場合、
      -- 作った addresses 行が孤児になるので消す
      IF v_address_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM leads WHERE address_id = v_address_id) THEN
        DELETE FROM addresses WHERE id = v_address_id;
      END IF;
    END IF;

    -- ── 法人・連絡先 ──────────────────────────────────────────────────────
    -- 名刺は連絡先でもあるため、この時点で contacts を作る。
    -- 取引先（Account）は契約後に作る運用なのでここでは触らない。
    -- 既に紐付いている Lead は再取込でも作り直さない。
    SELECT * INTO v_lead_row FROM leads WHERE id = v_lead_id;

    v_company_id := v_lead_row.company_id;
    v_contact_id := v_lead_row.contact_id;
    v_contact_was_null := v_lead_row.contact_id IS NULL;

    IF v_company_id IS NULL THEN
      v_company_id := resolve_or_create_company(
        v_lead_row.company_name,
        v_lead_row.contact_email,
        COALESCE(v_lead_row.company_phone, v_lead_row.contact_phone),
        v_lead_row.url,
        v_lead_row.owner_user_id,
        v_lead_row.lead_source_id,
        v_imported_by
      );
    END IF;

    IF v_contact_id IS NULL THEN
      v_contact_id := resolve_or_create_contact(
        v_company_id,
        v_lead_row.contact_last_name,
        v_lead_row.contact_first_name,
        v_lead_row.contact_department,
        v_lead_row.contact_job_title,
        v_lead_row.contact_email,
        v_lead_row.contact_phone,
        v_lead_row.owner_user_id,
        v_lead_row.lead_source_id,
        v_imported_by
      );
    END IF;

    IF v_company_id IS DISTINCT FROM v_lead_row.company_id
       OR v_contact_id IS DISTINCT FROM v_lead_row.contact_id THEN
      UPDATE leads
         SET company_id = v_company_id,
             contact_id = v_contact_id
       WHERE id = v_lead_id;
    END IF;

    -- ── 名刺 ──────────────────────────────────────────────────────────────
    -- 所属（会社・部署・役職）は名刺の属性として残し、メール・電話の行に紐づける。
    -- **連絡先の現在の所属は書き換えない。** 登録日は在籍期間を表さないため、
    -- どの名刺を現在の所属とするかは人が決める
    IF v_contact_id IS NOT NULL THEN
      v_card_id := record_business_card(
        v_contact_id,
        v_company_id,
        v_lead_row.company_name,
        v_lead_row.contact_department,
        v_lead_row.contact_job_title,
        v_lead_row.contact_email,
        v_lead_row.contact_phone,
        v_lead_row.address_id,
        'eight',
        v_item ->> 'external_key',
        v_registered_on,
        v_imported_by
      );
      IF v_card_id IS NOT NULL THEN
        v_cards := v_cards + 1;
      END IF;

      -- 姓名しか一致しない別会社の連絡先を候補として拾う。
      -- 今回この名刺で連絡先を紐付けたときだけ調べる（再取込では走らせない）
      IF v_contact_was_null THEN
        v_candidates := v_candidates + detect_contact_merge_candidates(v_contact_id);
      END IF;
    END IF;

    -- ── 名刺データの登録履歴 ──
    -- Eight にデータを登録した日を活動として残す。**名刺を交換した日ではない**ので
    -- 文言でそう分かるようにする。同じ日付の重複記録は作らない（再取込しても増えない）
    FOR v_act IN SELECT * FROM jsonb_array_elements(COALESCE(v_item -> 'activities', '[]'::JSONB))
    LOOP
      IF (v_act ->> 'exchanged_on') IS NULL THEN
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1 FROM lead_activities
         WHERE lead_id = v_lead_id
           AND activity_type_id = v_activity_type
           AND called_on = (v_act ->> 'exchanged_on')::DATE
      ) THEN
        CONTINUE;
      END IF;

      SELECT COALESCE(MAX(call_number), 0) + 1 INTO v_call_number
        FROM lead_activities WHERE lead_id = v_lead_id;

      -- lead_activities に created_by は無い（作成者は caller_user_id が担う）
      INSERT INTO lead_activities (
        lead_id, call_number, called_on, caller_user_id,
        activity_type_id, call_status_id, note
      ) VALUES (
        v_lead_id,
        v_call_number,
        (v_act ->> 'exchanged_on')::DATE,
        v_owner_id,
        v_activity_type,
        v_call_status_id,
        '名刺データの登録（Eight）'
      );
    END LOOP;

    -- ── 取込レコード（生データ）──
    FOR v_raw_row IN SELECT * FROM jsonb_array_elements(COALESCE(v_item -> 'raw_rows', '[]'::JSONB))
    LOOP
      INSERT INTO lead_import_records (
        batch_id, lead_id, row_number, external_key, raw, outcome
      ) VALUES (
        v_batch_id,
        v_lead_id,
        (v_raw_row ->> 'row_number')::INTEGER,
        v_item ->> 'external_key',
        v_raw_row -> 'raw',
        CASE WHEN v_existing_id IS NULL THEN 'created' ELSE 'updated' END
      );
    END LOOP;
  END LOOP;

  -- ── エラー行 ──────────────────────────────────────────────────────────────
  FOR v_err IN SELECT * FROM jsonb_array_elements(COALESCE(p_errors, '[]'::JSONB))
  LOOP
    INSERT INTO lead_import_records (
      batch_id, lead_id, row_number, external_key, raw, outcome, error_reason
    ) VALUES (
      v_batch_id, NULL,
      (v_err ->> 'row_number')::INTEGER,
      NULL,
      v_err -> 'raw',
      'error',
      v_err ->> 'error_reason'
    );
    v_error := v_error + 1;
  END LOOP;

  UPDATE lead_import_batches SET
    created_count = v_created,
    updated_count = v_updated,
    skipped_count = v_skipped,
    error_count   = v_error
  WHERE id = v_batch_id;

  RETURN jsonb_build_object(
    'batch_id',      v_batch_id,
    'created_count', v_created,
    'updated_count', v_updated,
    'skipped_count', v_skipped,
    'error_count',   v_error,
    'card_count',    v_cards,
    'merge_candidate_count', v_candidates
  );
END;
$$;

COMMENT ON FUNCTION import_eight_leads(JSONB, JSONB, JSONB, JSONB) IS
  'Eight 名刺 CSV の取込。addresses/leads/companies/contacts/business_cards/lead_activities/lead_import_records を単一トランザクションで書く。連絡先の現在の所属は書き換えない（登録日が在籍期間を表さないため）';
