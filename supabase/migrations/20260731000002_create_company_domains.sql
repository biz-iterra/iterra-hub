-- ============================================================
-- company_domains: 法人が使うメールドメイン
--
-- 目的:
--   名刺取込で「この人はどの法人の所属か」を判定する主キーにする。
--   会社名は表記ゆれ（(株)/株式会社、全角半角、支店名付き）が大きく、
--   名前だけの名寄せでは同一法人を取りこぼす。メールドメインは
--   ゆれが無く、名刺には必ず載っているため一次キーとして扱う。
--
--   1 法人が複数ドメインを持つ（事業部別・買収・旧ドメイン併用）ため
--   companies に 1 カラム持たせるのではなく別テーブルにする。
--
-- 判定の優先順位（import 側の実装と対応）:
--   1. メールドメイン一致（本テーブル）
--   2. 正規化した会社名の一致
--   3. どちらも当たらなければ新規作成し、ドメインも同時に登録する
-- ============================================================

-- ------------------------------------------------------------
-- フリーメール判定
--
-- 個人アドレスの名刺（gmail 等）でドメイン名寄せをすると、
-- 無関係な会社が 1 つの法人に統合されてしまう。
-- 判定から除外し、company_domains への登録自体も禁止する。
--
-- IMMUTABLE にして CHECK 制約から使えるようにしている。
-- 追加が必要になったらこの関数を差し替える（マスタ化は必要になってから）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_free_email_domain(p_domain TEXT) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT lower(COALESCE(p_domain, '')) IN (
    'gmail.com', 'googlemail.com',
    'yahoo.co.jp', 'yahoo.com', 'ybb.ne.jp',
    'outlook.com', 'outlook.jp', 'hotmail.com', 'hotmail.co.jp', 'live.jp', 'msn.com',
    'icloud.com', 'me.com', 'mac.com',
    'docomo.ne.jp', 'ezweb.ne.jp', 'au.com', 'softbank.ne.jp', 'i.softbank.jp',
    'ocn.ne.jp', 'nifty.com', 'so-net.ne.jp', 'biglobe.ne.jp', 'plala.or.jp',
    'aol.com', 'aol.jp', 'protonmail.com', 'proton.me', 'zoho.com',
    'yandex.com', 'mail.com', 'gmx.com', 'qq.com', '163.com', '126.com'
  );
$$;

COMMENT ON FUNCTION is_free_email_domain(TEXT) IS
  'フリーメール（個人向け）ドメインかどうか。法人ドメインの名寄せから除外するために使う';

-- ------------------------------------------------------------
-- テーブル
-- ------------------------------------------------------------
CREATE TABLE company_domains (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- 小文字・www 無しに正規化して保存する（正規化はアプリ／取込関数の責務）
  domain          TEXT NOT NULL,
  -- 代表ドメイン。表示や新規作成時の既定に使う
  is_primary      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES crm_users(id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_updated_by UUID REFERENCES crm_users(id),

  -- 小文字・ラベル形式のみ許す。表示用の大文字混じりや URL は入れさせない
  CONSTRAINT company_domains_format_check
    CHECK (domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  -- フリーメールを法人ドメインとして登録させない
  CONSTRAINT company_domains_not_free_email_check
    CHECK (NOT is_free_email_domain(domain))
);

-- ドメインは法人を一意に決めるキーとして使うため、全体で重複させない。
-- 同じドメインを 2 社に登録しようとした時点で弾き、名寄せ結果が
-- 呼び出し順で変わるのを防ぐ
CREATE UNIQUE INDEX company_domains_domain_key ON company_domains(domain);
CREATE INDEX company_domains_company_idx ON company_domains(company_id);
-- 代表ドメインは法人ごとに 1 つ
CREATE UNIQUE INDEX company_domains_primary_key
  ON company_domains(company_id) WHERE is_primary;

COMMENT ON TABLE company_domains IS '法人が使うメールドメイン。名刺取込の法人名寄せの一次キー';
COMMENT ON COLUMN company_domains.domain IS '小文字・www 無しに正規化済みのドメイン。全体で一意';
COMMENT ON COLUMN company_domains.is_primary IS '代表ドメイン。法人ごとに 1 件まで';

CREATE TRIGGER trg_company_domains_updated_at
  BEFORE UPDATE ON company_domains
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ------------------------------------------------------------
-- RLS
-- 親 companies の可視性・編集権限をそのまま引き継ぐ
-- （従属テーブルは親の owner_user_id を参照する規約）
-- ------------------------------------------------------------
ALTER TABLE company_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY company_domains_select ON company_domains
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM companies c
       WHERE c.id = company_domains.company_id
         AND (is_manager_or_above() OR c.owner_user_id = auth.uid())
    )
  );

CREATE POLICY company_domains_insert ON company_domains
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM companies c
       WHERE c.id = company_domains.company_id
         AND (is_admin() OR c.owner_user_id = auth.uid())
    )
  );

CREATE POLICY company_domains_update ON company_domains
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM companies c
       WHERE c.id = company_domains.company_id
         AND (is_admin() OR c.owner_user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM companies c
       WHERE c.id = company_domains.company_id
         AND (is_admin() OR c.owner_user_id = auth.uid())
    )
  );

CREATE POLICY company_domains_delete ON company_domains
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM companies c
       WHERE c.id = company_domains.company_id
         AND (is_admin() OR c.owner_user_id = auth.uid())
    )
  );

-- ------------------------------------------------------------
-- ドメイン正規化
-- メールアドレス／URL／裸のドメインのいずれからでも
-- 保存形式（小文字・www 無し）に揃える。取込と画面入力の双方から使う
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION normalize_domain(p_input TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT NULLIF(
    regexp_replace(
      regexp_replace(
        -- メールなら @ 以降、URL ならスキーム・パスを落とす
        lower(btrim(COALESCE(p_input, ''))),
        '^(?:[^@\s]*@|[a-z]+://)?(?:www\.)?([^/\s:?#]+).*$', '\1'
      ),
      '\.$', ''
    ),
    ''
  );
$$;

COMMENT ON FUNCTION normalize_domain(TEXT) IS
  'メールアドレス／URL／ドメイン文字列を、company_domains.domain の保存形式に正規化する';

-- ------------------------------------------------------------
-- ドメイン登録
--
-- 正規化・重複判定・代表フラグの付け替えを 1 トランザクションで行う。
-- 代表を切り替えるには「既存を落として新しいものを立てる」の 2 文が要り、
-- アプリから順に投げると部分ユニークインデックスに衝突しうるため関数に寄せる。
--
-- SECURITY INVOKER（既定）。呼び出しユーザーの RLS がそのまま効く
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION upsert_company_domain(
  p_company_id UUID,
  p_input      TEXT,
  p_is_primary BOOLEAN DEFAULT FALSE
) RETURNS company_domains
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_domain TEXT := normalize_domain(p_input);
  v_owner  UUID;
  v_row    company_domains;
BEGIN
  IF v_domain IS NULL THEN
    RAISE EXCEPTION '[domain] ドメインを入力してください';
  END IF;

  IF is_free_email_domain(v_domain) THEN
    RAISE EXCEPTION '[domain] % はフリーメールのため法人ドメインとして登録できません', v_domain;
  END IF;

  -- ドメインは法人を一意に決めるキーなので、他社に付いていれば弾く
  SELECT company_id INTO v_owner FROM company_domains WHERE domain = v_domain;
  IF v_owner IS NOT NULL AND v_owner <> p_company_id THEN
    RAISE EXCEPTION '[domain] % は既に別の法人に登録されています', v_domain;
  END IF;

  IF p_is_primary THEN
    UPDATE company_domains SET is_primary = FALSE
     WHERE company_id = p_company_id AND is_primary;
  END IF;

  INSERT INTO company_domains (company_id, domain, is_primary, created_by, last_updated_by)
  VALUES (p_company_id, v_domain, p_is_primary, auth.uid(), auth.uid())
  ON CONFLICT (domain) DO UPDATE
     SET is_primary      = EXCLUDED.is_primary OR company_domains.is_primary,
         last_updated_by = auth.uid()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION upsert_company_domain(UUID, TEXT, BOOLEAN) IS
  '法人ドメインを正規化して登録する。代表フラグの付け替えも同一トランザクションで行う';

REVOKE ALL ON FUNCTION upsert_company_domain(UUID, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_company_domain(UUID, TEXT, BOOLEAN) TO authenticated;
