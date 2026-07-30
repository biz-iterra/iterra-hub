-- ============================================================
-- Eight 名刺 CSV の取込を単一トランザクションで実行する関数
--
-- 設計:
--   - 値の整形（文字コード判定・住所分割・電話正規化・同一人物の統合）は TS 側で行い、
--     本関数は整形済みの JSONB を受け取って書き込むだけに徹する
--     （promote_lead_to_deal と同じ分担）
--   - addresses → leads → lead_activities → lead_import_records を 1 トランザクションで
--     書く。途中失敗は全体ロールバックになる
--   - 既存 Lead は source_external_key で突き合わせ、空欄のみ補完する。
--     CRM 側で更新済みの値を古い名刺で巻き戻さないため
--   - service_role から呼ぶ（RLS 経由では 1,000 行超の bulk insert が
--     statement_timeout に達する）。Server Action 側で admin チェックを先に通すこと
--   - SECURITY INVOKER（既定）。service_role なら RLS はバイパスされる
--
-- 引数:
--   p_batch : { source_slug, file_name, encoding, row_count, imported_by }
--   p_leads : [{
--     external_key, lead, address, activities: [{ exchanged_on }], raw_rows: [{ row_number, raw }]
--   }]
--   p_errors: [{ row_number, raw, error_reason }]
--   p_defaults: { stage_id, status_id, lead_source_id, activity_type_id, owner_user_id }
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

  v_created  INTEGER := 0;
  v_updated  INTEGER := 0;
  v_skipped  INTEGER := 0;
  v_error    INTEGER := 0;
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

    -- ── 名刺交換の履歴 ──
    -- 同一人物と複数回交換した分をすべて記録する。
    -- 同じ日付の重複記録は作らない（再取込しても増えない）
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
        '名刺交換（Eight からの取込）'
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
    'error_count',   v_error
  );
END;
$$;

COMMENT ON FUNCTION import_eight_leads(JSONB, JSONB, JSONB, JSONB) IS
  'Eight 名刺 CSV の取込。addresses/leads/lead_activities/lead_import_records を単一トランザクションで書く。既存 Lead は空欄のみ補完する';
