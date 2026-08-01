-- ============================================================
-- 連絡先の統合（Phase C）
--
-- 同一人物が二重に登録されていたものを 1 つにまとめる。
-- 複数テーブルへの書き込みなので DB 関数で単一トランザクションにする
-- （データ整合性の規約）。
--
-- **統合は取り消せない前提で作る。** 実行前に何がどれだけ動くかを
-- merge_contacts_preview() で見せ、確認したうえで実行する。
--
-- 設計: docs/contact-identity.md § 9
-- ============================================================

-- ------------------------------------------------------------
-- 統合の下見。付け替わる件数を数えるだけで何も変更しない
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION merge_contacts_preview(p_keep UUID, p_merge UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'emails',        (SELECT count(*) FROM contact_emails            WHERE contact_id = p_merge),
    'phones',        (SELECT count(*) FROM contact_phones            WHERE contact_id = p_merge),
    'affiliations',  (SELECT count(*) FROM contact_affiliations      WHERE contact_id = p_merge),
    'accounts',      (SELECT count(*) FROM account_contacts          WHERE contact_id = p_merge),
    'leads',         (SELECT count(*) FROM leads                     WHERE contact_id = p_merge OR promoted_contact_id = p_merge),
    'deals',         (SELECT count(*) FROM deals                     WHERE contact_id = p_merge),
    'contracts',     (SELECT count(*) FROM contracts                 WHERE counterparty_contact_id = p_merge OR counterparty_manager_id = p_merge),
    'talents',       (SELECT count(*) FROM talents                   WHERE contact_id = p_merge),
    'emails_synced', (SELECT count(*) FROM email_message_contacts    WHERE contact_id = p_merge),
    'activities',    (SELECT count(*) FROM activity_logs             WHERE contact_id = p_merge)
                   + (SELECT count(*) FROM deal_activities           WHERE contact_id = p_merge),
    'histories',     (SELECT count(*) FROM contact_change_histories  WHERE contact_id = p_merge),
    -- 1:1 制約があるため、両方にタレント情報があると統合できない
    'talent_conflict', (
      SELECT EXISTS (SELECT 1 FROM talents WHERE contact_id = p_keep)
         AND EXISTS (SELECT 1 FROM talents WHERE contact_id = p_merge)
    )
  );
$$;

COMMENT ON FUNCTION merge_contacts_preview(UUID, UUID) IS
  '連絡先の統合で付け替わる件数を数える。変更はしない';

-- ------------------------------------------------------------
-- 統合の実行
--
-- p_keep を残し、p_merge を吸収する。p_merge は物理削除せず
-- deleted_at と merged_into_contact_id を立てて閉じる。
--
-- SECURITY DEFINER にするのは、付け替え対象が多くのテーブルに跨り
-- 実行者の RLS では書けない行が混じるため。権限は関数の中で確かめる。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION merge_contacts(p_keep UUID, p_merge UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  UUID := auth.uid();
  v_result JSONB;
  v_keep   contacts%ROWTYPE;
  v_merge  contacts%ROWTYPE;
BEGIN
  -- 影響が広いので manager 以上に限る
  IF NOT is_manager_or_above() THEN
    RAISE EXCEPTION '連絡先の統合には manager 以上の権限が必要です';
  END IF;

  IF p_keep IS NULL OR p_merge IS NULL OR p_keep = p_merge THEN
    RAISE EXCEPTION '統合する 2 件の連絡先を指定してください';
  END IF;

  SELECT * INTO v_keep FROM contacts WHERE id = p_keep AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION '残す側の連絡先が見つかりません';
  END IF;

  SELECT * INTO v_merge FROM contacts WHERE id = p_merge AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION '統合する側の連絡先が見つかりません';
  END IF;

  -- タレント情報は連絡先と 1:1。両方にあると機械的に選べないので止める
  IF EXISTS (SELECT 1 FROM talents WHERE contact_id = p_keep)
     AND EXISTS (SELECT 1 FROM talents WHERE contact_id = p_merge) THEN
    RAISE EXCEPTION '両方にタレント情報があります。片方を整理してから統合してください';
  END IF;

  -- 何が動くかを先に数えておく（実行後の報告用）
  v_result := merge_contacts_preview(p_keep, p_merge);

  -- ── 一意制約があるもの: 重複しない行だけ移し、残りは捨てる ──
  UPDATE contact_emails e SET contact_id = p_keep
   WHERE e.contact_id = p_merge
     AND NOT EXISTS (
       SELECT 1 FROM contact_emails k
        WHERE k.contact_id = p_keep AND lower(k.email) = lower(e.email)
     );
  DELETE FROM contact_emails WHERE contact_id = p_merge;

  UPDATE contact_phones p SET contact_id = p_keep
   WHERE p.contact_id = p_merge
     AND NOT EXISTS (
       SELECT 1 FROM contact_phones k
        WHERE k.contact_id = p_keep AND k.phone = p.phone
     );
  DELETE FROM contact_phones WHERE contact_id = p_merge;

  UPDATE account_contacts a SET contact_id = p_keep
   WHERE a.contact_id = p_merge
     AND NOT EXISTS (
       SELECT 1 FROM account_contacts k
        WHERE k.contact_id = p_keep AND k.account_id = a.account_id
     );
  DELETE FROM account_contacts WHERE contact_id = p_merge;

  UPDATE email_message_contacts m SET contact_id = p_keep
   WHERE m.contact_id = p_merge
     AND NOT EXISTS (
       SELECT 1 FROM email_message_contacts k
        WHERE k.contact_id = p_keep AND k.message_id = m.message_id AND k.role = m.role
     );
  DELETE FROM email_message_contacts WHERE contact_id = p_merge;

  -- ── 所属履歴: すべて移し、現在の所属は最新の 1 行だけにする ──
  UPDATE contact_affiliations SET is_current = FALSE
   WHERE contact_id IN (p_keep, p_merge) AND is_current;

  UPDATE contact_affiliations SET contact_id = p_keep, last_updated_by = v_actor
   WHERE contact_id = p_merge;

  UPDATE contact_affiliations SET is_current = TRUE
   WHERE id = (
     SELECT id FROM contact_affiliations
      WHERE contact_id = p_keep
      ORDER BY started_on DESC NULLS LAST, created_at DESC
      LIMIT 1
   );

  PERFORM sync_contact_current_affiliation(p_keep);

  -- ── 単純な付け替え ──
  UPDATE leads     SET contact_id = p_keep          WHERE contact_id = p_merge;
  UPDATE leads     SET promoted_contact_id = p_keep WHERE promoted_contact_id = p_merge;
  UPDATE deals     SET contact_id = p_keep          WHERE contact_id = p_merge;
  UPDATE contracts SET counterparty_contact_id = p_keep WHERE counterparty_contact_id = p_merge;
  UPDATE contracts SET counterparty_manager_id = p_keep WHERE counterparty_manager_id = p_merge;
  UPDATE talents   SET contact_id = p_keep          WHERE contact_id = p_merge;
  UPDATE financial_info   SET contact_id = p_keep   WHERE contact_id = p_merge;
  UPDATE other_addresses  SET contact_id = p_keep   WHERE contact_id = p_merge;
  UPDATE companies SET primary_contact_id = p_keep  WHERE primary_contact_id = p_merge;
  UPDATE email_contact_candidates SET contact_id = p_keep WHERE contact_id = p_merge;

  -- 履歴は消さずに移す。誰の履歴だったかは統合後も残す必要がある
  UPDATE activity_logs            SET contact_id = p_keep WHERE contact_id = p_merge;
  UPDATE deal_activities          SET contact_id = p_keep WHERE contact_id = p_merge;
  UPDATE contact_change_histories SET contact_id = p_keep WHERE contact_id = p_merge;

  -- ── 空欄の補完 ──
  -- 残す側に無い情報だけを引き継ぐ。既存値は上書きしない
  UPDATE contacts SET
    middle_name      = COALESCE(middle_name,      v_merge.middle_name),
    last_name_kana   = COALESCE(last_name_kana,   v_merge.last_name_kana),
    first_name_kana  = COALESCE(first_name_kana,  v_merge.first_name_kana),
    middle_name_kana = COALESCE(middle_name_kana, v_merge.middle_name_kana),
    birth_date       = COALESCE(birth_date,       v_merge.birth_date),
    blood_type       = COALESCE(blood_type,       v_merge.blood_type),
    postal_code      = COALESCE(postal_code,      v_merge.postal_code),
    prefecture       = COALESCE(prefecture,       v_merge.prefecture),
    city             = COALESCE(city,             v_merge.city),
    address_line1    = COALESCE(address_line1,    v_merge.address_line1),
    address_line2    = COALESCE(address_line2,    v_merge.address_line2),
    website_url      = COALESCE(website_url,      v_merge.website_url),
    line_user_id     = COALESCE(line_user_id,     v_merge.line_user_id),
    lead_source_id   = COALESCE(lead_source_id,   v_merge.lead_source_id),
    -- 社内メモは両方に意味があるので連結する
    internal_memo    = CASE
      WHEN v_merge.internal_memo IS NULL THEN internal_memo
      WHEN internal_memo IS NULL THEN v_merge.internal_memo
      ELSE internal_memo || E'\n---\n' || v_merge.internal_memo
    END,
    last_updated_by  = v_actor
  WHERE id = p_keep;

  -- ── 吸収した側を閉じる ──
  -- 物理削除はしない。統合後に「どこへ行ったか」を辿れるようにする
  UPDATE contacts SET
    deleted_at = NOW(),
    merged_into_contact_id = p_keep,
    last_updated_by = v_actor
  WHERE id = p_merge;

  -- ── 候補の始末 ──
  UPDATE contact_merge_candidates SET
    status = 'merged',
    decided_by_user_id = v_actor,
    decided_at = NOW()
  WHERE status = 'pending'
    AND (contact_id, candidate_contact_id) IN ((p_keep, p_merge), (p_merge, p_keep));

  -- 吸収した側が絡む他の候補は、残した側の候補として読み替える意味が薄いので閉じる
  UPDATE contact_merge_candidates SET
    status = 'rejected',
    decided_by_user_id = v_actor,
    decided_at = NOW()
  WHERE status = 'pending'
    AND (contact_id = p_merge OR candidate_contact_id = p_merge);

  RETURN v_result || jsonb_build_object('kept_contact_id', p_keep, 'merged_contact_id', p_merge);
END;
$$;

COMMENT ON FUNCTION merge_contacts(UUID, UUID) IS
  '連絡先を統合する。p_keep を残し p_merge を吸収。manager 以上のみ。取り消しはできない';
