-- ============================================================
-- 取引先区分（顧客 / 販売パートナー / 技術パートナー / 仕入れ先 / 外注先）
--
-- 背景:
--   既存の account_types は「法人 / 個人事業主 / 官公庁・自治体」で、
--   これは事業体の形態を表す軸。「顧客か仕入れ先か」は取引上の役割で
--   軸が違うため、同じマスタに混ぜると
--     - 「法人かつ顧客」が表せない
--     - 契約時の種別自動判定（法人 / 個人事業主）が壊れる
--   ことになる。別マスタに分ける。
--
--   1 社が顧客でも仕入れ先でもあることは実務で起きるため N:M にする。
--
-- パイプライン連動:
--   account_role_types.pipeline_type_id を持たせ、契約が成立したときに
--   その商談のパイプラインに対応する区分を自動で付与する。
--     営業パイプラインで契約   → 顧客
--     仕入れパイプラインで契約 → 仕入れ先
--     業務委託パイプラインで契約 → 外注先
--   販売／技術パートナーはパイプラインを持たず、手動で付ける。
-- ============================================================

-- ------------------------------------------------------------
-- M: account_role_types（取引先区分マスタ）
-- ------------------------------------------------------------
CREATE TABLE account_role_types (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code             VARCHAR(32) NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  definition       TEXT,
  -- バッジ色。ステータス系マスタと同じ #RRGGBB 形式で揃える
  color            TEXT,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  -- この区分を自動付与する取引パイプライン。NULL は手動付与のみ
  pipeline_type_id UUID REFERENCES pipeline_types(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID REFERENCES crm_users(id),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_updated_by  UUID REFERENCES crm_users(id),
  deleted_at       TIMESTAMPTZ,
  deleted_by       UUID REFERENCES crm_users(id),
  deletion_reason  TEXT,

  CONSTRAINT account_role_types_code_format_check
    CHECK (code ~ '^[a-z][a-z0-9_]{0,31}$'),
  CONSTRAINT account_role_types_color_format_check
    CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$')
);

-- 1 パイプラインに自動付与される区分は 1 つに限る。
-- 複数あると契約時にどれを付けるかが呼び出し順で変わる
CREATE UNIQUE INDEX account_role_types_pipeline_key
  ON account_role_types(pipeline_type_id)
  WHERE pipeline_type_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON TABLE account_role_types IS '取引先区分マスタ。取引上の役割（顧客・パートナー・仕入れ先等）。事業体の形態を表す account_types とは軸が違う';
COMMENT ON COLUMN account_role_types.pipeline_type_id IS 'この区分を契約成立時に自動付与するパイプライン。NULL は手動付与のみ';

CREATE TRIGGER trg_account_role_types_updated_at
  BEFORE UPDATE ON account_role_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- マスタ共通の RLS（SELECT は認証済み全員、CUD は admin のみ）
ALTER TABLE account_role_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY account_role_types_select ON account_role_types
  FOR SELECT TO authenticated USING (true);
CREATE POLICY account_role_types_insert ON account_role_types
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY account_role_types_update ON account_role_types
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY account_role_types_delete ON account_role_types
  FOR DELETE TO authenticated USING (is_admin());

-- ------------------------------------------------------------
-- J: account_roles（取引先 × 区分）
-- ------------------------------------------------------------
CREATE TABLE account_roles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  role_type_id  UUID NOT NULL REFERENCES account_role_types(id),
  -- 契約成立で自動付与されたものか、担当者が手で付けたものか。
  -- 自動付与を誤って消した場合に区別できるようにする
  assigned_by_contract BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES crm_users(id),

  CONSTRAINT account_roles_unique UNIQUE (account_id, role_type_id)
);

CREATE INDEX account_roles_account_idx ON account_roles(account_id);
CREATE INDEX account_roles_type_idx    ON account_roles(role_type_id);

COMMENT ON TABLE account_roles IS '取引先が持つ区分。1 社が顧客かつ仕入れ先といった重複を許す';
COMMENT ON COLUMN account_roles.assigned_by_contract IS '契約成立で自動付与されたか。手動付与と区別する';

-- 親 accounts の可視性・編集権限を引き継ぐ（従属テーブルの規約）
ALTER TABLE account_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY account_roles_select ON account_roles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM accounts a
       WHERE a.id = account_roles.account_id
         AND (is_manager_or_above() OR a.owner_user_id = auth.uid())
    )
  );

CREATE POLICY account_roles_insert ON account_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM accounts a
       WHERE a.id = account_roles.account_id
         AND (is_admin() OR a.owner_user_id = auth.uid())
    )
  );

CREATE POLICY account_roles_delete ON account_roles
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM accounts a
       WHERE a.id = account_roles.account_id
         AND (is_admin() OR a.owner_user_id = auth.uid())
    )
  );

-- ------------------------------------------------------------
-- 初期値
--
-- 色は §16.2 の意味カテゴリに寄せる:
--   顧客 = 成功/完了のセージ、パートナー = 進行のティール／シアン、
--   仕入れ・外注 = 交渉のアンバー系
-- ------------------------------------------------------------
INSERT INTO account_role_types (code, name, definition, color, sort_order, pipeline_type_id) VALUES
  ('customer',      '顧客',           '自社がサービスを提供する相手',           '#4D7A65', 1,
    (SELECT id FROM pipeline_types WHERE name = '営業'     AND deleted_at IS NULL LIMIT 1)),
  ('sales_partner', '販売パートナー', '販売代理・取次を担う相手',               '#0F766E', 2, NULL),
  ('tech_partner',  '技術パートナー', '開発・施工など技術面を担う相手',         '#0E7490', 3, NULL),
  ('supplier',      '仕入れ先',       '物品・サービスの購入先',                 '#B88A2E', 4,
    (SELECT id FROM pipeline_types WHERE name = '仕入れ'   AND deleted_at IS NULL LIMIT 1)),
  ('subcontractor', '外注先',         '業務を委託する相手',                     '#C2703A', 5,
    (SELECT id FROM pipeline_types WHERE name = '業務委託' AND deleted_at IS NULL LIMIT 1))
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------------------
-- 契約成立時の区分付与
--
-- 20260731000007 のトリガー関数を差し替える。
-- 変更点: 取引先を作る／作らないに関わらず、契約した商談のパイプラインに
--         対応する区分を必ず付与する。
--         既に顧客として登録済みの取引先と仕入れ契約を結んだ場合に
--         「顧客 + 仕入れ先」になるのが狙い。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION ensure_account_on_contract() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deal       deals%ROWTYPE;
  v_company    companies%ROWTYPE;
  v_contact    contacts%ROWTYPE;
  v_account_id UUID;
  v_type_id    UUID;
  v_status_id  UUID;
  v_role_id    UUID;
  v_name       TEXT;
  v_actor      UUID := COALESCE(auth.uid(), NEW.created_by, NEW.registered_by);
BEGIN
  IF NEW.deal_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_deal FROM deals WHERE id = NEW.deal_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_account_id := v_deal.account_id;

  -- ── 取引先が未作成なら作る ────────────────────────────────────────────────
  IF v_account_id IS NULL THEN
    IF v_deal.company_id IS NOT NULL THEN
      SELECT * INTO v_company FROM companies WHERE id = v_deal.company_id;
    END IF;
    IF v_deal.contact_id IS NOT NULL THEN
      SELECT * INTO v_contact FROM contacts WHERE id = v_deal.contact_id;
    END IF;

    -- 取引先名は法人名を優先し、個人取引なら担当者名を使う
    v_name := COALESCE(
      v_company.name,
      NULLIF(btrim(COALESCE(v_contact.last_name, '') || ' ' || COALESCE(v_contact.first_name, '')), ''),
      v_deal.name
    );

    IF v_name IS NULL THEN
      -- 相手を特定できないまま取引先は作れない。契約自体は成立させる
      RETURN NEW;
    END IF;

    SELECT id INTO v_type_id FROM account_types
     WHERE slug = CASE WHEN v_deal.company_id IS NOT NULL THEN 'corporate' ELSE 'sole_proprietor' END
       AND deleted_at IS NULL
     LIMIT 1;

    SELECT id INTO v_status_id FROM account_statuses
     WHERE name = 'アクティブ' AND deleted_at IS NULL LIMIT 1;
    IF v_status_id IS NULL THEN
      SELECT id INTO v_status_id FROM account_statuses
       WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;
    END IF;
    IF v_status_id IS NULL THEN
      RAISE EXCEPTION 'account_statuses が未投入です';
    END IF;

    INSERT INTO accounts (
      name, company_id, account_type_id, account_status_id,
      lead_source_id, owner_user_id, created_by
    ) VALUES (
      v_name, v_deal.company_id, v_type_id, v_status_id,
      v_company.lead_source_id, COALESCE(v_deal.owner_user_id, v_actor), v_actor
    ) RETURNING id INTO v_account_id;

    -- 商談の相手担当者をそのまま取引先の主担当にする
    IF v_deal.contact_id IS NOT NULL THEN
      INSERT INTO account_contacts (account_id, contact_id, role)
      VALUES (v_account_id, v_deal.contact_id, 'primary')
      ON CONFLICT (account_id, contact_id) DO NOTHING;
    END IF;

    UPDATE deals SET account_id = v_account_id WHERE id = v_deal.id;

    -- 昇格元のリードにも取引先を記録する（リードから辿れるようにする）
    UPDATE leads
       SET promoted_account_id = v_account_id
     WHERE promoted_deal_id = v_deal.id
       AND promoted_account_id IS NULL;
  END IF;

  -- ── 区分の付与 ────────────────────────────────────────────────────────────
  -- 取引先が既にあった場合もここは通す。
  -- 顧客として登録済みの相手と仕入れ契約を結べば「顧客 + 仕入れ先」になる
  SELECT id INTO v_role_id FROM account_role_types
   WHERE pipeline_type_id = v_deal.pipeline_type_id
     AND deleted_at IS NULL
   LIMIT 1;

  IF v_role_id IS NOT NULL AND v_account_id IS NOT NULL THEN
    INSERT INTO account_roles (account_id, role_type_id, assigned_by_contract, created_by)
    VALUES (v_account_id, v_role_id, TRUE, v_actor)
    ON CONFLICT (account_id, role_type_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION ensure_account_on_contract() IS
  '契約の登録時に、取引先が未作成なら作って紐付け、商談のパイプラインに対応する取引先区分を付与する。契約と同一トランザクションで実行される';
