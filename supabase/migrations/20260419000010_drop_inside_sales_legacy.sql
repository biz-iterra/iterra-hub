-- ============================================================
-- Phase D: inside_sales パイプライン撤去
-- テスト段階の1回限り例外（2026-04-19 ユーザー承認済み）
-- 運用後の deals 物理削除は絶対禁止（§11.8 参照）
-- ============================================================

DO $$
DECLARE
  v_pipeline_id UUID;
  v_contract_count INTEGER;
BEGIN
  -- inside_sales パイプラインの ID を取得
  SELECT id INTO v_pipeline_id
  FROM pipeline_types
  WHERE slug = 'inside_sales'
  LIMIT 1;

  IF v_pipeline_id IS NULL THEN
    RAISE NOTICE 'pipeline_types slug=inside_sales が見つかりません。スキップします。';
    RETURN;
  END IF;

  -- 安全確認: inside_sales deals に紐づく contracts が存在するか確認
  SELECT COUNT(*) INTO v_contract_count
  FROM contracts c
  WHERE c.deal_id IN (
    SELECT id FROM deals WHERE pipeline_type_id = v_pipeline_id
  );

  IF v_contract_count > 0 THEN
    RAISE NOTICE 'WARNING: inside_sales deals に紐づく contracts が % 件存在します。それらも削除されます。', v_contract_count;
  ELSE
    RAISE NOTICE 'INFO: inside_sales deals に紐づく contracts は 0 件です。安全に削除できます。';
  END IF;

  -- inside_sales deals を物理削除
  -- CASCADE により以下も自動削除:
  --   deal_ext_inside_sales / deal_ext_inside_sales_calls
  --   deal_activities / deal_activity_emails
  --   deal_stage_histories / deal_status_histories / deal_change_histories
  --   contracts (v_contract_count > 0 の場合)
  DELETE FROM deals
  WHERE pipeline_type_id = v_pipeline_id;

  RAISE NOTICE 'INFO: inside_sales パイプラインの deals を物理削除しました。';

  -- inside_sales 専用の deal_stages を削除
  -- (他 pipeline で参照されているものは残す)
  DELETE FROM deal_stages
  WHERE pipeline_type_id = v_pipeline_id;

  RAISE NOTICE 'INFO: inside_sales パイプラインの deal_stages を削除しました。';

  -- inside_sales 専用の deal_statuses を削除
  DELETE FROM deal_statuses
  WHERE pipeline_type_id = v_pipeline_id;

  RAISE NOTICE 'INFO: inside_sales パイプラインの deal_statuses を削除しました。';

  -- pipeline_types から inside_sales を削除
  DELETE FROM pipeline_types
  WHERE id = v_pipeline_id;

  RAISE NOTICE 'INFO: pipeline_types から slug=inside_sales を削除しました。';

  RAISE NOTICE 'Phase D: inside_sales legacy データ削除完了。';
END;
$$;

-- ------------------------------------------------------------
-- deal_ext_inside_sales_calls テーブルを DROP
-- (deals CASCADE 削除後なのでデータは既に空のはずだが DROP で完全撤去)
-- ------------------------------------------------------------
DROP TABLE IF EXISTS deal_ext_inside_sales_calls;

-- ------------------------------------------------------------
-- deal_ext_inside_sales テーブルを DROP
-- ------------------------------------------------------------
DROP TABLE IF EXISTS deal_ext_inside_sales;

-- ------------------------------------------------------------
-- is_deal_accessible 関数は deals テーブル全般で使用するため残す
-- (他パイプライン拡張が追加された場合に再利用可能)
-- ------------------------------------------------------------
