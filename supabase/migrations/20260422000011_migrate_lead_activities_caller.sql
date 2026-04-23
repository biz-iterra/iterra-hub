-- ============================================================
-- lead_activities.caller_id → caller_user_id（crm_users 参照）に移行
-- Phase 10b-3 で lead_callers マスタを DROP するための事前準備
-- ============================================================

-- Step 1: 新カラム追加（NULL 許容、FK は crm_users）
ALTER TABLE lead_activities
  ADD COLUMN caller_user_id UUID REFERENCES crm_users(id);

-- Step 2: linked_user_id 経由でバックフィル
UPDATE lead_activities la
SET caller_user_id = lc.linked_user_id
FROM lead_callers lc
WHERE la.caller_id = lc.id
  AND lc.linked_user_id IS NOT NULL;

-- Step 3: linked_user_id が NULL で解決できなかったレコードを警告
DO $$
DECLARE
  v_unresolved INT;
BEGIN
  SELECT COUNT(*) INTO v_unresolved
  FROM lead_activities
  WHERE caller_id IS NOT NULL AND caller_user_id IS NULL;

  IF v_unresolved > 0 THEN
    RAISE WARNING '[migrate_caller] % 件の lead_activities が caller_user_id を解決できませんでした。linked_user_id が NULL の lead_callers を参照していました', v_unresolved;
  END IF;
END $$;

-- Step 4: 旧カラムのインデックス削除
DROP INDEX IF EXISTS idx_lead_activities_caller;

-- Step 5: caller_id カラム削除
ALTER TABLE lead_activities DROP COLUMN caller_id;

-- Step 6: caller_user_id を NOT NULL に変更
-- 解決できなかった行がある場合はマイグレーションが失敗する
-- 開発環境では全件解決できるはず（seed の lead_callers 3件は全員 linked_user_id 設定済み）
ALTER TABLE lead_activities
  ALTER COLUMN caller_user_id SET NOT NULL;

-- Step 7: 新カラムのインデックス作成
CREATE INDEX idx_lead_activities_caller_user ON lead_activities(caller_user_id);

COMMENT ON COLUMN lead_activities.caller_user_id IS '対応者のCRMユーザー。旧 caller_id (lead_callers FK) からの移行';
