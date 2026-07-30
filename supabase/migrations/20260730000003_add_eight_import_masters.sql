-- ============================================================
-- Eight 名刺取込に必要なマスタを追加
--
-- 本番は稼働中で seed を再実行しないため、マスタ追加はマイグレーションで行う。
-- 新規環境向けに supabase/seeds/01-masters.sql にも同じ内容を入れてあるので、
-- 二重投入にならないよう冪等に書く。
-- ============================================================

-- ------------------------------------------------------------
-- M05: リードソース「Eight」
-- ------------------------------------------------------------
INSERT INTO lead_sources (name, definition, slug)
VALUES ('Eight', '名刺アプリ Eight からの取込', 'eight')
ON CONFLICT (slug) DO NOTHING;

-- ------------------------------------------------------------
-- M23: 対応種別「名刺交換」
--
-- 名刺交換日（Eight CSV で 100% 充填）を接点の履歴として残すために使う。
-- 同一人物と複数回交換した場合は交換ごとに 1 件記録する。
-- ------------------------------------------------------------
INSERT INTO lead_activity_types (code, name, definition, color, sort_order)
VALUES ('card_exchange', '名刺交換', '名刺を交換した接点', '#8FA9C4', 6)
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------------------
-- M19: 獲得ステージのステータス「名刺交換済」
--
-- 既存の list_ready「リスト化済」は架電リスト向けのため分ける。
-- 名刺交換済みは既に接点があり、架電前のリストとは温度が違う。
-- ------------------------------------------------------------
INSERT INTO lead_statuses (stage_id, code, name, definition, sort_order)
SELECT s.id, 'card_exchanged', '名刺交換済', '名刺交換により獲得したリード', 5
  FROM lead_stages s
 WHERE s.slug = 'generation'
ON CONFLICT (stage_id, code) DO NOTHING;

-- ------------------------------------------------------------
-- スコアリング: lead_source = Eight
--
-- 名刺交換は既に対面の接点があるため、フォーム流入と同等以上に評価する。
-- lead_score_rules に UNIQUE 制約が無いので、存在チェックで冪等にする。
-- ------------------------------------------------------------
INSERT INTO lead_score_rules (category, condition_type, condition_value_id, score_delta, description, sort_order)
SELECT 'attribute', 'lead_source', src.id, 10, 'Eight 名刺交換', 99
  FROM lead_sources src
 WHERE src.slug = 'eight'
   AND NOT EXISTS (
     SELECT 1 FROM lead_score_rules r
      WHERE r.condition_type = 'lead_source'
        AND r.condition_value_id = src.id
        AND r.deleted_at IS NULL
   );

-- ------------------------------------------------------------
-- M20: 通電状況「名刺交換」
--
-- lead_activities.call_status_id は NOT NULL だが、既存の値は架電結果
-- （NT / 不出 / 担当不在 …）ばかりで名刺交換に該当するものがない。
-- 対面で接触済みなので hot 相当の色を割り当てる。
-- ------------------------------------------------------------
INSERT INTO lead_call_statuses (code, name, color, sort_order)
VALUES ('card_exchange', '名刺交換', '#F97316', 11)
ON CONFLICT (code) DO NOTHING;

-- スコアリング: 名刺交換は対面接触なので活動として加点する
INSERT INTO lead_score_rules (category, condition_type, condition_value_id, score_delta, description, sort_order)
SELECT 'activity', 'call_status', cs.id, 10, '名刺交換（対面接触）', 100
  FROM lead_call_statuses cs
 WHERE cs.code = 'card_exchange'
   AND NOT EXISTS (
     SELECT 1 FROM lead_score_rules r
      WHERE r.condition_type = 'call_status'
        AND r.condition_value_id = cs.id
        AND r.deleted_at IS NULL
   );
