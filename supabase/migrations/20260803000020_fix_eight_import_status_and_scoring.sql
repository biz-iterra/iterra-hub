-- ============================================================
-- 名刺取込が完了しない問題を塞ぐ（DB 側）
--
-- 1. ステータス「名刺交換済」が作られない環境がある
--    20260730000003 は lead_stages を SELECT して lead_statuses を作るが、
--    lead_stages は seeds/01-masters.sql でしか入らない。マイグレーションは
--    seed より先に走るため、db reset した環境では対象 0 行で何も作られない。
--    その結果 resolveDefaults が「ステータス「名刺交換済」が登録されていません」で
--    止まり、取込が一度も成立しない。
--    seed 済みの今なら当たるので、同じ INSERT を冪等に打ち直す。
--    （20260731000008 の pipeline_types と同じ種類の退行。マイグレーションから
--      seed のデータを参照しないという原則の徹底が本来の対策）
--
-- 2. 取込のたびに全リードのスコアを再計算していた
--    recalculate_all_lead_scores() はリード総数に比例するため、
--    10 件の取込でも 3,000 件を計算していた（実測 3,008 件で約 3.9 秒）。
--    リードが増えるほど取込が遅くなり、Cloudflare Tunnel の 100 秒に
--    近づいていく。取り込んだバッチの分だけ再計算する関数を足す。
-- ============================================================

-- ------------------------------------------------------------
-- 1. ステータス「名刺交換済」
-- ------------------------------------------------------------
INSERT INTO lead_statuses (stage_id, code, name, definition, sort_order, color)
SELECT s.id, 'card_exchanged', '名刺交換済', '名刺交換により獲得したリード', 5, '#0E7490'
  FROM lead_stages s
 WHERE s.slug = 'generation'
ON CONFLICT (stage_id, code) DO NOTHING;

-- 色は 20260731000001 で一括付与しているが、上の INSERT で今回初めて
-- 行ができた環境では当時の UPDATE が当たっていない。空なら埋める
UPDATE lead_statuses
   SET color = '#0E7490'
 WHERE code = 'card_exchanged'
   AND color IS NULL;

-- ------------------------------------------------------------
-- 2. バッチ単位のスコア再計算
--
-- lead_import_records は取込 1 行につき 1 レコードなので、同じ Lead が
-- 複数行に現れる（名刺が複数枚ある人）。DISTINCT で 1 回に畳む。
-- 論理削除済みの Lead は recalculate_lead_score が例外を投げるため除く。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_lead_scores_for_batch(p_batch_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lead_id UUID;
  v_count   INTEGER := 0;
BEGIN
  FOR v_lead_id IN
    SELECT DISTINCT r.lead_id
      FROM lead_import_records r
      JOIN leads l ON l.id = r.lead_id
     WHERE r.batch_id = p_batch_id
       AND r.lead_id IS NOT NULL
       AND l.deleted_at IS NULL
  LOOP
    PERFORM recalculate_lead_score(v_lead_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.recalculate_lead_scores_for_batch(UUID) IS
  '取込バッチに含まれるリードだけスコアを再計算する。全件再計算は週次 pg_cron が担う';

GRANT EXECUTE ON FUNCTION public.recalculate_lead_scores_for_batch(UUID) TO service_role;
