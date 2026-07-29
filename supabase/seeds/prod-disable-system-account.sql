-- ============================================================
-- システム用アカウント（admin@iterra.jp）の無効化（本番投入用・手動実行）
--
-- 背景:
--   20260418000009_add_audit_columns.sql が UUID a0000000-...-0001 のユーザーを作成し、
--   35 個のカラムの created_by DEFAULT 値として埋め込んでいる。
--     ALTER TABLE ... ADD COLUMN created_by UUID NOT NULL
--       DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id)
--   そのため crm_users のレコードを削除・UUID 変更すると INSERT が全て失敗する。
--
-- 方針:
--   レコードは残したまま、人が使えないアカウントとして封じる。
--   実運用の管理者は別アカウントを作成する（docs/deployment-nas.md § 0.4）。
--
--   - banned_until = 'infinity'      … ログイン禁止
--   - crm_users.is_active = false    … 担当者候補（getCrmUsers）から除外
--   - full_name を用途が分かる名前に … created_by の表示が「管理者テスト」では紛らわしい
--
-- 実行対象: 本番のみ。
--   開発環境では admin@iterra.jp をログイン確認に使うため、この SQL は流さない。
-- ============================================================

BEGIN;

-- ログインを禁止する
UPDATE auth.users
   SET banned_until = 'infinity'
 WHERE id = 'a0000000-0000-0000-0000-000000000001';

-- 担当者候補から外し、システム用途であることを名前で明示する
UPDATE crm_users
   SET is_active      = FALSE,
       full_name      = 'システム（初期投入）',
       full_name_kana = 'システム'
 WHERE id = 'a0000000-0000-0000-0000-000000000001';

COMMIT;

-- 確認用
-- SELECT u.email, u.banned_until::text, c.full_name, c.role, c.is_active
--   FROM crm_users c JOIN auth.users u ON u.id = c.id
--  WHERE c.id = 'a0000000-0000-0000-0000-000000000001';
