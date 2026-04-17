-- ============================================================
-- D03: financial_info（口座情報）
-- ============================================================
CREATE TABLE financial_info (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  bank_code VARCHAR(4),
  branch_name TEXT,
  branch_code VARCHAR(3),
  account_type TEXT CHECK (account_type IN ('ordinary', 'current', 'savings')),
  account_number VARCHAR(7),
  account_holder TEXT,
  account_holder_kana TEXT,
  passbook_copy_url TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_financial_info_owner CHECK (
    (company_id IS NOT NULL AND contact_id IS NULL)
    OR (company_id IS NULL AND contact_id IS NOT NULL)
  )
);

COMMENT ON TABLE financial_info IS '口座情報';
COMMENT ON COLUMN financial_info.company_id IS 'カンパニー（排他）';
COMMENT ON COLUMN financial_info.contact_id IS 'コンタクト（排他）';
COMMENT ON COLUMN financial_info.bank_name IS '銀行名';
COMMENT ON COLUMN financial_info.bank_code IS '銀行コード';
COMMENT ON COLUMN financial_info.branch_name IS '支店名';
COMMENT ON COLUMN financial_info.branch_code IS '支店コード';
COMMENT ON COLUMN financial_info.account_type IS '口座種別（ordinary/current/savings）';
COMMENT ON COLUMN financial_info.account_number IS '口座番号';
COMMENT ON COLUMN financial_info.account_holder IS '口座名義';
COMMENT ON COLUMN financial_info.account_holder_kana IS '口座名義カナ';
COMMENT ON COLUMN financial_info.passbook_copy_url IS '通帳コピーURL';
COMMENT ON COLUMN financial_info.is_primary IS '主口座フラグ';

-- ============================================================
-- D04: other_addresses（その他住所）
-- ============================================================
CREATE TABLE other_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  label TEXT,
  postal_code VARCHAR(8),
  prefecture TEXT,
  city TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  phone VARCHAR(20),
  fax VARCHAR(20),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_other_addresses_owner CHECK (
    (company_id IS NOT NULL AND contact_id IS NULL)
    OR (company_id IS NULL AND contact_id IS NOT NULL)
  )
);

COMMENT ON TABLE other_addresses IS 'その他住所';
COMMENT ON COLUMN other_addresses.company_id IS 'カンパニー（排他）';
COMMENT ON COLUMN other_addresses.contact_id IS 'コンタクト（排他）';
COMMENT ON COLUMN other_addresses.label IS 'ラベル';
COMMENT ON COLUMN other_addresses.postal_code IS '郵便番号';
COMMENT ON COLUMN other_addresses.prefecture IS '都道府県';
COMMENT ON COLUMN other_addresses.city IS '市区町村';
COMMENT ON COLUMN other_addresses.address_line1 IS '住所1';
COMMENT ON COLUMN other_addresses.address_line2 IS '住所2';
COMMENT ON COLUMN other_addresses.phone IS '電話番号';
COMMENT ON COLUMN other_addresses.fax IS 'FAX番号';
COMMENT ON COLUMN other_addresses.memo IS '備考';
