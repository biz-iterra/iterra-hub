-- ============================================================
-- 開発用ユーザー（開発環境専用）
-- auth.users へ直接 INSERT し、共通パスワードを設定している。
-- 本番へは投入しないこと。本番のユーザー作成は docs/deployment-nas.md を参照。
-- ============================================================

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new, phone_change, phone_change_token,
  raw_app_meta_data, raw_user_meta_data
) VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated',
    'admin@iterra.jp',
    crypt('password123', gen_salt('bf')),
    NOW(), NOW(), NOW(), '', '', '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"管理者テスト"}'
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated',
    'manager@iterra.jp',
    crypt('password123', gen_salt('bf')),
    NOW(), NOW(), NOW(), '', '', '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"マネージャーテスト"}'
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-0000-0000-000000000003',
    'authenticated', 'authenticated',
    'member@iterra.jp',
    crypt('password123', gen_salt('bf')),
    NOW(), NOW(), NOW(), '', '', '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"メンバーテスト"}'
  ),
  -- インサイドセールス架電担当者（暫定。emailは後で本番値に差し替え）
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-0000-0000-000000000010',
    'authenticated', 'authenticated',
    'ogawa@iterra.jp',
    crypt('password123', gen_salt('bf')),
    NOW(), NOW(), NOW(), '', '', '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"小川"}'
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-0000-0000-000000000011',
    'authenticated', 'authenticated',
    'tanaka@iterra.jp',
    crypt('password123', gen_salt('bf')),
    NOW(), NOW(), NOW(), '', '', '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"田中"}'
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-0000-0000-000000000012',
    'authenticated', 'authenticated',
    'fushimi@iterra.jp',
    crypt('password123', gen_salt('bf')),
    NOW(), NOW(), NOW(), '', '', '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"伏見"}'
  )
ON CONFLICT (id) DO UPDATE SET
  encrypted_password = EXCLUDED.encrypted_password,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  updated_at = NOW();

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at) VALUES
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 'admin@iterra.jp',   '{"sub":"a0000000-0000-0000-0000-000000000001","email":"admin@iterra.jp"}',   'email', NOW(), NOW(), NOW()),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000002', 'manager@iterra.jp', '{"sub":"a0000000-0000-0000-0000-000000000002","email":"manager@iterra.jp"}', 'email', NOW(), NOW(), NOW()),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000003', 'member@iterra.jp',  '{"sub":"a0000000-0000-0000-0000-000000000003","email":"member@iterra.jp"}',  'email', NOW(), NOW(), NOW()),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000010', 'ogawa@iterra.jp',   '{"sub":"a0000000-0000-0000-0000-000000000010","email":"ogawa@iterra.jp"}',   'email', NOW(), NOW(), NOW()),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000011', 'tanaka@iterra.jp',  '{"sub":"a0000000-0000-0000-0000-000000000011","email":"tanaka@iterra.jp"}',  'email', NOW(), NOW(), NOW()),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000012', 'fushimi@iterra.jp', '{"sub":"a0000000-0000-0000-0000-000000000012","email":"fushimi@iterra.jp"}', 'email', NOW(), NOW(), NOW())
ON CONFLICT (provider, provider_id) DO NOTHING;

-- crm_users（admin は Phase E マイグレーションで先行投入済みのため衝突吸収）
INSERT INTO crm_users (id, email, full_name, full_name_kana, role) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'admin@iterra.jp',   '管理者テスト',       'カンリシャテスト',         'admin'),
  ('a0000000-0000-0000-0000-000000000002', 'manager@iterra.jp', 'マネージャーテスト', 'マネージャーテスト',       'manager'),
  ('a0000000-0000-0000-0000-000000000003', 'member@iterra.jp',  'メンバーテスト',     'メンバーテスト',           'member'),
  ('a0000000-0000-0000-0000-000000000010', 'ogawa@iterra.jp',   '小川',               'オガワ',                   'member'),
  ('a0000000-0000-0000-0000-000000000011', 'tanaka@iterra.jp',  '田中',               'タナカ',                   'member'),
  ('a0000000-0000-0000-0000-000000000012', 'fushimi@iterra.jp', '伏見',               'フシミ',                   'member')
ON CONFLICT (id) DO NOTHING;

