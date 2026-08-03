-- ============================================================
-- resolve_or_create_contact の既定ステータスが「見込み」に戻っていた退行を直す
--
-- 背景:
--   20260731000003 で resolve_or_create_contact を作った際、新規連絡先の
--   既定ステータスを contact_statuses の「見込み」にしていた。
--
--   20260731000009 で「見込み」は営業ステージの語彙であり連絡先そのものの
--   状態ではないと決定し、既存データを「アクティブ」へ移送したうえで
--   contact_statuses の「見込み」を論理削除し、関数も「アクティブ」を
--   引くよう直した。
--
--   ところが 20260801000007（電話番号ラベル判定の変更）が
--   resolve_or_create_contact 全体を差し替えた際、ベースにした版が古く、
--   既定ステータスの検索条件が `name = '見込み'` に巻き戻ってしまっていた。
--
--   現在の contact_statuses は アクティブ / 休眠 / 退職 の 3 件で「見込み」は
--   論理削除済みのため、この条件は常に該当なしとなり、フォールバックの
--   `ORDER BY created_at LIMIT 1` に落ちる。seed は 3 件を同一 INSERT 文で
--   投入しており created_at が同値のため、どのステータスが選ばれるかは
--   非決定的だった。名刺取込・問い合わせ取込で作られる連絡先が
--   「休眠」や「退職」になりうる状態だった。
--
-- 修正方針:
--   20260801000007 の最終版（電話ラベル判定・携帯番号での名寄せ等）は
--   そのまま維持し、既定ステータスの検索条件だけを 20260731000009 の
--   意図どおり `name = 'アクティブ'` に戻す。
--
--   フォールバックの `ORDER BY created_at LIMIT 1` は削除する。
--   マスタの「アクティブ」が万一存在しない場合、非決定的な別ステータスで
--   静かに連絡先を作り続けるより、その場で失敗させて気づけるようにする方が
--   安全（company_statuses 側の resolve_or_create_company も同じ考え方で
--   「該当なしなら RAISE EXCEPTION」にしている。20260802000006）。
-- ============================================================

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
  v_digits    TEXT;
BEGIN
  -- 姓が取れない行は人物として成立しないので連絡先を作らない
  IF v_last IS NULL THEN
    RETURN NULL;
  END IF;

  -- P1. メール一致。同一人物の判定として最も確実
  IF v_email IS NOT NULL THEN
    SELECT c.id INTO v_id
      FROM contacts c
      JOIN contact_emails e ON e.contact_id = c.id
     WHERE lower(e.email) = lower(v_email)
       AND c.deleted_at IS NULL
     LIMIT 1;
  END IF;

  -- P2. 携帯番号 + 姓一致。会社もメールも変わる転職を跨げる
  IF v_id IS NULL AND v_phone IS NOT NULL AND is_mobile_phone(v_phone) THEN
    v_digits := regexp_replace(v_phone, '[^0-9]', '', 'g');
    SELECT c.id INTO v_id
      FROM contacts c
      JOIN contact_phones p ON p.contact_id = c.id
     WHERE regexp_replace(p.phone, '[^0-9]', '', 'g') = v_digits
       AND is_mobile_phone(p.phone)
       AND c.last_name = v_last
       AND c.deleted_at IS NULL
     ORDER BY c.created_at
     LIMIT 1;
  END IF;

  -- P3. 会社 × 姓名一致
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
    -- 営業上の進度は Lead 側（lead_statuses）が持つ（20260731000009）。
    --
    -- 「アクティブ」が見つからない場合は非決定的な別ステータスへ
    -- フォールバックせず、その場で失敗させる。マスタが壊れたまま
    -- 誤ったステータスで連絡先を作り続けるほうが気づきにくく危険なため
    SELECT id INTO v_status_id FROM contact_statuses
     WHERE name = 'アクティブ' AND deleted_at IS NULL LIMIT 1;
    IF v_status_id IS NULL THEN
      RAISE EXCEPTION 'contact_statuses の「アクティブ」が見つかりません。マスタを確認してください';
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

  -- メール・電話は空欄補完ではなく追加。転職後の新アドレスを足しても
  -- 旧アドレスは残す（過去のやり取りの参照先を壊さないため）
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
      v_id, v_phone,
      default_phone_label(v_phone),
      NOT EXISTS (SELECT 1 FROM contact_phones WHERE contact_id = v_id),
      p_actor, p_actor
    );
  END IF;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION resolve_or_create_contact IS
  '名刺の氏名／メールから連絡先を名寄せし、無ければ「アクティブ」で作成する。既定ステータスが見つからない場合はフォールバックせず例外を投げる（20260803000001）。メール・電話は空欄補完ではなく追加。ラベルは phone_line_type ベースの default_phone_label（20260801000007）';
