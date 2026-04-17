-- ============================================================
-- T03: accounts（アカウント）
-- ============================================================
CREATE TABLE accounts (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_code      VARCHAR(10) UNIQUE NOT NULL,
  company_id        UUID        REFERENCES companies(id),
  account_type_id   UUID        REFERENCES account_types(id),
  account_status_id UUID        NOT NULL REFERENCES account_statuses(id),
  name              TEXT        NOT NULL,
  description       TEXT,
  lead_source_id    UUID        REFERENCES lead_sources(id),
  owner_user_id     UUID        REFERENCES crm_users(id),
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  status_updated_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- インデックス
CREATE INDEX idx_accounts_company_id        ON accounts (company_id);
CREATE INDEX idx_accounts_owner_user_id     ON accounts (owner_user_id);
CREATE INDEX idx_accounts_account_status_id ON accounts (account_status_id);

-- ============================================================
-- J02: account_contacts（アカウント‐コンタクト中間テーブル）
-- ※ contact_id の FK は contacts テーブル作成後にファイル08で追加
-- ============================================================
CREATE TABLE account_contacts (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID        NOT NULL, -- FK はファイル08で追加
  role       TEXT        CHECK (role IN ('primary', 'billing', 'technical', 'other')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (account_id, contact_id)
);
