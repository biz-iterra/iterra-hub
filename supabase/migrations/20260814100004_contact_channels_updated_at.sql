-- ============================================================
-- 連絡手段（メール・電話）に updated_at を足す（T-0096）
--
-- 背景:
--   従属テーブルの更新は親フォームとは別の Server Action を直接呼んでおり、
--   親の楽観ロックでは守られない。ところが `contact_emails` /
--   `contact_phones` には **`updated_at` 列そのものが無く**、
--   「編集開始時点の値」を条件にする楽観ロックを載せられなかった。
--
--   他の従属テーブル（住所・SNS・タレントのスキル／経歴／実績・連携プロファイル）は
--   既に updated_at を持っているので、この 2 表だけ揃える。
--
-- 方針:
--   - 既存行は `created_at` を初期値にする。**NOW() を入れない**
--     （触っていない行が「たった今更新された」ことになると、
--       変更履歴と突き合わせたときに嘘になる）
--   - 以後の更新は共通の `update_updated_at()` トリガーが面倒を見る
-- ============================================================

ALTER TABLE contact_emails
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE contact_phones
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 既存行は作成時刻に揃える（列を足した瞬間を「更新」と呼ばない）
UPDATE contact_emails SET updated_at = created_at WHERE updated_at <> created_at;
UPDATE contact_phones SET updated_at = created_at WHERE updated_at <> created_at;

DROP TRIGGER IF EXISTS trg_contact_emails_updated_at ON contact_emails;
CREATE TRIGGER trg_contact_emails_updated_at
  BEFORE UPDATE ON contact_emails
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_contact_phones_updated_at ON contact_phones;
CREATE TRIGGER trg_contact_phones_updated_at
  BEFORE UPDATE ON contact_phones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON COLUMN contact_emails.updated_at IS '楽観ロックに使う（T-0096）。更新はトリガー任せ';
COMMENT ON COLUMN contact_phones.updated_at IS '楽観ロックに使う（T-0096）。更新はトリガー任せ';
