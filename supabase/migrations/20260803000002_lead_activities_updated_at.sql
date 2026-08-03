-- ============================================================
-- lead_activities に updated_at を持たせる
--
-- 背景:
--   更新系 Server Action は expected_updated_at を WHERE 条件に含めて
--   後勝ちの上書きを防ぐ規約になっている（CLAUDE.md「データ整合性の規約」）。
--   ところが lead_activities だけ updated_at を持たず（created_at と
--   編集監査用の last_edited_at のみ）、楽観ロックの基準に last_edited_at を
--   使わざるを得なかった。
--
--   last_edited_at は INSERT 時 NULL・編集時のみ設定される列なので、
--   「一度も編集されていない記録の初回同時編集」だけロックが効かない。
--   架電記録は本人と manager/admin が触れるため、この隙間は実際に起こりうる。
--
-- 対応:
--   他テーブルと同じ updated_at + update_updated_at() トリガーに揃える。
--   last_edited_at / last_edited_by_user_id は監査証跡としてそのまま残す
--   （20260426000001 の目的は「誰がいつ直したか」の記録であり、役割が違う）。
-- ============================================================

ALTER TABLE lead_activities
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 既存行のバックフィル。編集済みならその時刻、未編集なら作成時刻を初期値にする。
-- DEFAULT NOW() のままだと全行が「たった今更新された」ことになり、
-- 画面が保持している値との突き合わせが常に外れる
UPDATE lead_activities
   SET updated_at = COALESCE(last_edited_at, created_at);

DROP TRIGGER IF EXISTS trg_lead_activities_updated_at ON lead_activities;
CREATE TRIGGER trg_lead_activities_updated_at
  BEFORE UPDATE ON lead_activities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON COLUMN lead_activities.updated_at IS
  '最終更新時刻。楽観ロック（expected_updated_at）の基準。'
  '「誰がいつ編集したか」の監査は last_edited_at / last_edited_by_user_id が持つ';
