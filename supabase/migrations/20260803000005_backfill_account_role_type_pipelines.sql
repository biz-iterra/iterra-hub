-- ============================================================
-- account_role_types.pipeline_type_id のバックフィル
--
-- 20260731000008 は区分マスタを入れるとき、パイプラインを
--   (SELECT id FROM pipeline_types WHERE name = '営業' …)
-- で引いていた。ところが pipeline_types を投入するのは seed
-- （supabase/seeds/01-masters.sql）であり、マイグレーション実行時点では空。
-- サブクエリが NULL を返し、5 件すべて pipeline_type_id = NULL で入る。
-- INSERT は ON CONFLICT (code) DO NOTHING なので seed 投入後も直らない。
--
-- 結果、ensure_account_on_contract() の区分付与が
--   SELECT id FROM account_role_types WHERE pipeline_type_id = v_deal.pipeline_type_id
-- で常に NULL になり、**契約が成立しても取引先に区分が付かない**状態だった
-- （営業→顧客 / 仕入れ→仕入れ先 / 業務委託→外注先 が一度も動いていない）。
--
-- seed の lead_score_rules（20260803000004）と同じ「マスタ投入順に依存した
-- サブクエリ」の構造。ここでは code で引き当てて補正する。
-- ============================================================

UPDATE account_role_types art
   SET pipeline_type_id = pt.id,
       updated_at = now()
  FROM pipeline_types pt
 WHERE art.pipeline_type_id IS NULL
   AND art.deleted_at IS NULL
   AND pt.deleted_at IS NULL
   AND (
     (art.code = 'customer'      AND pt.slug = 'sales') OR
     (art.code = 'supplier'      AND pt.slug = 'procurement') OR
     (art.code = 'subcontractor' AND pt.slug = 'outsourcing')
   );

-- 補正できたかを検証する。3 件そろわない場合はマスタ側の欠落なので気づけるようにする
DO $$
DECLARE v_missing text;
BEGIN
  SELECT string_agg(code, ', ' ORDER BY sort_order) INTO v_missing
    FROM account_role_types
   WHERE code IN ('customer','supplier','subcontractor')
     AND deleted_at IS NULL
     AND pipeline_type_id IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE WARNING 'account_role_types のパイプライン紐付けが未設定です: % （pipeline_types の slug を確認すること）', v_missing;
  END IF;
END $$;
