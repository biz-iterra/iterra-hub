-- ============================================================
-- メール連携の関数の実行権限を整理する
--
-- email_messages / email_message_contacts には authenticated 向けの
-- INSERT ポリシーを置いていない（同期処理が service_role で書く前提）。
-- ところが承認は画面から authenticated で呼ばれるため、
-- approve_email_contact_candidate が呼び出し元の権限のままだと
-- 過去メールの紐付け（email_message_contacts への INSERT）で RLS に弾かれる。
--
-- 対処として関数を SECURITY DEFINER にする。RLS をバイパスする以上、
-- 関数の中で権限チェックを明示する（テーブルの RLS が効かなくなるため、
-- 「候補を読める＝manager 以上」という条件を関数側で担保する必要がある）。
--
-- あわせて record_email_message は同期処理専用なので
-- authenticated から呼べないようにする。
-- ============================================================

CREATE OR REPLACE FUNCTION approve_email_contact_candidate(
  p_candidate_id  UUID,
  p_last_name     TEXT,
  p_first_name    TEXT DEFAULT '',
  p_company_id    UUID DEFAULT NULL,
  p_owner_user_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
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

  -- SECURITY DEFINER で RLS をバイパスするため、
  -- email_contact_candidates の SELECT ポリシーと同じ条件をここで課す
  IF NOT is_manager_or_above() THEN
    RAISE EXCEPTION '連絡先候補の承認には manager 以上の権限が必要です';
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
  '連絡先候補を承認して連絡先を作り、そのアドレスが登場する既存メールを遡って紐づける（manager 以上）';

REVOKE ALL ON FUNCTION approve_email_contact_candidate FROM PUBLIC;
GRANT EXECUTE ON FUNCTION approve_email_contact_candidate TO authenticated;

-- 同期処理からのみ呼ぶ。画面から直接メールを書き込ませない
REVOKE ALL ON FUNCTION record_email_message(
  UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT[], TEXT[], JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_email_message(
  UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT[], TEXT[], JSONB
) TO service_role;
