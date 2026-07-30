-- ============================================================
-- addresses: 住所を共通テーブルとして切り出す
--
-- 背景:
--   companies / contacts に同じ住所 5 カラムが重複している。
--   Lead に住所を持たせるにあたって同じ重複を 3 つ目に増やさないため、
--   構造が確定した共通項として独立テーブルにする。
--
--   まず leads から使い始め、companies / contacts の移行は別フェーズとする
--   （本番稼働中のため一度に変えない）。
--
-- 昇格時の利点:
--   promote_lead_to_deal で値をコピーするのではなく address_id を
--   companies へ引き継ぐだけで済む。
-- ============================================================

CREATE TABLE addresses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  postal_code     TEXT,
  prefecture      TEXT,
  city            TEXT,
  address_line1   TEXT,
  address_line2   TEXT,
  -- 名刺の住所は 1 列に都道府県〜建物名までまとまっており、
  -- 都道府県が省略されている行がある（Eight 実データで 35/839）。
  -- 分割に失敗しても情報を失わないよう原文を必ず保持する。
  raw_text        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES crm_users(id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_updated_by UUID REFERENCES crm_users(id)
);

COMMENT ON TABLE addresses IS '住所の共通テーブル。leads から参照する（companies/contacts は別フェーズで移行）';
COMMENT ON COLUMN addresses.raw_text IS '分割前の原文。パース失敗時の復旧と手動補正の根拠に使う';

CREATE TRIGGER addresses_updated_at
  BEFORE UPDATE ON addresses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ------------------------------------------------------------
-- leads への参照追加
-- ------------------------------------------------------------
ALTER TABLE leads ADD COLUMN address_id UUID REFERENCES addresses(id);

COMMENT ON COLUMN leads.address_id IS '住所（addresses）。Opportunity 昇格時に companies へ引き継ぐ';

CREATE INDEX leads_address_id_idx ON leads(address_id) WHERE address_id IS NOT NULL;

-- ------------------------------------------------------------
-- RLS
--
-- 住所単体では誰の住所か分からないが、全件 SELECT できると顧客の住所一覧に
-- なるため、参照元 lead の可視性に従わせる（従属テーブルの規約）。
--
-- lead に紐づく前の行（取込トランザクション中の中間状態）は作成者本人のみ
-- 参照できるようにして、INSERT → leads.address_id 設定の順序を許容する。
-- ------------------------------------------------------------
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY addresses_select ON addresses
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM leads l
      WHERE l.address_id = addresses.id
        AND is_lead_accessible(l.id)
    )
    -- まだどの lead からも参照されていない行は作成者のみ
    OR (
      created_by = auth.uid()
      AND NOT EXISTS (SELECT 1 FROM leads l2 WHERE l2.address_id = addresses.id)
    )
  );

CREATE POLICY addresses_insert ON addresses
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY addresses_update ON addresses
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM leads l
      WHERE l.address_id = addresses.id
        AND is_lead_accessible(l.id)
    )
  );

-- 住所の削除は行わない（参照元が消えても履歴として残す）。
-- 物理削除禁止の方針に合わせ DELETE ポリシーは作らない。
