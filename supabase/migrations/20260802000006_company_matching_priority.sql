-- ============================================================
-- 会社の名寄せは 法人番号 > ドメイン > 住所+名称 > 名称 の順で決める
--
-- これまでは ドメイン → 名称 の 2 段だった。同名の会社は珍しくないので
-- 名称だけでは決められない（実際「株式会社フロンティア」と
-- 「フロンティア株式会社」のように名寄せキーが重なる組が 8 つある）。
--
-- 順序の理由:
--   法人番号 … 法的に一意。単独で確定してよい
--   ドメイン … 会社に固有。フリーメールは除外済み（is_free_email_domain）
--   住所+名称 … **住所だけでは確定しない。** 雑居ビルやレンタルオフィスには
--               何社も入っている。同名の会社を区別する決め手として使う
--   名称 … 最後の手段。複数該当したら最も古いものを採る（従来どおり）
--
-- 住所は「郵便番号 + 番地」で比べる。番地は「1丁目2番3号」「1-2-3」「１−２−３」が
-- 同じ場所を指すため、区切りを揃えて数字列だけを取り出す。
-- ============================================================

-- ------------------------------------------------------------
-- 住所の照合キー
--
-- 実データでは建物名が address_line1 に続けて入っている
-- （「日本橋浜町2-35-4日本橋浜町パークビル」）。番地は**先頭の数字列**なので、
-- そこだけを取れば建物名や階数に引きずられない。
-- 番地を取り出せない住所はキーを作らない（NULL は照合に使わない）。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION normalize_address_key(
  p_postal_code   TEXT,
  p_prefecture    TEXT,
  p_city          TEXT,
  p_address_line1 TEXT
) RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  WITH parts AS (
    SELECT
      NULLIF(regexp_replace(COALESCE(p_postal_code, ''), '[^0-9]', '', 'g'), '') AS zip,
      NULLIF(btrim(COALESCE(p_prefecture, '') || COALESCE(p_city, '')), '')      AS area,
      -- regexp_match はキャプチャグループの配列を返すので、
      -- 取りたい範囲そのものを 1 つのグループにする（繰り返しは非キャプチャ）
      (regexp_match(
        regexp_replace(
          translate(COALESCE(p_address_line1, ''), '０１２３４５６７８９', '0123456789'),
          '(丁目|番地|条|番|号|の|ー|―|‐|－|−)', '-', 'g'
        ),
        '([0-9]+(?:-[0-9]+)*)'
      ))[1] AS banchi
  )
  SELECT CASE
           WHEN banchi IS NULL OR banchi = '' THEN NULL
           -- 郵便番号があれば都道府県・市区町村は含まれているので番地と組めば足りる
           WHEN zip  IS NOT NULL THEN zip  || '/' || banchi
           WHEN area IS NOT NULL THEN area || '/' || banchi
           ELSE NULL
         END
    FROM parts;
$$;

COMMENT ON FUNCTION normalize_address_key(TEXT, TEXT, TEXT, TEXT) IS
  '住所の照合キー。郵便番号（無ければ都道府県+市区町村）と番地の数字列を組む';

-- ------------------------------------------------------------
-- 名寄せ本体
--
-- 20260802000003 からの変更点:
--   - 法人番号とドメインを先に見る
--   - 住所+名称の一致を名称単独より先に見る
--   - 新規作成時に法人番号と住所を残し、以降の名寄せで使えるようにする
--
-- 追加した 2 引数は既定値を持つ。渡さない呼び出しは従来どおり動く。
--
-- 引数が増えると別の関数として作られてしまうので、旧シグネチャは先に落とす。
-- 残すと 7 引数の呼び出しがどちらにも一致して「not unique」になる。
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS resolve_or_create_company(TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION resolve_or_create_company(
  p_company_name     TEXT,
  p_email            TEXT,
  p_phone            TEXT,
  p_url              TEXT,
  p_owner_user_id    UUID,
  p_lead_source_id   UUID,
  p_actor            UUID,
  p_corporate_number TEXT DEFAULT NULL,
  p_address_id       UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_domain     TEXT := normalize_domain(p_email);
  v_norm       TEXT := normalize_company_name(p_company_name);
  v_number     TEXT := NULLIF(regexp_replace(COALESCE(p_corporate_number, ''), '[^0-9]', '', 'g'), '');
  v_name       TEXT := expand_corporate_abbreviations(p_company_name);
  v_addr_key   TEXT;
  v_usable_dom BOOLEAN;
  v_id         UUID;
  v_status_id  UUID;
BEGIN
  -- 法人番号は 13 桁。桁が違うものは番号として扱わない
  IF v_number IS NOT NULL AND length(v_number) <> 13 THEN
    v_number := NULL;
  END IF;

  IF p_address_id IS NOT NULL THEN
    SELECT normalize_address_key(a.postal_code, a.prefecture, a.city, a.address_line1)
      INTO v_addr_key
      FROM addresses a WHERE a.id = p_address_id;
  END IF;

  -- フリーメールは個人アドレスなので法人の識別に使えない
  v_usable_dom := v_domain IS NOT NULL AND NOT is_free_email_domain(v_domain);

  -- 1. 法人番号一致。法的に一意なので単独で確定してよい
  IF v_number IS NOT NULL THEN
    SELECT id INTO v_id
      FROM companies
     WHERE corporate_number = v_number
       AND deleted_at IS NULL
     LIMIT 1;
  END IF;

  -- 2. ドメイン一致
  IF v_id IS NULL AND v_usable_dom THEN
    SELECT cd.company_id INTO v_id
      FROM company_domains cd
      JOIN companies c ON c.id = cd.company_id AND c.deleted_at IS NULL
     WHERE cd.domain = v_domain
     LIMIT 1;
  END IF;

  -- 3. 住所 + 会社名の一致。
  --    住所だけで決めない。雑居ビルやレンタルオフィスには何社も入っており、
  --    同じ番地というだけで別会社に寄せると取り返しがつかない
  IF v_id IS NULL AND v_norm IS NOT NULL AND v_addr_key IS NOT NULL THEN
    SELECT c.id INTO v_id
      FROM companies c
      JOIN entity_addresses ea ON ea.company_id = c.id
      JOIN addresses a ON a.id = ea.address_id
     WHERE c.deleted_at IS NULL
       AND normalize_company_name(c.name) = v_norm
       AND normalize_address_key(a.postal_code, a.prefecture, a.city, a.address_line1) = v_addr_key
     ORDER BY c.created_at
     LIMIT 1;
  END IF;

  -- 4. 会社名一致。複数該当したら最も古いものを採る
  IF v_id IS NULL AND v_norm IS NOT NULL THEN
    SELECT id INTO v_id
      FROM companies
     WHERE normalize_company_name(name) = v_norm
       AND deleted_at IS NULL
     ORDER BY created_at
     LIMIT 1;
  END IF;

  -- 5. 新規作成。会社名が無ければ法人は作らない（ドメインだけでは社名を決められない）
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

    -- 論理削除済みの法人が同じ番号を持つことがある（UNIQUE は削除状態を見ない）。
    -- ここまで来たのは生きている法人に無かったということなので、番号は付けずに作る
    IF v_number IS NOT NULL
       AND EXISTS (SELECT 1 FROM companies WHERE corporate_number = v_number) THEN
      v_number := NULL;
    END IF;

    INSERT INTO companies (
      name, corporate_type_id, corporate_number, phone, website_url,
      company_status_id, lead_source_id, owner_user_id, created_by, last_updated_by
    ) VALUES (
      v_name, resolve_corporate_type_id(v_name), v_number,
      NULLIF(btrim(COALESCE(p_phone, '')), ''),
      NULLIF(btrim(COALESCE(p_url, '')), ''), v_status_id,
      p_lead_source_id, p_owner_user_id, p_actor, p_actor
    ) RETURNING id INTO v_id;

    -- 住所が分かっていれば主住所として残す。次からは住所でも名寄せできる
    IF p_address_id IS NOT NULL THEN
      INSERT INTO entity_addresses (
        address_id, company_id, label, is_primary, created_by, last_updated_by
      ) VALUES (p_address_id, v_id, 'main', TRUE, p_actor, p_actor);
    END IF;
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

COMMENT ON FUNCTION resolve_or_create_company(TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID, TEXT, UUID) IS
  '会社の名寄せ。法人番号 > ドメイン > 住所+名称 > 名称 の順に照合し、無ければ作る';

-- ------------------------------------------------------------
-- 住所での照合を実際に効かせるための索引
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS addresses_matching_key_idx
  ON addresses (normalize_address_key(postal_code, prefecture, city, address_line1));
