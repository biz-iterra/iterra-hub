-- ============================================================
-- 既存リードから法人・連絡先を遡って作る
--
-- 20260731000004 以降に取り込んだ名刺は Company / Contact が同時に作られるが、
-- それ以前に取り込んだリード（Eight の 3,000 件超を含む）は Lead だけの状態にある。
-- 取込時期によって連絡先に出てくる／出てこないが分かれるのを避けるため、
-- 同じ解決関数を通して埋める。
--
-- 冪等: company_id / contact_id が未設定の行だけを対象にする。
-- 二重実行しても増えない。
--
-- 名寄せは resolve_or_create_company / resolve_or_create_contact に任せる。
-- 判定基準を取込と共有するのが目的なので、ここに独自ロジックは置かない。
-- ============================================================

DO $$
DECLARE
  r          RECORD;
  v_company  UUID;
  v_contact  UUID;
  v_actor    UUID;
  v_fallback UUID;
  v_total    INTEGER := 0;
  v_company_created INTEGER := 0;
  v_contact_created INTEGER := 0;
BEGIN
  -- 件数が多く、本番では statement_timeout に掛かりうる
  SET LOCAL statement_timeout = 0;

  -- created_by が欠けている行の作成者として使う
  SELECT id INTO v_fallback FROM crm_users
   WHERE role = 'admin'
   ORDER BY created_at LIMIT 1;

  FOR r IN
    SELECT * FROM leads
     WHERE deleted_at IS NULL
       AND (company_id IS NULL OR contact_id IS NULL)
     ORDER BY created_at
  LOOP
    v_actor := COALESCE(r.created_by, r.owner_user_id, v_fallback);

    v_company := r.company_id;
    IF v_company IS NULL THEN
      v_company := resolve_or_create_company(
        r.company_name,
        r.contact_email,
        COALESCE(r.company_phone, r.contact_phone),
        r.url,
        r.owner_user_id,
        r.lead_source_id,
        v_actor
      );
      IF v_company IS NOT NULL AND r.company_id IS NULL THEN
        v_company_created := v_company_created + 1;
      END IF;
    END IF;

    v_contact := r.contact_id;
    IF v_contact IS NULL THEN
      v_contact := resolve_or_create_contact(
        v_company,
        r.contact_last_name,
        r.contact_first_name,
        r.contact_department,
        r.contact_job_title,
        r.contact_email,
        r.contact_phone,
        r.owner_user_id,
        r.lead_source_id,
        v_actor
      );
      IF v_contact IS NOT NULL THEN
        v_contact_created := v_contact_created + 1;
      END IF;
    END IF;

    IF v_company IS DISTINCT FROM r.company_id OR v_contact IS DISTINCT FROM r.contact_id THEN
      UPDATE leads SET company_id = v_company, contact_id = v_contact WHERE id = r.id;
    END IF;

    v_total := v_total + 1;
  END LOOP;

  RAISE NOTICE '遡及処理: リード % 件 / 法人紐付け % 件 / 連絡先紐付け % 件',
    v_total, v_company_created, v_contact_created;
END $$;
