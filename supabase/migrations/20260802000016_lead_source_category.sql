-- ============================================================
-- カテゴリは流入の性質を表す。経路ごとにマスタで決める
--
-- 20260802000013 では「Web問い合わせ以外はすべて MQL」「選定に進んだら TQL」
-- としていたが、これだと架電リスト（アウトバウンド）が MQL に入る。
--
-- 運用上の意味はこう:
--
--   Inquiry … 相手から問い合わせが来た
--   MQL     … インバウンド。相手が接点を持つ意思を示した（紹介・セミナー・名刺交換）
--   TQL     … アウトバウンド。こちらから当たった（架電・DM）
--   SQL     … 商談化した。リードを離れて商談（deals）で追う
--
-- **どの経路がどれになるかはマスタで決める。** 運用しながら見直せるように
-- 関数に埋め込まない。経路が増えたときも画面から設定できる。
-- ============================================================

ALTER TABLE lead_sources
  ADD COLUMN default_category_id UUID REFERENCES lead_categories(id);

COMMENT ON COLUMN lead_sources.default_category_id IS
  'この経路で入ったリードのカテゴリ。未設定なら MQL として扱う';

-- 初期の割り当て
UPDATE lead_sources SET default_category_id = (SELECT id FROM lead_categories WHERE code = 'inquiry')
 WHERE slug = 'web_form';

-- こちらから当たったもの
UPDATE lead_sources SET default_category_id = (SELECT id FROM lead_categories WHERE code = 'tql')
 WHERE slug IN ('tele_appo', 'dm');

-- 相手が接点を持つ意思を示したもの。名刺交換もここに入れる
-- （架電先で交換した名刺はアウトバウンド寄りだが、経路だけでは分けられない）
UPDATE lead_sources SET default_category_id = (SELECT id FROM lead_categories WHERE code = 'mql')
 WHERE slug IN ('eight', 'event', 'referral', 'sns', 'line', 'other')
    OR default_category_id IS NULL;

-- ------------------------------------------------------------
-- カテゴリの導出
--
-- 20260802000013 からの変更点:
--   - 経路の割り当て（マスタ）を見る
--   - 選定ステージで TQL に倒すのをやめた。TQL は「アウトバウンド」を
--     表すので、ステージが進んだことで変わる筋合いではない
--   - Sales 以降だけは SQL。商談として追う段階に入ったという意味
-- ------------------------------------------------------------
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
  v_category_id UUID;
BEGIN
  SELECT slug INTO v_stage_slug FROM lead_stages WHERE id = p_stage_id;

  -- 商談として追う段階。リード側に残っていてもカテゴリは SQL
  IF v_stage_slug IN ('sales', 'opportunity', 'customer') THEN
    RETURN (SELECT id FROM lead_categories WHERE code = 'sql' AND deleted_at IS NULL);
  END IF;

  SELECT default_category_id INTO v_category_id
    FROM lead_sources WHERE id = p_lead_source_id;

  -- 経路が無い / 割り当てが無いものはインバウンド扱いにしておく
  RETURN COALESCE(
    v_category_id,
    (SELECT id FROM lead_categories WHERE code = 'mql' AND deleted_at IS NULL)
  );
END;
$$;

COMMENT ON FUNCTION resolve_lead_category(UUID, UUID) IS
  'リードのカテゴリ。Sales 以降は SQL、それ以外は流入経路の割り当て（lead_sources.default_category_id）';

-- 経路の割り当てが変わったら、そのリードのカテゴリも揃える
UPDATE leads
   SET category_id = resolve_lead_category(lead_source_id, stage_id)
 WHERE category_id IS DISTINCT FROM resolve_lead_category(lead_source_id, stage_id);
