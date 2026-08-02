-- ============================================================
-- コーポレートサイトの問い合わせをリードとして取り込む
--
-- 取得元は D1 `corporate-iterra-leads`。CRM が定期的に読みに行き、
-- ここへ渡す（`/api/leads/inquiry-sync`）。サイト側には手を入れない。
--
-- **同じ人からの 2 回目以降は新しいリードを作らない。**
-- メールアドレスで既存のリードを探し、見つかれば顧客行動だけを足す。
-- 問い合わせのたびにリードが増えると、追客の状態が分散してしまう。
--
-- 取り込み済みかどうかは `lead_customer_activities.source` に入れた
-- `inquiry:<D1 の id>` で判断する。リード側の `source_external_key` では
-- 足りない（1 リードに複数回の問い合わせが載るため）。
--
-- 設計: docs/lead-import-inquiry.md
-- ============================================================

CREATE OR REPLACE FUNCTION import_inquiry_leads(p_batch JSONB, p_rows JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch_id       UUID;
  v_imported_by    UUID := (p_batch ->> 'imported_by')::UUID;
  v_owner_id       UUID := (p_batch ->> 'owner_user_id')::UUID;
  v_stage_id       UUID := (p_batch ->> 'stage_id')::UUID;
  v_status_id      UUID := (p_batch ->> 'status_id')::UUID;
  v_source_id      UUID := (p_batch ->> 'lead_source_id')::UUID;
  v_activity_type  UUID := (p_batch ->> 'activity_type_id')::UUID;

  v_row        JSONB;
  v_key        TEXT;
  v_email      TEXT;
  v_lead_id    UUID;
  v_company_id UUID;
  v_contact_id UUID;

  v_created  INTEGER := 0;
  v_appended INTEGER := 0;
  v_skipped  INTEGER := 0;
BEGIN
  IF v_imported_by IS NULL OR v_owner_id IS NULL THEN
    RAISE EXCEPTION '取込ユーザー / 担当者が指定されていません';
  END IF;
  IF v_stage_id IS NULL OR v_source_id IS NULL OR v_activity_type IS NULL THEN
    RAISE EXCEPTION 'ステージ / リードソース / 顧客行動種別の既定値が解決できていません';
  END IF;

  INSERT INTO lead_import_batches (
    source_slug, file_name, encoding, row_count, imported_by
  ) VALUES (
    'inquiry',
    COALESCE(p_batch ->> 'file_name', 'D1 corporate-iterra-leads'),
    'utf-8',
    jsonb_array_length(COALESCE(p_rows, '[]'::JSONB)),
    v_imported_by
  ) RETURNING id INTO v_batch_id;

  FOR v_row IN SELECT * FROM jsonb_array_elements(COALESCE(p_rows, '[]'::JSONB))
  LOOP
    v_key   := v_row ->> 'external_key';
    v_email := NULLIF(btrim(COALESCE(v_row ->> 'contact_email', '')), '');

    -- 取り込み済みなら触らない。何度実行しても同じ結果になるようにする
    IF EXISTS (SELECT 1 FROM lead_customer_activities WHERE source = v_key) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- 同じメールのリードがあればそこへ足す
    v_lead_id := NULL;
    IF v_email IS NOT NULL THEN
      SELECT id INTO v_lead_id
        FROM leads
       WHERE lower(contact_email) = lower(v_email)
         AND deleted_at IS NULL
       ORDER BY created_at
       LIMIT 1;
    END IF;

    IF v_lead_id IS NULL THEN
      INSERT INTO leads (
        lead_name, company_name,
        contact_last_name, contact_first_name,
        contact_email, contact_phone,
        stage_id, status_id, lead_source_id, owner_user_id,
        source_external_key, created_by, last_updated_by
      ) VALUES (
        v_row ->> 'lead_name',
        NULLIF(v_row ->> 'company_name', ''),
        NULLIF(v_row ->> 'contact_last_name', ''),
        NULLIF(v_row ->> 'contact_first_name', ''),
        v_email,
        NULLIF(v_row ->> 'contact_phone', ''),
        v_stage_id, v_status_id, v_source_id, v_owner_id,
        v_key, v_imported_by, v_imported_by
      ) RETURNING id INTO v_lead_id;

      v_created := v_created + 1;

      -- 名刺取込と同じ経路で法人・連絡先を作る。
      -- 取引先（Account）は契約後に作る運用なのでここでは触らない
      v_company_id := resolve_or_create_company(
        NULLIF(v_row ->> 'company_name', ''),
        v_email,
        NULLIF(v_row ->> 'contact_phone', ''),
        NULL,
        v_owner_id,
        v_source_id,
        v_imported_by
      );

      v_contact_id := resolve_or_create_contact(
        v_company_id,
        NULLIF(v_row ->> 'contact_last_name', ''),
        NULLIF(v_row ->> 'contact_first_name', ''),
        NULL,
        NULL,
        v_email,
        NULLIF(v_row ->> 'contact_phone', ''),
        v_owner_id,
        v_source_id,
        v_imported_by
      );

      UPDATE leads
         SET company_id = v_company_id,
             contact_id = v_contact_id
       WHERE id = v_lead_id;
    ELSE
      v_appended := v_appended + 1;
    END IF;

    -- 問い合わせは顧客のアクションなので顧客行動として残す
    INSERT INTO lead_customer_activities (
      lead_id, activity_type_id, occurred_at, detail, source,
      created_by, last_updated_by
    ) VALUES (
      v_lead_id,
      v_activity_type,
      COALESCE((v_row ->> 'occurred_at')::TIMESTAMPTZ, NOW()),
      v_row ->> 'detail',
      v_key,
      v_imported_by, v_imported_by
    );
  END LOOP;

  UPDATE lead_import_batches
     SET created_count = v_created,
         updated_count = v_appended,
         skipped_count = v_skipped
   WHERE id = v_batch_id;

  RETURN jsonb_build_object(
    'batch_id', v_batch_id,
    'created',  v_created,
    'appended', v_appended,
    'skipped',  v_skipped
  );
END;
$$;

COMMENT ON FUNCTION import_inquiry_leads(JSONB, JSONB) IS
  'コーポレートサイトの問い合わせを取り込む。同じメールの既存リードには顧客行動だけ足す';

-- 取り込み済み判定で毎回引くので索引を張る
CREATE INDEX IF NOT EXISTS idx_lead_customer_activities_source
  ON lead_customer_activities (source)
  WHERE source IS NOT NULL;
