-- ============================================================
-- 連絡先ステータスから「見込み」を外す
--
-- 背景:
--   contact_statuses に「見込み」があり、名刺取込で作る連絡先の既定値に
--   使っていた（20260731000003）。しかし「見込み」は営業上のステージであって
--   連絡先そのものの状態ではない。
--
--   リードの進度は leads.status_id（lead_statuses）が持つ。
--   連絡先が同じ語彙を持つと、同じ人物について 2 か所に進度が書かれ、
--   どちらが正かが決まらない。
--
--   連絡先のステータスは「連絡先として今も有効か」だけを表す:
--     アクティブ … 連絡が取れる現役の連絡先
--     休眠       … しばらく接触が無い
--     退職       … その組織を離れており連絡先として無効
--
-- 移行:
--   「見込み」だった連絡先は「アクティブ」にする。名刺交換した相手は
--   連絡先としては有効なので、営業上の温度感は Lead 側で見る。
-- ============================================================

DO $$
DECLARE
  v_active   UUID;
  v_prospect UUID;
  v_moved    INTEGER := 0;
BEGIN
  SELECT id INTO v_active   FROM contact_statuses WHERE name = 'アクティブ' AND deleted_at IS NULL LIMIT 1;
  SELECT id INTO v_prospect FROM contact_statuses WHERE name = '見込み'     AND deleted_at IS NULL LIMIT 1;

  IF v_prospect IS NULL THEN
    RAISE NOTICE '連絡先ステータス「見込み」は存在しません。移行をスキップします';
    RETURN;
  END IF;

  IF v_active IS NULL THEN
    RAISE EXCEPTION '連絡先ステータス「アクティブ」が見つかりません。先にマスタを整備してください';
  END IF;

  UPDATE contacts
     SET contact_status_id = v_active
   WHERE contact_status_id = v_prospect;
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  -- 参照が無くなってから論理削除する。物理削除はしない（削除ポリシー）
  UPDATE contact_statuses
     SET deleted_at      = now(),
         deletion_reason = '営業ステージの語彙のため廃止。リードの進度は lead_statuses が持つ'
   WHERE id = v_prospect;

  RAISE NOTICE '連絡先ステータス移行: 見込み → アクティブ % 件', v_moved;
END $$;

-- ------------------------------------------------------------
-- 取込時の既定ステータスを「アクティブ」にする
--
-- 20260731000003 の resolve_or_create_contact を差し替える。
-- 変更点は既定ステータスの選び方のみ（'見込み' → 'アクティブ'）。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION resolve_or_create_contact(
  p_company_id     UUID,
  p_last_name      TEXT,
  p_first_name     TEXT,
  p_department     TEXT,
  p_job_title      TEXT,
  p_email          TEXT,
  p_phone          TEXT,
  p_owner_user_id  UUID,
  p_lead_source_id UUID,
  p_actor          UUID
) RETURNS UUID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id        UUID;
  v_status_id UUID;
  v_last      TEXT := NULLIF(btrim(COALESCE(p_last_name, '')), '');
  v_first     TEXT := COALESCE(NULLIF(btrim(COALESCE(p_first_name, '')), ''), '');
  v_email     TEXT := NULLIF(btrim(COALESCE(p_email, '')), '');
  v_phone     TEXT := NULLIF(btrim(COALESCE(p_phone, '')), '');
BEGIN
  -- 姓が取れない行は人物として成立しないので連絡先を作らない
  IF v_last IS NULL THEN
    RETURN NULL;
  END IF;

  -- 1. メール一致。同一人物の判定として最も確実
  IF v_email IS NOT NULL THEN
    SELECT c.id INTO v_id
      FROM contacts c
      JOIN contact_emails e ON e.contact_id = c.id
     WHERE lower(e.email) = lower(v_email)
       AND c.deleted_at IS NULL
     LIMIT 1;
  END IF;

  -- 2. 会社 × 姓名一致
  IF v_id IS NULL AND p_company_id IS NOT NULL THEN
    SELECT id INTO v_id
      FROM contacts
     WHERE company_id = p_company_id
       AND last_name = v_last
       AND COALESCE(first_name, '') = v_first
       AND deleted_at IS NULL
     ORDER BY created_at
     LIMIT 1;
  END IF;

  IF v_id IS NULL THEN
    -- 名刺交換した相手は連絡先としては有効なので「アクティブ」で作る。
    -- 営業上の進度は Lead 側（lead_statuses）が持つ
    SELECT id INTO v_status_id FROM contact_statuses
     WHERE name = 'アクティブ' AND deleted_at IS NULL LIMIT 1;
    IF v_status_id IS NULL THEN
      SELECT id INTO v_status_id FROM contact_statuses
       WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;
    END IF;
    IF v_status_id IS NULL THEN
      RAISE EXCEPTION 'contact_statuses が未投入です';
    END IF;

    INSERT INTO contacts (
      last_name, first_name, department, job_title,
      contact_type, company_id, contact_status_id,
      lead_source_id, owner_user_id, created_by, last_updated_by
    ) VALUES (
      v_last, v_first,
      NULLIF(btrim(COALESCE(p_department, '')), ''),
      NULLIF(btrim(COALESCE(p_job_title, '')), ''),
      -- 法人に紐付かない名刺は所属不明として other にする
      -- （employee は company_id 必須という規約があるため）
      CASE WHEN p_company_id IS NOT NULL THEN 'employee' ELSE 'other' END,
      p_company_id, v_status_id,
      p_lead_source_id, p_owner_user_id, p_actor, p_actor
    ) RETURNING id INTO v_id;
  END IF;

  -- メール・電話は空欄補完のみ。既存の値は名刺で上書きしない
  IF v_email IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM contact_emails WHERE contact_id = v_id AND lower(email) = lower(v_email)
  ) THEN
    INSERT INTO contact_emails (contact_id, email, label, is_primary, created_by, last_updated_by)
    VALUES (
      v_id, v_email, 'work',
      NOT EXISTS (SELECT 1 FROM contact_emails WHERE contact_id = v_id),
      p_actor, p_actor
    );
  END IF;

  IF v_phone IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM contact_phones WHERE contact_id = v_id AND phone = v_phone
  ) THEN
    INSERT INTO contact_phones (contact_id, phone, label, is_primary, created_by, last_updated_by)
    VALUES (
      v_id, v_phone, 'work',
      NOT EXISTS (SELECT 1 FROM contact_phones WHERE contact_id = v_id),
      p_actor, p_actor
    );
  END IF;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION resolve_or_create_contact IS
  '名刺の氏名／メールから連絡先を名寄せし、無ければ「アクティブ」で作成する。メール・電話は空欄補完のみ';
