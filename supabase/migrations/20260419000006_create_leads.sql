-- ============================================================
-- T09 leads（リード本体）
-- J04  lead_campaigns（Lead×Campaign 中間テーブル）
-- 共通関数: is_lead_accessible(p_lead_id UUID)
-- 順序: leads テーブル作成 → 関数定義 → lead_campaigns → RLS
-- ============================================================

-- ------------------------------------------------------------
-- T09: leads（リード本体）
-- ------------------------------------------------------------
CREATE TABLE leads (
  -- 基本識別
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_name             TEXT          NOT NULL,

  -- 分類
  account_type_id       UUID          REFERENCES account_types(id),
  company_name          TEXT,                                        -- 任意テキスト（companies と無関係でも可）
  company_id            UUID          REFERENCES companies(id),
  contact_id            UUID          REFERENCES contacts(id),

  -- 流入経路
  lead_source_id        UUID          REFERENCES lead_sources(id),

  -- ステージ・ステータス・温度感
  stage_id              UUID          NOT NULL REFERENCES lead_stages(id),
  status_id             UUID          NOT NULL REFERENCES lead_statuses(id),
  temperature_id        UUID          REFERENCES lead_temperatures(id),

  -- スコアリング
  score                 NUMERIC,

  -- リード固有情報
  url                   TEXT,
  phone                 VARCHAR(20),

  -- セグメント（旧 IS 拡張の引き継ぎ）
  large_segment_id      UUID          REFERENCES lead_large_segments(id),
  small_segment_id      UUID          REFERENCES lead_small_segments(id),
  primary_caller_id     UUID          REFERENCES lead_callers(id),

  -- 所有・管理
  owner_user_id         UUID          NOT NULL REFERENCES crm_users(id),

  -- Deal 昇格
  promoted_deal_id      UUID          REFERENCES deals(id) ON DELETE SET NULL,

  -- 論理削除
  deleted_at            TIMESTAMPTZ,
  deleted_by            UUID          REFERENCES crm_users(id),
  deletion_reason       TEXT,

  -- 監査
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_by            UUID          REFERENCES crm_users(id),
  last_updated_by       UUID          REFERENCES crm_users(id),

  CONSTRAINT chk_leads_lead_name_length
    CHECK (char_length(lead_name) BETWEEN 1 AND 300),
  CONSTRAINT chk_leads_company_name_length
    CHECK (company_name IS NULL OR char_length(company_name) BETWEEN 1 AND 200),
  CONSTRAINT chk_leads_url_length
    CHECK (url IS NULL OR char_length(url) <= 500),
  CONSTRAINT chk_leads_score_range
    CHECK (score IS NULL OR score >= 0)
);

-- インデックス
CREATE INDEX idx_leads_stage        ON leads(stage_id)        WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_status       ON leads(status_id)       WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_owner        ON leads(owner_user_id)   WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_company      ON leads(company_id)      WHERE deleted_at IS NULL AND company_id IS NOT NULL;
CREATE INDEX idx_leads_contact      ON leads(contact_id)      WHERE deleted_at IS NULL AND contact_id IS NOT NULL;
CREATE INDEX idx_leads_promoted     ON leads(promoted_deal_id) WHERE deleted_at IS NULL AND promoted_deal_id IS NOT NULL;
-- Category 算出 View 用複合インデックス
CREATE INDEX idx_leads_stage_score  ON leads(stage_id, score) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE leads IS 'リード（見込み客）エンティティ（T09）';
COMMENT ON COLUMN leads.lead_name IS '表示名。企業名 or 個人名などで自由に設定';
COMMENT ON COLUMN leads.company_name IS '任意テキスト企業名（company_id が NULL の場合でも入力可能）';
COMMENT ON COLUMN leads.score IS 'リードスコア（0以上）。Server Action でscoring_rules参照してtemperature_idと連動';
COMMENT ON COLUMN leads.promoted_deal_id IS 'Lead→Deal昇格後に設定。ON DELETE SET NULLで Deal物理削除時も無効化可能';

-- ------------------------------------------------------------
-- 共通関数: is_lead_accessible
-- leads テーブル作成後に定義
-- deal の is_deal_accessible と同パターン
-- member: own leads のみ / manager/admin: 全件
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_lead_accessible(p_lead_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM leads l
    WHERE l.id = p_lead_id
      AND l.deleted_at IS NULL
      AND (is_manager_or_above() OR l.owner_user_id = auth.uid())
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION is_lead_accessible(UUID) IS 'lead拡張テーブルのRLS共通判定。親leadが生きていてオーナー/マネージャー以上ならアクセス可';

-- ------------------------------------------------------------
-- J04: lead_campaigns（Lead×Campaign 中間テーブル）
-- leads 作成後に定義（leads FK が必要なため）
-- ------------------------------------------------------------
CREATE TABLE lead_campaigns (
  lead_id         UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  campaign_id     UUID        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (lead_id, campaign_id)
);

CREATE INDEX idx_lead_campaigns_campaign ON lead_campaigns(campaign_id);

COMMENT ON TABLE lead_campaigns IS 'リード×キャンペーン 中間テーブル（J04）';

-- ============================================================
-- RLS
-- leads: is_lead_accessible ヘルパーで CRUD 制御
-- lead_campaigns: 親 lead へのアクセス権を委譲
-- ============================================================

ALTER TABLE leads          ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_campaigns ENABLE ROW LEVEL SECURITY;

-- leads
CREATE POLICY leads_select ON leads
  FOR SELECT TO authenticated
  USING (is_manager_or_above() OR owner_user_id = auth.uid());

CREATE POLICY leads_insert ON leads
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid() OR is_manager_or_above());

CREATE POLICY leads_update ON leads
  FOR UPDATE TO authenticated
  USING (is_manager_or_above() OR owner_user_id = auth.uid())
  WITH CHECK (is_manager_or_above() OR owner_user_id = auth.uid());

CREATE POLICY leads_delete ON leads
  FOR DELETE TO authenticated
  USING (is_manager_or_above() OR owner_user_id = auth.uid());

-- lead_campaigns
CREATE POLICY lead_campaigns_select ON lead_campaigns
  FOR SELECT TO authenticated USING (is_lead_accessible(lead_id));
CREATE POLICY lead_campaigns_insert ON lead_campaigns
  FOR INSERT TO authenticated WITH CHECK (is_lead_accessible(lead_id));
CREATE POLICY lead_campaigns_delete ON lead_campaigns
  FOR DELETE TO authenticated USING (is_lead_accessible(lead_id));
