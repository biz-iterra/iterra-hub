-- ============================================================
-- 退職済み担当者アカウント（本番投入用・手動実行）
--
-- 目的:
--   leads / lead_activities の担当者列が参照する crm_users を用意する。
--   本人は退職済みでログインさせないが、対応履歴の担当者名を残すために
--   レコード自体は必要（crm_users.id は auth.users への外部キー）。
--
-- 方式と理由:
--   - ダッシュボードの招待ではなく SQL で作成する
--     → 招待メールを送らない。かつ UUID を開発環境と同じ値に固定できるため、
--       04-leads.sql を UUID 置換なしでそのまま投入できる。
--   - encrypted_password はランダム値（誰も知らない）
--   - banned_until = 'infinity' でログインを明示的に禁止
--   - crm_users.is_active = false
--     → getCrmUsers()（src/actions/users.ts）が is_active=true で絞るため、
--       新規登録時の担当者候補には現れず、既存データの担当者表示だけが残る。
--
-- 実行対象: 本番のみ。開発環境では 02-dev-users.sql が同じ UUID を作る。
-- ============================================================

BEGIN;

-- ── auth.users ────────────────────────────────────────────────────────────────
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, banned_until, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  phone_change, phone_change_token,
  raw_app_meta_data, raw_user_meta_data
) VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-0000-0000-000000000010',
    'authenticated', 'authenticated',
    'ogawa@iterra.jp',
    crypt(gen_random_uuid()::text, gen_salt('bf')),  -- ランダム。ログイン用途なし
    NOW(), 'infinity', NOW(), NOW(),
    '', '', '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"小川"}'
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-0000-0000-000000000011',
    'authenticated', 'authenticated',
    'tanaka@iterra.jp',
    crypt(gen_random_uuid()::text, gen_salt('bf')),
    NOW(), 'infinity', NOW(), NOW(),
    '', '', '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"田中"}'
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-0000-0000-000000000012',
    'authenticated', 'authenticated',
    'fushimi@iterra.jp',
    crypt(gen_random_uuid()::text, gen_salt('bf')),
    NOW(), 'infinity', NOW(), NOW(),
    '', '', '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"伏見"}'
  )
ON CONFLICT (id) DO NOTHING;

-- ── auth.identities ───────────────────────────────────────────────────────────
INSERT INTO auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
) VALUES
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000010', 'ogawa@iterra.jp',
   '{"sub":"a0000000-0000-0000-0000-000000000010","email":"ogawa@iterra.jp"}', 'email',
   NULL, NOW(), NOW()),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000011', 'tanaka@iterra.jp',
   '{"sub":"a0000000-0000-0000-0000-000000000011","email":"tanaka@iterra.jp"}', 'email',
   NULL, NOW(), NOW()),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000012', 'fushimi@iterra.jp',
   '{"sub":"a0000000-0000-0000-0000-000000000012","email":"fushimi@iterra.jp"}', 'email',
   NULL, NOW(), NOW())
ON CONFLICT (provider, provider_id) DO NOTHING;

-- ── crm_users（is_active = false で退職者として扱う）──────────────────────────
INSERT INTO crm_users (id, email, full_name, full_name_kana, role, is_active) VALUES
  ('a0000000-0000-0000-0000-000000000010', 'ogawa@iterra.jp',   '小川', 'オガワ', 'member', FALSE),
  ('a0000000-0000-0000-0000-000000000011', 'tanaka@iterra.jp',  '田中', 'タナカ', 'member', FALSE),
  ('a0000000-0000-0000-0000-000000000012', 'fushimi@iterra.jp', '伏見', 'フシミ', 'member', FALSE)
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- 確認用
-- SELECT u.email, u.banned_until, c.is_active
--   FROM crm_users c JOIN auth.users u ON u.id = c.id
--  WHERE c.email IN ('ogawa@iterra.jp','tanaka@iterra.jp','fushimi@iterra.jp');
