-- ============================================================
-- 連携プロファイル（事業者情報 × 連携先）
--
-- 背景（2026-08-06 の指摘）:
--   freee へ渡す担当者メールは「主担当の連絡先の is_primary なメール 1 件」で
--   決まる。`is_primary` は連絡先に 1 つしか立たないため、同じ人が 2 社の
--   主担当だと**両社に同じメールが渡る**。会社ごとにメールを使い分けている
--   場合、片方は必ず差分として残り、突合が終わらない。
--
--   さらに利用者の指摘: **今後 API 連携する項目は増える。項目が増えるたびに
--   列を足して回るのは本質的でない。** 基本情報とは別に「連携用のプロファイル」
--   を持ち、既定は基本情報から導出しつつ、後から変更できる形にしたい。
--
-- 方針（利用者判断）:
--   **値ではなくレコードを選ぶ。** CRM が正本のままで、CRM を直せば連携値も
--   追随する。値を持たせると二重管理になり、どちらが正かを毎回判断することになる。
--
--   freee へ渡す CRM 側の値は「主」を 1 つ選んでいる従属レコードに集中している
--   （担当者・メール・住所・口座・電話）。そこを 1 つの表にまとめれば、
--   連携先が増えても行が増えるだけで済む。
--
--   **すべての列で NULL は「既定に従う」を意味する。** 表が空でも今までと
--   同じ値が出るので、移行は要らない。
-- ============================================================

CREATE TABLE company_integration_profiles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- 連携先。増えたら CHECK に足す（表は増やさない）
  integration TEXT NOT NULL CHECK (integration IN ('freee')),

  -- 以下すべて NULL = 既定に従う。
  -- **ON DELETE SET NULL。** 元のレコードを消したら既定へ戻る（連携が止まらない）
  /** 担当者。既定は companies.primary_contact_id */
  contact_id              UUID REFERENCES contacts(id)         ON DELETE SET NULL,
  /** 担当者メール。既定は担当者の主メール */
  contact_email_id        UUID REFERENCES contact_emails(id)   ON DELETE SET NULL,
  /** 住所。既定は主住所 */
  entity_address_id       UUID REFERENCES entity_addresses(id) ON DELETE SET NULL,
  /** 電話。既定は companies.phone（代表電話）。指定するとその拠点の電話を使う */
  phone_entity_address_id UUID REFERENCES entity_addresses(id) ON DELETE SET NULL,
  /** 口座。既定は主口座 */
  financial_info_id       UUID REFERENCES financial_info(id)   ON DELETE SET NULL,

  note TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES crm_users(id),
  last_updated_by UUID REFERENCES crm_users(id),

  UNIQUE (company_id, integration)
);

CREATE INDEX company_integration_profiles_company_idx
  ON company_integration_profiles(company_id);

COMMENT ON TABLE company_integration_profiles IS
'連携先へ渡す値をどのレコードから取るかの設定。全列 NULL 可で、NULL は既定（主担当・主メール・主住所・主口座・代表電話）に従う';
COMMENT ON COLUMN company_integration_profiles.phone_entity_address_id IS
'指定するとその拠点の電話を使う。NULL なら companies.phone（代表電話）';

CREATE TRIGGER trg_company_integration_profiles_updated_at
  BEFORE UPDATE ON company_integration_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_company_integration_profiles_change_log
  AFTER INSERT OR UPDATE OR DELETE ON company_integration_profiles
  FOR EACH ROW EXECUTE FUNCTION log_entity_change();

-- ------------------------------------------------------------
-- 選べる範囲を DB で縛る
--
-- **画面から任意の ID を送られても通さない。** 別人のメールや他社の口座を
-- 連携先へ渡してしまうと、会計データの取り違えになる。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_company_integration_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contact UUID;
BEGIN
  -- 担当者は、その事業者に関わる連絡先（主たる所属 + 兼務）だけ
  IF NEW.contact_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM company_contact_affiliations aff
       WHERE aff.company_id = NEW.company_id
         AND aff.contact_id = NEW.contact_id
    ) THEN
      RAISE EXCEPTION 'この連絡先は対象の事業者に関わっていません（所属か兼務の登録が要ります）';
    END IF;
  END IF;

  -- メールは「その事業者の担当者」が持つものだけ。
  -- 担当者を指定していなければ既定（companies.primary_contact_id）で判定する
  IF NEW.contact_email_id IS NOT NULL THEN
    v_contact := NEW.contact_id;
    IF v_contact IS NULL THEN
      SELECT primary_contact_id INTO v_contact FROM companies WHERE id = NEW.company_id;
    END IF;
    IF v_contact IS NULL THEN
      RAISE EXCEPTION '担当者が決まっていないため、担当者メールを選べません';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM contact_emails ce
       WHERE ce.id = NEW.contact_email_id AND ce.contact_id = v_contact
    ) THEN
      RAISE EXCEPTION 'このメールアドレスは担当者のものではありません';
    END IF;
  END IF;

  -- 住所・電話の拠点は、その事業者の住所だけ
  IF NEW.entity_address_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM entity_addresses ea
     WHERE ea.id = NEW.entity_address_id AND ea.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'この住所は対象の事業者のものではありません';
  END IF;

  IF NEW.phone_entity_address_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM entity_addresses ea
     WHERE ea.id = NEW.phone_entity_address_id AND ea.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'この拠点は対象の事業者のものではありません';
  END IF;

  -- 口座も同じ
  IF NEW.financial_info_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM financial_info f
     WHERE f.id = NEW.financial_info_id
       AND f.company_id = NEW.company_id
       AND f.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'この口座は対象の事業者のものではありません';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_company_integration_profiles_check
  BEFORE INSERT OR UPDATE ON company_integration_profiles
  FOR EACH ROW EXECUTE FUNCTION check_company_integration_profile();

COMMENT ON FUNCTION check_company_integration_profile IS
'連携プロファイルで選べるレコードを、その事業者に関わるものだけに縛る';

-- ------------------------------------------------------------
-- RLS
--
-- 参照は認証済み全員（従属テーブルの方針。20260803000008）。
-- 書き込みは事業者情報の担当者か manager 以上。
-- 引数なしの関数はスカラーサブクエリで包む（行ごとの評価を避ける）。
-- ------------------------------------------------------------
ALTER TABLE company_integration_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY company_integration_profiles_select ON company_integration_profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY company_integration_profiles_insert ON company_integration_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT is_manager_or_above())
    OR EXISTS (SELECT 1 FROM companies c
                WHERE c.id = company_integration_profiles.company_id
                  AND c.owner_user_id = (SELECT auth.uid()))
  );

CREATE POLICY company_integration_profiles_update ON company_integration_profiles
  FOR UPDATE TO authenticated
  USING (
    (SELECT is_manager_or_above())
    OR EXISTS (SELECT 1 FROM companies c
                WHERE c.id = company_integration_profiles.company_id
                  AND c.owner_user_id = (SELECT auth.uid()))
  );

CREATE POLICY company_integration_profiles_delete ON company_integration_profiles
  FOR DELETE TO authenticated
  USING (
    (SELECT is_manager_or_above())
    OR EXISTS (SELECT 1 FROM companies c
                WHERE c.id = company_integration_profiles.company_id
                  AND c.owner_user_id = (SELECT auth.uid()))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON company_integration_profiles TO authenticated;

-- ------------------------------------------------------------
-- 連携先へ渡す値を 1 か所で決める
--
-- **これまで detect_freee_partner_diffs の中に散っていた導出をここへ集めた。**
-- 連携先が増えても、渡す値の決め方はここを見れば分かる。
--
-- プロファイルが無い（または列が NULL）なら、従来どおりの「主」を返す。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION resolve_company_integration_values(
  p_company_id  UUID,
  p_integration TEXT
)
RETURNS TABLE (
  contact_id     UUID,
  contact_name   TEXT,
  contact_email  TEXT,
  phone          TEXT,
  postal_code    TEXT,
  prefecture     TEXT,
  street         TEXT,
  building       TEXT,
  bank_name      TEXT,
  branch_name    TEXT,
  account_number TEXT,
  account_holder TEXT,
  account_type   TEXT
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  p       company_integration_profiles%ROWTYPE;
  c       companies%ROWTYPE;
  v_ct    UUID;
BEGIN
  SELECT * INTO c FROM companies WHERE id = p_company_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO p FROM company_integration_profiles
   WHERE company_id = p_company_id AND integration = p_integration;

  -- 担当者。既定は主担当
  v_ct := COALESCE(p.contact_id, c.primary_contact_id);

  RETURN QUERY
  SELECT
    v_ct,
    -- 氏名は既存の部品を使う。**担当者を差し替えたときはこちらで組み立てる**
    CASE WHEN v_ct IS NOT DISTINCT FROM c.primary_contact_id
         THEN company_primary_contact_name(p_company_id)
         ELSE (SELECT NULLIF(btrim(concat_ws(' ',
                        NULLIF(btrim(COALESCE(ct.last_name, '')), ''),
                        NULLIF(btrim(COALESCE(ct.middle_name, '')), ''),
                        NULLIF(btrim(COALESCE(ct.first_name, '')), ''))), '')
                 FROM contacts ct WHERE ct.id = v_ct AND ct.deleted_at IS NULL)
    END,
    -- メール。指定があればそれ、無ければ担当者の主メール
    COALESCE(
      (SELECT ce.email FROM contact_emails ce WHERE ce.id = p.contact_email_id),
      (SELECT ce.email FROM contact_emails ce
        WHERE ce.contact_id = v_ct
        ORDER BY ce.is_primary DESC, ce.email
        LIMIT 1)
    ),
    -- 電話。拠点の指定があればその電話、無ければ代表電話。
    -- **VARCHAR の列は TEXT へ明示的に寄せる**（戻り値の型と食い違うと実行時に落ちる）
    COALESCE(
      (SELECT ea.phone FROM entity_addresses ea WHERE ea.id = p.phone_entity_address_id),
      c.phone
    )::TEXT,
    addr.postal_code::TEXT, addr.prefecture::TEXT,
    NULLIF(btrim(COALESCE(addr.city, '') || COALESCE(addr.address_line1, '')), '')::TEXT,
    addr.address_line2::TEXT,
    fin.bank_name::TEXT, fin.branch_name::TEXT, fin.account_number::TEXT,
    fin.account_holder::TEXT, fin.account_type::TEXT
  -- **必ず 1 行返す。** 住所も口座も無い事業者で行が消えると、担当者名や
  -- メールまで一緒に落ちる（JOIN で組むと実際にそうなった）
  FROM (SELECT 1) AS anchor
  LEFT JOIN LATERAL (
    -- 住所。指定があればその 1 件、無ければ主住所
    SELECT a.postal_code, a.prefecture, a.city, a.address_line1, a.address_line2
      FROM entity_addresses ea JOIN addresses a ON a.id = ea.address_id
     WHERE ea.company_id = p_company_id
       AND (p.entity_address_id IS NULL OR ea.id = p.entity_address_id)
     ORDER BY ea.is_primary DESC
     LIMIT 1
  ) addr ON TRUE
  LEFT JOIN LATERAL (
    -- 口座。指定があればその 1 件、無ければ主口座
    SELECT f.bank_name, f.branch_name, f.account_number, f.account_holder, f.account_type
      FROM financial_info f
     WHERE f.company_id = p_company_id AND f.deleted_at IS NULL
       AND (p.financial_info_id IS NULL OR f.id = p.financial_info_id)
     ORDER BY f.is_primary DESC
     LIMIT 1
  ) fin ON TRUE;
END;
$$;

COMMENT ON FUNCTION resolve_company_integration_values IS
'連携先へ渡す CRM 側の値。プロファイルの指定があればそれを、無ければ既定（主担当・主メール・主住所・主口座・代表電話）を返す';

REVOKE ALL ON FUNCTION resolve_company_integration_values(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_company_integration_values(UUID, TEXT) TO authenticated;

DO $mig$
BEGIN
  RAISE NOTICE '連携プロファイルを追加した。渡す値の決め方は resolve_company_integration_values へ';
END $mig$;
