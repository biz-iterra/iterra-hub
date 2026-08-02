-- ============================================================
-- 会社名の略記を正式表記に開き、法人格を名称から決める
--
-- 実データでは「㈱」712 件 /「（株）」179 件 /「(株)」89 件のように
-- 同じ法人格が 4 通りで書かれていた。表記が違うだけで別の法人として
-- 登録されてしまうため、保存する値そのものを正式表記に寄せる。
--
-- `normalize_company_name`（名寄せキー）の除去リストに `㈱` が無く、
-- 「㈱ワンエイト」と「株式会社ワンエイト」が別の法人になっていた。
-- 除去リストを増やすのではなく、開いてから落とす順序に変えて塞ぐ。
--
-- 法人格（corporate_types）は 3,598 件中 1 件しか設定されていなかった。
-- 名称に綴りが含まれていれば機械的に決まるので、そこから埋める。
--
-- 規則は TS 側 `src/lib/company-name.ts` と対になっている。
-- 画面からの保存は TS、名刺取込は DB を通るため、**片方だけ直さないこと**。
-- ============================================================

-- ------------------------------------------------------------
-- 略記 → 正式表記
--
-- 綴りが一意に定まらない合成文字（㈳ は「社団法人」か「一般社団法人」か
-- 決められない）は対象にしない。誤った法人格を名前に焼き付けないため。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION expand_corporate_abbreviations(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name  TEXT;
  v_rule  TEXT[];
  v_rules TEXT[] := ARRAY[
    ARRAY['㈱|\(株\)|（株）',     '株式会社'],
    ARRAY['㈲|\(有\)|（有）',     '有限会社'],
    ARRAY['\(同\)|（同）',        '合同会社'],
    ARRAY['㈾|\(資\)|（資）',     '合資会社'],
    ARRAY['㈴|\(名\)|（名）',     '合名会社'],
    ARRAY['\(一社\)|（一社）',    '一般社団法人'],
    ARRAY['\(一財\)|（一財）',    '一般財団法人'],
    ARRAY['\(公社\)|（公社）',    '公益社団法人'],
    ARRAY['\(公財\)|（公財）',    '公益財団法人'],
    ARRAY['\(特非\)|（特非）',    '特定非営利活動法人'],
    ARRAY['\(医\)|（医）',        '医療法人'],
    ARRAY['㈻|\(学\)|（学）',     '学校法人'],
    ARRAY['\(福\)|（福）',        '社会福祉法人'],
    ARRAY['\(宗\)|（宗）',        '宗教法人']
  ];
BEGIN
  IF p_name IS NULL THEN
    RETURN NULL;
  END IF;

  v_name := replace(p_name, '　', ' ');

  FOREACH v_rule SLICE 1 IN ARRAY v_rules LOOP
    v_name := regexp_replace(v_name, v_rule[1], v_rule[2], 'g');
  END LOOP;

  -- NOT NULL の列に入るので空文字は NULL にしない
  RETURN btrim(regexp_replace(v_name, '[[:space:]]+', ' ', 'g'));
END;
$$;

COMMENT ON FUNCTION expand_corporate_abbreviations(TEXT) IS
  '会社名の略記を正式表記に開く。㈱ → 株式会社。TS 側 src/lib/company-name.ts と同じ規則';

-- ------------------------------------------------------------
-- 名称から法人格を決める
--
-- 名称に綴りがそのまま含まれていれば、それを法人格とみなす。
-- 「一般社団法人」と「社団法人」の両方がマスタにある場合に短い方が
-- 先に当たらないよう、長い綴りから探す。
-- 「個人事業主」のように名称へ現れないものは決まらない（NULL）。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION resolve_corporate_type_id(p_company_name TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT ct.id
    FROM corporate_types ct
   WHERE ct.deleted_at IS NULL
     AND btrim(ct.name) <> ''
     AND position(btrim(ct.name) IN expand_corporate_abbreviations(COALESCE(p_company_name, ''))) > 0
   ORDER BY length(btrim(ct.name)) DESC, ct.created_at
   LIMIT 1;
$$;

COMMENT ON FUNCTION resolve_corporate_type_id(TEXT) IS
  '会社名に含まれる法人格を返す。最長一致。決められないときは NULL';

-- ------------------------------------------------------------
-- 名寄せキーは「開いてから落とす」
--
-- 除去リストに合成文字を書き足す方式だと、書き漏らしがそのまま
-- 名寄せの取りこぼしになる（実際 ㈱ が漏れていた）。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION normalize_company_name(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT NULLIF(
    regexp_replace(
      regexp_replace(
        lower(
          translate(
            expand_corporate_abbreviations(COALESCE(p_name, '')),
            'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ０１２３４５６７８９',
            'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
          )
        ),
        '(株式会社|有限会社|合同会社|合資会社|合名会社|一般社団法人|一般財団法人|公益社団法人|公益財団法人|特定非営利活動法人|npo法人|医療法人|学校法人|社会福祉法人|宗教法人)',
        '', 'g'
      ),
      '[[:space:]　・．，、.,\-ー－_/\\&＆]', '', 'g'
    ),
    ''
  );
$$;

-- ------------------------------------------------------------
-- 取込で作る法人にも同じ規則を通す
--
-- 20260731000003 からの変更点は 2 つだけ:
--   - 保存する名前を expand_corporate_abbreviations に通す
--   - 法人格を名称から決めて入れる
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION resolve_or_create_company(
  p_company_name  TEXT,
  p_email         TEXT,
  p_phone         TEXT,
  p_url           TEXT,
  p_owner_user_id UUID,
  p_lead_source_id UUID,
  p_actor         UUID
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
  v_name       TEXT := expand_corporate_abbreviations(p_company_name);
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

    -- 名刺から作った法人は実在確認をしていないので「未確認」から始める
    SELECT id INTO v_status_id FROM company_statuses
     WHERE code = 'unverified' AND deleted_at IS NULL LIMIT 1;
    IF v_status_id IS NULL THEN
      SELECT id INTO v_status_id FROM company_statuses
       WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;
    END IF;
    IF v_status_id IS NULL THEN
      RAISE EXCEPTION 'company_statuses が未投入です';
    END IF;

    INSERT INTO companies (
      name, corporate_type_id, phone, website_url, company_status_id,
      lead_source_id, owner_user_id, created_by, last_updated_by
    ) VALUES (
      v_name, resolve_corporate_type_id(v_name),
      NULLIF(btrim(COALESCE(p_phone, '')), ''),
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

-- ============================================================
-- 既存データの是正
-- ============================================================

-- 論理削除済みも直す。復元したときに古い表記が残らないようにする
UPDATE companies
   SET name = expand_corporate_abbreviations(name)
 WHERE name IS DISTINCT FROM expand_corporate_abbreviations(name);

-- 人が選んだ値は上書きしない。空いているものだけ埋める
UPDATE companies
   SET corporate_type_id = resolve_corporate_type_id(name)
 WHERE corporate_type_id IS NULL
   AND resolve_corporate_type_id(name) IS NOT NULL;

-- ------------------------------------------------------------
-- 式インデックスの作り直し
--
-- normalize_company_name を差し替えても、既に積まれた索引の値は
-- 古い規則のまま残る（PostgreSQL は IMMUTABLE 関数の再定義を検知しない）。
-- 積み直さないと「㈱」時代のキーで引き続き検索されてしまう。
-- ------------------------------------------------------------
REINDEX INDEX companies_normalized_name_idx;
