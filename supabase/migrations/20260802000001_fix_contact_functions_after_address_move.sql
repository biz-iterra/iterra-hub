-- ============================================================
-- 住所の共通マスタ化で取り残された参照を直す
--
-- 20260801000010 で other_addresses と contacts / companies の住所 5 カラムを
-- 廃止したが、それらを参照する関数を追随させていなかった。
-- plpgsql は名前を実行時に解決するため定義時には気付けず、**呼んだときに** 落ちる。
--
--   merge_contacts             … 連絡先の統合が実行できない
--   purge_soft_deleted_records … 毎日 3:00 の cron が失敗し続ける
--
-- 併せて、住所の引き継ぎ（entity_addresses）が統合に無かったので追加する。
-- ============================================================

-- ------------------------------------------------------------
-- 論理削除の物理削除（90 日経過分）
--
-- other_addresses の行を落とすほか、統合で吸収した連絡先を対象外にする。
-- 統合された側は deleted_at が立つため、そのままだと 90 日で消えて
-- 「どこへ統合されたか」を辿れなくなる（merge_contacts の意図に反する）。
--
-- SECURITY DEFINER なので search_path も固定する。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION purge_soft_deleted_records()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  cutoff TIMESTAMPTZ := NOW() - INTERVAL '90 days';
BEGIN
  -- マスタ系（FK 依存が少ない順）
  DELETE FROM skills             WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;
  DELETE FROM skill_categories   WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;
  DELETE FROM deal_statuses      WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;
  DELETE FROM deal_stages        WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;
  DELETE FROM contact_statuses   WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;
  DELETE FROM account_statuses   WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;
  DELETE FROM account_types      WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;
  DELETE FROM lead_sources       WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;
  DELETE FROM services           WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;
  DELETE FROM corporate_types    WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;
  DELETE FROM contract_types     WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;
  DELETE FROM pipeline_types     WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;

  -- 共有エンティティ
  DELETE FROM financial_info     WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;

  -- 主要エンティティ（子 → 親 の順）
  DELETE FROM contracts          WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;
  DELETE FROM deals              WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;
  DELETE FROM talents            WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;

  -- 統合で吸収した連絡先は残す。統合先を辿れなくなるため
  DELETE FROM contacts
   WHERE deleted_at IS NOT NULL
     AND deleted_at < cutoff
     AND merged_into_contact_id IS NULL;

  DELETE FROM accounts           WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;
  DELETE FROM companies          WHERE deleted_at IS NOT NULL AND deleted_at < cutoff;
END;
$$;

COMMENT ON FUNCTION purge_soft_deleted_records() IS
  '論理削除から 90 日経過した行を物理削除する。統合で吸収した連絡先は辿れるよう残す';

-- ------------------------------------------------------------
-- 統合の下見に住所を加える
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
    'cards',         (SELECT count(*) FROM business_cards            WHERE contact_id = p_merge),
    'addresses',     (SELECT count(*) FROM entity_addresses          WHERE contact_id = p_merge),
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

-- ------------------------------------------------------------
-- 統合の実行
--
-- 20260801000005 からの変更点:
--   - other_addresses（廃止）の付け替えを entity_addresses に置き換え
--   - 空欄の補完から住所 5 カラム（廃止）を除去
--   - 診断結果を birth_date と組で引き継ぐ
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
  --
  -- 主の印は連絡先ごとに 1 件しか持てない（uq_contact_emails_primary /
  -- uq_contact_phones_primary。20260801000008 で追加）。
  -- 残す側に主があるなら、吸収した側の印を先に落としてから移す。
  IF EXISTS (SELECT 1 FROM contact_emails WHERE contact_id = p_keep AND is_primary) THEN
    UPDATE contact_emails SET is_primary = FALSE
     WHERE contact_id = p_merge AND is_primary;
  END IF;

  UPDATE contact_emails e SET contact_id = p_keep
   WHERE e.contact_id = p_merge
     AND NOT EXISTS (
       SELECT 1 FROM contact_emails k
        WHERE k.contact_id = p_keep AND lower(k.email) = lower(e.email)
     );
  DELETE FROM contact_emails WHERE contact_id = p_merge;

  -- 主だった行を重複として捨てた場合に備える。繰り上げトリガー
  -- （trg_contact_emails_promote_next）は吸収した側しか見ないため、
  -- 残す側が主なしで残らないようここで補う
  IF NOT EXISTS (SELECT 1 FROM contact_emails WHERE contact_id = p_keep AND is_primary) THEN
    UPDATE contact_emails SET is_primary = TRUE
     WHERE id = (
       SELECT id FROM contact_emails WHERE contact_id = p_keep ORDER BY created_at LIMIT 1
     );
  END IF;

  IF EXISTS (SELECT 1 FROM contact_phones WHERE contact_id = p_keep AND is_primary) THEN
    UPDATE contact_phones SET is_primary = FALSE
     WHERE contact_id = p_merge AND is_primary;
  END IF;

  UPDATE contact_phones p SET contact_id = p_keep
   WHERE p.contact_id = p_merge
     AND NOT EXISTS (
       SELECT 1 FROM contact_phones k
        WHERE k.contact_id = p_keep AND k.phone = p.phone
     );
  DELETE FROM contact_phones WHERE contact_id = p_merge;

  IF NOT EXISTS (SELECT 1 FROM contact_phones WHERE contact_id = p_keep AND is_primary) THEN
    UPDATE contact_phones SET is_primary = TRUE
     WHERE id = (
       SELECT id FROM contact_phones WHERE contact_id = p_keep ORDER BY created_at LIMIT 1
     );
  END IF;

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

  -- ── 名刺: すべて移す ──
  -- 採用済みの印は残す側のものを優先する。**現在の所属は勝手に切り替えない**
  -- （名刺の登録日は在籍期間を表さないため。docs/contact-identity.md）。
  -- 残す側に印が無いときだけ、吸収した側の印を引き継ぐ
  IF EXISTS (SELECT 1 FROM business_cards WHERE contact_id = p_keep AND is_primary) THEN
    UPDATE business_cards SET is_primary = FALSE
     WHERE contact_id = p_merge AND is_primary;
  END IF;

  UPDATE business_cards SET contact_id = p_keep, last_updated_by = v_actor
   WHERE contact_id = p_merge;

  -- ── 住所: すべて移す ──
  -- 主住所は相手ごとに 1 件しか持てない（uq_entity_addresses_primary_contact）。
  -- 名刺と同じく、残す側に主住所があるなら吸収した側の印を先に落とす
  IF EXISTS (SELECT 1 FROM entity_addresses WHERE contact_id = p_keep AND is_primary) THEN
    UPDATE entity_addresses SET is_primary = FALSE
     WHERE contact_id = p_merge AND is_primary;
  END IF;

  UPDATE entity_addresses SET contact_id = p_keep, last_updated_by = v_actor
   WHERE contact_id = p_merge;

  -- ── 単純な付け替え ──
  UPDATE leads     SET contact_id = p_keep          WHERE contact_id = p_merge;
  UPDATE leads     SET promoted_contact_id = p_keep WHERE promoted_contact_id = p_merge;
  UPDATE deals     SET contact_id = p_keep          WHERE contact_id = p_merge;
  UPDATE contracts SET counterparty_contact_id = p_keep WHERE counterparty_contact_id = p_merge;
  UPDATE contracts SET counterparty_manager_id = p_keep WHERE counterparty_manager_id = p_merge;
  UPDATE talents   SET contact_id = p_keep          WHERE contact_id = p_merge;
  UPDATE financial_info   SET contact_id = p_keep   WHERE contact_id = p_merge;
  UPDATE companies SET primary_contact_id = p_keep  WHERE primary_contact_id = p_merge;
  UPDATE email_contact_candidates SET contact_id = p_keep WHERE contact_id = p_merge;

  -- 履歴は消さずに移す。誰の履歴だったかは統合後も残す必要がある
  UPDATE activity_logs            SET contact_id = p_keep WHERE contact_id = p_merge;
  UPDATE deal_activities          SET contact_id = p_keep WHERE contact_id = p_merge;
  UPDATE contact_change_histories SET contact_id = p_keep WHERE contact_id = p_merge;

  -- ── 空欄の補完 ──
  -- 残す側に無い情報だけを引き継ぐ。既存値は上書きしない。
  -- 診断結果は生年月日から導かれる値なので、birth_date と組で引き継ぐ
  -- （DB 側では算出しないため、片方だけ移すと空のまま残る）
  UPDATE contacts SET
    middle_name      = COALESCE(middle_name,      v_merge.middle_name),
    last_name_kana   = COALESCE(last_name_kana,   v_merge.last_name_kana),
    first_name_kana  = COALESCE(first_name_kana,  v_merge.first_name_kana),
    middle_name_kana = COALESCE(middle_name_kana, v_merge.middle_name_kana),
    birth_date       = COALESCE(birth_date,       v_merge.birth_date),
    potential_number = COALESCE(potential_number, v_merge.potential_number),
    constellation_id = COALESCE(constellation_id, v_merge.constellation_id),
    blood_type       = COALESCE(blood_type,       v_merge.blood_type),
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
