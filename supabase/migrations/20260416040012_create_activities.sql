-- ============================================================
-- Migration: 20260416040012_create_activities.sql
-- Description: アクティビティログ・ディール活動・ステージ/ステータス履歴・エンティティ変更履歴
-- ============================================================

-- ----------------------------------------------------------
-- A01: activity_logs — 汎用アクティビティログ (INSERT ONLY)
-- ----------------------------------------------------------
CREATE TABLE activity_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_type   TEXT NOT NULL CHECK (activity_type IN ('note', 'task', 'other')),
    subject         TEXT,
    description     TEXT,
    deal_id         UUID REFERENCES deals(id) ON DELETE CASCADE,
    contact_id      UUID REFERENCES contacts(id) ON DELETE CASCADE,
    account_id      UUID REFERENCES accounts(id) ON DELETE CASCADE,
    company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
    created_by      UUID REFERENCES crm_users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT activity_logs_at_least_one_entity
        CHECK (COALESCE(deal_id, contact_id, account_id, company_id) IS NOT NULL)
);

CREATE INDEX idx_activity_logs_deal_id    ON activity_logs (deal_id);
CREATE INDEX idx_activity_logs_contact_id ON activity_logs (contact_id);
CREATE INDEX idx_activity_logs_account_id ON activity_logs (account_id);
CREATE INDEX idx_activity_logs_company_id ON activity_logs (company_id);
CREATE INDEX idx_activity_logs_created_at ON activity_logs (created_at DESC);

-- ----------------------------------------------------------
-- A02: deal_activities — ディール活動記録
-- ----------------------------------------------------------
CREATE TABLE deal_activities (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id          UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    activity_type    TEXT NOT NULL CHECK (activity_type IN ('email', 'call', 'meeting', 'visit', 'other')),
    activity_at      TIMESTAMPTZ NOT NULL,
    contact_id       UUID REFERENCES contacts(id),
    subject          TEXT,
    description      TEXT,
    duration_minutes INTEGER CHECK (duration_minutes >= 0),
    performed_by     UUID NOT NULL REFERENCES crm_users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deal_activities_deal_id      ON deal_activities (deal_id);
CREATE INDEX idx_deal_activities_contact_id   ON deal_activities (contact_id);
CREATE INDEX idx_deal_activities_performed_by ON deal_activities (performed_by);
CREATE INDEX idx_deal_activities_activity_at  ON deal_activities (activity_at DESC);

-- ----------------------------------------------------------
-- A03: deal_activity_emails — メール詳細 (INSERT ONLY)
-- ----------------------------------------------------------
CREATE TABLE deal_activity_emails (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_activity_id UUID NOT NULL UNIQUE REFERENCES deal_activities(id) ON DELETE CASCADE,
    sender_name      TEXT,
    sender_email     TEXT,
    recipient_email  TEXT,
    body             TEXT,
    summary          TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------
-- A04: deal_stage_histories — ステージ遷移履歴 (INSERT ONLY)
-- ----------------------------------------------------------
CREATE TABLE deal_stage_histories (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id       UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    from_stage_id UUID REFERENCES deal_stages(id),
    to_stage_id   UUID NOT NULL REFERENCES deal_stages(id),
    reason        TEXT,
    changed_by    UUID NOT NULL REFERENCES crm_users(id),
    changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deal_stage_histories_deal_id    ON deal_stage_histories (deal_id);
CREATE INDEX idx_deal_stage_histories_changed_at ON deal_stage_histories (changed_at DESC);

-- ----------------------------------------------------------
-- A05: deal_status_histories — ステータス遷移履歴 (INSERT ONLY)
-- ----------------------------------------------------------
CREATE TABLE deal_status_histories (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id        UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    stage_id       UUID NOT NULL REFERENCES deal_stages(id),
    from_status_id UUID REFERENCES deal_statuses(id),
    to_status_id   UUID NOT NULL REFERENCES deal_statuses(id),
    reason         TEXT,
    changed_by     UUID NOT NULL REFERENCES crm_users(id),
    changed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deal_status_histories_deal_id    ON deal_status_histories (deal_id);
CREATE INDEX idx_deal_status_histories_stage_id   ON deal_status_histories (stage_id);
CREATE INDEX idx_deal_status_histories_changed_at ON deal_status_histories (changed_at DESC);

-- ----------------------------------------------------------
-- A06: company_change_histories — カンパニー変更履歴 (INSERT ONLY)
-- ----------------------------------------------------------
CREATE TABLE company_change_histories (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    field_name TEXT NOT NULL,
    old_value  TEXT,
    new_value  TEXT,
    changed_by UUID NOT NULL REFERENCES crm_users(id),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_company_change_histories_company_id  ON company_change_histories (company_id);
CREATE INDEX idx_company_change_histories_changed_at  ON company_change_histories (changed_at DESC);

-- ----------------------------------------------------------
-- A07: account_change_histories — アカウント変更履歴 (INSERT ONLY)
-- ----------------------------------------------------------
CREATE TABLE account_change_histories (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    field_name TEXT NOT NULL,
    old_value  TEXT,
    new_value  TEXT,
    changed_by UUID NOT NULL REFERENCES crm_users(id),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_account_change_histories_account_id  ON account_change_histories (account_id);
CREATE INDEX idx_account_change_histories_changed_at  ON account_change_histories (changed_at DESC);

-- ----------------------------------------------------------
-- A08: contact_change_histories — コンタクト変更履歴 (INSERT ONLY)
-- ----------------------------------------------------------
CREATE TABLE contact_change_histories (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    field_name TEXT NOT NULL,
    old_value  TEXT,
    new_value  TEXT,
    changed_by UUID NOT NULL REFERENCES crm_users(id),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contact_change_histories_contact_id  ON contact_change_histories (contact_id);
CREATE INDEX idx_contact_change_histories_changed_at  ON contact_change_histories (changed_at DESC);

-- ----------------------------------------------------------
-- A09: deal_change_histories — ディール変更履歴 (INSERT ONLY)
-- ----------------------------------------------------------
CREATE TABLE deal_change_histories (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id    UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    field_name TEXT NOT NULL,
    old_value  TEXT,
    new_value  TEXT,
    changed_by UUID NOT NULL REFERENCES crm_users(id),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deal_change_histories_deal_id     ON deal_change_histories (deal_id);
CREATE INDEX idx_deal_change_histories_changed_at  ON deal_change_histories (changed_at DESC);

-- ----------------------------------------------------------
-- A10: talent_change_histories — タレント変更履歴 (INSERT ONLY)
-- ----------------------------------------------------------
CREATE TABLE talent_change_histories (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    talent_id  UUID NOT NULL REFERENCES talents(id) ON DELETE CASCADE,
    field_name TEXT NOT NULL,
    old_value  TEXT,
    new_value  TEXT,
    changed_by UUID NOT NULL REFERENCES crm_users(id),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_talent_change_histories_talent_id   ON talent_change_histories (talent_id);
CREATE INDEX idx_talent_change_histories_changed_at  ON talent_change_histories (changed_at DESC);
