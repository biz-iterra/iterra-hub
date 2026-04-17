-- ============================================================
-- T02: companies（カンパニー）
-- ============================================================
CREATE TABLE companies (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_code                VARCHAR(10) UNIQUE NOT NULL,
  corporate_type_id           UUID        REFERENCES corporate_types(id),
  name                        TEXT        NOT NULL,
  name_kana                   TEXT,
  representative_name         TEXT,
  corporate_number            VARCHAR(13) UNIQUE,
  invoice_registered          BOOLEAN     NOT NULL DEFAULT FALSE,
  invoice_registration_number VARCHAR(14) UNIQUE,
  postal_code                 VARCHAR(8),
  prefecture                  TEXT,
  city                        TEXT,
  address_line1               TEXT,
  address_line2               TEXT,
  phone                       VARCHAR(20),
  fax                         VARCHAR(20),
  website_url                 TEXT,
  industry_classification_id  UUID        REFERENCES industry_classifications(id),
  registration_certificate_url TEXT,
  internal_memo               TEXT,
  lead_source_id              UUID        REFERENCES lead_sources(id),
  owner_user_id               UUID        REFERENCES crm_users(id),
  is_active                   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_companies_invoice
    CHECK (invoice_registered = FALSE OR invoice_registration_number IS NOT NULL)
);

-- インデックス
CREATE INDEX idx_companies_name              ON companies (name);
CREATE INDEX idx_companies_owner_user_id     ON companies (owner_user_id);
CREATE INDEX idx_companies_corporate_type_id ON companies (corporate_type_id);
