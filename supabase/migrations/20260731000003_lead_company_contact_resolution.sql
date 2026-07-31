-- ============================================================
-- 名刺データから法人・連絡先を作る仕組み
--
-- 背景:
--   名刺は「リード」であると同時に「連絡先」でもある。従来は Deal 昇格まで
--   contacts を作らなかったため、取り込んだ人物を連絡先一覧から探せなかった。
--   取込の時点で Company / Contact を作り、Lead から参照する。
--
--   取引先（Account）は契約後に作るため、ここでは作らない。
--
-- 名寄せの優先順位:
--   1. メールドメイン一致（company_domains）— 表記ゆれの影響を受けない
--   2. 正規化した会社名の一致
--   3. どちらも当たらなければ新規作成し、ドメインも同時に登録する
--
-- 解決ロジックを関数に置くのは、取込（import_eight_leads）と
-- 既存リードの遡及作成が同じ判定を使うため。片方だけ直る事故を防ぐ。
-- ============================================================

-- ------------------------------------------------------------
-- 会社名の正規化
--
-- 「株式会社ABC」「(株)ABC」「ＡＢＣ株式会社」を同じキーに寄せる。
-- 法人格の表記・全角半角・区切り記号は名刺ごとにばらつくため、
-- 比較前に落とす。表示用の名前は元のまま保持する。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION normalize_company_name(p_name TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT NULLIF(
    regexp_replace(
      regexp_replace(
        lower(
          translate(
            COALESCE(p_name, ''),
            'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ０１２３４５６７８９',
            'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
          )
        ),
        '(株式会社|有限会社|合同会社|合資会社|合名会社|一般社団法人|一般財団法人|公益社団法人|公益財団法人|特定非営利活動法人|npo法人|医療法人|学校法人|社会福祉法人|宗教法人|\(株\)|（株）|\(有\)|（有）|\(同\)|（同）)',
        '', 'g'
      ),
      '[[:space:]　・．，、.,\-ー－_/\\&＆]', '', 'g'
    ),
    ''
  );
$$;

COMMENT ON FUNCTION normalize_company_name(TEXT) IS
  '会社名の名寄せキー。法人格表記・全角半角・区切り記号を落として比較可能にする';

-- 名寄せは毎回の取込で会社数ぶん走るため関数インデックスを張る
CREATE INDEX IF NOT EXISTS companies_normalized_name_idx
  ON companies (normalize_company_name(name))
  WHERE deleted_at IS NULL;

-- ------------------------------------------------------------
-- Lead から作られた法人・連絡先への参照
--
-- promoted_company_id / promoted_contact_id は「Deal 昇格で作られたもの」
-- を指す既存カラム。取込時点の紐付けは意味が違うので別に持つ。
-- 昇格時はこの値をそのまま promoted_* に引き継ぐ（作り直さない）。
-- ------------------------------------------------------------
ALTER TABLE leads ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id);

CREATE INDEX IF NOT EXISTS leads_company_idx ON leads(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_contact_idx ON leads(contact_id) WHERE contact_id IS NOT NULL;

COMMENT ON COLUMN leads.company_id IS '取込時に名寄せ／作成した法人。昇格を待たずに紐付く';
COMMENT ON COLUMN leads.contact_id IS '取込時に作成した連絡先。名刺はリードであると同時に連絡先でもある';

-- 連絡先の重複判定（会社 × 姓名）を索引で支える
CREATE INDEX IF NOT EXISTS contacts_company_name_idx
  ON contacts (company_id, last_name, first_name)
  WHERE deleted_at IS NULL;

-- メール一致の判定用
CREATE INDEX IF NOT EXISTS contact_emails_lower_email_idx
  ON contact_emails (lower(email));

-- ------------------------------------------------------------
-- 法人の解決／作成
--
-- 戻り値: companies.id（会社名もドメインも無ければ NULL）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION resolve_or_create_company(
  p_company_name   TEXT,
  p_email          TEXT,
  p_phone          TEXT,
  p_url            TEXT,
  p_owner_user_id  UUID,
  p_lead_source_id UUID,
  p_actor          UUID
) RETURNS UUID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_domain     TEXT := normalize_domain(p_email);
  v_norm       TEXT := normalize_company_name(p_company_name);
  v_usable_dom BOOLEAN;
  v_id         UUID;
  v_status_id  UUID;
BEGIN
  -- フリーメールは個人アドレスなので法人の識別に使えない
  v_usable_dom := v_domain IS NOT NULL AND NOT is_free_email_domain(v_domain);

  -- 1. ドメイン一致
  IF v_usable_dom THEN
    SELECT cd.company_id INTO v_id
      FROM company_domains cd
      JOIN companies c ON c.id = cd.company_id AND c.deleted_at IS NULL
     WHERE cd.domain = v_domain
     LIMIT 1;
  END IF;

  -- 2. 会社名一致
  IF v_id IS NULL AND v_norm IS NOT NULL THEN
    SELECT id INTO v_id
      FROM companies
     WHERE normalize_company_name(name) = v_norm
       AND deleted_at IS NULL
     ORDER BY created_at
     LIMIT 1;
  END IF;

  -- 3. 新規作成。会社名が無ければ法人は作らない（ドメインだけでは社名を決められない）
  IF v_id IS NULL THEN
    IF v_norm IS NULL THEN
      RETURN NULL;
    END IF;

    -- company_status_id は NOT NULL。取込直後は「見込み」から始める
    SELECT id INTO v_status_id FROM company_statuses
     WHERE name = '見込み' AND deleted_at IS NULL LIMIT 1;
    IF v_status_id IS NULL THEN
      SELECT id INTO v_status_id FROM company_statuses
       WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;
    END IF;
    IF v_status_id IS NULL THEN
      RAISE EXCEPTION 'company_statuses が未投入です';
    END IF;

    INSERT INTO companies (
      name, phone, website_url, company_status_id,
      lead_source_id, owner_user_id, created_by, last_updated_by
    ) VALUES (
      btrim(p_company_name), NULLIF(btrim(COALESCE(p_phone, '')), ''),
      NULLIF(btrim(COALESCE(p_url, '')), ''), v_status_id,
      p_lead_source_id, p_owner_user_id, p_actor, p_actor
    ) RETURNING id INTO v_id;
  END IF;

  -- ドメインを法人に紐付ける。以降の取込がこの法人に寄るようにする。
  -- 既に他社へ登録済みなら握りつぶす（先に登録された方を正とする）
  IF v_usable_dom THEN
    INSERT INTO company_domains (company_id, domain, is_primary, created_by, last_updated_by)
    VALUES (
      v_id, v_domain,
      NOT EXISTS (SELECT 1 FROM company_domains WHERE company_id = v_id),
      p_actor, p_actor
    )
    ON CONFLICT (domain) DO NOTHING;
  END IF;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION resolve_or_create_company IS
  '名刺の会社名／メールドメインから法人を名寄せし、無ければ作成する。ドメインも同時に登録する';

-- ------------------------------------------------------------
-- 連絡先の解決／作成
--
-- 戻り値: contacts.id（姓が取れない場合は NULL）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION resolve_or_create_contact(
  p_company_id     UUID,
  p_last_name      TEXT,
  p_first_name     TEXT,
  p_department     TEXT,
  p_job_title      TEXT,
  p_email          TEXT,
  p_phone          TEXT,
  p_owner_user_id  UUID,
  p_lead_source_id UUID,
  p_actor          UUID
) RETURNS UUID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id        UUID;
  v_status_id UUID;
  v_last      TEXT := NULLIF(btrim(COALESCE(p_last_name, '')), '');
  v_first     TEXT := COALESCE(NULLIF(btrim(COALESCE(p_first_name, '')), ''), '');
  v_email     TEXT := NULLIF(btrim(COALESCE(p_email, '')), '');
  v_phone     TEXT := NULLIF(btrim(COALESCE(p_phone, '')), '');
BEGIN
  -- 姓が取れない行は人物として成立しないので連絡先を作らない
  IF v_last IS NULL THEN
    RETURN NULL;
  END IF;

  -- 1. メール一致。同一人物の判定として最も確実
  IF v_email IS NOT NULL THEN
    SELECT c.id INTO v_id
      FROM contacts c
      JOIN contact_emails e ON e.contact_id = c.id
     WHERE lower(e.email) = lower(v_email)
       AND c.deleted_at IS NULL
     LIMIT 1;
  END IF;

  -- 2. 会社 × 姓名一致
  IF v_id IS NULL AND p_company_id IS NOT NULL THEN
    SELECT id INTO v_id
      FROM contacts
     WHERE company_id = p_company_id
       AND last_name = v_last
       AND COALESCE(first_name, '') = v_first
       AND deleted_at IS NULL
     ORDER BY created_at
     LIMIT 1;
  END IF;

  IF v_id IS NULL THEN
    SELECT id INTO v_status_id FROM contact_statuses
     WHERE name = '見込み' AND deleted_at IS NULL LIMIT 1;
    IF v_status_id IS NULL THEN
      SELECT id INTO v_status_id FROM contact_statuses
       WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;
    END IF;
    IF v_status_id IS NULL THEN
      RAISE EXCEPTION 'contact_statuses が未投入です';
    END IF;

    INSERT INTO contacts (
      last_name, first_name, department, job_title,
      contact_type, company_id, contact_status_id,
      lead_source_id, owner_user_id, created_by, last_updated_by
    ) VALUES (
      v_last, v_first,
      NULLIF(btrim(COALESCE(p_department, '')), ''),
      NULLIF(btrim(COALESCE(p_job_title, '')), ''),
      -- 法人に紐付かない名刺は所属不明として other にする
      -- （employee は company_id 必須という規約があるため）
      CASE WHEN p_company_id IS NOT NULL THEN 'employee' ELSE 'other' END,
      p_company_id, v_status_id,
      p_lead_source_id, p_owner_user_id, p_actor, p_actor
    ) RETURNING id INTO v_id;
  END IF;

  -- メール・電話は空欄補完のみ。既存の値は名刺で上書きしない
  IF v_email IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM contact_emails WHERE contact_id = v_id AND lower(email) = lower(v_email)
  ) THEN
    INSERT INTO contact_emails (contact_id, email, label, is_primary, created_by, last_updated_by)
    VALUES (
      v_id, v_email, 'work',
      NOT EXISTS (SELECT 1 FROM contact_emails WHERE contact_id = v_id),
      p_actor, p_actor
    );
  END IF;

  IF v_phone IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM contact_phones WHERE contact_id = v_id AND phone = v_phone
  ) THEN
    INSERT INTO contact_phones (contact_id, phone, label, is_primary, created_by, last_updated_by)
    VALUES (
      v_id, v_phone, 'work',
      NOT EXISTS (SELECT 1 FROM contact_phones WHERE contact_id = v_id),
      p_actor, p_actor
    );
  END IF;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION resolve_or_create_contact IS
  '名刺の氏名／メールから連絡先を名寄せし、無ければ作成する。メール・電話は空欄補完のみ';
