-- ============================================================
-- Lead スコアリング刷新 Phase 5: recalculate_lead_score 関数 + 既存 score 初期化
-- ============================================================

-- ============================================================
-- DB 関数: recalculate_lead_score(p_lead_id UUID) RETURNS INT
-- ============================================================

CREATE OR REPLACE FUNCTION recalculate_lead_score(p_lead_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead              RECORD;
  r                   RECORD;
  v_total_score       INT  := 0;
  v_temperature_id    UUID := NULL;
  v_score             INT  := 0;
  matched             BOOLEAN;
  v_ref_exists        BOOLEAN;
BEGIN
  -- --------------------------------------------------------
  -- 1. 対象 Lead の取得
  -- --------------------------------------------------------
  SELECT *
    INTO v_lead
    FROM leads
   WHERE id = p_lead_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'recalculate_lead_score: lead_id=% が見つかりません（deleted_at IS NOT NULL or 存在しない）', p_lead_id;
  END IF;

  -- --------------------------------------------------------
  -- 2. 加点ルール全件を順に評価
  -- --------------------------------------------------------
  FOR r IN
    SELECT *
      FROM lead_score_rules
     WHERE deleted_at IS NULL
     ORDER BY sort_order ASC, created_at ASC
  LOOP
    matched := FALSE;

    -- ----------------------------------------------------------
    -- 2-1. 参照切れチェック（condition_value_id が NULL は対象外）
    -- ----------------------------------------------------------
    IF r.condition_value_id IS NOT NULL THEN
      v_ref_exists := FALSE;

      CASE r.condition_type
        WHEN 'company_size' THEN
          SELECT EXISTS(
            SELECT 1 FROM lead_company_sizes
             WHERE id = r.condition_value_id AND deleted_at IS NULL
          ) INTO v_ref_exists;

        WHEN 'large_segment' THEN
          SELECT EXISTS(
            SELECT 1 FROM lead_large_segments
             WHERE id = r.condition_value_id AND deleted_at IS NULL
          ) INTO v_ref_exists;

        WHEN 'small_segment' THEN
          SELECT EXISTS(
            SELECT 1 FROM lead_small_segments
             WHERE id = r.condition_value_id AND deleted_at IS NULL
          ) INTO v_ref_exists;

        WHEN 'lead_source' THEN
          SELECT EXISTS(
            SELECT 1 FROM lead_sources
             WHERE id = r.condition_value_id AND deleted_at IS NULL
          ) INTO v_ref_exists;

        WHEN 'stage' THEN
          SELECT EXISTS(
            SELECT 1 FROM lead_stages
             WHERE id = r.condition_value_id AND deleted_at IS NULL
          ) INTO v_ref_exists;

        WHEN 'status' THEN
          SELECT EXISTS(
            SELECT 1 FROM lead_statuses
             WHERE id = r.condition_value_id AND deleted_at IS NULL
          ) INTO v_ref_exists;

        WHEN 'call_status' THEN
          SELECT EXISTS(
            SELECT 1 FROM lead_call_statuses
             WHERE id = r.condition_value_id AND deleted_at IS NULL
          ) INTO v_ref_exists;

        WHEN 'activity_type' THEN
          SELECT EXISTS(
            SELECT 1 FROM lead_activity_types
             WHERE id = r.condition_value_id AND deleted_at IS NULL
          ) INTO v_ref_exists;

        WHEN 'customer_activity_type' THEN
          SELECT EXISTS(
            SELECT 1 FROM lead_customer_activity_types
             WHERE id = r.condition_value_id AND deleted_at IS NULL
          ) INTO v_ref_exists;

        ELSE
          v_ref_exists := TRUE; -- 未知の condition_type は警告なしでスキップ対象外
      END CASE;

      IF NOT v_ref_exists THEN
        RAISE WARNING '[recalculate_lead_score] rule_id=% condition_type=% condition_value_id=% が参照するマスタが見つかりません。このルールをスキップします',
          r.id, r.condition_type, r.condition_value_id;
        CONTINUE;
      END IF;
    END IF;

    -- ----------------------------------------------------------
    -- 2-2. ルール評価（category × condition_type）
    -- ----------------------------------------------------------
    CASE r.condition_type
      WHEN 'company_size' THEN
        matched := (v_lead.company_size_id IS NOT NULL AND v_lead.company_size_id = r.condition_value_id);

      WHEN 'large_segment' THEN
        matched := (v_lead.large_segment_id IS NOT NULL AND v_lead.large_segment_id = r.condition_value_id);

      WHEN 'small_segment' THEN
        matched := (v_lead.small_segment_id IS NOT NULL AND v_lead.small_segment_id = r.condition_value_id);

      WHEN 'lead_source' THEN
        matched := (v_lead.lead_source_id IS NOT NULL AND v_lead.lead_source_id = r.condition_value_id);

      WHEN 'stage' THEN
        matched := (v_lead.stage_id IS NOT NULL AND v_lead.stage_id = r.condition_value_id);

      WHEN 'status' THEN
        matched := (v_lead.status_id IS NOT NULL AND v_lead.status_id = r.condition_value_id);

      WHEN 'call_status' THEN
        -- 最新の lead_activities.call_status_id のみ判定
        SELECT (la.call_status_id = r.condition_value_id)
          INTO matched
          FROM lead_activities la
         WHERE la.lead_id = p_lead_id
         ORDER BY la.called_on DESC NULLS LAST, la.created_at DESC
         LIMIT 1;
        IF matched IS NULL THEN matched := FALSE; END IF;

      WHEN 'activity_type' THEN
        -- activity_type_id が 1 件以上存在するか
        SELECT EXISTS(
          SELECT 1
            FROM lead_activities la
           WHERE la.lead_id = p_lead_id
             AND la.activity_type_id = r.condition_value_id
        ) INTO matched;

      WHEN 'customer_activity_type' THEN
        -- lead_customer_activities に 1 件以上存在するか
        SELECT EXISTS(
          SELECT 1
            FROM lead_customer_activities lca
           WHERE lca.lead_id = p_lead_id
             AND lca.activity_type_id = r.condition_value_id
        ) INTO matched;

      ELSE
        matched := FALSE;
    END CASE;

    -- ----------------------------------------------------------
    -- 2-3. 一致した場合に加点 + breakdown 記録用に後で INSERT
    -- ----------------------------------------------------------
    IF matched THEN
      v_total_score := v_total_score + r.score_delta;
    END IF;

  END LOOP;

  -- --------------------------------------------------------
  -- 3. スコアを 0-100 にクリップ
  -- --------------------------------------------------------
  v_score := LEAST(v_total_score, 100);
  v_score := GREATEST(v_score, 0);

  -- --------------------------------------------------------
  -- 4. temperature_id を解決
  -- --------------------------------------------------------
  SELECT temperature_id
    INTO v_temperature_id
    FROM lead_score_thresholds
   WHERE deleted_at IS NULL
     AND min_score <= v_score
     AND (max_score IS NULL OR v_score <= max_score)
   ORDER BY min_score DESC
   LIMIT 1;

  -- --------------------------------------------------------
  -- 5. leads テーブル更新（score / temperature_id）
  -- --------------------------------------------------------
  UPDATE leads
     SET score          = v_score,
         temperature_id = v_temperature_id
   WHERE id = p_lead_id;

  -- --------------------------------------------------------
  -- 6. lead_score_breakdowns を全置換
  -- --------------------------------------------------------
  DELETE FROM lead_score_breakdowns WHERE lead_id = p_lead_id;

  -- マッチしたルールを再評価して INSERT
  FOR r IN
    SELECT *
      FROM lead_score_rules
     WHERE deleted_at IS NULL
     ORDER BY sort_order ASC, created_at ASC
  LOOP
    matched := FALSE;

    -- 参照切れチェック（同上・重複するが安全側に判定）
    IF r.condition_value_id IS NOT NULL THEN
      v_ref_exists := FALSE;
      CASE r.condition_type
        WHEN 'company_size' THEN
          SELECT EXISTS(SELECT 1 FROM lead_company_sizes WHERE id = r.condition_value_id AND deleted_at IS NULL) INTO v_ref_exists;
        WHEN 'large_segment' THEN
          SELECT EXISTS(SELECT 1 FROM lead_large_segments WHERE id = r.condition_value_id AND deleted_at IS NULL) INTO v_ref_exists;
        WHEN 'small_segment' THEN
          SELECT EXISTS(SELECT 1 FROM lead_small_segments WHERE id = r.condition_value_id AND deleted_at IS NULL) INTO v_ref_exists;
        WHEN 'lead_source' THEN
          SELECT EXISTS(SELECT 1 FROM lead_sources WHERE id = r.condition_value_id AND deleted_at IS NULL) INTO v_ref_exists;
        WHEN 'stage' THEN
          SELECT EXISTS(SELECT 1 FROM lead_stages WHERE id = r.condition_value_id AND deleted_at IS NULL) INTO v_ref_exists;
        WHEN 'status' THEN
          SELECT EXISTS(SELECT 1 FROM lead_statuses WHERE id = r.condition_value_id AND deleted_at IS NULL) INTO v_ref_exists;
        WHEN 'call_status' THEN
          SELECT EXISTS(SELECT 1 FROM lead_call_statuses WHERE id = r.condition_value_id AND deleted_at IS NULL) INTO v_ref_exists;
        WHEN 'activity_type' THEN
          SELECT EXISTS(SELECT 1 FROM lead_activity_types WHERE id = r.condition_value_id AND deleted_at IS NULL) INTO v_ref_exists;
        WHEN 'customer_activity_type' THEN
          SELECT EXISTS(SELECT 1 FROM lead_customer_activity_types WHERE id = r.condition_value_id AND deleted_at IS NULL) INTO v_ref_exists;
        ELSE
          v_ref_exists := TRUE;
      END CASE;
      IF NOT v_ref_exists THEN CONTINUE; END IF;
    END IF;

    -- マッチ判定（1回目と同じロジック）
    CASE r.condition_type
      WHEN 'company_size' THEN
        matched := (v_lead.company_size_id IS NOT NULL AND v_lead.company_size_id = r.condition_value_id);
      WHEN 'large_segment' THEN
        matched := (v_lead.large_segment_id IS NOT NULL AND v_lead.large_segment_id = r.condition_value_id);
      WHEN 'small_segment' THEN
        matched := (v_lead.small_segment_id IS NOT NULL AND v_lead.small_segment_id = r.condition_value_id);
      WHEN 'lead_source' THEN
        matched := (v_lead.lead_source_id IS NOT NULL AND v_lead.lead_source_id = r.condition_value_id);
      WHEN 'stage' THEN
        matched := (v_lead.stage_id IS NOT NULL AND v_lead.stage_id = r.condition_value_id);
      WHEN 'status' THEN
        matched := (v_lead.status_id IS NOT NULL AND v_lead.status_id = r.condition_value_id);
      WHEN 'call_status' THEN
        SELECT (la.call_status_id = r.condition_value_id)
          INTO matched
          FROM lead_activities la
         WHERE la.lead_id = p_lead_id
         ORDER BY la.called_on DESC NULLS LAST, la.created_at DESC
         LIMIT 1;
        IF matched IS NULL THEN matched := FALSE; END IF;
      WHEN 'activity_type' THEN
        SELECT EXISTS(
          SELECT 1 FROM lead_activities la
           WHERE la.lead_id = p_lead_id AND la.activity_type_id = r.condition_value_id
        ) INTO matched;
      WHEN 'customer_activity_type' THEN
        SELECT EXISTS(
          SELECT 1 FROM lead_customer_activities lca
           WHERE lca.lead_id = p_lead_id AND lca.activity_type_id = r.condition_value_id
        ) INTO matched;
      ELSE
        matched := FALSE;
    END CASE;

    IF matched THEN
      INSERT INTO lead_score_breakdowns(lead_id, rule_id, score_delta, applied_at)
      VALUES (p_lead_id, r.id, r.score_delta, NOW());
    END IF;

  END LOOP;

  -- --------------------------------------------------------
  -- 7. 算出後のスコアを返す
  -- --------------------------------------------------------
  RETURN v_score;
END;
$$;

COMMENT ON FUNCTION recalculate_lead_score IS
'単一リードのスコアを再計算。lead_score_rules を全件評価して加点合算、0-100クリップ、temperature_id 連動、breakdowns 全置換。参照切れは WARNING ログでスキップ';

-- ============================================================
-- 既存 leads の score を 0 にリセット + 全件再計算
-- ============================================================

UPDATE leads SET score = 0, temperature_id = NULL WHERE deleted_at IS NULL;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM leads WHERE deleted_at IS NULL LOOP
    PERFORM recalculate_lead_score(r.id);
  END LOOP;
END $$;
