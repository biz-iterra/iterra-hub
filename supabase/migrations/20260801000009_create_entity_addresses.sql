-- ============================================================
-- 住所を共通マスタにし、連絡先・法人情報・取引先から紐づける
--
-- これまで住所は contacts / companies に 5 カラムずつ重複して持ち、
-- 追加住所は other_addresses が別に持っていた（leads / business_cards だけが
-- addresses を参照していた）。同じ概念が 3 か所に散っている状態だった。
--
-- addresses を住所そのもののマスタとし、entity_addresses が
-- 「誰のどの住所か」を持つ。1 つの相手が本社・支店・請求先を持てる。
--
-- 移行対象のデータは 0 件（contacts / companies の住所カラム、other_addresses
-- とも実データなし）なので、値の移送は不要。
-- ============================================================

-- 住所の原文。名刺のように 1 行でしか取れない住所を保持する用途で
-- addresses には既に raw_text がある
CREATE TABLE entity_addresses (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  address_id      UUID        NOT NULL REFERENCES addresses(id) ON DELETE CASCADE,

  -- 紐づく相手。いずれか 1 つだけを埋める
  contact_id      UUID        REFERENCES contacts(id)  ON DELETE CASCADE,
  company_id      UUID        REFERENCES companies(id) ON DELETE CASCADE,
  account_id      UUID        REFERENCES accounts(id)  ON DELETE CASCADE,

  label           TEXT        NOT NULL DEFAULT 'main'
                  CHECK (label IN ('main', 'billing', 'shipping', 'branch', 'home', 'other')),
  -- 主住所。相手ごとに 1 件
  is_primary      BOOLEAN     NOT NULL DEFAULT FALSE,

  -- その拠点の連絡先（本社と支店で電話が違うため住所側に持つ）
  phone           VARCHAR(20),
  fax             VARCHAR(20),
  memo            TEXT,

  created_by      UUID        REFERENCES crm_users(id),
  last_updated_by UUID        REFERENCES crm_users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_entity_addresses_owner
    CHECK (num_nonnulls(contact_id, company_id, account_id) = 1)
);

-- 主住所は相手ごとに 1 件
CREATE UNIQUE INDEX uq_entity_addresses_primary_contact
  ON entity_addresses (contact_id) WHERE is_primary AND contact_id IS NOT NULL;
CREATE UNIQUE INDEX uq_entity_addresses_primary_company
  ON entity_addresses (company_id) WHERE is_primary AND company_id IS NOT NULL;
CREATE UNIQUE INDEX uq_entity_addresses_primary_account
  ON entity_addresses (account_id) WHERE is_primary AND account_id IS NOT NULL;

CREATE INDEX idx_entity_addresses_address ON entity_addresses (address_id);
CREATE INDEX idx_entity_addresses_contact ON entity_addresses (contact_id);
CREATE INDEX idx_entity_addresses_company ON entity_addresses (company_id);
CREATE INDEX idx_entity_addresses_account ON entity_addresses (account_id);

CREATE TRIGGER trg_entity_addresses_updated_at
  BEFORE UPDATE ON entity_addresses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ------------------------------------------------------------
-- 紐付けが消えたら住所も片付ける
--
-- 住所は共有できる構造だが、UI では相手ごとに作る。どこからも参照されなく
-- なった住所を残すと、住所マスタが孤児で膨らむ。
-- leads / business_cards も addresses を指しているので、そちらを確認してから消す
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION cleanup_orphan_address()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM entity_addresses WHERE address_id = OLD.address_id)
     AND NOT EXISTS (SELECT 1 FROM leads WHERE address_id = OLD.address_id)
     AND NOT EXISTS (SELECT 1 FROM business_cards WHERE address_id = OLD.address_id) THEN
    DELETE FROM addresses WHERE id = OLD.address_id;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_entity_addresses_cleanup
  AFTER DELETE ON entity_addresses
  FOR EACH ROW EXECUTE FUNCTION cleanup_orphan_address();

-- ------------------------------------------------------------
-- 主住所が空にならないようにする
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION promote_next_entity_address()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.is_primary THEN
    UPDATE entity_addresses SET is_primary = TRUE
     WHERE id = (
       SELECT id FROM entity_addresses
        WHERE (OLD.contact_id IS NOT NULL AND contact_id = OLD.contact_id)
           OR (OLD.company_id IS NOT NULL AND company_id = OLD.company_id)
           OR (OLD.account_id IS NOT NULL AND account_id = OLD.account_id)
        ORDER BY created_at LIMIT 1
     );
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_entity_addresses_promote_next
  AFTER DELETE ON entity_addresses
  FOR EACH ROW EXECUTE FUNCTION promote_next_entity_address();

-- ------------------------------------------------------------
-- 主住所の切り替え（落としてから立てる）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_primary_entity_address(p_id UUID, p_actor UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row entity_addresses%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM entity_addresses WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '住所が見つかりません';
  END IF;

  UPDATE entity_addresses SET is_primary = FALSE
   WHERE id <> p_id
     AND is_primary
     AND ((v_row.contact_id IS NOT NULL AND contact_id = v_row.contact_id)
       OR (v_row.company_id IS NOT NULL AND company_id = v_row.company_id)
       OR (v_row.account_id IS NOT NULL AND account_id = v_row.account_id));

  UPDATE entity_addresses
     SET is_primary = TRUE, last_updated_by = COALESCE(p_actor, last_updated_by)
   WHERE id = p_id;
END;
$$;

-- ------------------------------------------------------------
-- 住所の登録（住所本体と紐付けを 1 トランザクションで作る）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION add_entity_address(
  p_owner_type    TEXT,   -- 'contact' | 'company' | 'account'
  p_owner_id      UUID,
  p_postal_code   TEXT,
  p_prefecture    TEXT,
  p_city          TEXT,
  p_address_line1 TEXT,
  p_address_line2 TEXT,
  p_label         TEXT DEFAULT 'main',
  p_phone         TEXT DEFAULT NULL,
  p_fax           TEXT DEFAULT NULL,
  p_memo          TEXT DEFAULT NULL,
  p_actor         UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_address_id UUID;
  v_link_id    UUID;
  v_has_any    BOOLEAN;
BEGIN
  IF p_owner_type NOT IN ('contact', 'company', 'account') THEN
    RAISE EXCEPTION '紐づけ先の種別が不正です: %', p_owner_type;
  END IF;

  INSERT INTO addresses (
    postal_code, prefecture, city, address_line1, address_line2,
    created_by, last_updated_by
  ) VALUES (
    NULLIF(btrim(COALESCE(p_postal_code, '')), ''),
    NULLIF(btrim(COALESCE(p_prefecture, '')), ''),
    NULLIF(btrim(COALESCE(p_city, '')), ''),
    NULLIF(btrim(COALESCE(p_address_line1, '')), ''),
    NULLIF(btrim(COALESCE(p_address_line2, '')), ''),
    p_actor, p_actor
  ) RETURNING id INTO v_address_id;

  -- 1 件目なら主住所にする
  SELECT EXISTS (
    SELECT 1 FROM entity_addresses
     WHERE (p_owner_type = 'contact' AND contact_id = p_owner_id)
        OR (p_owner_type = 'company' AND company_id = p_owner_id)
        OR (p_owner_type = 'account' AND account_id = p_owner_id)
  ) INTO v_has_any;

  INSERT INTO entity_addresses (
    address_id, contact_id, company_id, account_id,
    label, is_primary, phone, fax, memo, created_by, last_updated_by
  ) VALUES (
    v_address_id,
    CASE WHEN p_owner_type = 'contact' THEN p_owner_id END,
    CASE WHEN p_owner_type = 'company' THEN p_owner_id END,
    CASE WHEN p_owner_type = 'account' THEN p_owner_id END,
    p_label, NOT v_has_any,
    NULLIF(btrim(COALESCE(p_phone, '')), ''),
    NULLIF(btrim(COALESCE(p_fax, '')), ''),
    NULLIF(btrim(COALESCE(p_memo, '')), ''),
    p_actor, p_actor
  ) RETURNING id INTO v_link_id;

  RETURN v_link_id;
END;
$$;

-- ============================================================
-- RLS — 紐づく相手の owner_user_id に従う
-- ============================================================

ALTER TABLE entity_addresses ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_entity_address_accessible(
  p_contact_id UUID, p_company_id UUID, p_account_id UUID
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT is_manager_or_above()
      OR EXISTS (SELECT 1 FROM contacts  c WHERE c.id = p_contact_id AND c.owner_user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM companies c WHERE c.id = p_company_id AND c.owner_user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM accounts  a WHERE a.id = p_account_id AND a.owner_user_id = auth.uid());
$$;

CREATE POLICY entity_addresses_select ON entity_addresses
  FOR SELECT TO authenticated
  USING (is_entity_address_accessible(contact_id, company_id, account_id));

CREATE POLICY entity_addresses_insert ON entity_addresses
  FOR INSERT TO authenticated
  WITH CHECK (is_entity_address_accessible(contact_id, company_id, account_id));

CREATE POLICY entity_addresses_update ON entity_addresses
  FOR UPDATE TO authenticated
  USING (is_entity_address_accessible(contact_id, company_id, account_id))
  WITH CHECK (is_entity_address_accessible(contact_id, company_id, account_id));

CREATE POLICY entity_addresses_delete ON entity_addresses
  FOR DELETE TO authenticated
  USING (is_entity_address_accessible(contact_id, company_id, account_id));

COMMENT ON TABLE entity_addresses IS
  '住所の紐付け。addresses（住所そのもの）を連絡先・法人情報・取引先に結び、本社/支店/請求先を区別する';
