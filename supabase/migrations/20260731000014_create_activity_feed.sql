-- ============================================================
-- アクティビティの横断フィード
--
-- 活動の記録先はテーブルごとに分かれている（社内対応・顧客行動・メール）。
-- 「いつ・誰と・何があったか」を時系列で追うには毎回 3 テーブルを
-- 突き合わせる必要があり、画面ごとに書くと条件がずれる。
-- 読み取り専用のビューに集約して 1 か所で持つ。
--
-- security_invoker = true にして、元テーブルの RLS をそのまま効かせる。
-- これを付けないとビュー所有者の権限で読まれ、member が他人のリードの
-- 対応履歴まで見えてしまう。
--
-- 収録するのは実際に記録されている 3 種。deal_activities と activity_logs は
-- 書き込む画面がまだ無く常に空になるため入れていない。
-- 使い始めるときに UNION ALL を足す。
-- ============================================================

-- ------------------------------------------------------------
-- 顧客行動の種別にも色を持たせる
-- （バッジ色はマスタの color を正本にする規約。ここだけ欠けていた）
-- ------------------------------------------------------------
ALTER TABLE lead_customer_activity_types
  ADD COLUMN IF NOT EXISTS color TEXT;

ALTER TABLE lead_customer_activity_types
  DROP CONSTRAINT IF EXISTS chk_lead_customer_activity_types_color;
ALTER TABLE lead_customer_activity_types
  ADD CONSTRAINT chk_lead_customer_activity_types_color
  CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$');

-- 顧客の意思表示の強さで色を分ける。値は既定色パレット（20260731000001）に揃える
UPDATE lead_customer_activity_types SET color = CASE code
    -- 問い合わせ = 最も強い意思表示
    WHEN 'form_submit'        THEN '#0F766E'  -- 進行・提案
    -- 足を運ぶ・取りに行く = 能動的な接触
    WHEN 'event_attend'       THEN '#0E7490'  -- 接触・育成
    WHEN 'seminar_attend'     THEN '#0E7490'
    WHEN 'webinar_attend'     THEN '#0E7490'
    WHEN 'material_download'  THEN '#0E7490'
    -- 見た・開いた = 受動的な反応
    WHEN 'website_visit'      THEN '#2563EB'  -- 開始・新規
    WHEN 'email_open'         THEN '#2563EB'
    WHEN 'email_click'        THEN '#2563EB'
    ELSE '#6B7280'
  END
 WHERE color IS NULL;

COMMENT ON COLUMN lead_customer_activity_types.color IS
  'バッジ色（#RRGGBB）。顧客の意思表示の強さで分ける';

-- ------------------------------------------------------------
-- 横断フィード本体
--
-- occurred_at は timestamptz に揃える。lead_activities だけ
-- 日付 + 時刻の分割保持なので、JST として組み立ててから変換する。
-- 時刻未入力は 00:00 として組むが、それを「0 時の出来事」と読ませないよう
-- has_time で区別する（画面はこれを見て日付だけ出す）。
--
-- id は行のキーとして使うため、テーブルをまたいでも衝突しないよう
-- source_kind と組で扱う。1 通のメールが複数の連絡先に紐づくと
-- 連絡先ごとに 1 行になるので、キーには email_message_contacts.id を使う。
-- ------------------------------------------------------------
DROP VIEW IF EXISTS activity_feed;

CREATE VIEW activity_feed WITH (security_invoker = true) AS

-- 社内対応履歴（架電など、こちらから動いた記録）
SELECT
  'lead_activity'::TEXT                                     AS source_kind,
  la.id                                                     AS id,
  ((la.called_on + COALESCE(la.called_at_time, TIME '00:00'))
     AT TIME ZONE 'Asia/Tokyo')                             AS occurred_at,
  (la.called_at_time IS NOT NULL)                           AS has_time,
  COALESCE(lat.name, '対応')                                AS activity_name,
  COALESCE(lat.color, '#6B7280')                            AS activity_color,
  -- 種別と同じ文字列なら結果として出す意味がない（「名刺交換／名刺交換」になる）
  NULLIF(lcs.name, lat.name)                                AS outcome_name,
  lcs.color                                                 AS outcome_color,
  la.note                                                   AS detail,
  u.full_name                                               AS actor_name,
  'lead'::TEXT                                              AS entity_type,
  la.lead_id                                                AS entity_id,
  COALESCE(NULLIF(btrim(l.lead_name), ''),
           NULLIF(btrim(l.company_name), ''),
           '(名称未設定)')                                  AS entity_label,
  l.owner_user_id                                           AS owner_user_id
FROM lead_activities la
JOIN leads l               ON l.id  = la.lead_id AND l.deleted_at IS NULL
LEFT JOIN lead_activity_types lat ON lat.id = la.activity_type_id
LEFT JOIN lead_call_statuses  lcs ON lcs.id = la.call_status_id
LEFT JOIN crm_users u             ON u.id   = la.caller_user_id

UNION ALL

-- 顧客行動ログ（相手が動いた記録）
SELECT
  'lead_customer_activity'::TEXT,
  lca.id,
  lca.occurred_at,
  TRUE,
  COALESCE(lcat.name, '行動'),
  COALESCE(lcat.color, '#6B7280'),
  lca.source,
  NULL::TEXT,
  lca.detail,
  NULL::TEXT,                        -- 顧客側の行動なので社内担当者は持たない
  'lead'::TEXT,
  lca.lead_id,
  COALESCE(NULLIF(btrim(l.lead_name), ''),
           NULLIF(btrim(l.company_name), ''),
           '(名称未設定)'),
  l.owner_user_id
FROM lead_customer_activities lca
JOIN leads l ON l.id = lca.lead_id AND l.deleted_at IS NULL
LEFT JOIN lead_customer_activity_types lcat ON lcat.id = lca.activity_type_id

UNION ALL

-- メールのやり取り（Gmail 同期）
SELECT
  'email'::TEXT,
  emc.id,
  em.sent_at,
  TRUE,
  CASE em.direction WHEN 'inbound' THEN 'メール受信' ELSE 'メール送信' END,
  CASE em.direction WHEN 'inbound' THEN '#0E7490' ELSE '#4D7A65' END,
  NULL::TEXT,
  NULL::TEXT,
  em.subject,
  CASE WHEN em.direction = 'outbound' THEN cu.full_name ELSE NULL END,
  'contact'::TEXT,
  c.id,
  btrim(c.last_name || ' ' || COALESCE(c.first_name, '')),
  c.owner_user_id
FROM email_message_contacts emc
JOIN email_messages em ON em.id = emc.message_id
JOIN contacts c        ON c.id  = emc.contact_id AND c.deleted_at IS NULL
LEFT JOIN gmail_connections gc ON gc.id = em.connection_id
LEFT JOIN crm_users cu         ON cu.id = gc.crm_user_id
-- from / to / cc の複数 role で同じ連絡先に付くことがあるため代表 1 行に絞る
WHERE emc.id = (
  SELECT e2.id FROM email_message_contacts e2
   WHERE e2.message_id = emc.message_id AND e2.contact_id = emc.contact_id
   ORDER BY e2.created_at, e2.id
   LIMIT 1
);

COMMENT ON VIEW activity_feed IS
  '社内対応・顧客行動・メールを時系列で横断する読み取り専用ビュー。RLS は元テーブルに委譲（security_invoker）';

GRANT SELECT ON activity_feed TO authenticated;
