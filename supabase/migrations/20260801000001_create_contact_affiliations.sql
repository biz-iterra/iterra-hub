-- ============================================================
-- T22: contact_affiliations（連絡先の所属履歴）
--
-- 名刺は「ある時点における、その人の所属のスナップショット」である。
-- 人は変わらないが所属は変わるため、会社・部署・役職を時系列で持つ。
-- 設計: docs/contact-identity.md § 3.1
--
-- contacts.company_id / department / job_title は is_current = true の
-- 行のキャッシュとして残す（既存の画面・検索・RLS を壊さないため）。
-- 正本はこのテーブルで、キャッシュの更新は DB 関数の中でのみ行う。
-- ============================================================

CREATE TABLE contact_affiliations (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id        UUID        NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  company_id        UUID        REFERENCES companies(id),
  -- 法人を特定できない名刺のために、書かれていた会社名を残す
  company_name_raw  TEXT,
  department        TEXT,
  job_title         TEXT,
  -- 在籍を確認できた最古の日（名刺交換日）。不明なら NULL
  started_on        DATE,
  -- 次の所属が判明した時点で入る。在籍中は NULL
  ended_on          DATE,
  is_current        BOOLEAN     NOT NULL DEFAULT FALSE,
  source            TEXT        NOT NULL DEFAULT 'manual'
                    CHECK (source IN ('business_card', 'manual', 'email', 'import')),
  -- どの名刺に由来するか辿れるように（lead_import_records.id 等）
  source_record_id  UUID,
  created_by        UUID        REFERENCES crm_users(id),
  last_updated_by   UUID        REFERENCES crm_users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 会社も会社名も無い所属は情報として成立しない
  CONSTRAINT chk_contact_affiliations_company
    CHECK (company_id IS NOT NULL OR NULLIF(btrim(COALESCE(company_name_raw, '')), '') IS NOT NULL),

  -- 在籍期間の前後が逆転しないこと
  CONSTRAINT chk_contact_affiliations_period
    CHECK (started_on IS NULL OR ended_on IS NULL OR ended_on >= started_on)
);

-- 現在の所属は 1 人 1 つ。兼務は扱わない（docs/contact-identity.md § 11）
CREATE UNIQUE INDEX uq_contact_affiliations_current
  ON contact_affiliations (contact_id) WHERE is_current;

CREATE INDEX idx_contact_affiliations_contact ON contact_affiliations (contact_id);
CREATE INDEX idx_contact_affiliations_company ON contact_affiliations (company_id);

CREATE TRIGGER trg_contact_affiliations_updated_at
  BEFORE UPDATE ON contact_affiliations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- RLS — 親 contacts.owner_user_id ベース（従属テーブルの規約）
--
-- 履歴だが UPDATE を許可する。ended_on / is_current の更新が要るため。
-- DELETE は admin のみ（誤記録の修正用）。
-- ============================================================

ALTER TABLE contact_affiliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY contact_affiliations_select ON contact_affiliations
  FOR SELECT TO authenticated
  USING (
    is_manager_or_above()
    OR EXISTS (
      SELECT 1 FROM contacts c
       WHERE c.id = contact_affiliations.contact_id AND c.owner_user_id = auth.uid()
    )
  );

CREATE POLICY contact_affiliations_insert ON contact_affiliations
  FOR INSERT TO authenticated
  WITH CHECK (
    is_manager_or_above()
    OR EXISTS (
      SELECT 1 FROM contacts c
       WHERE c.id = contact_affiliations.contact_id AND c.owner_user_id = auth.uid()
    )
  );

CREATE POLICY contact_affiliations_update ON contact_affiliations
  FOR UPDATE TO authenticated
  USING (
    is_manager_or_above()
    OR EXISTS (
      SELECT 1 FROM contacts c
       WHERE c.id = contact_affiliations.contact_id AND c.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    is_manager_or_above()
    OR EXISTS (
      SELECT 1 FROM contacts c
       WHERE c.id = contact_affiliations.contact_id AND c.owner_user_id = auth.uid()
    )
  );

CREATE POLICY contact_affiliations_delete ON contact_affiliations
  FOR DELETE TO authenticated
  USING (is_admin());

COMMENT ON TABLE contact_affiliations IS
  '連絡先の所属履歴。名刺交換日を started_on として時系列で持つ。contacts の会社・部署・役職はこのテーブルの is_current 行のキャッシュ';
