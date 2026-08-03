-- ============================================================
-- lead_score_rules の condition_value_id が NULL のまま入っている行を埋め直す
--
-- 背景:
--   seed `01-masters.sql` の M26（lead_score_rules）が、参照先である
--   M14（lead_large_segments）と M16（lead_call_statuses）より前に置かれていた。
--   seed は上から順に流れる 1 本の SQL なので、INSERT 時点でこれらのテーブルは
--   まだ空で、condition_value_id を決めるサブクエリが NULL を返していた。
--
--   recalculate_lead_score() は condition_value_id IS NULL の行を評価しないため、
--   エラーも警告も出ないまま以下の 5 ルールが「一生加点されない」状態だった:
--     call_status:   資料送付済み(+10) / 見込み判定(+25) / アポ獲得(+40)
--     large_segment: 製造業(+10) / IT・SaaS(+10)
--   架電結果を記録してもスコアが動かない、という形で表面化する。
--
--   seed 側の順序は同日に修正済みだが、それは次回 db reset 以降にしか効かない。
--   既に投入済みの環境（本番を含む）はこのマイグレーションで補正する。
--
-- 方針:
--   description（seed が付けた説明文）から対象マスタの code を引き当てる。
--   NULL の行だけを対象にするので、正しく入っている環境では 0 行更新で終わる。
-- ============================================================

DO $$
DECLARE
  v_fixed INTEGER := 0;
  v_total INTEGER;
BEGIN
  -- call_status 系
  UPDATE lead_score_rules r
     SET condition_value_id = cs.id
    FROM lead_call_statuses cs
   WHERE r.condition_value_id IS NULL
     AND r.condition_type = 'call_status'
     AND cs.deleted_at IS NULL
     AND cs.code = CASE r.description
                     WHEN '資料送付済み' THEN 'material_sent'
                     WHEN '見込み判定'   THEN 'promising'
                     WHEN 'アポ獲得'     THEN 'appointment'
                   END;
  GET DIAGNOSTICS v_fixed = ROW_COUNT;
  RAISE NOTICE 'call_status ルールを % 件補正しました', v_fixed;

  -- large_segment 系
  UPDATE lead_score_rules r
     SET condition_value_id = ls.id
    FROM lead_large_segments ls
   WHERE r.condition_value_id IS NULL
     AND r.condition_type = 'large_segment'
     AND ls.deleted_at IS NULL
     AND ls.code = CASE r.description
                     WHEN '製造業セグメント'    THEN 'manufacturing'
                     WHEN 'IT・SaaSセグメント'  THEN 'it_saas'
                   END;
  GET DIAGNOSTICS v_fixed = ROW_COUNT;
  RAISE NOTICE 'large_segment ルールを % 件補正しました', v_fixed;

  -- 補正しきれずに残った NULL があれば知らせる（説明文が変わっている等）
  SELECT count(*) INTO v_total FROM lead_score_rules
   WHERE condition_value_id IS NULL AND deleted_at IS NULL;
  IF v_total > 0 THEN
    RAISE WARNING 'condition_value_id が NULL のルールが % 件残っています。'
                  'このルールは評価対象外のままです', v_total;
  END IF;
END $$;

-- 補正でルールが増えた分を既存リードのスコアへ反映する。
-- 週次 pg_cron を待たずにここで揃えておく（関数は 20260422000007 で定義）
SELECT recalculate_all_lead_scores();
