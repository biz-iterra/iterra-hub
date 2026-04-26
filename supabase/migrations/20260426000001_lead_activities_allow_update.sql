-- ============================================================
-- D08 lead_activities — 編集機能解禁（Phase 11: 2026-04-26）
--
-- 背景: 社内対応履歴の誤記録を admin が DELETE→再作成するのは非効率。
--       代わりに caller_user_id 本人または manager/admin による UPDATE を許可し、
--       last_edited_at / last_edited_by_user_id で監査証跡を保全する。
-- ============================================================

-- ---------- 監査用カラム追加 ----------
ALTER TABLE lead_activities
  ADD COLUMN IF NOT EXISTS last_edited_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_edited_by_user_id UUID REFERENCES crm_users(id);

COMMENT ON COLUMN lead_activities.last_edited_at IS
  '最終編集日時（監査用）。INSERT 時は NULL。編集が行われた場合のみ設定される';
COMMENT ON COLUMN lead_activities.last_edited_by_user_id IS
  '最終編集者（監査用）。FK → crm_users(id)。INSERT 時は NULL。編集が行われた場合のみ設定される';

-- ---------- UPDATE RLS ポリシー ----------
-- caller_user_id 本人（登録した対応者）または manager/admin のみ UPDATE 可能
CREATE POLICY lead_activities_update ON lead_activities
  FOR UPDATE TO authenticated
  USING  (caller_user_id = auth.uid() OR is_manager_or_above())
  WITH CHECK (caller_user_id = auth.uid() OR is_manager_or_above());
