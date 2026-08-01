-- ============================================================
-- T22: business_cards（名刺）
--
-- 名刺 1 枚を 1 行として持ち、**その名刺のメールアドレス・電話番号の行に紐づける**。
--
-- 背景:
--   当初は名刺交換日を在籍期間の起点として所属履歴を組んだが、Eight の
--   「名刺交換日」は**利用者が Eight にデータを登録した日**であり、名刺情報の
--   変更日でも在籍期間でもない。2020 年にもらった前職の名刺を今日まとめて
--   登録すれば、それが最新の所属として採用されてしまう。
--
--   日付を所属の順序の根拠にはできない。代わりに、所属の裏付けになるのは
--   **会社ドメインを含むメールアドレス**と電話番号そのものである。
--   そこで所属（会社・部署・役職）は名刺の属性として持ち、名刺は連絡手段に紐づける。
--
-- 現在の所属（contacts.company_id / department / job_title）は
-- **名刺の取込では自動で切り替えない。** 人が名刺を選んで反映する
-- （apply_business_card_as_current）。
--
-- 設計: docs/contact-identity.md
-- ============================================================

CREATE TABLE business_cards (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id           UUID        NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,

  -- この名刺の連絡手段。会社ドメインのメールが所属の裏付けになる。
  -- 連絡先の統合で行が付け替わっても、名刺は同じ連絡手段を指したままになる
  contact_email_id     UUID        REFERENCES contact_emails(id) ON DELETE SET NULL,
  contact_phone_id     UUID        REFERENCES contact_phones(id) ON DELETE SET NULL,

  -- 名刺に書かれていた所属
  company_id           UUID        REFERENCES companies(id),
  company_name_raw     TEXT,
  department           TEXT,
  job_title            TEXT,
  address_id           UUID        REFERENCES addresses(id),

  source               TEXT        NOT NULL DEFAULT 'manual'
                       CHECK (source IN ('eight', 'manual', 'import')),
  -- 取込元での一意キー。再取込しても名刺が増えないようにする
  source_external_key  TEXT,
  -- **取込元にこのデータを登録した日。在籍期間でも名刺交換日でもない。**
  -- 名前で誤用を防ぐ。順序の根拠には使わない
  source_registered_on DATE,

  -- 現在の所属として採用している名刺。人が選ぶ（contact ごとに 1 枚）
  is_primary           BOOLEAN     NOT NULL DEFAULT FALSE,

  created_by           UUID        REFERENCES crm_users(id),
  last_updated_by      UUID        REFERENCES crm_users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 会社も会社名も無い名刺は所属の情報として成立しない
  CONSTRAINT chk_business_cards_company
    CHECK (company_id IS NOT NULL OR NULLIF(btrim(COALESCE(company_name_raw, '')), '') IS NOT NULL)
);

-- 同じ取込元の同じ名刺は 1 行だけ
CREATE UNIQUE INDEX uq_business_cards_source_key
  ON business_cards (source, source_external_key)
  WHERE source_external_key IS NOT NULL;

-- 現在の所属として採用する名刺は 1 人 1 枚
CREATE UNIQUE INDEX uq_business_cards_primary
  ON business_cards (contact_id) WHERE is_primary;

CREATE INDEX idx_business_cards_contact ON business_cards (contact_id);
CREATE INDEX idx_business_cards_company ON business_cards (company_id);
CREATE INDEX idx_business_cards_email   ON business_cards (contact_email_id);
CREATE INDEX idx_business_cards_phone   ON business_cards (contact_phone_id);

CREATE TRIGGER trg_business_cards_updated_at
  BEFORE UPDATE ON business_cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- RLS — 親 contacts.owner_user_id ベース（従属テーブルの規約）
-- ============================================================

ALTER TABLE business_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY business_cards_select ON business_cards
  FOR SELECT TO authenticated
  USING (
    is_manager_or_above()
    OR EXISTS (
      SELECT 1 FROM contacts c
       WHERE c.id = business_cards.contact_id AND c.owner_user_id = auth.uid()
    )
  );

CREATE POLICY business_cards_insert ON business_cards
  FOR INSERT TO authenticated
  WITH CHECK (
    is_manager_or_above()
    OR EXISTS (
      SELECT 1 FROM contacts c
       WHERE c.id = business_cards.contact_id AND c.owner_user_id = auth.uid()
    )
  );

CREATE POLICY business_cards_update ON business_cards
  FOR UPDATE TO authenticated
  USING (
    is_manager_or_above()
    OR EXISTS (
      SELECT 1 FROM contacts c
       WHERE c.id = business_cards.contact_id AND c.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    is_manager_or_above()
    OR EXISTS (
      SELECT 1 FROM contacts c
       WHERE c.id = business_cards.contact_id AND c.owner_user_id = auth.uid()
    )
  );

CREATE POLICY business_cards_delete ON business_cards
  FOR DELETE TO authenticated
  USING (is_admin());

COMMENT ON TABLE business_cards IS
  '名刺。所属（会社・部署・役職）を名刺の属性として持ち、その名刺のメール・電話の行に紐づける。source_registered_on は取込元への登録日で在籍期間ではない';

COMMENT ON COLUMN business_cards.source_registered_on IS
  '取込元にデータを登録した日。名刺交換日でも在籍開始日でもないため、所属の順序の根拠には使わない';

-- ============================================================
-- 現在の所属として採用する
--
-- **人が選んだときだけ動く。** 取込では呼ばない。
-- 名刺の登録日は当てにならないため、機械的に最新を採ることをしない。
-- ============================================================
CREATE OR REPLACE FUNCTION apply_business_card_as_current(
  p_card_id UUID,
  p_actor   UUID DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_card    business_cards%ROWTYPE;
  v_contact contacts%ROWTYPE;
BEGIN
  SELECT * INTO v_card FROM business_cards WHERE id = p_card_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '名刺が見つかりません';
  END IF;

  SELECT * INTO v_contact FROM contacts WHERE id = v_card.contact_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '連絡先が見つかりません';
  END IF;

  -- 一意インデックス（is_primary は 1 人 1 枚）があるので先に落とす
  UPDATE business_cards SET is_primary = FALSE
   WHERE contact_id = v_card.contact_id AND is_primary AND id <> p_card_id;

  UPDATE business_cards SET is_primary = TRUE, last_updated_by = COALESCE(p_actor, last_updated_by)
   WHERE id = p_card_id;

  UPDATE contacts
     SET company_id = v_card.company_id,
         department = v_card.department,
         job_title  = v_card.job_title,
         -- 代表者は代表者のまま。所属先が付いた一般社員だけ employee にする
         contact_type = CASE
           WHEN v_contact.contact_type = 'corporate_rep' THEN v_contact.contact_type
           WHEN v_card.company_id IS NOT NULL THEN 'employee'
           ELSE v_contact.contact_type
         END,
         last_updated_by = COALESCE(p_actor, last_updated_by)
   WHERE id = v_card.contact_id;
END;
$$;

COMMENT ON FUNCTION apply_business_card_as_current(UUID, UUID) IS
  '名刺の所属を連絡先の現在の所属として反映する。人の操作からのみ呼ぶ';
