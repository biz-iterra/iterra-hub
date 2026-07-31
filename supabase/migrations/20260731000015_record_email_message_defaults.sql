-- ============================================================
-- record_email_message の任意引数に既定値を持たせる
--
-- 差出人の表示名はヘッダに無いことがある（`taro@example.com` だけの From）。
-- 既定値が無いと生成される TS 型で必須引数になり null を渡せず、
-- 呼び出し側が空文字を送るしかなくなる。「名前が無い」と
-- 「名前が空文字」を DB で区別できなくなるため既定値を付ける。
--
-- 既定値を持つ引数の後ろに持たない引数は置けないので、
-- p_from_name 以降をまとめて既定値ありにする。
--
-- あわせて、リフレッシュトークンの暗号化を pgcrypto ではなく
-- アプリ側（AES-256-GCM）で行う方針に変えたためコメントを直す。
-- pgp_sym_encrypt は鍵を SQL の引数として DB へ送ることになり、
-- 「鍵を DB に置かない」という前提が崩れる。
-- ============================================================

DROP FUNCTION IF EXISTS record_email_message(
  UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT[], TEXT[], JSONB
);

CREATE OR REPLACE FUNCTION record_email_message(
  p_connection_id    UUID,
  p_gmail_message_id TEXT,
  p_gmail_thread_id  TEXT,
  p_direction        TEXT,
  p_subject          TEXT,
  p_sent_at          TIMESTAMPTZ,
  p_from_email       TEXT,
  p_from_name        TEXT   DEFAULT NULL,
  p_to_emails        TEXT[] DEFAULT '{}',
  p_cc_emails        TEXT[] DEFAULT '{}',
  p_participants     JSONB  DEFAULT '[]'::JSONB
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
    NULLIF(btrim(COALESCE(p_subject, '')), ''), p_sent_at,
    lower(p_from_email), NULLIF(btrim(COALESCE(p_from_name, '')), ''),
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

-- DROP で権限が落ちるため付け直す。同期処理からのみ呼ぶ
REVOKE ALL ON FUNCTION record_email_message(
  UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT[], TEXT[], JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_email_message(
  UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT[], TEXT[], JSONB
) TO service_role;

-- ------------------------------------------------------------
-- 暗号化の方式が変わったのでコメントを実態に合わせる
-- ------------------------------------------------------------
COMMENT ON COLUMN gmail_connections.refresh_token_enc IS
  'アプリ側で AES-256-GCM 暗号化済み（iv || tag || ciphertext）。鍵は GMAIL_TOKEN_ENCRYPTION_KEY が持ち DB には渡さない';
