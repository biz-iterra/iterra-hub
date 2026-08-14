-- ============================================================
-- ディールの初回履歴もトリガーに寄せる（T-0102）
--
-- 背景:
--   20260814100002 で「更新」の履歴だけをトリガーへ移した。作成時の初回履歴は
--   `promote_lead_to_deal` と `create_deal_with_lead` が今も自前で INSERT しており、
--   **記録の入口が 2 つある**状態だった。どちらも同じ関数の中なので
--   トランザクションは切れておらず実害は無いが、片方だけ直す事故が起きやすい。
--   履歴 2 表の INSERT ポリシーを落とせないのもこのため（消すと昇格と新規作成が
--   丸ごと落ちる。実際に E2E-03 / 04 / 12 / 17 / 18 で踏んだ）。
--
-- 方針:
--   - トリガーを AFTER INSERT OR UPDATE にし、INSERT のときは
--     `from_stage_id = NULL` の初回履歴を書く（関数がやっていたことと同じ）
--   - 関数 2 本から履歴の INSERT を外す。**残したままトリガーを INSERT へ広げると
--     二重記録になる**ので、必ず同じマイグレーションで行う
--   - 書き込み口がトリガーだけになるので、履歴 2 表の INSERT ポリシーを落とす。
--     トリガーは SECURITY DEFINER・所有者権限で動くので RLS を通らない
--
-- 注意:
--   関数の本体は 20260808000006 / 20260808000007 の定義から履歴 INSERT だけを
--   除いたもの。**他の変更は入れていない。**
-- ============================================================

-- ── 1. トリガー関数を INSERT にも対応させる ──────────────────────────────
CREATE OR REPLACE FUNCTION log_deal_stage_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  /*
   * 記録者の決め方は作成と更新で分ける。
   * **更新で created_by へ落とさないこと。** 作った人と直した人は別で、
   * 「誰が動かしたか」を作成者の名前で埋めると履歴が嘘になる
   */
  v_actor UUID := CASE
    WHEN TG_OP = 'INSERT' THEN COALESCE(auth.uid(), NEW.last_updated_by, NEW.created_by)
    ELSE COALESCE(auth.uid(), NEW.last_updated_by)
  END;
BEGIN
  -- 記録者が分からない更新は履歴を残さない（changed_by は NOT NULL）
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- 初回。遷移前は無い
    INSERT INTO deal_stage_histories (deal_id, from_stage_id, to_stage_id, changed_by)
    VALUES (NEW.id, NULL, NEW.deal_stage_id, v_actor);

    INSERT INTO deal_status_histories (deal_id, stage_id, from_status_id, to_status_id, changed_by)
    VALUES (NEW.id, NEW.deal_stage_id, NULL, NEW.deal_status_id, v_actor);

    RETURN NEW;
  END IF;

  IF NEW.deal_stage_id IS DISTINCT FROM OLD.deal_stage_id THEN
    INSERT INTO deal_stage_histories (deal_id, from_stage_id, to_stage_id, changed_by)
    VALUES (NEW.id, OLD.deal_stage_id, NEW.deal_stage_id, v_actor);
  END IF;

  IF NEW.deal_status_id IS DISTINCT FROM OLD.deal_status_id THEN
    INSERT INTO deal_status_histories (deal_id, stage_id, from_status_id, to_status_id, changed_by)
    VALUES (NEW.id, NEW.deal_stage_id, OLD.deal_status_id, NEW.deal_status_id, v_actor);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION log_deal_stage_status_change() IS
  'deals の作成とステージ・ステータス変更を履歴 2 表へ記録する。アプリからも DB 関数からも INSERT しない（T-0095 / T-0102）';

-- 旧トリガー（UPDATE のみ）を張り替える。
-- **WHEN 句では TG_OP を参照できない**ので、INSERT と UPDATE でトリガーを分ける。
-- 中身は同じ関数で、関数側が TG_OP を見て振る舞いを変える
DROP TRIGGER IF EXISTS trg_deals_stage_status_history ON deals;

CREATE TRIGGER trg_deals_stage_status_history_insert
  AFTER INSERT ON deals
  FOR EACH ROW
  EXECUTE FUNCTION log_deal_stage_status_change();

DROP TRIGGER IF EXISTS trg_deals_stage_status_history_update ON deals;
CREATE TRIGGER trg_deals_stage_status_history_update
  AFTER UPDATE ON deals
  FOR EACH ROW
  WHEN (
    OLD.deal_stage_id IS DISTINCT FROM NEW.deal_stage_id
    OR OLD.deal_status_id IS DISTINCT FROM NEW.deal_status_id
  )
  EXECUTE FUNCTION log_deal_stage_status_change();

-- ── 2. 昇格（初回履歴の INSERT を外す） ──────────────────────────────────
CREATE OR REPLACE FUNCTION promote_lead_to_deal(
  p_lead_id       UUID,
  p_company       JSONB,
  p_contact       JSONB,
  p_contact_email TEXT,
  p_contact_phone TEXT,
  p_account       JSONB,
  p_deal          JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id    UUID := auth.uid();
  v_lead       leads%ROWTYPE;
  v_company_id UUID;
  v_contact_id UUID;
  v_deal_id    UUID;
  v_stage_id   UUID;
  v_status_id  UUID;
  v_c          RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '認証が必要です';
  END IF;

  -- ── 対象 Lead をロックして取得（二重昇格の同時実行を防ぐ）──────────────────
  SELECT * INTO v_lead
    FROM leads
   WHERE id = p_lead_id
     AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'リードが見つかりません';
  END IF;

  IF v_lead.promoted_deal_id IS NOT NULL THEN
    RAISE EXCEPTION 'このリードはすでに Deal に昇格済みです';
  END IF;

  -- ── 1. Company ────────────────────────────────────────────────────────────
  -- 取込時に作られていればそれを使う。名刺由来のリードは基本ここで確定する
  v_company_id := v_lead.company_id;

  IF v_company_id IS NULL AND p_company IS NOT NULL THEN
    SELECT * INTO v_c
      FROM jsonb_to_record(p_company) AS c(
        name                TEXT,
        name_kana           TEXT,
        representative_name TEXT,
        corporate_number    TEXT,
        phone               TEXT,
        website_url         TEXT,
        lead_source_id      UUID,
        owner_user_id       UUID,
        company_status_id   UUID,
        created_by          UUID,
        last_updated_by     UUID
      );

    -- **名寄せを通す。** 法人番号 → メールドメイン → 住所+名称 → 名称 の順に
    -- 既存を探し、無ければ作る。取込経路と同じ関数を使う（規則を二重に持たない）
    v_company_id := resolve_or_create_company(
      v_c.name,
      p_contact_email,
      v_c.phone,
      v_c.website_url,
      COALESCE(v_c.owner_user_id, v_lead.owner_user_id),
      COALESCE(v_c.lead_source_id, v_lead.lead_source_id),
      v_user_id,
      v_c.corporate_number,
      v_lead.address_id
    );

    -- 名寄せが扱わない項目は**空欄だけ補う**。
    -- 既存の事業者に寄ったとき、そちらの値を上書きしてはいけない
    IF v_company_id IS NOT NULL THEN
      UPDATE companies
         SET name_kana           = COALESCE(name_kana, v_c.name_kana),
             representative_name = COALESCE(representative_name, v_c.representative_name),
             company_status_id   = COALESCE(company_status_id, v_c.company_status_id),
             last_updated_by     = v_user_id
       WHERE id = v_company_id
         AND (name_kana IS NULL OR representative_name IS NULL OR company_status_id IS NULL);
    END IF;
  END IF;

  -- ── 2. Contact ────────────────────────────────────────────────────────────
  v_contact_id := v_lead.contact_id;

  IF v_contact_id IS NULL THEN
    INSERT INTO contacts (
      last_name, middle_name, first_name,
      last_name_kana, middle_name_kana, first_name_kana,
      department, job_title, contact_type, company_id, website_url,
      contact_status_id, lead_source_id, owner_user_id,
      created_by, last_updated_by
    )
    SELECT
      ct.last_name, ct.middle_name, ct.first_name,
      ct.last_name_kana, ct.middle_name_kana, ct.first_name_kana,
      ct.department, ct.job_title, ct.contact_type, v_company_id, ct.website_url,
      ct.contact_status_id, ct.lead_source_id, ct.owner_user_id,
      ct.created_by, ct.last_updated_by
    FROM jsonb_to_record(p_contact) AS ct(
      last_name         TEXT,
      middle_name       TEXT,
      first_name        TEXT,
      last_name_kana    TEXT,
      middle_name_kana  TEXT,
      first_name_kana   TEXT,
      department        TEXT,
      job_title         TEXT,
      contact_type      TEXT,
      website_url       TEXT,
      contact_status_id UUID,
      lead_source_id    UUID,
      owner_user_id     UUID,
      created_by        UUID,
      last_updated_by   UUID
    )
    RETURNING id INTO v_contact_id;

    -- ── 3. 連絡先（新規作成した場合のみ）──────────────────────────────────
    -- 既存 Contact には取込時に登録済みなので触らない
    IF p_contact_email IS NOT NULL THEN
      INSERT INTO contact_emails (contact_id, email, label, is_primary, created_by, last_updated_by)
      VALUES (v_contact_id, p_contact_email, 'work', TRUE, v_user_id, v_user_id);
    END IF;

    IF p_contact_phone IS NOT NULL THEN
      INSERT INTO contact_phones (contact_id, phone, label, is_primary, created_by, last_updated_by)
      VALUES (v_contact_id, p_contact_phone, 'work', TRUE, v_user_id, v_user_id);
    END IF;
  END IF;

  -- 法人の代表者が未設定なら、この連絡先を代表として立てる
  IF v_company_id IS NOT NULL AND v_contact_id IS NOT NULL THEN
    UPDATE companies
       SET primary_contact_id = v_contact_id
     WHERE id = v_company_id
       AND primary_contact_id IS NULL;
  END IF;

  -- ── 4. Deal（取引先なし）──────────────────────────────────────────────────
  -- Account は契約成立時に作る。ここでは相手を company / contact で示す。
  -- **lead_id が紐づけの正本**（T-0069）
  INSERT INTO deals (
    name, pipeline_type_id, deal_stage_id, deal_status_id,
    account_id, company_id, contact_id, lead_id,
    owner_user_id, created_by, last_updated_by
  )
  SELECT
    d.name, d.pipeline_type_id, d.deal_stage_id, d.deal_status_id,
    NULL, v_company_id, v_contact_id, p_lead_id,
    d.owner_user_id, d.created_by, d.last_updated_by
  FROM jsonb_to_record(p_deal) AS d(
    name             TEXT,
    pipeline_type_id UUID,
    deal_stage_id    UUID,
    deal_status_id   UUID,
    owner_user_id    UUID,
    created_by       UUID,
    last_updated_by  UUID
  )
  RETURNING id, deal_stage_id, deal_status_id
       INTO v_deal_id, v_stage_id, v_status_id;

  -- ── 5. Lead の紐づけを更新 ────────────────────────────────────────────────
  -- `promoted_deal_id` はトリガー sync_lead_promoted_deal が入れるので触らない
  -- （派生値。正本は deals.lead_id）。promoted_account_id は契約時まで NULL
  UPDATE leads
     SET promoted_company_id = v_company_id,
         promoted_contact_id = v_contact_id,
         company_id          = COALESCE(company_id, v_company_id),
         contact_id          = COALESCE(contact_id, v_contact_id),
         last_updated_by     = v_user_id
   WHERE id = p_lead_id;

  -- ステージ／ステータスの初回履歴は AFTER INSERT トリガーが書く（T-0102）。
  -- ここから INSERT すると記録の入口が 2 つになり、片方だけ直す事故が起きる

  RETURN jsonb_build_object(
    'deal_id',    v_deal_id,
    'company_id', v_company_id,
    'contact_id', v_contact_id,
    'account_id', NULL
  );
END;
$function$;

COMMENT ON FUNCTION promote_lead_to_deal IS
'リードをディールへ昇格させる。事業者情報は resolve_or_create_company で名寄せし、既存があれば再利用する（事業者 1 : リード N）。deals.lead_id を埋める。初回履歴はトリガーが書く（T-0102）';

-- ── 3. リード起点の新規作成（初回履歴の INSERT を外す） ──────────────────
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
  v_requires_lead BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '認証が必要です';
  END IF;

  -- ── 1. リードを用意する ───────────────────────────────────────────────────
  --
  --   **リードが要るかはパイプラインが決める**（`pipeline_types.requires_lead`）。
  --   セールスは必須だが、プロキュアメント・パートナーシップは
  --   相手（仕入れ先・委託先）が既にいる状態から始まるので要らない。
  SELECT requires_lead INTO v_requires_lead
    FROM pipeline_types
   WHERE id = (p_deal ->> 'pipeline_type_id')::UUID;

  IF v_lead_id IS NULL AND p_new_lead IS NULL THEN
    IF COALESCE(v_requires_lead, FALSE) THEN
      RAISE EXCEPTION 'このディールには元になったリードが必要です。既存のリードを選ぶか、リードを新規作成してください';
    END IF;

  ELSIF v_lead_id IS NULL THEN
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
    -- 上げた結果がディールを起こせる段階かは、この下の 2b で確かめる
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

  -- ── 2. リードを読む（リードがある場合だけ） ───────────────────────────────
  IF v_lead_id IS NOT NULL THEN
    SELECT * INTO v_lead FROM leads WHERE id = v_lead_id AND deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'リードが見つかりません';
    END IF;
  END IF;

  -- ── 2b. ディールを起こしてよい段階か ──────────────────────────────────────────
  --
  --   **この経路（ディールの新規作成画面）でだけ見る。** トリガー側で一律に
  --   強制すると、昇格（リードを Sales へ上げる操作）が壊れる。昇格は
  --   「ディールを作ってからステージを上げる」順序で動くため、その途中では
  --   リードがまだリード獲得やナーチャリングのままディールが作られる。
  SELECT * INTO v_stage FROM lead_stages WHERE id = v_lead.stage_id;
  IF v_lead_id IS NOT NULL AND FOUND AND NOT v_stage.is_deal_ready THEN
    RAISE EXCEPTION
      'リード「%」は「%」段階です。ディールを作れる段階まで進めてください',
      v_lead.lead_name, v_stage.name;
  END IF;

  -- ── 3. ディール ───────────────────────────────────────────────────────────────
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

  -- ステージ／ステータスの初回履歴は AFTER INSERT トリガーが書く（T-0102）

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
'リードとディールを 1 トランザクションで作る。初回履歴はトリガーが書く（T-0102）';

-- ── 4. 書き込み口をトリガーだけにする ────────────────────────────────────
-- ここまでで、履歴を書くのは log_deal_stage_status_change() だけになった。
-- SECURITY DEFINER なので RLS を通らない
DROP POLICY IF EXISTS deal_stage_histories_insert ON deal_stage_histories;
DROP POLICY IF EXISTS deal_status_histories_insert ON deal_status_histories;
