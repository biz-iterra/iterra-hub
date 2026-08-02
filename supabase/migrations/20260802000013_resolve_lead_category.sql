-- ============================================================
-- リードのカテゴリを流入経路とステージから決める
--
-- カテゴリ（Inquiry / MQL / TQL / SQL）は手で付けるものになっており、
-- 実データでは架電リスト 2,971 件が Inquiry（問い合わせ）に入っていた。
-- 架電で当たったリストは問い合わせではない。
--
-- カテゴリはファネルのどこに居るかを表すので、**流入経路とステージから導く**。
--
--   選定以降   … 架電して見込みありと判断した   → TQL
--   Sales 以降 … 営業が案件として扱う           → SQL
--   それ以前   … 流入経路で決まる
--                  Web問い合わせ → Inquiry（相手から来た）
--                  それ以外       → MQL（こちらから接点を作った）
--
-- Dead（終了）はそこへ至るまでの経路で決める。終わり方でカテゴリを
-- 変えると、どの層が落ちたのかが分からなくなる。
--
-- 実データの架電リスト 3,008 件は流入経路が未設定だったので
-- 「テレアポ」を入れる（ITERRA Academy 架電リスト由来。seed のコメント）。
-- ============================================================

CREATE OR REPLACE FUNCTION resolve_lead_category(
  p_lead_source_id UUID,
  p_stage_id       UUID
) RETURNS UUID
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stage_slug  TEXT;
  v_source_slug TEXT;
  v_code        TEXT;
BEGIN
  SELECT slug INTO v_stage_slug FROM lead_stages WHERE id = p_stage_id;
  SELECT slug INTO v_source_slug FROM lead_sources WHERE id = p_lead_source_id;

  v_code := CASE
    WHEN v_stage_slug IN ('sales', 'opportunity', 'customer') THEN 'sql'
    WHEN v_stage_slug = 'qualification'                       THEN 'tql'
    -- 相手から来たものだけが問い合わせ。こちらから作った接点は MQL
    WHEN v_source_slug = 'web_form'                           THEN 'inquiry'
    ELSE 'mql'
  END;

  RETURN (SELECT id FROM lead_categories WHERE code = v_code AND deleted_at IS NULL);
END;
$$;

COMMENT ON FUNCTION resolve_lead_category(UUID, UUID) IS
  'リードのカテゴリを流入経路とステージから決める。ステージが優先';

-- ------------------------------------------------------------
-- 保存のたびに合わせる
--
-- カテゴリは導出値にする。手で付けられるままだと、ステージが進んでも
-- 古いカテゴリが残り、集計が実態とずれる。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_lead_category()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.category_id := resolve_lead_category(NEW.lead_source_id, NEW.stage_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_leads_set_category
  BEFORE INSERT OR UPDATE OF lead_source_id, stage_id ON leads
  FOR EACH ROW EXECUTE FUNCTION set_lead_category();

-- ============================================================
-- 既存データ
-- ============================================================

-- 架電リスト由来のリードに流入経路を入れる。
-- 経路が無いとカテゴリが「こちらから作った接点」に倒れるだけで、
-- どう獲得したのかが記録に残らない
UPDATE leads
   SET lead_source_id = (SELECT id FROM lead_sources WHERE slug = 'tele_appo' AND deleted_at IS NULL)
 WHERE lead_source_id IS NULL;

-- 全件を導出し直す。トリガーは lead_source_id / stage_id の更新でしか
-- 動かないので、ここは直接入れる
UPDATE leads
   SET category_id = resolve_lead_category(lead_source_id, stage_id)
 WHERE category_id IS DISTINCT FROM resolve_lead_category(lead_source_id, stage_id);
