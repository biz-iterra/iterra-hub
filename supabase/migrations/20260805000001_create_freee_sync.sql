-- ============================================================
-- freee 会計 取引先連携（freee → CRM 読み取り専用）
--
-- 目的:
--   freee 会計に既にある取引先（Partner）を CRM へ取り込み、
--   事業者情報（companies）・取引先（accounts）と突合できるようにする。
--
-- 方針（2026-08-04 決定。docs/database-design.md の freee 連携章）:
--   - **freee 側には一切書かない。** 読み取り専用の同期
--   - **自動紐付けはインボイス登録番号の一致だけ。**
--     名称・メールドメイン・電話の一致は「候補」として提示し、admin が画面で確定する
--   - **Account は絶対に自動作成しない。** Account は契約成立時の
--     ensure_account_on_contract トリガーでのみ自動作成される原則（§16.6）を崩さない。
--     freee にあって CRM に無い取引先への操作は
--     「既存へ紐付け / companies を新規作成して紐付け / 対象外」の 3 択で、
--     いずれも Account を生まない
--   - インボイス番号が CRM と freee で食い違う場合は **CRM が正本**。
--     自動紐付けせず、画面で警告表示に留める
-- ============================================================

-- ------------------------------------------------------------
-- 1. 接続（freee_connections）
--
-- 組織レベルの接続（Gmail のような個人ごとの連携ではない）。
-- トークンはアプリ側で AES-256-GCM 暗号化してから BYTEA で渡す
-- （src/lib/gmail/crypto.ts を流用。鍵は環境変数 FREEE_TOKEN_ENCRYPTION_KEY）。
--
-- freee のリフレッシュトークンは**ローテーション式**（使うたびに新しい値へ
-- 置き換わる）。リフレッシュのたびに保存失敗のリスクを負うため、
-- アクセストークン（6 時間有効）も暗号化保存して生きている間は再利用し、
-- リフレッシュの回数自体を減らす。
-- ------------------------------------------------------------
CREATE TABLE freee_connections (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 誰が繋いだか（組織の接続だが操作者は残す）
  crm_user_id             UUID NOT NULL REFERENCES crm_users(id),
  -- freee の事業所 ID。紐付けの親キー
  freee_company_id        BIGINT NOT NULL,
  freee_company_name      TEXT,
  refresh_token_enc       BYTEA NOT NULL,
  access_token_enc        BYTEA,
  access_token_expires_at TIMESTAMPTZ,
  granted_scope           TEXT,
  last_synced_at          TIMESTAMPTZ,
  -- 全件同期（削除検出）を最後に行った時刻
  last_full_synced_at     TIMESTAMPTZ,
  last_error              TEXT,
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 同じ事業所の接続は 1 行だけ。**is_active を条件にしない**（全体 UNIQUE）。
-- 切断 → 再接続で行を作り直すと freee_partners 側の紐付けが宙に浮くため、
-- 再接続は必ず同じ行の UPDATE にする（コールバック実装がこの前提に依存する）
CREATE UNIQUE INDEX freee_connections_company_key
  ON freee_connections(freee_company_id);

COMMENT ON TABLE freee_connections IS
'freee 会計との接続（組織レベル・事業所ごとに 1 行）。切断は is_active = FALSE で表し、行は消さない';
COMMENT ON COLUMN freee_connections.refresh_token_enc IS
'AES-256-GCM で暗号化済み（iv||authTag||ciphertext）。鍵はアプリの環境変数が持つ';
COMMENT ON COLUMN freee_connections.access_token_enc IS
'アクセストークン（6 時間有効）。生きている間は再利用し、ローテーション式リフレッシュの回数を減らす';

CREATE TRIGGER trg_freee_connections_updated_at
  BEFORE UPDATE ON freee_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ------------------------------------------------------------
-- 2. 取引先ミラー + 紐付け（freee_partners）
-- ------------------------------------------------------------
CREATE TABLE freee_partners (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 冪等キーは (事業所 ID, Partner ID)。接続行の作り直しに影響されないよう
  -- connection の UUID ではなく freee 側の ID で持つ
  freee_company_id            BIGINT NOT NULL,
  freee_partner_id            BIGINT NOT NULL,

  -- ---- freee 側の写し（同期のたびに上書きする） ----
  name                        TEXT NOT NULL,
  code                        TEXT,
  long_name                   TEXT,
  name_kana                   TEXT,
  -- null: 未設定 / 1: 法人 / 2: 個人
  org_code                    SMALLINT,
  country_code                TEXT,
  phone                       TEXT,
  contact_name                TEXT,
  email                       TEXT,
  qualified_invoice_issuer    BOOLEAN,
  invoice_registration_number VARCHAR(14),
  address_zipcode             TEXT,
  -- freee の都道府県コード（0: 北海道 〜 46: 沖縄県。-1 / NULL: 未設定）
  address_prefecture_code     SMALLINT,
  address_street_name1        TEXT,
  address_street_name2        TEXT,
  -- freee 側の使用停止フラグ（false = 停止中）
  available                   BOOLEAN NOT NULL DEFAULT TRUE,
  freee_update_date           DATE,
  -- 全件同期で freee 側から消えていたことを検出した時刻。差分同期では検出できない
  freee_deleted_at            TIMESTAMPTZ,
  synced_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ---- 導出（法人のみ）。インボイス番号の T を除いた 13 桁 = 法人番号。
  --      個人事業主（org_code = 2）の T 番号は法人番号ではないので導出しない ----
  corporate_number VARCHAR(13) GENERATED ALWAYS AS (
    CASE WHEN org_code = 1 AND invoice_registration_number ~ '^T[0-9]{13}$'
         THEN substring(invoice_registration_number FROM 2)
    END
  ) STORED,

  -- ---- CRM との紐付け ----
  -- unlinked: 未紐付け / auto: インボイス番号一致で自動 /
  -- confirmed: admin が確定 / excluded: 対象外と判断
  link_status TEXT NOT NULL DEFAULT 'unlinked'
    CHECK (link_status IN ('unlinked', 'auto', 'confirmed', 'excluded')),
  company_id  UUID REFERENCES companies(id) ON DELETE SET NULL,
  account_id  UUID REFERENCES accounts(id)  ON DELETE SET NULL,
  linked_at   TIMESTAMPTZ,
  linked_by   UUID REFERENCES crm_users(id),

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT freee_partners_partner_key UNIQUE (freee_company_id, freee_partner_id),
  -- 紐付いた状態なら、相手（company か account）が必ずいる
  CONSTRAINT freee_partners_link_target_check CHECK (
    link_status NOT IN ('auto', 'confirmed')
    OR company_id IS NOT NULL OR account_id IS NOT NULL
  )
);

CREATE INDEX freee_partners_unlinked_idx
  ON freee_partners(freee_update_date DESC) WHERE link_status = 'unlinked';
CREATE INDEX freee_partners_company_idx ON freee_partners(company_id);
CREATE INDEX freee_partners_account_idx ON freee_partners(account_id);
CREATE INDEX freee_partners_invoice_idx ON freee_partners(invoice_registration_number);

COMMENT ON TABLE freee_partners IS
'freee 取引先のミラーと CRM への紐付け。freee が正本の写し（ミラー列）と、CRM 側の判断（紐付け列）を分けて持つ';
COMMENT ON COLUMN freee_partners.corporate_number IS
'org_code=1（法人）のときだけインボイス番号から導出。個人の T 番号は法人番号ではない';
COMMENT ON COLUMN freee_partners.link_status IS
'auto はインボイス番号一致のみ。名称・ドメイン・電話の一致は候補提示に留め、confirmed は人が確定した印';

CREATE TRIGGER trg_freee_partners_updated_at
  BEFORE UPDATE ON freee_partners
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ------------------------------------------------------------
-- 3. RLS
--
-- 会計との突合は admin の業務。member / manager には見せない。
-- 同期（service_role）は RLS をバイパスするため INSERT/DELETE ポリシーは
-- 置かない（gmail_sync と同じ整理）。UPDATE は紐付け操作のため admin に許す。
-- 引数なし関数はスカラーサブクエリで包む（20260803000021 の規約）。
-- ------------------------------------------------------------
ALTER TABLE freee_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE freee_partners    ENABLE ROW LEVEL SECURITY;

CREATE POLICY freee_connections_select ON freee_connections
  FOR SELECT TO authenticated USING ((SELECT is_admin()));
CREATE POLICY freee_connections_insert ON freee_connections
  FOR INSERT TO authenticated WITH CHECK ((SELECT is_admin()));
CREATE POLICY freee_connections_update ON freee_connections
  FOR UPDATE TO authenticated
  USING ((SELECT is_admin())) WITH CHECK ((SELECT is_admin()));

CREATE POLICY freee_partners_select ON freee_partners
  FOR SELECT TO authenticated USING ((SELECT is_admin()));
CREATE POLICY freee_partners_update ON freee_partners
  FOR UPDATE TO authenticated
  USING ((SELECT is_admin())) WITH CHECK ((SELECT is_admin()));

-- ------------------------------------------------------------
-- 4. 同期の取込関数
--
-- Server Action / API route が freee から取得した Partner の配列を
-- JSONB で一括で渡す（inquiry-sync の import_inquiry_leads と同じ形）。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION upsert_freee_partners(
  p_freee_company_id BIGINT,
  p_rows             JSONB,
  p_full             BOOLEAN DEFAULT FALSE
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row          JSONB;
  v_upserted     INTEGER := 0;
  v_auto_linked  INTEGER := 0;
  v_marked       INTEGER := 0;
  v_seen_ids     BIGINT[] := '{}';
  r              RECORD;
  v_company_id   UUID;
  v_account_id   UUID;
  v_account_cnt  INTEGER;
BEGIN
  -- 取込は数百件規模。HTTP の経路には乗らない想定だが、
  -- Server Action から直接呼ばれても 8 秒制限に当たらないよう明示しておく
  -- （authenticator ロールの statement_timeout は関数属性の SET で上書きできる）

  -- 1. ミラーの upsert。**紐付け列（link_status / company_id / account_id）には触れない。**
  --    freee 側の変化とCRM 側の判断を混ぜないため
  FOR v_row IN SELECT * FROM jsonb_array_elements(COALESCE(p_rows, '[]'::JSONB))
  LOOP
    INSERT INTO freee_partners (
      freee_company_id, freee_partner_id,
      name, code, long_name, name_kana, org_code, country_code,
      phone, contact_name, email,
      qualified_invoice_issuer, invoice_registration_number,
      address_zipcode, address_prefecture_code, address_street_name1, address_street_name2,
      available, freee_update_date, synced_at
    ) VALUES (
      p_freee_company_id,
      (v_row ->> 'freee_partner_id')::BIGINT,
      v_row ->> 'name',
      NULLIF(v_row ->> 'code', ''),
      NULLIF(v_row ->> 'long_name', ''),
      NULLIF(v_row ->> 'name_kana', ''),
      (v_row ->> 'org_code')::SMALLINT,
      NULLIF(v_row ->> 'country_code', ''),
      NULLIF(v_row ->> 'phone', ''),
      NULLIF(v_row ->> 'contact_name', ''),
      NULLIF(v_row ->> 'email', ''),
      (v_row ->> 'qualified_invoice_issuer')::BOOLEAN,
      NULLIF(v_row ->> 'invoice_registration_number', ''),
      NULLIF(v_row ->> 'address_zipcode', ''),
      (v_row ->> 'address_prefecture_code')::SMALLINT,
      NULLIF(v_row ->> 'address_street_name1', ''),
      NULLIF(v_row ->> 'address_street_name2', ''),
      COALESCE((v_row ->> 'available')::BOOLEAN, TRUE),
      (v_row ->> 'freee_update_date')::DATE,
      now()
    )
    ON CONFLICT (freee_company_id, freee_partner_id) DO UPDATE SET
      name                        = EXCLUDED.name,
      code                        = EXCLUDED.code,
      long_name                   = EXCLUDED.long_name,
      name_kana                   = EXCLUDED.name_kana,
      org_code                    = EXCLUDED.org_code,
      country_code                = EXCLUDED.country_code,
      phone                       = EXCLUDED.phone,
      contact_name                = EXCLUDED.contact_name,
      email                       = EXCLUDED.email,
      qualified_invoice_issuer    = EXCLUDED.qualified_invoice_issuer,
      invoice_registration_number = EXCLUDED.invoice_registration_number,
      address_zipcode             = EXCLUDED.address_zipcode,
      address_prefecture_code     = EXCLUDED.address_prefecture_code,
      address_street_name1        = EXCLUDED.address_street_name1,
      address_street_name2        = EXCLUDED.address_street_name2,
      available                   = EXCLUDED.available,
      freee_update_date           = EXCLUDED.freee_update_date,
      -- 再び出現したら「消えていた」印を外す
      freee_deleted_at            = NULL,
      synced_at                   = now();

    v_upserted := v_upserted + 1;
    v_seen_ids := v_seen_ids || (v_row ->> 'freee_partner_id')::BIGINT;
  END LOOP;

  -- 2. 自動紐付け（unlinked の行のみ）。**確実なキーだけ。**
  --    ① インボイス登録番号の完全一致
  --    ② 法人（org_code=1）の導出法人番号 = companies.corporate_number。
  --       ただし CRM 側にインボイス番号が入っていて食い違う場合は自動にしない
  --       （CRM が正本。画面の警告で人が判断する）
  FOR r IN
    SELECT fp.id, fp.invoice_registration_number, fp.corporate_number
      FROM freee_partners fp
     WHERE fp.freee_company_id = p_freee_company_id
       AND fp.link_status = 'unlinked'
       AND (fp.invoice_registration_number IS NOT NULL OR fp.corporate_number IS NOT NULL)
  LOOP
    v_company_id := NULL;

    -- ① インボイス番号一致
    IF r.invoice_registration_number IS NOT NULL THEN
      SELECT c.id INTO v_company_id FROM companies c
       WHERE c.invoice_registration_number = r.invoice_registration_number
         AND c.deleted_at IS NULL
       LIMIT 1;
    END IF;

    -- ② 導出法人番号一致（CRM 側のインボイス番号が未入力のときだけ）
    IF v_company_id IS NULL AND r.corporate_number IS NOT NULL THEN
      SELECT c.id INTO v_company_id FROM companies c
       WHERE c.corporate_number = r.corporate_number
         AND c.invoice_registration_number IS NULL
         AND c.deleted_at IS NULL
       LIMIT 1;
    END IF;

    IF v_company_id IS NOT NULL THEN
      -- その事業者の未削除 Account がちょうど 1 件なら account も張る。
      -- 複数あるときは決められないので NULL のまま（確定操作で人が選ぶ）
      SELECT count(*), min(a.id::TEXT)::UUID
        INTO v_account_cnt, v_account_id
        FROM accounts a
       WHERE a.company_id = v_company_id AND a.deleted_at IS NULL;

      UPDATE freee_partners
         SET link_status = 'auto',
             company_id  = v_company_id,
             account_id  = CASE WHEN v_account_cnt = 1 THEN v_account_id END,
             linked_at   = now(),
             linked_by   = NULL   -- 自動なので人は記録しない
       WHERE id = r.id;
      v_auto_linked := v_auto_linked + 1;
    END IF;
  END LOOP;

  -- 3. 全件同期のときだけ、今回出現しなかった行へ「freee 側から消えていた」印。
  --    行と紐付けは残す（会計側の削除で CRM の判断まで消さない）
  IF p_full THEN
    UPDATE freee_partners
       SET freee_deleted_at = now()
     WHERE freee_company_id = p_freee_company_id
       AND freee_deleted_at IS NULL
       AND NOT (freee_partner_id = ANY (v_seen_ids));
    GET DIAGNOSTICS v_marked = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'upserted', v_upserted,
    'auto_linked', v_auto_linked,
    'marked_deleted', v_marked
  );
END;
$$;

COMMENT ON FUNCTION upsert_freee_partners IS
'freee 取引先のミラー upsert + 自動紐付け（インボイス番号一致のみ）。紐付け済みの行の判断は上書きしない';

ALTER FUNCTION upsert_freee_partners(BIGINT, JSONB, BOOLEAN)
  SET statement_timeout = '120s';

REVOKE ALL ON FUNCTION upsert_freee_partners(BIGINT, JSONB, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_freee_partners(BIGINT, JSONB, BOOLEAN) TO service_role;

-- ------------------------------------------------------------
-- 5. 候補の検出（保存しない。その場で計算する）
--
-- freee 側・CRM 側どちらの変化でも陳腐化するため、貯めずに都度引く。
-- 自動紐付けには使わない弱いキー（名称・ドメイン・電話）による提案。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION detect_freee_partner_candidates(p_partner_id UUID)
RETURNS TABLE (
  company_id   UUID,
  company_name TEXT,
  reason       TEXT,
  -- 画面の判断材料（その事業者のインボイス番号・Account の有無など）
  detail       JSONB
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  fp     freee_partners%ROWTYPE;
  v_norm TEXT;
  v_dom  TEXT;
  v_tel  TEXT;
BEGIN
  SELECT * INTO fp FROM freee_partners WHERE id = p_partner_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_norm := normalize_company_name(COALESCE(fp.long_name, fp.name));
  v_dom  := CASE WHEN fp.email LIKE '%@%'
                 THEN normalize_domain(split_part(fp.email, '@', 2)) END;
  IF v_dom IS NOT NULL AND is_free_email_domain(v_dom) THEN
    v_dom := NULL;  -- フリーメールはドメイン名寄せに使わない（既存規約）
  END IF;
  v_tel  := NULLIF(regexp_replace(COALESCE(fp.phone, ''), '[^0-9]', '', 'g'), '');

  RETURN QUERY
  SELECT c.id,
         c.name,
         m.reason,
         jsonb_build_object(
           'invoice_registration_number', c.invoice_registration_number,
           'corporate_number', c.corporate_number,
           'account_count', (SELECT count(*) FROM accounts a
                              WHERE a.company_id = c.id AND a.deleted_at IS NULL)
         )
    FROM (
      -- 同じ事業者が複数の理由で当たることは普通にある（名称も電話も一致など）。
      -- 画面に同じ会社を何度も出しても選択の助けにならないので、
      -- **1 社 1 行にして最も強い理由だけを示す**（prio が小さいほど強い）
      SELECT DISTINCT ON (u.cid) u.cid, u.reason, u.prio
        FROM (
          -- 名称の正規化一致（株式会社の略記展開・空白除去は既存関数に任せる）
          SELECT c2.id AS cid, 'name'::TEXT AS reason, 1 AS prio
            FROM companies c2
           WHERE v_norm IS NOT NULL
             AND normalize_company_name(c2.name) = v_norm
             AND c2.deleted_at IS NULL
          UNION
          -- メールドメイン一致
          SELECT cd.company_id, 'domain', 2
            FROM company_domains cd
           WHERE v_dom IS NOT NULL AND cd.domain = v_dom
          UNION
          -- 電話番号一致（数字のみで比較）
          SELECT c3.id, 'phone', 3
            FROM companies c3
           WHERE v_tel IS NOT NULL
             AND regexp_replace(COALESCE(c3.phone, ''), '[^0-9]', '', 'g') = v_tel
             AND c3.deleted_at IS NULL
        ) u
       ORDER BY u.cid, u.prio
    ) m
    JOIN companies c ON c.id = m.cid AND c.deleted_at IS NULL
   ORDER BY m.prio, c.name;
END;
$$;

COMMENT ON FUNCTION detect_freee_partner_candidates IS
'freee 取引先の紐付け候補（名称・ドメイン・電話）。1 社 1 行で最も強い理由を返す。提案のみで自動確定には使わない';

-- 画面（admin）からのみ呼ぶ。SECURITY INVOKER なので freee_partners の RLS も効く
REVOKE ALL ON FUNCTION detect_freee_partner_candidates(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION detect_freee_partner_candidates(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 6. 紐付けの確定（admin の画面操作）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION confirm_freee_partner_link(
  p_partner_id UUID,
  p_company_id UUID,
  p_account_id UUID DEFAULT NULL,
  p_actor      UUID DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := COALESCE(auth.uid(), p_actor);  -- 監査証跡なので実行者を優先する
BEGIN
  -- SECURITY DEFINER なので RLS に頼れない。関数内で必ず権限を確認する。
  -- **COALESCE を外さないこと。** is_admin() は crm_users に行の無い
  -- 認証ユーザーに対して NULL を返し、`NOT NULL` は偽になるため
  -- 素の `IF NOT is_admin()` だとチェックをすり抜ける
  IF NOT COALESCE(is_admin(), FALSE) THEN
    RAISE EXCEPTION '紐付けの確定は admin だけが行えます';
  END IF;
  IF p_company_id IS NULL AND p_account_id IS NULL THEN
    RAISE EXCEPTION '紐付け先（事業者情報または取引先）を指定してください';
  END IF;

  IF p_company_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM companies WHERE id = p_company_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION '指定された事業者情報が見つかりません';
  END IF;

  IF p_account_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM accounts WHERE id = p_account_id AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION '指定された取引先が見つかりません';
    END IF;
    -- account と company の両方を指定するなら親子関係が一致していること
    IF p_company_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM accounts
       WHERE id = p_account_id AND company_id = p_company_id
    ) THEN
      RAISE EXCEPTION '取引先が指定の事業者情報に属していません';
    END IF;
  END IF;

  UPDATE freee_partners
     SET link_status = 'confirmed',
         company_id  = p_company_id,
         account_id  = p_account_id,
         linked_at   = now(),
         linked_by   = v_actor
   WHERE id = p_partner_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'freee 取引先が見つかりません';
  END IF;
END;
$$;

COMMENT ON FUNCTION confirm_freee_partner_link IS
'freee 取引先の紐付けを admin が確定する。Account は作らない（紐付けるだけ）';

REVOKE ALL ON FUNCTION confirm_freee_partner_link(UUID, UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION confirm_freee_partner_link(UUID, UUID, UUID, UUID) TO authenticated;

-- ------------------------------------------------------------
-- 7. 事業者情報の新規作成 + 紐付け（admin の画面操作）
--
-- **resolve_or_create_company は使わない。** あの関数は名称一致で既存へ
-- 寄せるが、ここで既存へ寄せてよいかは人の判断（候補から選ぶ操作）。
-- この関数は「CRM に確かに無い」と人が判断したときの新規作成専用。
-- **accounts は作らない**（契約成立時のトリガーだけが作る。§16.6）。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION register_freee_partner_company(
  p_partner_id UUID,
  p_actor      UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  fp           freee_partners%ROWTYPE;
  v_actor      UUID := COALESCE(auth.uid(), p_actor);  -- 監査証跡なので実行者を優先する
  v_name       TEXT;
  v_status_id  UUID;
  v_company_id UUID;
  v_number     VARCHAR(13);
  v_dom        TEXT;
  v_pref       TEXT;
  -- freee の都道府県コード（0 始まり・JIS 順）
  v_prefs      TEXT[] := ARRAY[
    '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県',
    '茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県',
    '新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県',
    '静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県',
    '奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県',
    '徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県',
    '熊本県','大分県','宮崎県','鹿児島県','沖縄県'
  ];
BEGIN
  -- COALESCE の理由は confirm_freee_partner_link と同じ（NULL ですり抜けさせない）
  IF NOT COALESCE(is_admin(), FALSE) THEN
    RAISE EXCEPTION '事業者情報の作成は admin だけが行えます';
  END IF;

  SELECT * INTO fp FROM freee_partners WHERE id = p_partner_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'freee 取引先が見つかりません';
  END IF;
  IF fp.link_status IN ('auto', 'confirmed') THEN
    RAISE EXCEPTION '既に紐付け済みです。先に紐付けを解除してください';
  END IF;

  -- 正式名称があればそちら。略記（㈱ など）は既存の展開規則で開く
  v_name := expand_corporate_abbreviations(COALESCE(fp.long_name, fp.name));

  SELECT id INTO v_status_id FROM company_statuses
   WHERE code = 'unverified' AND deleted_at IS NULL LIMIT 1;
  IF v_status_id IS NULL THEN
    RAISE EXCEPTION 'company_statuses が未投入です';
  END IF;

  -- 導出法人番号。論理削除済みの法人が同じ番号を持っていると UNIQUE に当たるため、
  -- その場合は番号なしで作る（resolve_or_create_company と同じ扱い）
  v_number := fp.corporate_number;
  IF v_number IS NOT NULL
     AND EXISTS (SELECT 1 FROM companies WHERE corporate_number = v_number) THEN
    v_number := NULL;
  END IF;

  INSERT INTO companies (
    name, name_kana, corporate_type_id, corporate_number,
    invoice_registered, invoice_registration_number,
    phone, company_status_id, owner_user_id, created_by, last_updated_by
  ) VALUES (
    v_name,
    NULLIF(fp.name_kana, ''),
    resolve_corporate_type_id(v_name),
    v_number,
    COALESCE(fp.qualified_invoice_issuer, FALSE),
    -- インボイス番号も UNIQUE。別の会社が既に持っているなら付けずに作り、
    -- 食い違いとして画面に出す（CRM が正本の原則）
    CASE WHEN fp.invoice_registration_number IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM companies
                           WHERE invoice_registration_number = fp.invoice_registration_number)
         THEN fp.invoice_registration_number END,
    NULLIF(fp.phone, ''),
    v_status_id,
    v_actor, v_actor, v_actor
  ) RETURNING id INTO v_company_id;

  -- 住所（あれば）。add_entity_address が addresses と紐付けをまとめて作る
  IF fp.address_zipcode IS NOT NULL
     OR fp.address_street_name1 IS NOT NULL
     OR (fp.address_prefecture_code IS NOT NULL AND fp.address_prefecture_code >= 0) THEN
    v_pref := CASE WHEN fp.address_prefecture_code BETWEEN 0 AND 46
                   THEN v_prefs[fp.address_prefecture_code + 1] END;
    PERFORM add_entity_address(
      'company', v_company_id,
      fp.address_zipcode, v_pref,
      NULL,                       -- freee は市区町村を分けて持たない
      fp.address_street_name1,    -- 市区町村町名・番地
      fp.address_street_name2,    -- 建物名等
      'main', NULL, NULL, NULL, v_actor
    );
  END IF;

  -- メールドメイン（フリーメール除外は upsert_company_domain 側の既存規約）
  IF fp.email LIKE '%@%' THEN
    v_dom := normalize_domain(split_part(fp.email, '@', 2));
    IF v_dom IS NOT NULL AND NOT is_free_email_domain(v_dom) THEN
      INSERT INTO company_domains (company_id, domain, is_primary, created_by)
      VALUES (v_company_id, v_dom, TRUE, v_actor)
      ON CONFLICT (domain) DO NOTHING;
    END IF;
  END IF;

  UPDATE freee_partners
     SET link_status = 'confirmed',
         company_id  = v_company_id,
         account_id  = NULL,
         linked_at   = now(),
         linked_by   = v_actor
   WHERE id = p_partner_id;

  RETURN v_company_id;
END;
$$;

COMMENT ON FUNCTION register_freee_partner_company IS
'freee 取引先から事業者情報を新規作成して紐付ける。accounts は作らない（契約成立時のトリガーの専権。§16.6）';

REVOKE ALL ON FUNCTION register_freee_partner_company(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION register_freee_partner_company(UUID, UUID) TO authenticated;
