-- 連絡先の SNS・チャットの連絡口。
--
-- 1 人が Chatwork と Slack の両方を持つ、Slack が 2 ワークスペースにある、
-- といったことがあるので 1:N。**個別の DM へ直接飛べる形**で持つ。
--
-- サービスはマスタにする。飛び先の URL の作り方はサービスごとに違うが
-- 置換で済むため、雛形をマスタに置けば新しい SNS を admin が足せる
-- （コードを直さなくてよい）。

-- ---------------------------------------------------------------------------
-- M: social_services（サービスマスタ）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS social_services (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  -- 一覧に丸バッジで並べるときの表記。ブランドのロゴは使えないので
  -- 1〜4 文字の略称と色で見分ける
  short_label TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#6B7280',

  -- 飛び先。{account_id} と {workspace} を差し替える。
  -- 例: 'https://line.me/ti/p/~{account_id}'
  dm_url_template TEXT,

  -- Slack のようにワークスペースまで決めないと相手が定まらないサービス用
  requires_workspace BOOLEAN NOT NULL DEFAULT FALSE,
  workspace_label    TEXT,

  -- 入力欄に出す案内。サービスごとに「何の ID か」が違う
  account_label TEXT NOT NULL DEFAULT 'ID',
  hint          TEXT,

  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_social_services_color CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  -- ワークスペースが要るなら、何を入れる欄なのか名前が要る
  CONSTRAINT chk_social_services_workspace
    CHECK (NOT requires_workspace OR workspace_label IS NOT NULL)
);

COMMENT ON TABLE social_services IS
  'SNS・チャットのサービス。dm_url_template の {account_id} / {workspace} を差し替えて個別の DM へ飛ぶ。';

CREATE TRIGGER trg_social_services_updated_at
  BEFORE UPDATE ON social_services
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE social_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "social_services_select_authenticated" ON social_services
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "social_services_insert_admin" ON social_services
  FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "social_services_update_admin" ON social_services
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "social_services_delete_admin" ON social_services
  FOR DELETE TO authenticated USING (is_admin());

-- ---------------------------------------------------------------------------
-- J: contact_social_accounts（連絡先 × サービス）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contact_social_accounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id  UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  service_id  UUID NOT NULL REFERENCES social_services(id),

  -- 相手を指す値。サービスによって意味が変わる
  -- （LINE ID / Chatwork のルーム ID / Slack のメンバー ID …）
  account_id  TEXT NOT NULL,
  -- Slack のワークスペースなど、相手を絞るための上位の識別子
  workspace   TEXT,
  -- 画面での見え方。同じサービスに複数あるとき「営業用」などで区別する
  display_name TEXT,
  note        TEXT,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID NOT NULL REFERENCES crm_users(id)
                DEFAULT 'a0000000-0000-0000-0000-000000000001'::uuid,
  last_updated_by UUID REFERENCES crm_users(id),

  CONSTRAINT chk_contact_social_account_id CHECK (btrim(account_id) <> ''),
  -- 同じ相手を二重に登録しない。ワークスペース違いは別物として通す
  CONSTRAINT uq_contact_social_account
    UNIQUE (contact_id, service_id, account_id, workspace)
);

COMMENT ON TABLE contact_social_accounts IS
  '連絡先の SNS・チャットの連絡口。1 人が複数持てる。contacts.line_user_id（Messaging API 用）とは別物。';

CREATE INDEX IF NOT EXISTS idx_contact_social_accounts_contact
  ON contact_social_accounts (contact_id);

CREATE TRIGGER trg_contact_social_accounts_updated_at
  BEFORE UPDATE ON contact_social_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE contact_social_accounts ENABLE ROW LEVEL SECURITY;

-- 親（連絡先）の見え方に合わせる。従属テーブルの決まりどおり
-- owner_user_id を見に行く
CREATE POLICY "contact_social_accounts_select" ON contact_social_accounts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_social_accounts.contact_id
        AND (is_manager_or_above() OR c.owner_user_id = auth.uid())
    )
  );

CREATE POLICY "contact_social_accounts_insert" ON contact_social_accounts
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_social_accounts.contact_id
        AND (is_manager_or_above() OR c.owner_user_id = auth.uid())
    )
  );

CREATE POLICY "contact_social_accounts_update" ON contact_social_accounts
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_social_accounts.contact_id
        AND (is_manager_or_above() OR c.owner_user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_social_accounts.contact_id
        AND (is_manager_or_above() OR c.owner_user_id = auth.uid())
    )
  );

CREATE POLICY "contact_social_accounts_delete" ON contact_social_accounts
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_social_accounts.contact_id
        AND (is_manager_or_above() OR c.owner_user_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 初期データ
--
-- 飛び先はいずれも「相手ひとりとのやり取り」を開く URL。
-- LinkedIn だけは DM の直リンクが無いのでプロフィールを開く。
-- ---------------------------------------------------------------------------
INSERT INTO social_services
  (code, name, short_label, color, dm_url_template, requires_workspace,
   workspace_label, account_label, hint, sort_order)
VALUES
  ('chatwork', 'Chatwork', 'CW', '#F03D24',
   'https://www.chatwork.com/#!rid{account_id}', FALSE, NULL,
   'ダイレクトチャットのルーム ID',
   'ダイレクトチャットを開いた URL の #!rid のあとの数字', 10),

  ('slack', 'Slack', 'Sl', '#4A154B',
   'https://app.slack.com/client/{workspace}/{account_id}', TRUE,
   'ワークスペース ID（T から始まる）',
   'メンバー ID（U から始まる）',
   'プロフィール → その他 → メンバー ID をコピー', 20),

  ('line', 'LINE', 'LINE', '#06C755',
   'https://line.me/ti/p/~{account_id}', FALSE, NULL,
   'LINE ID',
   '相手が ID 検索を許可している必要があります', 30),

  ('x', 'X', 'X', '#000000',
   'https://x.com/messages/compose?recipient_id={account_id}', FALSE, NULL,
   '数値のユーザー ID',
   '@ 名ではなく数値 ID。DM を受け付けている相手のみ開けます', 40),

  ('messenger', 'Messenger', 'FB', '#0084FF',
   'https://m.me/{account_id}', FALSE, NULL,
   'ユーザー名または ID', NULL, 50),

  ('instagram', 'Instagram', 'IG', '#E4405F',
   'https://ig.me/m/{account_id}', FALSE, NULL,
   'ユーザー名', NULL, 60),

  ('linkedin', 'LinkedIn', 'in', '#0A66C2',
   'https://www.linkedin.com/in/{account_id}', FALSE, NULL,
   'パブリックプロフィール ID',
   'DM の直リンクが無いためプロフィールを開きます', 70),

  ('other', 'その他', '他', '#6B7280',
   '{account_id}', FALSE, NULL,
   'URL',
   'https:// から始まる URL をそのまま入れてください', 900)
ON CONFLICT (code) DO NOTHING;
