-- ============================================================
-- Google コンタクト同期（Phase 1: 接続 + CRM → Google の push）
--
-- 設計の正本は docs/google-contacts-sync.md。
--
-- 方針（2026-08-05 決定）:
--   - **CRM が正本。** CRM 側の変更は自動で Google へ反映する。
--     電話帳は「常に最新」であることが目的そのもので、人の確認を挟むと
--     放置され古い電話帳が残る（freee と意図的に変えた点）
--   - Google 側の変更は差分画面で人が確定する（Phase 2）
--   - 対象は**全連絡先**。連絡先の参照は全ロールに開いている（RLS）ので整合する
--   - 接続は**会社の Workspace アカウント限定**。Google 側は内部アプリにし、
--     アプリ側でも hd を検証する（多層防御）
--   - **同期対象はコンタクトグループ「ITERRA CRM」の中だけ**。
--     利用者の個人的な連絡先には一切触れない
-- ============================================================

-- ------------------------------------------------------------
-- 1. 接続
--
-- Gmail（gmail_connections）と同じくユーザーごとの OAuth。
-- freee と同じくアクセストークンも暗号化保存して期限内は再利用する
-- （毎回リフレッシュすると無駄に Google を叩く）。
--
-- Google のリフレッシュトークンは freee と違い**ローテーションしない**ので、
-- 「保存前に落ちると接続が死ぬ」という freee 特有の注意は当てはまらない。
-- ------------------------------------------------------------
CREATE TABLE google_contact_connections (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_user_id             UUID NOT NULL REFERENCES crm_users(id) ON DELETE CASCADE,
  email_address           TEXT NOT NULL,
  -- 認可したアカウントの組織ドメイン（ID トークンの hd）。会社限定の証跡
  hd_domain               TEXT,
  refresh_token_enc       BYTEA NOT NULL,
  access_token_enc        BYTEA,
  access_token_expires_at TIMESTAMPTZ,
  -- 実際に許可されたスコープ。contacts から広がっていないか監査する
  granted_scope           TEXT,
  -- People API の差分取得の起点。NULL なら次回は全件取得
  sync_token              TEXT,
  -- 「ITERRA CRM」グループの resourceName（contactGroups/xxx）
  contact_group_resource  TEXT,
  last_synced_at          TIMESTAMPTZ,
  last_error              TEXT,
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT google_contact_connections_email_format_check
    CHECK (email_address ~ '^[^@[:space:]]+@[^@[:space:]]+$')
);

-- 同じアドレスを二重に繋がせない（Gmail 連携と同じ）
CREATE UNIQUE INDEX google_contact_connections_email_key
  ON google_contact_connections(lower(email_address)) WHERE is_active;
CREATE INDEX google_contact_connections_user_idx
  ON google_contact_connections(crm_user_id);

COMMENT ON TABLE google_contact_connections IS
'Google コンタクト連携の接続。ユーザーごとの OAuth。会社の Workspace アカウント限定';
COMMENT ON COLUMN google_contact_connections.refresh_token_enc IS
'アプリ側で AES-256-GCM 暗号化済み。鍵は環境変数（GOOGLE_CONTACTS_TOKEN_ENCRYPTION_KEY）';
COMMENT ON COLUMN google_contact_connections.sync_token IS
'People API の syncToken。約 7 日で失効し、そのときは全件取得からやり直す';
COMMENT ON COLUMN google_contact_connections.contact_group_resource IS
'同期対象の境界。このグループの中だけを触る（個人の連絡先に触れないため）';

CREATE TRIGGER trg_google_contact_connections_updated_at
  BEFORE UPDATE ON google_contact_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ------------------------------------------------------------
-- 2. Google 側のミラー
--
-- グループ内の連絡先だけを持つ。Phase 2 の差分検出はここと CRM を比べる。
-- ------------------------------------------------------------
CREATE TABLE google_contacts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id         UUID NOT NULL REFERENCES google_contact_connections(id) ON DELETE CASCADE,
  -- people/c1234567890
  resource_name         TEXT NOT NULL,
  -- 更新時に必須。**不一致なら他所で変わっている**ので上書きしない
  etag                  TEXT,

  family_name           TEXT,
  middle_name           TEXT,
  given_name            TEXT,
  family_name_kana      TEXT,
  middle_name_kana      TEXT,
  given_name_kana       TEXT,

  org_name              TEXT,
  department            TEXT,
  job_title             TEXT,

  -- 年ありのときだけ入る。CRM は DATE なので年なしは取り込めない（§4.1）
  birth_date            DATE,
  -- 年なしで持たれていた場合の表示用（mm-dd）
  birthday_without_year TEXT,

  -- [{"email": "...", "label": "work"}] / [{"phone": "...", "label": "mobile"}]
  emails                JSONB NOT NULL DEFAULT '[]'::JSONB,
  phones                JSONB NOT NULL DEFAULT '[]'::JSONB,
  addresses             JSONB NOT NULL DEFAULT '[]'::JSONB,

  -- clientData に刻んだ CRM の連絡先コード。対応付けの復元に使う
  client_contact_code   TEXT,
  -- 所属グループ。ITERRA CRM から外されたかを見る
  group_resource_names  TEXT[] NOT NULL DEFAULT '{}',

  google_deleted_at     TIMESTAMPTZ,
  synced_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT google_contacts_resource_key UNIQUE (connection_id, resource_name)
);

CREATE INDEX google_contacts_connection_idx ON google_contacts(connection_id);
CREATE INDEX google_contacts_code_idx ON google_contacts(client_contact_code)
  WHERE client_contact_code IS NOT NULL;

COMMENT ON TABLE google_contacts IS
'Google 側の連絡先のミラー（ITERRA CRM グループ内のみ）。差分検出の材料';

CREATE TRIGGER trg_google_contacts_updated_at
  BEFORE UPDATE ON google_contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ------------------------------------------------------------
-- 3. 対応付け（正）
--
-- どの連絡先がどの Google 連絡先か。clientData とグループは復元と
-- 見分けのための補助で、判断はこの表が持つ。
-- ------------------------------------------------------------
CREATE TABLE google_contact_links (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id       UUID NOT NULL REFERENCES google_contact_connections(id) ON DELETE CASCADE,
  contact_id          UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  google_contact_id   UUID REFERENCES google_contacts(id) ON DELETE SET NULL,
  -- people/c1234567890。google_contacts が消えても対応を追えるよう二重に持つ
  resource_name       TEXT,

  -- active: 同期する / excluded: この連絡先は同期しない（人が外した）
  status              TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'excluded')),

  -- 最後に push した内容の指紋。CRM 側の変更検出に使う（§5.2）
  pushed_fingerprint  TEXT,
  -- push した時点の etag。Google 側で変わったかの判断材料
  etag_at_sync        TEXT,
  last_pushed_at      TIMESTAMPTZ,
  last_error          TEXT,

  linked_by           UUID REFERENCES crm_users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 1 接続につき 1 連絡先 1 行
  CONSTRAINT google_contact_links_contact_key UNIQUE (connection_id, contact_id)
);

-- **同じ Google 連絡先に複数の CRM 連絡先を紐付けない。**
-- freee で company_id に UNIQUE が無く二重紐付けが起きたのと同じ穴を塞ぐ
CREATE UNIQUE INDEX google_contact_links_resource_key
  ON google_contact_links(connection_id, resource_name)
  WHERE resource_name IS NOT NULL;
CREATE INDEX google_contact_links_contact_idx ON google_contact_links(contact_id);

COMMENT ON TABLE google_contact_links IS
'CRM の連絡先と Google 連絡先の対応付け（正）。1 接続 × 1 連絡先 × 1 Google 連絡先';
COMMENT ON COLUMN google_contact_links.pushed_fingerprint IS
'最後に push した同期対象項目の指紋。contact_emails 等に updated_at が無いため内容で比べる';

CREATE TRIGGER trg_google_contact_links_updated_at
  BEFORE UPDATE ON google_contact_links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ------------------------------------------------------------
-- 4. 反映の記録
--
-- 成否とも必ず残す（freee_sync_logs と同型）。
-- 「送ったが弾かれた」を後から追えないと原因が分からなくなる。
-- ------------------------------------------------------------
CREATE TABLE google_contact_sync_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id  UUID NOT NULL REFERENCES google_contact_connections(id) ON DELETE CASCADE,
  -- 連絡先が消えてもログは残す
  contact_id     UUID REFERENCES contacts(id) ON DELETE SET NULL,
  resource_name  TEXT,
  -- to_google: CRM → Google / to_crm: Google → CRM（Phase 2）
  direction      TEXT NOT NULL CHECK (direction IN ('to_google', 'to_crm')),
  -- create / update / delete
  operation      TEXT NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
  changes        JSONB NOT NULL DEFAULT '{}'::JSONB,
  succeeded      BOOLEAN NOT NULL,
  error_message  TEXT,
  performed_by   UUID REFERENCES crm_users(id),
  performed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX google_contact_sync_logs_connection_idx
  ON google_contact_sync_logs(connection_id, performed_at DESC);

COMMENT ON TABLE google_contact_sync_logs IS
'Google コンタクト同期の記録。成否とも残す（失敗の理由を後から追うため）';

-- ============================================================
-- RLS
--
-- 接続・ミラー・リンクとも**接続の所有者 + admin**が参照できる。
-- 書き込みは同期（service_role）と SECURITY DEFINER 関数のみ。
--
-- 引数なしの関数はスカラーサブクエリで包む（プランナが行ごとに評価するのを防ぐ）。
-- ============================================================
ALTER TABLE google_contact_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_contacts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_contact_links       ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_contact_sync_logs   ENABLE ROW LEVEL SECURITY;

CREATE POLICY google_contact_connections_select ON google_contact_connections
  FOR SELECT TO authenticated
  USING (crm_user_id = (SELECT auth.uid()) OR (SELECT is_admin()));

-- 接続の作成・切断は本人だけ（admin でも他人のトークンは触らせない）
CREATE POLICY google_contact_connections_insert ON google_contact_connections
  FOR INSERT TO authenticated
  WITH CHECK (crm_user_id = (SELECT auth.uid()));

CREATE POLICY google_contact_connections_update ON google_contact_connections
  FOR UPDATE TO authenticated
  USING (crm_user_id = (SELECT auth.uid()))
  WITH CHECK (crm_user_id = (SELECT auth.uid()));

CREATE POLICY google_contacts_select ON google_contacts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM google_contact_connections c
       WHERE c.id = google_contacts.connection_id
         AND (c.crm_user_id = (SELECT auth.uid()) OR (SELECT is_admin()))
    )
  );

CREATE POLICY google_contact_links_select ON google_contact_links
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM google_contact_connections c
       WHERE c.id = google_contact_links.connection_id
         AND (c.crm_user_id = (SELECT auth.uid()) OR (SELECT is_admin()))
    )
  );

-- 同期対象から外す / 戻すのは画面から行う（本人のみ）
CREATE POLICY google_contact_links_update ON google_contact_links
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM google_contact_connections c
       WHERE c.id = google_contact_links.connection_id
         AND c.crm_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM google_contact_connections c
       WHERE c.id = google_contact_links.connection_id
         AND c.crm_user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY google_contact_sync_logs_select ON google_contact_sync_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM google_contact_connections c
       WHERE c.id = google_contact_sync_logs.connection_id
         AND (c.crm_user_id = (SELECT auth.uid()) OR (SELECT is_admin()))
    )
  );

-- ============================================================
-- 送る値を 1 か所で集める
--
-- **同期対象の項目だけ**を返す。社内メモ・診断・ステータス等は含めない
-- （docs/google-contacts-sync.md §4.5）。
-- 変換（ラベル・誕生日の形）は TS 側で行う。
-- ============================================================
CREATE OR REPLACE FUNCTION get_contact_google_source(p_contact_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c JSONB;
BEGIN
  SELECT jsonb_build_object(
           'contact_id',       ct.id,
           'contact_code',     ct.contact_code,
           'last_name',        ct.last_name,
           'middle_name',      ct.middle_name,
           'first_name',       ct.first_name,
           'last_name_kana',   ct.last_name_kana,
           'middle_name_kana', ct.middle_name_kana,
           'first_name_kana',  ct.first_name_kana,
           'company_name',     co.name,
           'department',       ct.department,
           'job_title',        ct.job_title,
           -- 誕生日は同期する（2026-08-05 の依頼）。診断結果は出さない
           'birth_date',       to_char(ct.birth_date, 'YYYY-MM-DD'),
           'emails', COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
                      'email', e.email, 'label', e.label, 'is_primary', e.is_primary)
                    ORDER BY e.is_primary DESC, e.email)
               FROM contact_emails e WHERE e.contact_id = ct.id), '[]'::JSONB),
           'phones', COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
                      'phone', p.phone, 'label', p.label, 'is_primary', p.is_primary)
                    ORDER BY p.is_primary DESC, p.phone)
               FROM contact_phones p WHERE p.contact_id = ct.id), '[]'::JSONB),
           'addresses', COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
                      'label', ea.label, 'is_primary', ea.is_primary,
                      'postal_code', a.postal_code, 'prefecture', a.prefecture,
                      'city', a.city, 'address_line1', a.address_line1,
                      'address_line2', a.address_line2)
                    ORDER BY ea.is_primary DESC, a.postal_code)
               FROM entity_addresses ea
               JOIN addresses a ON a.id = ea.address_id
              WHERE ea.contact_id = ct.id), '[]'::JSONB)
         )
    INTO c
    FROM contacts ct
    LEFT JOIN companies co ON co.id = ct.company_id AND co.deleted_at IS NULL
   WHERE ct.id = p_contact_id
     AND ct.deleted_at IS NULL;

  RETURN c;  -- 見つからない（削除済み含む）なら NULL
END;
$$;

COMMENT ON FUNCTION get_contact_google_source IS
'Google コンタクトへ送る値一式。同期対象の項目だけを返す（社内メモ・診断は含めない）';

REVOKE ALL ON FUNCTION get_contact_google_source(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_contact_google_source(UUID) TO authenticated, service_role;

-- ============================================================
-- push 対象の洗い出し
--
-- **削除済みも含めて返す。** CRM で論理削除された連絡先は Google からも
-- 消す必要があり、「対象外になった」ことを検出できないと消し漏れる。
-- ============================================================
CREATE OR REPLACE FUNCTION list_google_push_targets(p_connection_id UUID)
RETURNS TABLE (
  contact_id     UUID,
  link_id        UUID,
  resource_name  TEXT,
  etag           TEXT,
  fingerprint    TEXT,
  is_deleted     BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- ① まだ Google に無い連絡先（新規作成の対象）
  SELECT ct.id, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, FALSE
    FROM contacts ct
   WHERE ct.deleted_at IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM google_contact_links l
        WHERE l.connection_id = p_connection_id AND l.contact_id = ct.id
     )
  UNION ALL
  -- ② 既にリンクがあるもの（更新・削除の判断は呼び出し側が指紋で行う）
  SELECT l.contact_id, l.id, l.resource_name, l.etag_at_sync, l.pushed_fingerprint,
         (ct.deleted_at IS NOT NULL)
    FROM google_contact_links l
    JOIN contacts ct ON ct.id = l.contact_id
   WHERE l.connection_id = p_connection_id
     AND l.status = 'active';
$$;

COMMENT ON FUNCTION list_google_push_targets IS
'CRM → Google へ送る候補。論理削除済みも返す（Google 側から消すため）';

REVOKE ALL ON FUNCTION list_google_push_targets(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_google_push_targets(UUID) TO service_role;

-- ============================================================
-- push の結果を記録する
--
-- **1 つの関数にまとめる。** supabase-js は複数文を 1 トランザクションに
-- できないため、アプリ側で「リンク更新 → ログ」と順に呼ぶと途中で失敗した
-- ときに中途半端な状態が残る（データ整合性の規約）。
-- ============================================================
-- **値の入らない引数は既定値を持たせて後ろに集める。**
-- 生成される TS の型が optional になり、呼び出し側で undefined を渡せる
-- （既定値の無い引数は string 必須になり、null を渡せない）
CREATE OR REPLACE FUNCTION record_google_push(
  p_connection_id  UUID,
  p_contact_id     UUID,
  p_operation      TEXT,
  p_succeeded      BOOLEAN,
  p_resource_name  TEXT DEFAULT NULL,
  p_etag           TEXT DEFAULT NULL,
  p_fingerprint    TEXT DEFAULT NULL,
  p_error          TEXT DEFAULT NULL,
  p_actor          UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_link_id UUID;
BEGIN
  IF p_succeeded THEN
    IF p_operation = 'delete' THEN
      -- Google から消したらリンクも畳む。**ログは残す**
      DELETE FROM google_contact_links
       WHERE connection_id = p_connection_id AND contact_id = p_contact_id
       RETURNING id INTO v_link_id;
    ELSE
      INSERT INTO google_contact_links (
        connection_id, contact_id, resource_name, etag_at_sync,
        pushed_fingerprint, last_pushed_at, last_error, linked_by
      ) VALUES (
        p_connection_id, p_contact_id, p_resource_name, p_etag,
        p_fingerprint, now(), NULL, p_actor
      )
      ON CONFLICT (connection_id, contact_id) DO UPDATE SET
        resource_name      = EXCLUDED.resource_name,
        etag_at_sync       = EXCLUDED.etag_at_sync,
        pushed_fingerprint = EXCLUDED.pushed_fingerprint,
        last_pushed_at     = now(),
        last_error         = NULL
      RETURNING id INTO v_link_id;
    END IF;
  ELSE
    -- 失敗したら理由をリンクに残す（次回の同期で再試行される）
    UPDATE google_contact_links
       SET last_error = p_error
     WHERE connection_id = p_connection_id AND contact_id = p_contact_id
     RETURNING id INTO v_link_id;
  END IF;

  INSERT INTO google_contact_sync_logs (
    connection_id, contact_id, resource_name, direction, operation,
    changes, succeeded, error_message, performed_by
  ) VALUES (
    p_connection_id, p_contact_id, p_resource_name, 'to_google', p_operation,
    '{}'::JSONB, p_succeeded, p_error, p_actor
  );

  RETURN v_link_id;
END;
$$;

COMMENT ON FUNCTION record_google_push IS
'CRM → Google の反映結果を記録する。リンクの更新とログを 1 トランザクションで行う';

REVOKE ALL ON FUNCTION record_google_push(UUID, UUID, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_google_push(UUID, UUID, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT, UUID) TO service_role;
