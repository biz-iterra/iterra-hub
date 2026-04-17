-- ============================================================
-- T05: deals（ディール）
-- ============================================================
CREATE TABLE deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_code VARCHAR(9) UNIQUE NOT NULL,
  name TEXT NOT NULL,
  pipeline_type_id UUID NOT NULL REFERENCES pipeline_types(id),
  deal_stage_id UUID NOT NULL REFERENCES deal_stages(id),
  deal_status_id UUID NOT NULL REFERENCES deal_statuses(id),
  amount BIGINT CHECK (amount >= 0),
  account_id UUID NOT NULL REFERENCES accounts(id),
  owner_user_id UUID REFERENCES crm_users(id),
  contract_name TEXT,
  application_date DATE,
  review_completed_date DATE,
  stage_updated_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  last_updated_by UUID REFERENCES crm_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE deals IS 'ディール（取引）';
COMMENT ON COLUMN deals.deal_code IS 'ディールコード（一意）';
COMMENT ON COLUMN deals.name IS 'ディール名';
COMMENT ON COLUMN deals.pipeline_type_id IS 'パイプライン種別';
COMMENT ON COLUMN deals.deal_stage_id IS 'ディールステージ';
COMMENT ON COLUMN deals.deal_status_id IS 'ディールステータス';
COMMENT ON COLUMN deals.amount IS '金額';
COMMENT ON COLUMN deals.account_id IS 'アカウント';
COMMENT ON COLUMN deals.owner_user_id IS '担当者';
COMMENT ON COLUMN deals.contract_name IS '契約名';
COMMENT ON COLUMN deals.application_date IS '申込日';
COMMENT ON COLUMN deals.review_completed_date IS '審査完了日';
COMMENT ON COLUMN deals.stage_updated_at IS 'ステージ更新日時';
COMMENT ON COLUMN deals.closed_at IS 'クローズ日時';
COMMENT ON COLUMN deals.last_updated_by IS '最終更新者';

CREATE INDEX idx_deals_pipeline_type_id ON deals(pipeline_type_id);
CREATE INDEX idx_deals_deal_stage_id ON deals(deal_stage_id);
CREATE INDEX idx_deals_deal_status_id ON deals(deal_status_id);
CREATE INDEX idx_deals_account_id ON deals(account_id);
CREATE INDEX idx_deals_owner_user_id ON deals(owner_user_id);
CREATE INDEX idx_deals_created_at ON deals(created_at DESC);

-- ============================================================
-- T06: contracts（契約）
-- ============================================================
CREATE TABLE contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_code VARCHAR(10) UNIQUE NOT NULL,
  deal_id UUID NOT NULL REFERENCES deals(id),
  contract_method TEXT CHECK (contract_method IN ('paper', 'electronic', 'verbal')),
  contract_type_id UUID REFERENCES contract_types(id),
  contract_name TEXT,
  counterparty_type TEXT CHECK (counterparty_type IN ('company', 'individual')),
  counterparty_company_id UUID REFERENCES companies(id),
  counterparty_contact_id UUID REFERENCES contacts(id),
  counterparty_manager_id UUID REFERENCES contacts(id),
  contract_content TEXT,
  sent_date DATE,
  signback_date DATE,
  execution_date DATE,
  start_date DATE,
  end_date DATE,
  auto_renewal BOOLEAN NOT NULL DEFAULT FALSE,
  cancellation_date DATE,
  original_document_url TEXT,
  contract_url TEXT,
  registered_by UUID REFERENCES crm_users(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_contracts_date_range CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
  CONSTRAINT chk_contracts_signback_date CHECK (signback_date IS NULL OR sent_date IS NULL OR signback_date >= sent_date),
  CONSTRAINT chk_contracts_cancellation_date CHECK (cancellation_date IS NULL OR start_date IS NULL OR cancellation_date >= start_date)
);

COMMENT ON TABLE contracts IS '契約';
COMMENT ON COLUMN contracts.contract_code IS '契約コード（一意）';
COMMENT ON COLUMN contracts.deal_id IS 'ディール';
COMMENT ON COLUMN contracts.contract_method IS '契約方法（paper/electronic/verbal）';
COMMENT ON COLUMN contracts.contract_type_id IS '契約種別';
COMMENT ON COLUMN contracts.contract_name IS '契約名';
COMMENT ON COLUMN contracts.counterparty_type IS '相手方種別（company/individual）';
COMMENT ON COLUMN contracts.counterparty_company_id IS '相手方カンパニー';
COMMENT ON COLUMN contracts.counterparty_contact_id IS '相手方コンタクト';
COMMENT ON COLUMN contracts.counterparty_manager_id IS '相手方担当者';
COMMENT ON COLUMN contracts.contract_content IS '契約内容';
COMMENT ON COLUMN contracts.sent_date IS '送付日';
COMMENT ON COLUMN contracts.signback_date IS '返送日';
COMMENT ON COLUMN contracts.execution_date IS '締結日';
COMMENT ON COLUMN contracts.start_date IS '契約開始日';
COMMENT ON COLUMN contracts.end_date IS '契約終了日';
COMMENT ON COLUMN contracts.auto_renewal IS '自動更新';
COMMENT ON COLUMN contracts.cancellation_date IS '解約日';
COMMENT ON COLUMN contracts.original_document_url IS '原本URL';
COMMENT ON COLUMN contracts.contract_url IS '契約書URL';
COMMENT ON COLUMN contracts.registered_by IS '登録者';

CREATE INDEX idx_contracts_deal_id ON contracts(deal_id);
CREATE INDEX idx_contracts_contract_type_id ON contracts(contract_type_id);
CREATE INDEX idx_contracts_counterparty_company_id ON contracts(counterparty_company_id);
CREATE INDEX idx_contracts_counterparty_contact_id ON contracts(counterparty_contact_id);
CREATE INDEX idx_contracts_counterparty_manager_id ON contracts(counterparty_manager_id);

-- ============================================================
-- J01: deal_services（ディール×サービス中間テーブル）
-- ============================================================
CREATE TABLE deal_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_deal_services UNIQUE (deal_id, service_id)
);

COMMENT ON TABLE deal_services IS 'ディール×サービス中間テーブル';
COMMENT ON COLUMN deal_services.deal_id IS 'ディール';
COMMENT ON COLUMN deal_services.service_id IS 'サービス';
