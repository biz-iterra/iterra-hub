-- ============================================================
-- 商談とリードの規則を deals.lead_id へ移す（T-0069）
--
--   前のマイグレーションで `deals.lead_id` を正本にした。ここでは
--   ①リード必須の強制 ②`promoted_deal_id`（派生値）の維持
--   ③既存の判定 4 つを `lead_id` 経由へ差し替える。
--
--   **1 リードに商談 N 本**になったので、「商談を消せるか」の判断が変わる。
--   これまでは「参照している商談を消すな」だったが、
--   これからは「**消したあとに生きた商談が 0 件になるなら**消すな」。
--
--   差し替える関数は 2026-08-08 の T-0065 で触ったばかりのものを含む。
--   `20260808000001` の版を土台にしている（取りこぼすと T-0065 の修正が
--   巻き戻る）。
-- ============================================================

-- ------------------------------------------------------------
-- 1. リード必須の強制
--
--   CHECK 制約では他テーブル（pipeline_types）を参照できないのでトリガーにする。
--
--   **既存の商談を詰ませない。** 規則の導入前からある `lead_id` が無い商談は、
--   金額を直すといった普通の編集ができなくなってはいけない。
--   `lead_id` も `pipeline_type_id` も動かない UPDATE は素通しする
--   （`check_lead_stage_requirements` と同じ判断）。
-- ------------------------------------------------------------
--   **「TQL 以上」はここで見ない。** 昇格（リードを Sales へ上げる操作）は
--   「商談を作ってからステージを上げる」順序で動く（逆にすると
--   `check_lead_stage_requirements` の「Sales には商談が必要」と噛み合わない）。
--   つまり昇格の途中では、リードはまだ獲得や育成のまま商談が作られる。
--   ここで段階を強制すると**昇格という正当な経路が壊れる**。
--   段階の検査は `create_deal_with_lead`（商談の新規作成画面が通る経路）で行う。
CREATE OR REPLACE FUNCTION check_deal_lead_requirement()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_requires_lead BOOLEAN;
  v_lead          leads%ROWTYPE;
BEGIN
  -- 紐づけもパイプラインも動かない更新は見ない（既存行を詰ませない）
  IF TG_OP = 'UPDATE'
     AND NEW.lead_id IS NOT DISTINCT FROM OLD.lead_id
     AND NEW.pipeline_type_id IS NOT DISTINCT FROM OLD.pipeline_type_id THEN
    RETURN NEW;
  END IF;

  SELECT requires_lead INTO v_requires_lead
    FROM pipeline_types WHERE id = NEW.pipeline_type_id;

  IF NEW.lead_id IS NULL THEN
    IF COALESCE(v_requires_lead, FALSE) THEN
      RAISE EXCEPTION
        'この商談には元になったリードが必要です。既存のリードを選ぶか、リードを新規作成してください';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO v_lead FROM leads WHERE id = NEW.lead_id;
  IF NOT FOUND THEN
    -- 存在しない ID は外部キーが弾く
    RETURN NEW;
  END IF;

  IF v_lead.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION '削除されたリードには商談を紐づけられません';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION check_deal_lead_requirement IS
'商談に元リードが必要か（pipeline_types.requires_lead）を検査する。段階（is_deal_ready）は昇格経路を壊すのでここでは見ない。create_deal_with_lead が見る';

DROP TRIGGER IF EXISTS trg_deal_lead_requirement ON deals;
CREATE TRIGGER trg_deal_lead_requirement
  BEFORE INSERT OR UPDATE OF lead_id, pipeline_type_id ON deals
  FOR EACH ROW EXECUTE FUNCTION check_deal_lead_requirement();

-- ------------------------------------------------------------
-- 2. leads.promoted_deal_id（派生値）の維持
--
--   正本は `deals.lead_id`。この列は「最初に紐づいた商談」を指すだけの
--   派生値で、**アプリからは書かない**。
--
--   商談が消えたり紐づけが外れたら、他の生きた商談（最古）へ張り替える。
--   1 本も無ければ NULL に戻す。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_lead_promoted_deal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lead_ids UUID[];
  v_lead_id  UUID;
  v_deal_id  UUID;
BEGIN
  -- 影響を受けるリード（付け替えなら旧と新の両方）
  v_lead_ids := ARRAY(
    SELECT DISTINCT x FROM unnest(ARRAY[
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.lead_id END,
      NEW.lead_id
    ]) AS x WHERE x IS NOT NULL
  );

  FOREACH v_lead_id IN ARRAY v_lead_ids LOOP
    SELECT id INTO v_deal_id
      FROM deals
     WHERE lead_id = v_lead_id AND deleted_at IS NULL
     ORDER BY created_at
     LIMIT 1;

    UPDATE leads
       SET promoted_deal_id = v_deal_id
     WHERE id = v_lead_id
       AND promoted_deal_id IS DISTINCT FROM v_deal_id;
  END LOOP;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION sync_lead_promoted_deal IS
'leads.promoted_deal_id（派生値）を deals.lead_id から維持する。最初に紐づいた商談を指し、それが消えたら次の商談へ張り替える';

DROP TRIGGER IF EXISTS trg_deals_sync_lead_promoted ON deals;
CREATE TRIGGER trg_deals_sync_lead_promoted
  AFTER INSERT OR UPDATE OF lead_id, deleted_at ON deals
  FOR EACH ROW EXECUTE FUNCTION sync_lead_promoted_deal();

-- ------------------------------------------------------------
-- 3. ステージ要件を deals.lead_id 経由にする
--
--   これまで `NEW.promoted_deal_id` を見ていた。派生値なので、
--   正本から数え直す形に変える。**1 リード N 商談**なので
--   「1 本でも生きていればよい」。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_lead_stage_requirements()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stage lead_stages%ROWTYPE;
BEGIN
  -- ステージが動かない更新は素通し
  IF TG_OP = 'UPDATE' AND NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_stage FROM lead_stages WHERE id = NEW.stage_id;
  -- 存在しないステージは外部キーが弾く
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_stage.requires_deal THEN
    IF NOT EXISTS (
      SELECT 1 FROM deals
       WHERE lead_id = NEW.id AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION
        '「%」へ進めるには商談が必要です。このリードに紐づく商談がありません',
        v_stage.name;
    END IF;
  END IF;

  IF v_stage.requires_contract THEN
    IF NOT EXISTS (
      SELECT 1
        FROM contracts c
        JOIN deals d ON d.id = c.deal_id
       WHERE d.lead_id = NEW.id
         AND d.deleted_at IS NULL
         AND c.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION
        '「%」へ進めるには契約が必要です。商談に契約が登録されていないため、このステージには変更できません',
        v_stage.name;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION check_lead_stage_requirements IS
'リードのステージ遷移時に、そのステージが要求する実体（商談・契約）の存在を確認する。判定は deals.lead_id 経由。ステージが変わるときだけ検査する';

-- ------------------------------------------------------------
-- 4. 商談の削除ガード
--
--   1 リード N 商談になったので「参照されている商談は消せない」では厳しすぎる。
--   **消したあとに生きた商談が 0 件になる場合だけ**拒む。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_deal_deletion_against_leads()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lead_name TEXT;
BEGIN
  -- 論理削除された瞬間だけ見る
  IF NEW.deleted_at IS NULL OR OLD.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT l.lead_name INTO v_lead_name
    FROM leads l
    JOIN lead_stages s ON s.id = l.stage_id
   WHERE l.id = NEW.lead_id
     AND l.deleted_at IS NULL
     AND s.requires_deal
     AND NOT EXISTS (
       SELECT 1 FROM deals d
        WHERE d.lead_id = l.id
          AND d.deleted_at IS NULL
          AND d.id <> NEW.id
     )
   LIMIT 1;

  IF v_lead_name IS NOT NULL THEN
    RAISE EXCEPTION
      'この商談はリード「%」が参照している唯一の商談です。先にリードのステージを下げてから削除してください',
      v_lead_name;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION check_deal_deletion_against_leads IS
'商談の論理削除で「ステージは Sales 以降なのに商談が無い」状態を作らせない。1 リードに複数の商談があるときは、最後の 1 本だけ拒む';

-- ------------------------------------------------------------
-- 5. 契約の削除・紐づけ解除ガード（T-0065 の版を土台に lead_id 経由へ）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_contract_detach_against_leads()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lead_name     TEXT;
  v_soft_deleting BOOLEAN;
  v_detaching     BOOLEAN;
BEGIN
  v_soft_deleting := (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL);
  v_detaching     := (NEW.deal_id IS DISTINCT FROM OLD.deal_id);

  IF NOT v_soft_deleting AND NOT v_detaching THEN
    RETURN NEW;
  END IF;

  -- もともとどの商談にも付いていなければ、リードが参照しようがない
  IF OLD.deal_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- この契約が外れると、そのリードに紐づく生きた契約が 0 件になるか
  SELECT l.lead_name INTO v_lead_name
    FROM deals od
    JOIN leads l       ON l.id = od.lead_id
    JOIN lead_stages s ON s.id = l.stage_id
   WHERE od.id = OLD.deal_id
     AND l.deleted_at IS NULL
     AND s.requires_contract
     AND NOT EXISTS (
       SELECT 1
         FROM contracts c
         JOIN deals d ON d.id = c.deal_id
        WHERE d.lead_id = l.id
          AND d.deleted_at IS NULL
          AND c.deleted_at IS NULL
          AND c.id <> OLD.id
     )
   LIMIT 1;

  IF v_lead_name IS NOT NULL THEN
    IF v_soft_deleting THEN
      RAISE EXCEPTION
        'この契約はリード「%」が参照している唯一の契約です。先にリードのステージを下げてから削除してください',
        v_lead_name;
    ELSE
      RAISE EXCEPTION
        'この契約はリード「%」が参照している唯一の契約です。先にリードのステージを下げてから紐づけを解除してください',
        v_lead_name;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION check_contract_detach_against_leads IS
'契約の論理削除・商談からの紐づけ解除で「ステージは取引先なのに契約が無い」状態を作らせない。判定は deals.lead_id 経由';

-- ------------------------------------------------------------
-- 6. 取引先の自動作成（T-0065 の版を土台に lead_id 経由へ）
--
--   変えたのは末尾の「昇格元のリードに取引先を記録する」1 箇所だけ。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION ensure_account_on_contract()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deal       deals%ROWTYPE;
  v_company    companies%ROWTYPE;
  v_contact    contacts%ROWTYPE;
  v_account_id UUID;
  v_type_id    UUID;
  v_status_id  UUID;
  v_role_id    UUID;
  v_name       TEXT;
  v_actor      UUID := COALESCE(auth.uid(), NEW.created_by, NEW.registered_by);
BEGIN
  IF NEW.deal_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_deal FROM deals WHERE id = NEW.deal_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_account_id := v_deal.account_id;

  -- ── 取引先が未作成なら作る ────────────────────────────────────────────────
  IF v_account_id IS NULL THEN
    IF v_deal.company_id IS NOT NULL THEN
      SELECT * INTO v_company FROM companies WHERE id = v_deal.company_id;
    END IF;
    IF v_deal.contact_id IS NOT NULL THEN
      SELECT * INTO v_contact FROM contacts WHERE id = v_deal.contact_id;
    END IF;

    -- 取引先名は法人名を優先し、個人取引なら担当者名を使う
    v_name := COALESCE(
      v_company.name,
      NULLIF(btrim(COALESCE(v_contact.last_name, '') || ' ' || COALESCE(v_contact.first_name, '')), ''),
      v_deal.name
    );

    IF v_name IS NULL THEN
      -- 相手を特定できないまま取引先は作れない。契約自体は成立させる
      RETURN NEW;
    END IF;

    -- **スラッグで引かない。** どの種別を使うかはマスタの設定が持つ
    -- （20260805000020）。法人か個人事業主かで分ける
    IF v_deal.company_id IS NOT NULL THEN
      SELECT id INTO v_type_id FROM account_types
       WHERE is_company_default AND deleted_at IS NULL LIMIT 1;
    ELSE
      SELECT id INTO v_type_id FROM account_types
       WHERE is_sole_proprietor_default AND deleted_at IS NULL LIMIT 1;
    END IF;

    SELECT id INTO v_status_id FROM account_statuses
     WHERE is_active_default AND deleted_at IS NULL LIMIT 1;
    IF v_status_id IS NULL THEN
      SELECT id INTO v_status_id FROM account_statuses
       WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;
    END IF;
    IF v_status_id IS NULL THEN
      RAISE EXCEPTION 'account_statuses が未投入です';
    END IF;

    INSERT INTO accounts (
      name, company_id, account_type_id, account_status_id,
      lead_source_id, owner_user_id, created_by
    ) VALUES (
      v_name, v_deal.company_id, v_type_id, v_status_id,
      v_company.lead_source_id, COALESCE(v_deal.owner_user_id, v_actor), v_actor
    ) RETURNING id INTO v_account_id;

    -- 商談の相手担当者をそのまま取引先の主担当にする
    IF v_deal.contact_id IS NOT NULL THEN
      INSERT INTO account_contacts (account_id, contact_id, role)
      VALUES (v_account_id, v_deal.contact_id, 'primary')
      ON CONFLICT (account_id, contact_id) DO NOTHING;
    END IF;

    UPDATE deals SET account_id = v_account_id WHERE id = v_deal.id;

    -- 元になったリードにも取引先を記録する（リードから辿れるようにする）。
    -- **deals.lead_id 経由**。promoted_deal_id は派生値なので使わない
    IF v_deal.lead_id IS NOT NULL THEN
      UPDATE leads
         SET promoted_account_id = v_account_id
       WHERE id = v_deal.lead_id
         AND promoted_account_id IS NULL;
    END IF;
  END IF;

  -- ── 区分の付与 ────────────────────────────────────────────────────────────
  -- 取引先が既にあった場合もここは通す。
  -- 顧客として登録済みの相手と仕入れ契約を結べば「顧客 + 仕入れ先」になる
  SELECT id INTO v_role_id FROM account_role_types
   WHERE pipeline_type_id = v_deal.pipeline_type_id
     AND deleted_at IS NULL
   LIMIT 1;

  IF v_role_id IS NOT NULL AND v_account_id IS NOT NULL THEN
    INSERT INTO account_roles (account_id, role_type_id, assigned_by_contract, created_by)
    VALUES (v_account_id, v_role_id, TRUE, v_actor)
    ON CONFLICT (account_id, role_type_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION ensure_account_on_contract IS
'契約の登録・商談への紐づけ時に、取引先が未作成の商談へ取引先を作って紐付ける。契約と同一トランザクションで実行される';

-- ------------------------------------------------------------
-- 7. 不整合の検出ビューも lead_id 経由へ
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_lead_stage_violations
WITH (security_invoker = true) AS
SELECT
  l.id            AS lead_id,
  l.lead_name,
  s.name          AS stage_name,
  s.slug          AS stage_slug,
  l.promoted_deal_id,
  l.owner_user_id,
  l.updated_at,
  CASE
    WHEN s.requires_deal AND NOT EXISTS (
      SELECT 1 FROM deals d WHERE d.lead_id = l.id AND d.deleted_at IS NULL
    ) THEN 'no_deal'
    WHEN s.requires_contract AND NOT EXISTS (
      SELECT 1 FROM contracts c JOIN deals d ON d.id = c.deal_id
       WHERE d.lead_id = l.id AND d.deleted_at IS NULL AND c.deleted_at IS NULL
    ) THEN 'no_contract'
  END AS violation
  FROM leads l
  JOIN lead_stages s ON s.id = l.stage_id
 WHERE l.deleted_at IS NULL
   AND (
     (s.requires_deal AND NOT EXISTS (
        SELECT 1 FROM deals d WHERE d.lead_id = l.id AND d.deleted_at IS NULL
      ))
     OR (s.requires_contract AND NOT EXISTS (
        SELECT 1 FROM contracts c JOIN deals d ON d.id = c.deal_id
         WHERE d.lead_id = l.id AND d.deleted_at IS NULL AND c.deleted_at IS NULL
      ))
   );

COMMENT ON VIEW v_lead_stage_violations IS
'ステージが要求する実体を欠くリード。判定は deals.lead_id 経由。security_invoker なので RLS はそのまま効く';
