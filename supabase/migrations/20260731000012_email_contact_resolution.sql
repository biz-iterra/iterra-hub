-- ============================================================
-- 同期したメールを連絡先に紐づける
--
-- アプリ側（TypeScript）はヘッダの解析と「記録対象か」の選別まで行い、
-- DB 側は「そのアドレスが誰か」を引き当てて書き込む。
-- 複数テーブル（email_messages / email_message_contacts /
-- email_contact_candidates）への書き込みが 1 通ごとに発生するため、
-- 途中で切れて中途半端に残らないよう関数にまとめる。
--
-- 突合の順序:
--   1. contact_emails に一致 → その連絡先に紐づける
--   2. 一致しない → 候補として溜める。ドメインが company_domains に
--      当たれば法人だけ先に紐づけておき、承認時の入力を減らす
-- ============================================================

-- ------------------------------------------------------------
-- アドレスから連絡先を引く
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION find_contact_by_email(p_email TEXT) RETURNS UUID
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT c.id
    FROM contact_emails e
    JOIN contacts c ON c.id = e.contact_id AND c.deleted_at IS NULL
   WHERE lower(e.email) = lower(btrim(p_email))
   ORDER BY e.is_primary DESC, c.created_at
   LIMIT 1;
$$;

COMMENT ON FUNCTION find_contact_by_email(TEXT) IS
  'メールアドレスから連絡先を引く。複数該当なら主アドレス・古い順で 1 件';

-- ------------------------------------------------------------
-- メール 1 通の記録
--
-- p_participants は [{ email, name, role }] の配列。
-- 呼び出し側（同期処理）が自分・社内・自動送信を除外済みである前提。
--
-- 冪等: 同じ gmail_message_id は ON CONFLICT で握りつぶす。
-- 再同期しても履歴が二重にならない。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_email_message(
  p_connection_id    UUID,
  p_gmail_message_id TEXT,
  p_gmail_thread_id  TEXT,
  p_direction        TEXT,
  p_subject          TEXT,
  p_sent_at          TIMESTAMPTZ,
  p_from_email       TEXT,
  p_from_name        TEXT,
  p_to_emails        TEXT[],
  p_cc_emails        TEXT[],
  p_participants     JSONB
) RETURNS UUID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_message_id UUID;
  v_item       JSONB;
  v_email      TEXT;
  v_name       TEXT;
  v_role       TEXT;
  v_contact_id UUID;
  v_company_id UUID;
  v_domain     TEXT;
BEGIN
  INSERT INTO email_messages (
    connection_id, gmail_message_id, gmail_thread_id, direction,
    subject, sent_at, from_email, from_name, to_emails, cc_emails
  ) VALUES (
    p_connection_id, p_gmail_message_id, p_gmail_thread_id, p_direction,
    p_subject, p_sent_at, lower(p_from_email), p_from_name,
    COALESCE(p_to_emails, '{}'), COALESCE(p_cc_emails, '{}')
  )
  ON CONFLICT (connection_id, gmail_message_id) DO NOTHING
  RETURNING id INTO v_message_id;

  -- 既に取り込み済みなら何もしない
  IF v_message_id IS NULL THEN
    RETURN NULL;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_participants, '[]'::JSONB))
  LOOP
    v_email := lower(btrim(v_item ->> 'email'));
    v_name  := NULLIF(btrim(COALESCE(v_item ->> 'name', '')), '');
    v_role  := v_item ->> 'role';

    CONTINUE WHEN v_email IS NULL OR v_email = '';

    v_contact_id := find_contact_by_email(v_email);

    IF v_contact_id IS NOT NULL THEN
      INSERT INTO email_message_contacts (message_id, contact_id, role)
      VALUES (v_message_id, v_contact_id, v_role)
      ON CONFLICT (message_id, contact_id, role) DO NOTHING;
    ELSE
      -- 未登録アドレス。ドメインから法人だけ先に引いておく
      v_domain := normalize_domain(v_email);
      v_company_id := NULL;
      IF v_domain IS NOT NULL AND NOT is_free_email_domain(v_domain) THEN
        SELECT cd.company_id INTO v_company_id
          FROM company_domains cd
          JOIN companies c ON c.id = cd.company_id AND c.deleted_at IS NULL
         WHERE cd.domain = v_domain
         LIMIT 1;
      END IF;

      INSERT INTO email_contact_candidates (
        email_address, display_name, company_id, message_count, last_seen_at
      ) VALUES (
        v_email, v_name, v_company_id, 1, p_sent_at
      )
      ON CONFLICT (lower(email_address)) DO UPDATE SET
        -- 表示名は空欄のときだけ補う。手で直した名前を上書きしない
        display_name  = COALESCE(email_contact_candidates.display_name, EXCLUDED.display_name),
        company_id    = COALESCE(email_contact_candidates.company_id, EXCLUDED.company_id),
        message_count = email_contact_candidates.message_count + 1,
        last_seen_at  = GREATEST(email_contact_candidates.last_seen_at, EXCLUDED.last_seen_at);
    END IF;
  END LOOP;

  RETURN v_message_id;
END;
$$;

COMMENT ON FUNCTION record_email_message IS
  'メール 1 通を記録し、連絡先への紐付けまたは候補への蓄積を行う。同じ gmail_message_id は無視する';

-- ------------------------------------------------------------
-- 候補を承認して連絡先を作る
--
-- 連絡先の作成と、そのアドレスが登場する既存メールへの紐付けを
-- 同一トランザクションで行う。承認した瞬間に過去のやり取りが
-- 履歴として見えるようにするため。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION approve_email_contact_candidate(
  p_candidate_id UUID,
  p_last_name    TEXT,
  p_first_name   TEXT,
  p_company_id   UUID,
  p_owner_user_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor      UUID := auth.uid();
  v_candidate  email_contact_candidates%ROWTYPE;
  v_contact_id UUID;
  v_status_id  UUID;
  v_linked     INTEGER;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION '認証が必要です';
  END IF;

  SELECT * INTO v_candidate
    FROM email_contact_candidates
   WHERE id = p_candidate_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '候補が見つかりません';
  END IF;
  IF v_candidate.status <> 'pending' THEN
    RAISE EXCEPTION 'この候補は既に処理済みです';
  END IF;

  -- 承認の間に別経路で連絡先が作られていれば、それを使う
  v_contact_id := find_contact_by_email(v_candidate.email_address);

  IF v_contact_id IS NULL THEN
    SELECT id INTO v_status_id FROM contact_statuses
     WHERE name = 'アクティブ' AND deleted_at IS NULL LIMIT 1;
    IF v_status_id IS NULL THEN
      SELECT id INTO v_status_id FROM contact_statuses
       WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;
    END IF;

    INSERT INTO contacts (
      last_name, first_name, contact_type, company_id,
      contact_status_id, owner_user_id, created_by, last_updated_by
    ) VALUES (
      COALESCE(NULLIF(btrim(p_last_name), ''), v_candidate.email_address),
      COALESCE(NULLIF(btrim(p_first_name), ''), ''),
      CASE WHEN p_company_id IS NOT NULL THEN 'employee' ELSE 'other' END,
      p_company_id, v_status_id,
      COALESCE(p_owner_user_id, v_actor), v_actor, v_actor
    ) RETURNING id INTO v_contact_id;

    INSERT INTO contact_emails (contact_id, email, label, is_primary, created_by, last_updated_by)
    VALUES (v_contact_id, v_candidate.email_address, 'work', TRUE, v_actor, v_actor);
  END IF;

  -- 過去のメールを遡って紐づける。
  -- from / to / cc のどれで登場したかは email_messages 側の列から判定する
  INSERT INTO email_message_contacts (message_id, contact_id, role)
  SELECT m.id, v_contact_id,
         CASE
           WHEN m.from_email = v_candidate.email_address THEN 'from'
           WHEN v_candidate.email_address = ANY(m.to_emails) THEN 'to'
           ELSE 'cc'
         END
    FROM email_messages m
   WHERE m.from_email = v_candidate.email_address
      OR v_candidate.email_address = ANY(m.to_emails)
      OR v_candidate.email_address = ANY(m.cc_emails)
  ON CONFLICT (message_id, contact_id, role) DO NOTHING;

  GET DIAGNOSTICS v_linked = ROW_COUNT;

  UPDATE email_contact_candidates
     SET status      = 'registered',
         contact_id  = v_contact_id,
         resolved_at = now(),
         resolved_by = v_actor
   WHERE id = p_candidate_id;

  RAISE NOTICE '候補承認: 連絡先 % に過去メール % 件を紐付け', v_contact_id, v_linked;

  RETURN v_contact_id;
END;
$$;

COMMENT ON FUNCTION approve_email_contact_candidate IS
  '連絡先候補を承認して連絡先を作り、そのアドレスが登場する既存メールを遡って紐づける';

REVOKE ALL ON FUNCTION approve_email_contact_candidate FROM PUBLIC;
GRANT EXECUTE ON FUNCTION approve_email_contact_candidate TO authenticated;
