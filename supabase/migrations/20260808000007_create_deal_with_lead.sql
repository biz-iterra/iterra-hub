-- ============================================================
-- 商談をリード起点で作る（T-0070）
--
--   商談の新規作成は「既存のリードを選ぶ」か「リードを新規作成する」から
--   始まる。TQL 未満のリードはその場で選定へ上げられる。
--
--   これらは**同じトランザクションで行う必要がある**。
--   supabase-js は複数文を 1 トランザクションにできないので、
--   アプリ側で順に投げると
--     ・リードだけできて商談ができない
--     ・ステージを上げただけで商談ができない
--     ・商談はできたが履歴が欠ける
--   といった中途半端な状態が残る（CLAUDE.md の「複数テーブルへの書き込みは
--   DB 関数にまとめる」）。
--
--   **既存 createDeal の非原子性もここで解消する。** これまで
--   deals / deal_stage_histories / deal_status_histories / deal_projects を
--   別々に投げており、途中で落ちると履歴が欠けていた。
--
--   **SECURITY DEFINER にしない。** RLS をそのまま効かせる
--   （member が他人のリードで商談を作れてしまわないように）。
-- ============================================================

CREATE OR REPLACE FUNCTION create_deal_with_lead(
  p_deal            JSONB,
  p_lead_id         UUID DEFAULT NULL,
  p_new_lead        JSONB DEFAULT NULL,
  p_raise_stage_id  UUID DEFAULT NULL,
  p_raise_status_id UUID DEFAULT NULL,
  p_project_id      UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id    UUID := auth.uid();
  v_lead_id    UUID := p_lead_id;
  v_lead       leads%ROWTYPE;
  v_deal_id    UUID;
  v_stage_id   UUID;
  v_status_id  UUID;
  v_company_id UUID;
  v_contact_id UUID;
  v_d          RECORD;
  v_stage      lead_stages%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '認証が必要です';
  END IF;

  -- ── 1. リードを用意する ───────────────────────────────────────────────────
  IF v_lead_id IS NULL THEN
    IF p_new_lead IS NULL THEN
      RAISE EXCEPTION 'この商談には元になったリードが必要です。既存のリードを選ぶか、リードを新規作成してください';
    END IF;

    INSERT INTO leads (
      lead_name, stage_id, status_id, lead_source_id, account_type_id,
      company_id, contact_id, company_name, owner_user_id,
      created_by, last_updated_by
    )
    SELECT
      n.lead_name, n.stage_id, n.status_id, n.lead_source_id, n.account_type_id,
      n.company_id, n.contact_id, n.company_name,
      COALESCE(n.owner_user_id, v_user_id), v_user_id, v_user_id
    FROM jsonb_to_record(p_new_lead) AS n(
      lead_name       TEXT,
      stage_id        UUID,
      status_id       UUID,
      lead_source_id  UUID,
      account_type_id UUID,
      company_id      UUID,
      contact_id      UUID,
      company_name    TEXT,
      owner_user_id   UUID
    )
    RETURNING id INTO v_lead_id;

  ELSIF p_raise_stage_id IS NOT NULL THEN
    -- ── 2. TQL 未満のリードをその場で上げる ─────────────────────────────────
    -- 上げた結果が商談を起こせる段階かは、この下の 2b で確かめる
    UPDATE leads
       SET stage_id        = p_raise_stage_id,
           status_id       = COALESCE(p_raise_status_id, status_id),
           last_updated_by = v_user_id
     WHERE id = v_lead_id
       AND deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'リードが見つかりません';
    END IF;
  END IF;

  SELECT * INTO v_lead FROM leads WHERE id = v_lead_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'リードが見つかりません';
  END IF;

  -- ── 2b. 商談を起こしてよい段階か ──────────────────────────────────────────
  --
  --   **この経路（商談の新規作成画面）でだけ見る。** トリガー側で一律に
  --   強制すると、昇格（リードを Sales へ上げる操作）が壊れる。昇格は
  --   「商談を作ってからステージを上げる」順序で動くため、その途中では
  --   リードがまだ獲得や育成のまま商談が作られる。
  SELECT * INTO v_stage FROM lead_stages WHERE id = v_lead.stage_id;
  IF FOUND AND NOT v_stage.is_deal_ready THEN
    RAISE EXCEPTION
      'リード「%」は「%」段階です。商談を作るには「選定」以上へ進めてください',
      v_lead.lead_name, v_stage.name;
  END IF;

  -- ── 3. 商談 ───────────────────────────────────────────────────────────────
  SELECT * INTO v_d
    FROM jsonb_to_record(p_deal) AS d(
      name             TEXT,
      pipeline_type_id UUID,
      deal_stage_id    UUID,
      deal_status_id   UUID,
      amount           BIGINT,
      company_id       UUID,
      contact_id       UUID,
      owner_user_id    UUID,
      application_date      DATE,
      review_completed_date DATE,
      expected_close_date   DATE
    );

  -- 相手先はリードの値を既定にし、画面で選び直されていればそちらを使う
  v_company_id := COALESCE(v_d.company_id, v_lead.company_id);
  v_contact_id := COALESCE(v_d.contact_id, v_lead.contact_id);

  INSERT INTO deals (
    name, pipeline_type_id, deal_stage_id, deal_status_id, amount,
    account_id, company_id, contact_id, lead_id,
    application_date, review_completed_date, expected_close_date,
    owner_user_id, created_by, last_updated_by
  ) VALUES (
    v_d.name, v_d.pipeline_type_id, v_d.deal_stage_id, v_d.deal_status_id, v_d.amount,
    NULL, v_company_id, v_contact_id, v_lead_id,
    v_d.application_date, v_d.review_completed_date, v_d.expected_close_date,
    COALESCE(v_d.owner_user_id, v_user_id), v_user_id, v_user_id
  )
  RETURNING id, deal_stage_id, deal_status_id
       INTO v_deal_id, v_stage_id, v_status_id;

  -- ── 4. 初回の履歴 ─────────────────────────────────────────────────────────
  INSERT INTO deal_stage_histories (deal_id, from_stage_id, to_stage_id, changed_by)
  VALUES (v_deal_id, NULL, v_stage_id, v_user_id);

  INSERT INTO deal_status_histories (deal_id, stage_id, from_status_id, to_status_id, changed_by)
  VALUES (v_deal_id, v_stage_id, NULL, v_status_id, v_user_id);

  -- ── 5. プロジェクトから来たときの紐づけ ───────────────────────────────────
  IF p_project_id IS NOT NULL THEN
    INSERT INTO deal_projects (deal_id, project_id, created_by)
    VALUES (v_deal_id, p_project_id, v_user_id);
  END IF;

  RETURN jsonb_build_object(
    'deal_id',    v_deal_id,
    'lead_id',    v_lead_id,
    'company_id', v_company_id,
    'contact_id', v_contact_id
  );
END;
$function$;

COMMENT ON FUNCTION create_deal_with_lead IS
'商談をリード起点で作る。リードの新規作成・ステージの引き上げ・商談・履歴・プロジェクト紐づけを単一トランザクションで行う';
