-- ============================================================
-- リードの作成を 1 トランザクションにまとめる（T-0094）
--
-- 背景:
--   `createLead` は leads を INSERT したあと、副担当を lead_owners へ
--   別文で INSERT していた。supabase-js は複数文を単一トランザクションに
--   できないため、**副担当の INSERT だけ失敗するとリードはできて副担当が
--   付かない**中途半端な状態が残る。しかもアプリ側は best effort 扱いで
--   `console.warn` を出すだけだったので、画面には成功として見える。
--   CLAUDE.md「複数テーブルへの書き込みは DB 関数にまとめる」に反する。
--
-- 方針:
--   - 値の整形（Zod 検証・主担当との重複除外・ステージとステータスの整合）は
--     これまでどおり TS 側。ここは書き込みだけを受け持つ
--   - SECURITY INVOKER。RLS はそのまま効く
--     （leads の INSERT は owner_user_id = auth.uid() OR manager 以上、
--       lead_owners の INSERT は親リードに準ずる）
--   - **副担当の INSERT が 0 行になったら例外にする。** 黙って落ちるのが
--     元の不具合なので、件数が合わなければリードごと巻き戻す
--   - スコアの再計算は呼ばない。service_role で別途走らせる既存の流れを変えない
--     （関数内で呼ぶと INVOKER の権限では実行できない）
--
-- 注意:
--   PostgreSQL は引数の個数が変わると CREATE OR REPLACE では置き換えにならず
--   別オーバーロードとして増える。引数を足すときは DROP FUNCTION を先に書く。
-- ============================================================

CREATE OR REPLACE FUNCTION create_lead_with_owners(
  -- leadCreateSchema が検証済みの leads の値（sub_owner_user_ids は含めない）
  p_lead JSONB,
  -- 副担当。主担当との重複は TS 側で除外済み
  p_sub_owner_ids UUID[] DEFAULT '{}'::UUID[]
) RETURNS UUID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor    UUID := auth.uid();
  v_lead_id  UUID;
  v_expected INTEGER;
  v_inserted INTEGER;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION '認証が必要です';
  END IF;

  -- ── 1. リード本体 ────────────────────────────────────────────────────────
  -- category_id / company_size_id / score / temperature_id はトリガーと
  -- 再計算関数が決める導出値なので受け取らない
  INSERT INTO leads (
    lead_name, account_type_id, stage_id, status_id,
    company_name, lead_source_id, company_id, contact_id,
    url, company_phone, employee_count, capital,
    large_segment_id, small_segment_id,
    contact_last_name, contact_middle_name, contact_first_name,
    contact_last_name_kana, contact_middle_name_kana, contact_first_name_kana,
    contact_department, contact_job_title, contact_email, contact_phone,
    company_name_kana, representative_name, corporate_number,
    owner_user_id, created_by, last_updated_by
  )
  SELECT
    l.lead_name, l.account_type_id, l.stage_id, l.status_id,
    l.company_name, l.lead_source_id, l.company_id, l.contact_id,
    l.url, l.company_phone, l.employee_count, l.capital,
    l.large_segment_id, l.small_segment_id,
    l.contact_last_name, l.contact_middle_name, l.contact_first_name,
    l.contact_last_name_kana, l.contact_middle_name_kana, l.contact_first_name_kana,
    l.contact_department, l.contact_job_title, l.contact_email, l.contact_phone,
    l.company_name_kana, l.representative_name, l.corporate_number,
    COALESCE(l.owner_user_id, v_actor), v_actor, v_actor
  FROM jsonb_to_record(p_lead) AS l(
    lead_name                TEXT,
    account_type_id          UUID,
    stage_id                 UUID,
    status_id                UUID,
    company_name             TEXT,
    lead_source_id           UUID,
    company_id               UUID,
    contact_id               UUID,
    url                      TEXT,
    company_phone            TEXT,
    employee_count           INTEGER,
    capital                  NUMERIC,
    large_segment_id         UUID,
    small_segment_id         UUID,
    contact_last_name        TEXT,
    contact_middle_name      TEXT,
    contact_first_name       TEXT,
    contact_last_name_kana   TEXT,
    contact_middle_name_kana TEXT,
    contact_first_name_kana  TEXT,
    contact_department       TEXT,
    contact_job_title        TEXT,
    contact_email            TEXT,
    contact_phone            TEXT,
    company_name_kana        TEXT,
    representative_name      TEXT,
    corporate_number         TEXT,
    owner_user_id            UUID
  )
  RETURNING id INTO v_lead_id;

  -- ── 2. 副担当 ────────────────────────────────────────────────────────────
  v_expected := COALESCE(array_length(p_sub_owner_ids, 1), 0);
  IF v_expected > 0 THEN
    INSERT INTO lead_owners (lead_id, user_id)
    SELECT v_lead_id, uid FROM unnest(p_sub_owner_ids) AS uid;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    -- **RLS で弾かれると 0 行になり、エラーも出ない。** 元の不具合はここ
    IF v_inserted <> v_expected THEN
      RAISE EXCEPTION '副担当を % 件登録するはずが % 件しか入りませんでした', v_expected, v_inserted;
    END IF;
  END IF;

  RETURN v_lead_id;
END;
$$;

COMMENT ON FUNCTION create_lead_with_owners(JSONB, UUID[]) IS
  'リード本体と副担当を単一トランザクションで作成する。副担当が入り切らなければ例外にしてリードごと巻き戻す（T-0094）';
