# Google コンタクト同期 設計書

作成: 2026-08-05（設計のみ。実装は未着手）

CRM の連絡先を各メンバーの Google コンタクトへ同期する。
スマホの電話帳に顧客の名前が出る・Gmail の宛先補完に出ることが主目的。

## 1. 決定事項（2026-08-05 利用者確認）

| 論点 | 決定 |
|---|---|
| 方向 | **双方向。ただし Google → CRM は差分画面で人が確定する**（freee と同じ方式） |
| 対象 | **全連絡先**（論理削除済みを除く。参照が全ロールに開いている RLS と整合） |
| 接続先 | **会社の Google Workspace アカウント限定**（個人 Gmail には同期させない） |

### 1.1 同期モデル（freee との違い）

**CRM が正本。** そのうえで方向ごとに扱いを変える。

| 変更の起点 | 扱い | 理由 |
|---|---|---|
| CRM 側の変更（作成・更新・削除） | **自動で Google へ反映** | 電話帳は「常に最新」であることが目的そのもの。人の確認を挟むと放置され、古い電話帳が残る |
| Google 側の変更 | **差分画面に出し、人が確定**（取り込む / CRM の値で上書き / 触らない） | スマホでの編集は品質が保証されない。正本（CRM）への書き込みは freee と同じく人が確定する |
| 両方が変わった（競合） | **自動反映を保留し、差分画面で解決** | 未確定の Google 側変更を自動 push で握りつぶさない |

freee が「CRM → freee も人が確定」なのは**会計データが確定値を扱う**ため。
Google コンタクトは配布先のミラーであり同じ制約は無い。この違いは意図的な設計判断。

## 2. 接続（OAuth）

Gmail 連携（`gmail_connections`）と同じ型: ユーザーごとの OAuth・
リフレッシュトークンは pgcrypto で暗号化・`/profile` から接続。

- スコープ: `https://www.googleapis.com/auth/contacts`（読み書き）のみ。
  `granted_scope` を保存しスコープ逸脱を監査する（Gmail と同じ）
- **OAuth クライアントは Gmail と分け、専用の GCP プロジェクトを組織内部アプリにする**
  - 同意画面の「内部 / 外部」は**プロジェクト単位**。Gmail 連携は共有メールボックス等で
    組織外アカウントも繋ぐため外部のまま維持する必要があり、同居できない
  - 内部アプリなら Google の審査が不要で、**Workspace 組織のアカウントしか認可できない**
    （会社アカウント限定を Google 側でも強制できる）
- アプリ側でも `hd` クレームと メールドメインを検証する（多層防御。
  `GOOGLE_CONTACTS_ALLOWED_DOMAIN` と比較し、不一致なら接続を拒否）
- アクセストークンも暗号化保存して再利用する（freee と同じ。毎回リフレッシュしない）。
  Google のリフレッシュトークンは freee と違い**ローテーションしない**

### 2.1 環境変数（シークレット管理の規約に従い Bitwarden → 転記）

| キー | 用途 | 秘密か |
|---|---|---|
| `GOOGLE_CONTACTS_CLIENT_ID` | 専用 OAuth クライアント | 準秘密 |
| `GOOGLE_CONTACTS_CLIENT_SECRET` | 同上 | **秘密** |
| `GOOGLE_CONTACTS_TOKEN_ENCRYPTION_KEY` | トークン暗号化（他の鍵と**別の値**） | **秘密** |
| `GOOGLE_CONTACTS_SYNC_CRON_SECRET` | `/api/google-contacts/sync` の認証 | **秘密** |
| `GOOGLE_CONTACTS_ALLOWED_DOMAIN` | 接続を許すドメイン（例: 会社の Workspace ドメイン） | 公開可 |

## 3. 対応付け（どの連絡先がどの Google 連絡先か）

3 段構えで持つ。

1. **リンク表 `google_contact_links`**（正）: 接続 × 連絡先 × Google の
   `resourceName`（`people/c…`）。etag・push 済み指紋・状態を持つ
2. **`clientData`**: Google 連絡先側に `iterra_contact_code = CNT-000123` を書き込む。
   リンク表が壊れても復元でき、Google 側からも対応が見える（freee の取引先コードと同じ思想）
3. **コンタクトグループ「ITERRA CRM」**: 同期対象を必ずこのグループに入れる。
   利用者が「どれが CRM 管理か」を見分けられ、切断時の一括回収にも使う

**同期対象 = グループの中だけ**という規約にする。

- CRM から push した連絡先は自動でグループに入る
- **Google 側でグループに入れた連絡先は「CRM への登録候補」として画面に出す**
  （Gmail の `email_contact_candidates` と同じ承認方式。自動作成しない）
- グループから外されたら「同期解除の意思」として差分画面に出す
- 個人の連絡先（グループ外）には**一切触れない**

### 3.1 初回接続時の突合

push する前に、**メール完全一致**する既存の Google 連絡先を候補として出し、
「この Google 連絡先と紐づける / 新規に作る」を人が選ぶ（freee の突合画面と同型）。
確認せずに全件作ると、個人の電話帳に既にいる相手が重複する。
候補が無いものは一括「全部新規作成」で流せるようにする（1 件ずつ確認はさせない）。

## 4. 項目の対応（マッピング表）

方向の凡例: **⇄** 双方向（Google → CRM は差分画面で人が確定）/ **→** CRM → Google のみ（自動）/ **✕** 同期しない

### 4.1 基本属性（`contacts` のスカラー列）

| CRM | Google（People API） | 方向 | 備考 |
|---|---|---|---|
| `last_name`（姓） | `names.familyName` | ⇄ | 姓名を構造で持てるので freee の担当者名問題（切れ目不明）は起きない |
| `middle_name` | `names.middleName` | ⇄ | |
| `first_name`（名） | `names.givenName` | ⇄ | |
| `last_name_kana` | `names.phoneticFamilyName` | ⇄ | |
| `middle_name_kana` | `names.phoneticMiddleName` | ⇄ | |
| `first_name_kana` | `names.phoneticGivenName` | ⇄ | |
| 会社名（`company_id` → `companies.name`） | `organizations[0].name` | **→** | 逆向きは「文字列 → 参照」の名寄せになるため取り込まない（freee の会社と同じ構図。候補提示は Phase 3） |
| `department`（部署） | `organizations[0].department` | ⇄ | スカラー列なので双方向可 |
| `job_title`（役職） | `organizations[0].title` | ⇄ | |
| `birth_date`（誕生日） | `birthdays[0].date` | ⇄ | 2026-08-05 に同期対象へ変更（利用者判断）。**Google 側は年なし（月日だけ）で持てる**が CRM は DATE なので、年なしは取り込めない（差分画面に表示のみ）。取り込むと**ポテンシャル診断（番号・星座）が再計算される**旨を差分画面に示す |
| `contact_code` | `clientData["iterra_contact_code"]` | **→** | 対応付けの刻印。人には見せない項目 |

### 4.2 メール（`contact_emails`、複数）

`emailAddresses[]` と**集合ごと**に比較・反映する（1 行ずつの方向選択はさせない）。

| CRM `label` | Google `type` | 逆向き（Google → CRM） |
|---|---|---|
| `work` | `work` | `work` → `work` |
| `personal` | `home` | `home` → `personal` |
| `other` | `other` | `other`・カスタム・空 → `other` |

- `is_primary` ⇄ 先頭 + `metadata.sourcePrimary`（primary の書き込み可否は実装時に API 仕様を確認）
- 比較は小文字化・前後空白除去で正規化

### 4.3 電話（`contact_phones`、複数）

`phoneNumbers[]` と集合ごとに比較・反映。

| CRM `label` | Google `type` | 逆向き（Google → CRM） |
|---|---|---|
| `work` | `work` | `work`・`main` → `work` |
| `mobile` | `mobile` | `mobile` → `mobile` |
| `home` | `home` | `home` → `home` |
| `fax` | `workFax` | `workFax`・`homeFax`・`otherFax` → `fax` |
| `other` | `other` | その他・カスタム・空 → `other` |

- 比較は数字のみ抽出で正規化（freee の電話比較と同じ）

### 4.4 住所（`entity_addresses` → `addresses`、複数）

| CRM | Google | 備考 |
|---|---|---|
| `addresses.postal_code` | `addresses[].postalCode` | |
| `addresses.prefecture` | `addresses[].region` | |
| `addresses.city` | `addresses[].city` | |
| `addresses.address_line1`（番地） | `addresses[].streetAddress` | |
| `addresses.address_line2`（建物名） | `addresses[].extendedAddress` | |

- ラベル対応（CRM → Google）: `main` → `work` / `home` → `home` /
  `billing`・`shipping`・`branch`・`other` → `other`
- **CRM → Google は全住所を送る。Google → CRM は主住所（`is_primary`）だけ差分対象**。
  複数住所の集合突合は誤りやすいため初期対応外（Phase 3）
- `entity_addresses.phone / fax`（住所付随の電話）は**対象外**。電話は `contact_phones` が正
- `countryCode`（JP）を送るかは実装時に判断（国内前提）

### 4.5 同期しないもの（✕。Google 側に出さない・取り込まない）

| CRM の項目 | 理由 |
|---|---|
| `internal_memo`（社内メモ） | 社内情報。Google の「メモ」（`biographies`）とも**双方向とも繋がない** |
| `potential_number` / `constellation_id`（ポテンシャル診断） | 社内の分析情報。**誕生日そのものは同期する**（§4.1）が、診断結果は出さない |
| `invoice_registered` / `invoice_registration_number` | 会計情報 |
| `contact_status_id` / `contact_type` / `lead_source_id` | 社内の管理区分 |
| `owner_user_id`（担当者） / `is_active` / `status_updated_at` | 社内の管理情報 |
| `line_user_id` / SNS（`contact_social_accounts`: Chatwork・Slack・LINE・X 等） | Phase 3 で `urls[]` / `imClients[]` への対応を検討 |

### 4.6 Google 側にあって CRM に無いもの（取り込まない・上書きもしない）

写真・ニックネーム・メモ（`biographies`）・記念日（`events`）・関係（`relations`）・
URL・チャット（`imClients`）など。**push 時の `updatePersonFields` に含めない**ことで
Google 側の値をそのまま残す（利用者がスマホで足した情報を消さない）。

## 5. 同期エンジン

### 5.1 取り込み（Google → ミラー）

- `people.connections.list` + **`syncToken` で差分取得**（`requestSyncToken=true`）。
  ミラー表 `google_contacts` に upsert。削除は `metadata.deleted` で検出
- syncToken 失効（410 EXPIRED_SYNC_TOKEN。約 7 日）→ 全件取得からやり直す
- 起動は NAS タスクスケジューラ → `/api/google-contacts/sync`（Bearer = cron secret）。
  Gmail / freee と同じ形で、有効な接続を順に処理する

### 5.2 変更検出（CRM 側）

`contact_emails` / `contact_phones` には `updated_at` が無く、親の `updated_at` も
子の変更で動く保証が無い。トリガーを増やす代わりに**内容指紋で比較する**:
同期対象項目を正規化した JSONB の md5 を `google_contact_links.pushed_fingerprint` に
保存し、同期ジョブが再計算して差があれば push 対象にする。件数は連絡先規模
（数百〜数千）なので全件再計算で足りる。

### 5.3 反映（push）と競合

- 更新は `updateContact` + `updatePersonFields` + **etag 必須**。etag 不一致
  （Google 側が変わっていた）は取り直して差分画面へ回す（黙って上書きしない）
- CRM 論理削除 → Google 側から削除（自動）。リンクは状態を変えて残す
- Google 側削除 → 差分画面に「再登録する（CRM が正）/ 同期対象から外す」。
  **Google の操作で CRM のデータは消さない**
- Google → CRM の取り込みは freee と同じく **DB 関数 1 本**（複数テーブル書き込みの規約）。
  通常の UPDATE なので `entity_change_logs` に自動で履歴が残る

### 5.4 クォータと初回全件

People API の書き込みは**ユーザーあたり毎分 90 リクエスト**程度の制限がある
（実装時に最新の公式値を確認）。`batchCreateContacts` は 1 回 200 件まで。

- **初回の全件 push はジョブ方式**（名刺取込 T-0019 と同じ import_jobs + pg_cron の型）。
  チャンク分割 + スロットリング + 429 は指数バックオフ
- 定期同期の増分は件数が小さいので同期ジョブ内で直接送る

## 6. 差分画面と権限

- 接続・切断は各ユーザーが `/profile` で行う（Gmail と並べる）
- 差分画面は**自分の接続分**を表示。項目ごとに
  「Google → CRM 取り込み / CRM の値で上書き / 触らない」を選ぶ
- **CRM への取り込みを確定できるのは、その連絡先の担当者（owner）か admin のみ**。
  連絡先の UPDATE 権限（RLS）と揃える。他人の担当分は表示のみ（依頼して直してもらう）
- 反映の成否は `google_contact_sync_logs` に必ず残す（freee_sync_logs と同型。
  direction: to_google / to_crm、changes JSONB、実行者）

### 6.1 切断・退職時

- 切断時に「Google 側に残す / ITERRA CRM グループごと削除して回収」を選ばせる
- Workspace 限定なので、退職時は**アカウント停止で連絡先ごと回収できる**
  （個人 Gmail を許さない理由）

## 7. テーブル（実装時に database-design.md へ正式反映）

```
google_contact_connections   -- 接続。gmail_connections + freee の access_token 保持を合成
  id / crm_user_id / email_address / hd_domain
  refresh_token_enc / access_token_enc / access_token_expires_at / granted_scope
  sync_token / contact_group_resource   -- ITERRA CRM グループの resourceName
  last_synced_at / last_error / is_active / created_at / updated_at
  UNIQUE (lower(email_address)) WHERE is_active

google_contacts              -- Google 側ミラー（グループ内のみ）
  id / connection_id / resource_name / etag
  family_name / middle_name / given_name / 各カナ
  org_name / department / job_title
  emails JSONB / phones JSONB / address 各列 / client_contact_code
  google_deleted_at / synced_at / …
  UNIQUE (connection_id, resource_name)

google_contact_links         -- 対応付け（正）
  id / connection_id / contact_id / google_contact_id
  status ('active' / 'excluded')   -- 競合・Google側削除はミラーとの突合で導出
  etag_at_sync / pushed_fingerprint / last_pushed_at / linked_by / …
  UNIQUE (connection_id, contact_id)

google_contact_sync_logs     -- 反映の記録（成否とも必ず残す）
  id / link_id / direction ('to_google'/'to_crm') / changes JSONB
  succeeded / error_message / performed_by / performed_at
```

RLS: 接続・ミラー・リンクとも**接続の所有者 + admin が SELECT**。
書き込みは同期（service_role）と SECURITY DEFINER 関数のみ。
関数内の権限確認は `IF NOT COALESCE(is_admin(), FALSE)` 形式
（`is_admin()` の NULL 伝播に注意。freee で実際に踏んだ穴）。

## 8. 実装フェーズ

| フェーズ | 内容 | ここまでで得られるもの |
|---|---|---|
| 1 | 接続（OAuth + ドメイン制限）/ 初回突合 / **CRM → Google の自動 push**（作成・更新・削除・グループ管理） | 電話帳ユースケースが成立する |
| 2 | ミラー取り込み（syncToken）/ 差分画面 / Google → CRM の確定 / グループ入り候補の承認 | 双方向が成立する |
| 3 | 会社の紐付け候補提示 / SNS・URL の同期 / 複数住所の Google → CRM 突合 | 拡張 |

## 9. 検討して採らなかった案

| 案 | 見送りの理由 |
|---|---|
| Workspace の共有連絡先（Directory / Domain Shared Contacts API） | 組織全体へ一括配布できるが、旧 GData API で管理者権限が要り、ユーザー個人の「連絡先」アプリでの編集と噛み合わない。将来の再検討余地はある |
| Gmail 連携の接続にスコープを追加 | 1 接続に複数スコープが混ざると `granted_scope` の逸脱監査が成立しない。Gmail は本文非取得（gmail.metadata）を厳守しており、混ぜない |
| 一方向（CRM → Google のみ） | 実装は半分で済むが、スマホで直した電話番号を CRM に戻せない。利用者の判断で双方向にした（2026-08-05） |
| Google 側の変更も自動で CRM へ | 正本への無確認書き込みになる。品質が保証されない（スマホの自動補完等）ため freee と同じ確認方式にした |
