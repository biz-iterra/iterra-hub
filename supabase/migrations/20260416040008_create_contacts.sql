-- ============================================================
-- T04: contacts（コンタクト）
-- ============================================================
CREATE TABLE contacts (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_code                VARCHAR(10) UNIQUE NOT NULL,
  last_name                   TEXT        NOT NULL,
  middle_name                 TEXT,
  first_name                  TEXT        NOT NULL,
  last_name_kana              TEXT,
  middle_name_kana            TEXT,
  first_name_kana             TEXT,
  contact_status_id           UUID        NOT NULL REFERENCES contact_statuses(id),
  contact_type                TEXT        CHECK (contact_type IN ('individual', 'corporate_rep', 'employee', 'other')),
  company_id                  UUID        REFERENCES companies(id),
  invoice_registered          BOOLEAN     NOT NULL DEFAULT FALSE,
  invoice_registration_number VARCHAR(14) UNIQUE,
  postal_code                 VARCHAR(8),
  prefecture                  TEXT,
  city                        TEXT,
  address_line1               TEXT,
  address_line2               TEXT,
  department                  TEXT,
  job_title                   TEXT,
  birth_date                  DATE,
  potential_number            INTEGER     REFERENCES number_diagnosis(number),
  constellation_id            UUID        REFERENCES constellation_fortune_telling(id),
  lead_source_id              UUID        REFERENCES lead_sources(id),
  line_user_id                TEXT        UNIQUE,
  internal_memo               TEXT,
  owner_user_id               UUID        REFERENCES crm_users(id),
  is_active                   BOOLEAN     NOT NULL DEFAULT TRUE,
  status_updated_at           TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_contacts_invoice
    CHECK (invoice_registered = FALSE OR invoice_registration_number IS NOT NULL)
);

-- インデックス
CREATE INDEX idx_contacts_name              ON contacts (last_name, first_name);
CREATE INDEX idx_contacts_contact_status_id ON contacts (contact_status_id);
CREATE INDEX idx_contacts_owner_user_id     ON contacts (owner_user_id);
CREATE INDEX idx_contacts_potential_number  ON contacts (potential_number);
CREATE INDEX idx_contacts_company_id        ON contacts (company_id);

-- ============================================================
-- D01: contact_emails（コンタクトメールアドレス）
-- ============================================================
CREATE TABLE contact_emails (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID        NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  email      TEXT        NOT NULL,
  label      TEXT        NOT NULL DEFAULT 'work'
             CHECK (label IN ('work', 'personal', 'other')),
  is_primary BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (contact_id, email)
);

CREATE INDEX idx_contact_emails_email ON contact_emails (email);

-- ============================================================
-- D02: contact_phones（コンタクト電話番号）
-- ============================================================
CREATE TABLE contact_phones (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID        NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  phone      VARCHAR(20) NOT NULL,
  label      TEXT        NOT NULL DEFAULT 'work'
             CHECK (label IN ('work', 'mobile', 'home', 'fax', 'other')),
  is_primary BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (contact_id, phone)
);

CREATE INDEX idx_contact_phones_phone ON contact_phones (phone);

-- ============================================================
-- account_contacts に contact_id の FK 制約を追加
-- （ファイル07で contacts テーブル未作成のため遅延追加）
-- ============================================================
ALTER TABLE account_contacts
  ADD CONSTRAINT account_contacts_contact_id_fkey
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;
