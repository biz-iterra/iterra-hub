-- ============================================================
-- Gmail 連携によるやり取りの記録
--
-- 目的:
--   連絡先とのメール送受信を CRM 側で時系列に追えるようにする。
--   名刺交換をしていない相手とのやり取りも拾い、連絡先として登録できる。
--
-- 方針（2026-07-31 決定）:
--   - 連携は「ユーザーごとの OAuth」。1 人が複数アカウントを繋げる
--     （個人アドレス・info@ 等の別アカウント・共有メールボックス）
--   - **本文と添付は保存しない。** 件名・相手・日時だけを持ち、
--     中身を見るときは Gmail へ遷移する。
--     Gmail API のスコープも gmail.metadata を使い、本文を取得できる
--     権限自体を要求しない。契約書や個人情報を CRM に複製しないため
--   - 未登録アドレスは候補として溜め、担当者が承認したら連絡先にする。
--     自動作成にすると配信メールやメーリングリストで連絡先が汚れる
-- ============================================================

-- ------------------------------------------------------------
-- 連携アカウント
--
-- リフレッシュトークンは pgcrypto で暗号化して保存する。
-- 鍵は DB に置かずアプリの環境変数（GMAIL_TOKEN_ENCRYPTION_KEY）が持つ。
-- DB のダンプだけが漏れてもトークンを復号できないようにするため。
-- ------------------------------------------------------------
CREATE TABLE gmail_connections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 連携したユーザー。共有メールボックスでも「誰が繋いだか」を残す
  crm_user_id       UUID NOT NULL REFERENCES crm_users(id) ON DELETE CASCADE,
  -- 連携先の Gmail アドレス
  email_address     TEXT NOT NULL,
  -- pgp_sym_encrypt で暗号化したリフレッシュトークン
  refresh_token_enc BYTEA NOT NULL,
  -- 実際に許可されたスコープ。gmail.metadata から広がっていないか監査する
  granted_scope     TEXT,
  -- Gmail の差分同期に使う。NULL なら初回同期がまだ
  last_history_id   TEXT,
  last_synced_at    TIMESTAMPTZ,
  -- 同期でエラーが続いた場合に理由を残す（再認可が必要など）
  last_error        TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT gmail_connections_email_format_check
    CHECK (email_address ~ '^[^@[:space:]]+@[^@[:space:]]+$')
);

-- 同じアドレスを二重に繋がせない
CREATE UNIQUE INDEX gmail_connections_email_key
  ON gmail_connections(lower(email_address)) WHERE is_active;
CREATE INDEX gmail_connections_user_idx ON gmail_connections(crm_user_id);

COMMENT ON TABLE gmail_connections IS 'Gmail 連携アカウント。1 ユーザーが複数繋げる';
COMMENT ON COLUMN gmail_connections.refresh_token_enc IS 'pgcrypto で暗号化済み。鍵はアプリの環境変数が持つ';
COMMENT ON COLUMN gmail_connections.last_history_id IS 'Gmail の historyId。差分同期の起点';

CREATE TRIGGER trg_gmail_connections_updated_at
  BEFORE UPDATE ON gmail_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ------------------------------------------------------------
-- 同期したメール（メタデータのみ）
-- ------------------------------------------------------------
CREATE TABLE email_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id   UUID NOT NULL REFERENCES gmail_connections(id) ON DELETE CASCADE,
  -- Gmail 側の ID。再同期しても重複しないための冪等キー
  gmail_message_id TEXT NOT NULL,
  gmail_thread_id  TEXT NOT NULL,
  -- inbound = 受信, outbound = 送信。連携アドレスが From かどうかで決まる
  direction       TEXT NOT NULL,
  subject         TEXT,
  sent_at         TIMESTAMPTZ NOT NULL,
  from_email      TEXT NOT NULL,
  from_name       TEXT,
  -- 宛先は複数ありうるので配列で持つ。連絡先との対応は email_message_contacts
  to_emails       TEXT[] NOT NULL DEFAULT '{}',
  cc_emails       TEXT[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT email_messages_direction_check
    CHECK (direction IN ('inbound', 'outbound'))
);

CREATE UNIQUE INDEX email_messages_gmail_key
  ON email_messages(connection_id, gmail_message_id);
CREATE INDEX email_messages_sent_at_idx ON email_messages(sent_at DESC);
CREATE INDEX email_messages_thread_idx  ON email_messages(gmail_thread_id);

COMMENT ON TABLE email_messages IS 'Gmail から同期したメールのメタデータ。本文・添付は保存しない（Gmail 側で見る）';

-- ------------------------------------------------------------
-- メール × 連絡先
--
-- 1 通に複数の連絡先が絡む（To に 2 名、Cc に 1 名など）ため N:M。
-- 連絡先詳細の「やり取り履歴」はこの表を引く。
-- ------------------------------------------------------------
CREATE TABLE email_message_contacts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  -- そのメールでこの連絡先が担った役割
  role       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT email_message_contacts_role_check
    CHECK (role IN ('from', 'to', 'cc')),
  CONSTRAINT email_message_contacts_unique UNIQUE (message_id, contact_id, role)
);

CREATE INDEX email_message_contacts_contact_idx ON email_message_contacts(contact_id);

COMMENT ON TABLE email_message_contacts IS 'メールと連絡先の対応。連絡先ごとのやり取り履歴はここを引く';

-- ------------------------------------------------------------
-- 連絡先候補
--
-- 既存の連絡先に一致しないアドレスを溜める。担当者が承認したときだけ
-- 連絡先を作る。自動作成だと配信メール・メーリングリスト・社内メールで
-- 連絡先が埋まってしまう。
-- ------------------------------------------------------------
CREATE TABLE email_contact_candidates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_address   TEXT NOT NULL,
  -- ヘッダの表示名。連絡先を作るときの氏名の手がかりにする
  display_name    TEXT,
  -- ドメインから引き当てた法人（あれば）。承認時の所属の初期値になる
  company_id      UUID REFERENCES companies(id) ON DELETE SET NULL,
  message_count   INTEGER NOT NULL DEFAULT 0,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- pending = 未処理, registered = 連絡先を作成済み, ignored = 対象外にした
  status          TEXT NOT NULL DEFAULT 'pending',
  -- 承認して作られた連絡先
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID REFERENCES crm_users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT email_contact_candidates_status_check
    CHECK (status IN ('pending', 'registered', 'ignored'))
);

CREATE UNIQUE INDEX email_contact_candidates_email_key
  ON email_contact_candidates(lower(email_address));
CREATE INDEX email_contact_candidates_status_idx
  ON email_contact_candidates(status, last_seen_at DESC);

COMMENT ON TABLE email_contact_candidates IS '未登録アドレスの候補。承認したときだけ連絡先を作る';

CREATE TRIGGER trg_email_contact_candidates_updated_at
  BEFORE UPDATE ON email_contact_candidates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- RLS
--
-- メールのやり取りは業務情報だが、連携元は個人のメールボックス。
-- 連携そのものは本人と admin だけが触れる。
-- 同期されたメールは、連絡先の可視範囲（manager 以上は全件、
-- member は自分が担当する連絡先）に合わせる。
-- ============================================================
ALTER TABLE gmail_connections        ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_messages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_message_contacts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_contact_candidates ENABLE ROW LEVEL SECURITY;

-- 連携: 本人のみ（admin は棚卸しのため参照可）
CREATE POLICY gmail_connections_select ON gmail_connections
  FOR SELECT TO authenticated
  USING (crm_user_id = auth.uid() OR is_admin());
CREATE POLICY gmail_connections_insert ON gmail_connections
  FOR INSERT TO authenticated
  WITH CHECK (crm_user_id = auth.uid());
CREATE POLICY gmail_connections_update ON gmail_connections
  FOR UPDATE TO authenticated
  USING (crm_user_id = auth.uid() OR is_admin())
  WITH CHECK (crm_user_id = auth.uid() OR is_admin());
CREATE POLICY gmail_connections_delete ON gmail_connections
  FOR DELETE TO authenticated
  USING (crm_user_id = auth.uid() OR is_admin());

-- メール: 紐づく連絡先が見えるなら見える。連絡先が付く前は連携者と manager 以上
CREATE POLICY email_messages_select ON email_messages
  FOR SELECT TO authenticated
  USING (
    is_manager_or_above()
    OR EXISTS (
      SELECT 1 FROM gmail_connections gc
       WHERE gc.id = email_messages.connection_id
         AND gc.crm_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM email_message_contacts emc
       JOIN contacts c ON c.id = emc.contact_id
      WHERE emc.message_id = email_messages.id
        AND c.owner_user_id = auth.uid()
    )
  );

CREATE POLICY email_message_contacts_select ON email_message_contacts
  FOR SELECT TO authenticated
  USING (
    is_manager_or_above()
    OR EXISTS (
      SELECT 1 FROM contacts c
       WHERE c.id = email_message_contacts.contact_id
         AND c.owner_user_id = auth.uid()
    )
  );

-- 候補の確認・承認は manager 以上。個人メールのアドレスが並ぶため範囲を絞る
CREATE POLICY email_contact_candidates_select ON email_contact_candidates
  FOR SELECT TO authenticated USING (is_manager_or_above());
CREATE POLICY email_contact_candidates_update ON email_contact_candidates
  FOR UPDATE TO authenticated
  USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());

-- 同期処理（service_role）が書き込む。RLS はバイパスされるので
-- authenticated 向けの INSERT ポリシーは置かない
