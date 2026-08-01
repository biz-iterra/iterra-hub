-- ============================================================
-- 名刺取込に所属変更（転職・異動）の反映を組み込む
--
-- 変更点（20260731000004 からの差分）:
--   - 連絡先を解決したあと apply_contact_affiliation を呼び、名刺交換日を
--     started_on として所属履歴に積む
--   - 転職を検知したら、旧所属のリードにメモを残す（後任への引き継ぎを検討できるように）
--   - 戻り値に transferred_count / reassigned_count を足す
--
-- 設計: docs/contact-identity.md § 5, § 6
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

  -- 所属の反映
  v_exchanged_on    DATE;
  v_prev_company_id UUID;
  v_aff_result      TEXT;
  v_memo_type       UUID;
  v_old_lead        RECORD;
  v_memo            TEXT;

  v_created      INTEGER := 0;
  v_updated      INTEGER := 0;
  v_skipped      INTEGER := 0;
  v_error        INTEGER := 0;
  v_transferred  INTEGER := 0;
  v_reassigned   INTEGER := 0;
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

  -- 転職メモ用。無ければ名刺交換と同じ種別で残す
  SELECT id INTO v_memo_type FROM lead_activity_types WHERE code = 'memo' LIMIT 1;

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

    -- この名刺の交換日。複数回交換していれば最新を所属の起点にする
    SELECT MAX((a ->> 'exchanged_on')::DATE) INTO v_exchanged_on
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
      -- 所属（会社・部署・役職）だけは名刺の方が新しければ後段で上書きする
      -- （docs/contact-identity.md § 7）。
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

    -- ── 所属（転職・異動）────────────────────────────────────────────────
    -- 名刺は「その時点の所属」。交換日が現在の所属の開始日より新しいときだけ
    -- 現在の所属を切り替え、古い名刺は履歴にだけ残す。
    IF v_contact_id IS NOT NULL THEN
      -- 転職メモの宛先を決めるため、切り替わる前の会社を控える
      SELECT company_id INTO v_prev_company_id
        FROM contact_affiliations
       WHERE contact_id = v_contact_id AND is_current;

      v_aff_result := apply_contact_affiliation(
        v_contact_id,
        v_company_id,
        v_lead_row.company_name,
        v_lead_row.contact_department,
        v_lead_row.contact_job_title,
        v_exchanged_on,
        'business_card',
        NULL,
        v_imported_by
      );

      IF v_aff_result = 'transferred' THEN
        v_transferred := v_transferred + 1;

        -- 旧所属のリードに気付けるようメモを残す。
        -- ステージ・ステータスは動かさない（後任への引き継ぎ営業があり得るため）
        IF v_prev_company_id IS NOT NULL THEN
          v_memo := format(
            '担当者が %s へ転職（名刺交換日: %s）',
            COALESCE(v_lead_row.company_name, '別の会社'),
            COALESCE(v_exchanged_on::TEXT, '不明')
          );

          FOR v_old_lead IN
            SELECT id FROM leads
             WHERE contact_id = v_contact_id
               AND company_id = v_prev_company_id
               AND id <> v_lead_id
               AND deleted_at IS NULL
          LOOP
            -- 再取込で同じメモを積み増さない
            CONTINUE WHEN EXISTS (
              SELECT 1 FROM lead_activities
               WHERE lead_id = v_old_lead.id AND note = v_memo
            );

            SELECT COALESCE(MAX(call_number), 0) + 1 INTO v_call_number
              FROM lead_activities WHERE lead_id = v_old_lead.id;

            INSERT INTO lead_activities (
              lead_id, call_number, called_on, caller_user_id,
              activity_type_id, call_status_id, note
            ) VALUES (
              v_old_lead.id,
              v_call_number,
              COALESCE(v_exchanged_on, CURRENT_DATE),
              v_owner_id,
              COALESCE(v_memo_type, v_activity_type),
              v_call_status_id,
              v_memo
            );
          END LOOP;
        END IF;
      ELSIF v_aff_result = 'reassigned' THEN
        v_reassigned := v_reassigned + 1;
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
    'batch_id',          v_batch_id,
    'created_count',     v_created,
    'updated_count',     v_updated,
    'skipped_count',     v_skipped,
    'error_count',       v_error,
    'transferred_count', v_transferred,
    'reassigned_count',  v_reassigned
  );
END;
$$;

COMMENT ON FUNCTION import_eight_leads(JSONB, JSONB, JSONB, JSONB) IS
  'Eight 名刺 CSV の取込。addresses/leads/companies/contacts/contact_affiliations/lead_activities/lead_import_records を単一トランザクションで書く。名刺交換日を所属の起点として転職・異動を反映する';
