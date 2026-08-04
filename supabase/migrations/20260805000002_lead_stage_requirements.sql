-- ============================================================
-- リードステージと実体（商談・契約）の整合を規則として強制する
--
-- 背景（2026-08-04 の指摘）:
--   ステージが Sales / Opportunity / Customer なのに商談も契約も無いリードを
--   作れてしまう状態だった。穴は 3 つ:
--     1. Customer へ直行できる。獲得 → Customer とステージだけ変えれば
--        商談も契約も無いまま「成約済み」になる
--     2. Sales は「商談化」という名前なのに商談を要求していない
--     3. Opportunity の不変条件（promoted_deal_id を持つ）は
--        src/actions/leads.ts の中でしか守られておらず、SQL 直接・
--        service_role 経由・将来の別経路ですり抜ける
--
-- 決定（2026-08-04）:
--   - **Sales 以降（Sales / Opportunity / 取引先）は商談を必須**にする
--   - **取引先はさらに契約を必須**にする
--   - **違反は DB トリガーで拒否**する。画面側にも先回りのチェックを置き、
--     どの経路からも不整合を作れないようにする（多層防御）
--   - Customer の表示名を「取引先」に変える。顧客・仕入れ先・協業パートナーの
--     いずれもありうるため、関係の方向を名前で決め打たない。
--     方向は account_roles の区分（顧客 / 仕入れ先 / 外注先）が表す
--
-- 規則はハードコードせず lead_stages のフラグで持つ。
-- auto_promote_to_deal / is_terminal と同じ流儀で、マスタ管理から変えられる。
-- ============================================================

-- ------------------------------------------------------------
-- 1. ステージに要件フラグを持たせる
-- ------------------------------------------------------------
ALTER TABLE lead_stages
  ADD COLUMN IF NOT EXISTS requires_deal     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS requires_contract BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN lead_stages.requires_deal IS
'このステージへ進めるには商談（leads.promoted_deal_id）が要る。トリガー check_lead_stage_requirements が強制する';
COMMENT ON COLUMN lead_stages.requires_contract IS
'このステージへ進めるには商談に紐づく契約が 1 件以上要る。requires_deal と併用する前提';

-- 契約を求めるなら商談も要る（契約は商談にぶら下がるため）。
-- マスタ管理から片方だけ立てられないようにする
ALTER TABLE lead_stages DROP CONSTRAINT IF EXISTS lead_stages_requirement_check;
ALTER TABLE lead_stages ADD CONSTRAINT lead_stages_requirement_check
  CHECK (NOT requires_contract OR requires_deal);

-- ------------------------------------------------------------
-- 2. 既定の規則を入れる
-- ------------------------------------------------------------
UPDATE lead_stages SET requires_deal = TRUE
 WHERE slug IN ('sales', 'opportunity', 'customer');

UPDATE lead_stages SET requires_contract = TRUE
 WHERE slug = 'customer';

-- Sales でも商談を自動生成する。
-- 商談を必須にした以上、自動で作らないと「先に商談を作る」手間が挟まって
-- ステージを進められなくなる（詰み）ため
UPDATE lead_stages SET auto_promote_to_deal = TRUE WHERE slug = 'sales';

-- Customer → 取引先。**slug は customer のまま**変えない。
-- slug は DB 関数（resolve_lead_category / lead_source_category）の分岐に
-- 使われており、変えると波及する（CLAUDE.md「コードは変更しない、名前変更は可」）
UPDATE lead_stages
   SET name       = '取引先',
       definition = '契約が成立し、取引が始まった相手。顧客・仕入れ先・協業パートナーのいずれもありうるため、関係の方向は取引先区分（account_roles）が表す'
 WHERE slug = 'customer';

UPDATE lead_stages
   SET definition = '商談が動いている段階。このステージへ進めると商談が自動で作られる'
 WHERE slug = 'sales' AND (definition IS NULL OR definition = '');

-- ------------------------------------------------------------
-- 3. 規則を強制するトリガー
--
-- **ステージが変わるときだけ検査する。** 常時検査にすると、既に不整合な行が
-- あった場合に「ステージと無関係な項目の修正」まで一切できなくなり、
-- 是正の手段そのものを塞いでしまう。ステージを下げる操作も塞がる。
-- 既存の不整合は §6 の検出クエリで洗い出して個別に直す。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_lead_stage_requirements()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stage lead_stages%ROWTYPE;
BEGIN
  -- ステージが動かない更新は素通し（上記の理由）
  IF TG_OP = 'UPDATE' AND NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_stage FROM lead_stages WHERE id = NEW.stage_id;
  -- 存在しないステージは外部キーが弾く。ここでは何も言わない
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_stage.requires_deal THEN
    IF NEW.promoted_deal_id IS NULL THEN
      RAISE EXCEPTION
        '「%」へ進めるには商談が必要です。商談が作られていないため、このステージには変更できません',
        v_stage.name;
    END IF;

    -- 商談が論理削除されていたら「ある」とは言えない
    IF NOT EXISTS (
      SELECT 1 FROM deals
       WHERE id = NEW.promoted_deal_id AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION
        '「%」へ進めるには商談が必要です。紐づいていた商談が削除されています',
        v_stage.name;
    END IF;
  END IF;

  IF v_stage.requires_contract THEN
    IF NOT EXISTS (
      SELECT 1 FROM contracts
       WHERE deal_id = NEW.promoted_deal_id AND deleted_at IS NULL
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
'リードのステージ遷移時に、そのステージが要求する実体（商談・契約）の存在を確認する。ステージが変わるときだけ検査する';

DROP TRIGGER IF EXISTS trg_lead_stage_requirements ON leads;
CREATE TRIGGER trg_lead_stage_requirements
  BEFORE INSERT OR UPDATE OF stage_id ON leads
  FOR EACH ROW EXECUTE FUNCTION check_lead_stage_requirements();

-- ------------------------------------------------------------
-- 4. 逆向きの穴を塞ぐ: 商談・契約を消してもステージは残る
--
-- 商談を論理削除すると「Sales なのに商談が無い」状態が生まれる。
-- ステージを自動で戻すと業務判断を勝手に覆すことになるため、
-- **消す側を止める**。要件を満たさなくなる削除は拒否し、
-- 先にリードのステージを下げてもらう
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

  SELECT l.lead_name INTO v_lead_name
    FROM leads l
    JOIN lead_stages s ON s.id = l.stage_id
   WHERE l.promoted_deal_id = NEW.id
     AND l.deleted_at IS NULL
     AND s.requires_deal
   LIMIT 1;

  IF v_lead_name IS NOT NULL THEN
    RAISE EXCEPTION
      'この商談はリード「%」が参照しています。先にリードのステージを下げてから削除してください',
      v_lead_name;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION check_deal_deletion_against_leads IS
'商談の論理削除で「ステージは Sales 以降なのに商談が無い」状態を作らせない';

DROP TRIGGER IF EXISTS trg_deal_deletion_against_leads ON deals;
CREATE TRIGGER trg_deal_deletion_against_leads
  BEFORE UPDATE OF deleted_at ON deals
  FOR EACH ROW EXECUTE FUNCTION check_deal_deletion_against_leads();

CREATE OR REPLACE FUNCTION check_contract_deletion_against_leads()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lead_name TEXT;
BEGIN
  IF NEW.deleted_at IS NULL OR OLD.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- この契約が消えると契約 0 件になるリードだけが対象
  SELECT l.lead_name INTO v_lead_name
    FROM leads l
    JOIN lead_stages s ON s.id = l.stage_id
   WHERE l.promoted_deal_id = NEW.deal_id
     AND l.deleted_at IS NULL
     AND s.requires_contract
     AND NOT EXISTS (
       SELECT 1 FROM contracts c
        WHERE c.deal_id = NEW.deal_id
          AND c.deleted_at IS NULL
          AND c.id <> NEW.id
     )
   LIMIT 1;

  IF v_lead_name IS NOT NULL THEN
    RAISE EXCEPTION
      'この契約はリード「%」が参照している唯一の契約です。先にリードのステージを下げてから削除してください',
      v_lead_name;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION check_contract_deletion_against_leads IS
'契約の論理削除で「ステージは取引先なのに契約が無い」状態を作らせない';

DROP TRIGGER IF EXISTS trg_contract_deletion_against_leads ON contracts;
CREATE TRIGGER trg_contract_deletion_against_leads
  BEFORE UPDATE OF deleted_at ON contracts
  FOR EACH ROW EXECUTE FUNCTION check_contract_deletion_against_leads();

-- ------------------------------------------------------------
-- 5. 既存の不整合を洗い出すビュー
--
-- トリガーはステージが動くときにしか働かないため、規則の導入前から
-- 不整合だった行はそのまま残る。放置せず一覧で見えるようにする。
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
    WHEN s.requires_deal AND l.promoted_deal_id IS NULL           THEN 'no_deal'
    WHEN s.requires_deal AND d.id IS NULL                          THEN 'deal_deleted'
    WHEN s.requires_contract AND NOT EXISTS (
      SELECT 1 FROM contracts c WHERE c.deal_id = l.promoted_deal_id AND c.deleted_at IS NULL
    ) THEN 'no_contract'
  END AS violation
  FROM leads l
  JOIN lead_stages s ON s.id = l.stage_id
  LEFT JOIN deals d  ON d.id = l.promoted_deal_id AND d.deleted_at IS NULL
 WHERE l.deleted_at IS NULL
   AND (
     (s.requires_deal AND (l.promoted_deal_id IS NULL OR d.id IS NULL))
     OR (s.requires_contract AND NOT EXISTS (
           SELECT 1 FROM contracts c WHERE c.deal_id = l.promoted_deal_id AND c.deleted_at IS NULL
        ))
   );

COMMENT ON VIEW v_lead_stage_violations IS
'ステージが要求する実体を欠くリード。規則の導入前から不整合だった行を拾う。security_invoker なので RLS はそのまま効く';
