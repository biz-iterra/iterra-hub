-- ============================================================
-- T01: crm_users（CRMユーザー）
-- ============================================================
CREATE TABLE crm_users (
  id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT        UNIQUE NOT NULL,
  full_name  TEXT        NOT NULL,
  full_name_kana TEXT,
  role       TEXT        NOT NULL DEFAULT 'member'
             CHECK (role IN ('member', 'manager', 'admin')),
  avatar_url TEXT,
  is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
