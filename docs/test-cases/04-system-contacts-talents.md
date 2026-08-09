# システムテスト仕様: 連絡先・タレント

最終更新: 2026-08-03

実装（画面・Server Action・validator・DB 関数）から導出したシステムテスト仕様。
テスト環境: http://localhost:2000（`npx supabase start` + `npm run dev`）。
テストユーザー: admin@iterra.jp / manager@iterra.jp / member@iterra.jp（いずれも password123）。

自動化区分の凡例:
- **PW**: Playwright で自動化可能
- **API**: Server Action / RPC を直接呼んで検証（UI 経路なし・または UI では再現しにくい分岐）
- **unit**: Vitest ユニットテストで担保（既存 or 追加）
- **手動**: マスタ削除等の環境操作を伴うため手動推奨

## 1. 対象範囲

| 区分 | 対象 |
|---|---|
| 画面 | `/contacts`（一覧）、`/contacts/new`、`/contacts/[id]`、`/contacts/[id]/edit`、`/contacts/candidates`、`/contacts/cards`、`/contacts/merge-candidates`、`/talents`（一覧）、`/talents/[id]`、`/talents/[id]/edit` |
| Server Action | `src/actions/contacts.ts`、`contact-channels.ts`、`contact-merge.ts`、`contact-social-accounts.ts`、`business-cards.ts`、`talents.ts`、`talent-classification.ts` |
| validator | `src/lib/validators/contacts.ts`、`talents.ts`、`common.ts`（birthDateSchema / urlSchema / uuidString / expectedUpdatedAtSchema）、`contact-social-accounts.ts`、`talent-classification.ts` |
| 判定ロジック | `src/lib/talent-classification/`（system-classifier / grade-calculator / job-type-classifier）、`src/lib/diagnosis/`（calcPotentialNumber / calcZodiacSign） |
| DB 関数 | `merge_contacts` / `merge_contacts_preview` / `detect_all_contact_merge_candidates` / `contact_merge_candidate_pairs` / `set_primary_contact_email(phone)` / `apply_business_card_as_current` |

対象外: リード取込（Eight CSV）そのもの（`docs/lead-import-eight.md` 系）、メール同期の取込処理（candidates 画面の承認・対象外操作のみ対象）、アクティビティ記録。

## 2. テストケース

---

### 連絡先一覧（/contacts）

### CNT-01: 一覧表示・ページネーション 30 件・バッジ色
- 対象: `/contacts`、`getContacts`、`ContactsView`
- 権限: admin
- 事前条件: seed 投入済み（連絡先 31 件以上）
- 手順:
  1. admin でログインし `/contacts` を開く
  2. 2 ページ目へ移動する
- 期待結果:
  - 一覧に氏名・ステータス・種別・所属・メール・電話・担当者・最終更新日の列が表示される
  - ページ移動後の表示は 30 件単位（`DEFAULT_PAGE_SIZE = 30`）。Pagination に総件数と現在ページが表示される
  - ステータスバッジの色が `contact_statuses.color` の値そのまま（画面側で sort_order から算出していないこと。DB の color を変更 → リロードで追随することを 1 件で確認）
  - メール・電話は `is_primary = true` の行を優先表示、無ければ先頭行
  - 注: 初回 SSR は `page.tsx` が `perPage: 50` で取得するため初期表示のみ 50 件になる（§3 懸念 1）
- 自動化区分: PW

### CNT-02: フィルタ（ステータス / 種別 / 担当者 / 氏名検索）とクリア
- 対象: `/contacts`、`getContacts` の statusId / contactType / ownerUserId / search 分岐
- 権限: admin
- 事前条件: ステータス「アクティブ」の連絡先と「休眠」の連絡先、種別 individual と employee、担当者の異なる連絡先が存在
- 手順:
  1. ステータス =「アクティブ」で絞る → 種別 =「個人」を追加 → 担当者を指定 → 検索欄に姓の一部（例: 「山田」）を入力
  2. クリアボタンを押す
- 期待結果:
  - 各フィルタは AND で効き、切替のたびに 1 ページ目へ戻る
  - 検索は姓・名・contact_code の部分一致（ilike）
  - クリアで全条件が外れ全件表示に戻る
- 自動化区分: PW

### CNT-03: ヘッダ導線の出し分け（未登録候補・統合候補・名刺）
- 対象: `/contacts` ヘッダ、`getPendingCandidateCount`、`countPendingMergeCandidates`
- 権限: admin / member
- 事前条件: pending のメール候補と pending の統合候補が存在
- 手順:
  1. admin で `/contacts` を開く
  2. member で `/contacts` を開く
- 期待結果:
  - admin: 「未登録の候補 N 件」「統合候補 N 件」「名刺」リンクが表示される（件数 0 のものはリンク自体が出ない）
  - member: メール候補は manager 以上限定のため件数 0 → リンク非表示。統合候補は RLS により自分の担当連絡先が絡む候補のみ計上される。「名刺」リンクは常に表示
- 自動化区分: PW

### CNT-04: 所属列の出所分岐（contact_type ごとの紐づけ）
- 対象: `ContactsView` の `resolveAffiliation` / `AffiliationCell`
- 権限: admin
- 事前条件:
  - A: contact_type = corporate_rep または employee で `company_id` 紐づけありの連絡先
  - B: contact_type = individual で `account_contacts` 経由の取引先紐づけのみの連絡先（role = primary を含む複数件）
  - C: どちらの紐づけも無い連絡先
- 手順: `/contacts` で A / B / C の行を確認し、所属リンクをクリックする
- 期待結果:
  - A: 事業者情報アイコン（Building2）+ 会社名。リンク先 `/companies/{id}`。取引先紐づけが併存する場合「他N件」を併記
  - B: 取引先アイコン（Briefcase）+ 取引先名（role = primary を優先）。リンク先 `/accounts/{id}`。2 件目以降は「他N件」
  - C: 「— 未紐付け」表示
  - 所属リンククリックで行遷移（連絡先詳細）が発火しない（stopPropagation）
- 自動化区分: PW

### CNT-05: member の一覧スコープ（RLS）
- 対象: `/contacts`、contacts RLS（member は owner_user_id = 自分のみ）
- 権限: member
- 事前条件: member 担当の連絡先と admin 担当の連絡先が存在
- 手順: member でログインし `/contacts` を開く
- 期待結果: 自分が担当（owner_user_id = member）の連絡先のみ表示され、総件数もその範囲で計上される
- 自動化区分: PW

---

### 連絡先 新規作成（/contacts/new）

### CNT-06: 新規作成 正常系（individual）
- 対象: `/contacts/new`、`createContact`、`createContactSchema`
- 権限: member（担当者未指定時に自分が owner になることを確認）
- 手順:
  1. `/contacts/new` で姓「テスト」名「太郎」、ステータス「アクティブ」、種別「個人」を入力し「作成」
- 期待結果:
  - success トースト「連絡先を作成しました」（約 4 秒で自動消滅）
  - 作成した連絡先の詳細ページへ遷移
  - DB: `contacts` に 1 行。`owner_user_id` = 操作ユーザー（未指定時）、`created_by` = 操作ユーザー、`deleted_at IS NULL`
- 自動化区分: PW

### CNT-07: 新規作成（corporate_rep / employee + 事業者情報の直接紐づけ）
- 対象: `/contacts/new` の所属事業者情報 SearchableSelect、`createContact`
- 権限: admin
- 事前条件: 事業者情報（companies）が 1 件以上存在
- 手順:
  1. 姓名・ステータスに加え、種別「法人従業員」、所属事業者情報で既存 company を選択し「作成」
  2. 詳細ページで確認
- 期待結果:
  - DB: `contacts.contact_type = 'employee'`、`contacts.company_id` = 選択した company
  - 詳細の属性情報に「所属事業者情報」として会社名リンク（`/companies/{id}`）が表示される
  - 一覧の所属列は事業者情報アイコンで表示される（CNT-04 A パターン）
- 自動化区分: PW

### CNT-08: 生年月日からの診断自動算出
- 対象: `createContact` → `applyBirthDateDiagnosis`、`calcPotentialNumber` / `calcZodiacSign`
- 権限: admin
- 事前条件: `number_diagnosis`（1〜60）と `constellation_fortune_telling`（12 星座）のマスタ投入済み
- 手順:
  1. 生年月日 1990-05-01 を入力して連絡先を作成
  2. 詳細ページのプロファイルを確認
- 期待結果:
  - DB: `contacts.potential_number = 10`（calcPotentialNumber("1990-05-01")）、`constellation_id` = 「牡牛座」の行の id
  - 詳細プロファイルに星座「牡牛座」と `number_diagnosis.type` のポテンシャルタイプが表示される
  - 入力側で potential_number / constellation_id を明示指定した場合は上書きされない（API で確認）
- 自動化区分: PW（算出値の網羅は unit: `src/lib/diagnosis` にテスト追加推奨）

### CNT-09: 診断マスタ未整備時は作成を中止
- 対象: `applyBirthDateDiagnosis` のマスタ未存在分岐
- 権限: admin
- 事前条件: `number_diagnosis` から該当 number の行を一時削除（またはローカル DB で SQL 操作）
- 手順: 生年月日付きで連絡先を作成
- 期待結果:
  - エラー「ポテンシャル診断マスタ（number=N）が見つかりません。マスタを整備してください」（星座欠落時は「星座マスタ（constellation=…）が見つかりません…」）
  - `contacts` に行が INSERT されない（書込中止）
  - エラートーストは約 10 秒で自動消滅する（閉じるボタンでも消せる）
- 自動化区分: 手動（またはローカル API）

### CNT-10: 新規作成バリデーション異常系（Zod）
- 対象: `createContactSchema`、`createContact` のエラー整形（`[field] message`）
- 権限: admin
- 手順: 以下を Server Action へ直接送信（UI では姓・名・ステータスは HTML required で先に止まるため API 検証）:
  1. `last_name: ""` → `[last_name] 姓は必須です`
  2. `first_name: ""` → `[first_name] 名は必須です`
  3. `contact_status_id: "abc"` → `[contact_status_id] ステータスは必須です`（uuid 形式不一致）
  4. `birth_date: "1990/05/01"` → `[birth_date] 日付形式（YYYY-MM-DD）で入力してください`
  5. `birth_date: "2026-02-30"` → `[birth_date] 存在しない日付です`
  6. `birth_date: "2030-01-01"` → `[birth_date] 生年月日に未来の日付は指定できません`
  7. `blood_type: "C"` → enum エラー
  8. `potential_number: 61` → 範囲エラー（1〜60）
  9. `website_url: "not-a-url"` → `[url] URL 形式で入力してください`
  10. `internal_memo`: 2001 文字 → max エラー
- 期待結果: いずれも `{ data: null, error: "[field] ..." }` で返り、DB に行が作られない。UI ではフィールド系エラーはインライン表示（`isFieldValidationError` 判定）、それ以外はエラートースト
- 自動化区分: API / unit

---

### 連絡先 詳細（/contacts/[id]）

### CNT-11: 詳細表示の全セクション
- 対象: `/contacts/[id]`、`getContact`
- 権限: admin
- 事前条件: メール 2 件（主 1）・電話 1 件・住所・SNS アカウント・名刺・account_contacts・タレントを持つ連絡先
- 手順: 詳細ページを開く
- 期待結果:
  - ヘッダ: contact_code + 姓・ミドルネーム・名（ミドルネームが省略されないこと）+ 編集ボタン
  - 基本情報（姓名・フリガナ・部署・役職・住所）/ 連絡先（メール: 主に Star アイコン + label バッジ、電話同様、SNS・チャット）/ 属性情報（ステータス・種別・所属事業者情報・担当者・ステータス更新日・個人サイトURL）
  - 名刺セクション（CNT-35）、紹介した相手（0 件なら非表示）、メモ（internal_memo があるときのみ）
  - 右カラム: プロファイル（生年月日・血液型・星座・ポテンシャルタイプ）、メール履歴、窓口になっている取引先、タレント情報（talent があるときのみ、`/talents/{id}` へのリンク付き）
- 自動化区分: PW

### CNT-12: UUID 不正 URL
- 対象: `/contacts/abc`、`/contacts/abc/edit`
- 権限: admin
- 手順: `/contacts/not-a-uuid` と `/contacts/not-a-uuid/edit` を直接開く
- 期待結果: 「不正なパラメータです」+ 連絡先一覧へ戻るリンクが表示される（DB アクセスに至らない）
- 自動化区分: PW

### CNT-13: member の他人データ直 URL / 存在しない ID
- 対象: `/contacts/[id]`、RLS
- 権限: member
- 手順:
  1. admin 担当の連絡先の UUID を控え、member で `/contacts/{そのUUID}` を開く
  2. 実在しないランダム UUID で `/contacts/{uuid}` を開く
- 期待結果: いずれも「連絡先が見つかりません」+ 一覧へ戻るリンク（RLS により 0 行 → 存在と同じ扱い）
- 自動化区分: PW

### CNT-14: 詳細ページでの紐づけ付け替え（RelationField）
- 対象: 詳細ページの「所属事業者情報」「担当者」RelationField、`saveRelation`（updateContact 経由・楽観ロック付き）
- 権限: admin（編集可）/ member（他人の連絡先は編集不可）
- 手順:
  1. admin で詳細を開き、所属事業者情報を別の company に変更して保存
  2. 担当者を別ユーザーに変更
  3. member で他人担当の連絡先詳細（自分に owner が移った直後などで閲覧できる場合）を確認
- 期待結果:
  - 変更が即保存され、`contacts.company_id` / `owner_user_id` が更新される
  - `expected_updated_at` は画面表示時点の `updated_at` で送信される（別タブで先に更新した場合は競合エラー: CNT-17 と同文言）
  - `canEdit`（admin または owner 本人）でない場合は編集 UI が表示されない
  - 編集ページ側には所属・担当の入力欄が無い（詳細ページが唯一の入口）
- 自動化区分: PW

### CNT-15: 窓口になっている取引先は閲覧のみ
- 対象: 詳細ページの「窓口になっている取引先」セクション
- 権限: admin
- 事前条件: account_contacts に紐づく連絡先
- 手順: 詳細ページで当該セクションを確認
- 期待結果: account_code・取引先名リンク（`/accounts/{id}`）・ロールバッジのみ表示され、追加・削除の操作 UI が無い（足し外しは取引先詳細の連絡先一覧で行う仕様）
- 自動化区分: PW

---

### 連絡先 編集（/contacts/[id]/edit）

### CNT-16: 編集保存 正常系 + status_updated_at
- 対象: `/contacts/[id]/edit`、`updateContact`
- 権限: admin
- 手順:
  1. 部署を「営業部」に変更して保存
  2. 再度編集を開き、ステータスを「アクティブ」→「休眠」に変更して保存
- 期待結果:
  - success トースト「保存しました」→ 詳細ページへ遷移
  - DB: `department = '営業部'`、`last_updated_by` = 操作ユーザー
  - ステータス変更時のみ `status_updated_at` が現在時刻に更新される（1 の保存では変わらない）
  - 変更履歴は `entity_change_logs` にトリガーで記録される（アプリからの INSERT は無い）
- 自動化区分: PW

### CNT-17: 楽観ロック競合
- 対象: `updateContact` の `expected_updated_at`、`conflictErrorMessage`
- 権限: admin（2 セッション、または同一ユーザー 2 タブ）
- 手順:
  1. 同じ連絡先の編集ページを 2 タブで開く
  2. タブ A で保存 → 成功
  3. タブ B で保存
- 期待結果:
  - タブ B はエラートースト「この連絡先は他のユーザーによって更新されています。画面を再読み込みしてから保存してください」
  - エラートーストは約 10 秒で自動消滅する（閉じるボタンでも消せる）
  - タブ B の変更内容は DB に反映されない（0 行更新）
- 自動化区分: PW

### CNT-18: member のオーナーチェック（更新）
- 対象: `updateContact` の owner チェック分岐
- 権限: member
- 手順: admin 担当の連絡先 id に対し member で `updateContact(id, { department: "x" })` を直接呼ぶ
- 期待結果: 「この連絡先を編集する権限がありません」（RLS で連絡先自体が見えない場合は「連絡先が見つかりません」）。DB 不変
- 自動化区分: API

### CNT-19: birth_date 変更・クリア時の診断値同期
- 対象: `updateContact` の birth_date 分岐（§10.8）
- 権限: admin
- 事前条件: CNT-08 で作成した連絡先（1990-05-01 / potential_number = 10 / 牡牛座）
- 手順:
  1. 編集で生年月日を 1991-12-25 に変更して保存
  2. 再度編集で生年月日を空にして保存
- 期待結果:
  - 1: `potential_number` = calcPotentialNumber("1991-12-25") の値に再計算、星座は「山羊座」の id に更新
  - 2: `potential_number` と `constellation_id` が両方 NULL にクリアされる
  - birth_date を送らない更新（部署のみ変更等）では診断値が変化しない
- 自動化区分: PW + API

### CNT-20: 連絡先の削除は admin 限定・論理削除
- 対象: 編集ページの削除ボタン、`deleteContact`
- 権限: admin / manager / member
- 手順:
  1. manager・member で編集ページを開く → 削除ボタンが無いことを確認（`isAdmin` のみ表示）
  2. member で `deleteContact(id)` を直接呼ぶ
  3. admin で編集ページから削除ボタン → ConfirmDialog → 実行
- 期待結果:
  - 2: 「管理者権限が必要です」、DB 不変
  - 3: success トースト「連絡先を削除しました」→ `/contacts` へ遷移。DB: `deleted_at` / `deleted_by` / `last_updated_by` が設定される（物理削除しない）。一覧・詳細取得（`.is("deleted_at", null)`）から消える
- 自動化区分: PW + API

---

### 連絡先チャネル（メール・電話・SNS）

### CNT-21: メールアドレス追加（初回は自動で主）
- 対象: 編集ページの `ContactChannelsEditor`、`addContactChannel`
- 権限: admin
- 事前条件: メール 0 件の連絡先
- 手順:
  1. 編集ページのメール欄に `taro@example.com`、種別「勤務先」で「追加」
  2. 続けて `taro2@example.com`、種別「個人」で追加
- 期待結果:
  - トースト「メールアドレスを追加しました」。保存ボタンを待たず即時反映（注記「追加・削除はこの場で反映されます」）
  - DB: 1 件目は `is_primary = true`、2 件目は `false`。`created_by` / `last_updated_by` = 操作ユーザー
  - 詳細ページで主の行に Star アイコンが付く
- 自動化区分: PW

### CNT-22: メール追加の異常系
- 対象: `addContactChannel` の email 分岐
- 権限: admin
- 手順:
  1. 空白のみで追加 → ボタン非活性（UI）。API 直呼びで空文字 → 「メールアドレスを入力してください」
  2. `invalid-mail` で追加 → 「メールアドレスの形式が正しくありません」
  3. 既存と同じ `taro@example.com` を追加 → 「同じ値が既に登録されています」（UNIQUE 23505）
  4. API 直呼びで label = `"invalid"` → 「種別が不正です」（email の許可 label: work / personal / other）
- 期待結果: いずれもエラートースト（約 10 秒で自動消滅）、DB に行が増えない
- 自動化区分: PW + API

### CNT-23: 電話番号追加と種別
- 対象: `addContactChannel` の phone 分岐
- 権限: admin
- 手順:
  1. `090-1234-5678`、種別「携帯」で追加
  2. 空文字を API 直呼び → 「電話番号を入力してください」
  3. label = `"work2"` を API 直呼び → 「種別が不正です」（phone の許可 label: work / mobile / home / fax / other）
  4. 同一番号を再追加 → 「同じ値が既に登録されています」
- 期待結果: 1 は成功トースト「電話番号を追加しました」+ 初回自動 primary。2〜4 はエラーで DB 不変
- 自動化区分: PW + API

### CNT-24: 主連絡先の切り替え（RPC）
- 対象: `setPrimaryContactChannel` → `set_primary_contact_email` / `set_primary_contact_phone`
- 権限: admin
- 事前条件: メール 2 件（1 件が主）の連絡先
- 手順: 非主の行の Star ボタンを押す
- 期待結果:
  - トースト「主にしました」
  - DB: 主フラグが排他的に切り替わる（旧主 false → 新主 true。同時に 2 件 true にならない）
  - 主の行の Star ボタンは非活性
- 自動化区分: PW

### CNT-25: チャネル削除（名刺参照の警告・主の繰り上げ）
- 対象: `deleteContactChannel`、`countCardsUsingChannel`、ConfirmDialog
- 権限: admin
- 事前条件: 名刺（business_cards.contact_email_id）が参照するメールと、参照の無いメールを持つ連絡先。主メール + 副メールの 2 件
- 手順:
  1. 名刺が参照するメールの削除ボタン → ダイアログ本文を確認 → 削除
  2. 主メールを削除
- 期待結果:
  - 1: ダイアログに「この連絡先を使っている名刺が N 枚あります。名刺は残りますが、連絡手段との紐付けは外れます。」が出る。削除後、名刺行は残り `contact_email_id` が NULL（FK ON DELETE SET NULL）
  - 2: ダイアログに「主の連絡先のため、残りのうち最初に登録されたものが主になります。」。削除後、残存行の 1 つが `is_primary = true` に繰り上がる（DB トリガー）
  - トースト「メールアドレスを削除しました」
- 自動化区分: PW

### CNT-26: member による他人のチャネル操作拒否（親 owner 参照）
- 対象: `contact-channels.ts` の `authorize`（親 contacts の owner_user_id を参照）
- 権限: member
- 手順:
  1. admin 担当の連絡先 id で `addContactChannel(id, "email", "x@example.com", "work")` を直接呼ぶ
  2. 論理削除済み連絡先の id で同様に呼ぶ
- 期待結果:
  - 1: 「この連絡先を変更する権限がありません」（RLS で見えない場合は「連絡先が見つかりません」）
  - 2: 「連絡先が見つかりません」（`deleted_at IS NULL` 条件）
  - manager は他人の連絡先でも操作できる（authorize は manager/admin を許可）
- 自動化区分: API

### CNT-27: SNS・チャットアカウントの追加・重複・削除
- 対象: `SocialAccountsEditor`、`contact-social-accounts.ts`
- 権限: admin / member
- 事前条件: `social_services` マスタ投入済み（is_active = true のもの）
- 手順:
  1. admin で編集ページからサービス（例: Slack）にアカウント ID を登録
  2. 同じサービス・同じ ID をもう一度登録
  3. 登録済みアカウントを削除
  4. member で他人の連絡先の SNS アカウントを API 直呼びで更新・削除
- 期待結果:
  - 1: 詳細ページの「SNS・チャット」で該当サービスに色が付き、登録の無いサービスは未設定表示
  - 2: 「同じ ID が既に登録されています」（23505）
  - 3: 物理削除される（論理削除ではない）。詳細から消える
  - 4: RLS の 0 行更新として「この連絡先を編集する権限がありません」
- 自動化区分: PW + API

---

### 連絡先マージ（/contacts/merge-candidates）

### CNT-28: 候補の一括検出（洗い直し）
- 対象: 「候補を洗い直す」ボタン、`detectAllMergeCandidates` → `detect_all_contact_merge_candidates` / `contact_merge_candidate_pairs`
- 権限: manager
- 事前条件:
  - A: 姓名が完全一致し `company_id` が異なる連絡先 2 件（カナ未入力）
  - B: 姓名一致・会社違いだがカナが両方入力されており食い違う 2 件
  - C: 姓名一致・同一 company の 2 件
- 手順: manager で `/contacts/merge-candidates` を開き「候補を洗い直す」を押す。もう一度押す
- 期待結果:
  - 1 回目: トースト「統合候補が N 件見つかりました」。A の組だけが `contact_merge_candidates` に `reason = 'same_name_diff_company'`、`status = 'pending'` で記録される。B（カナ矛盾）と C（同一会社）は候補に挙がらない
  - (A,B) と (B,A) が別候補として二重登録されない（UUID 小さい側が contact_id）
  - 2 回目: 既存候補は再記録されず（ON CONFLICT DO NOTHING）、トースト「新しい統合候補はありませんでした」
- 自動化区分: PW

### CNT-29: マージ操作の manager 以上限定
- 対象: `requireManager`、DB 関数側の `is_manager_or_above()`
- 権限: member
- 手順:
  1. member で `/contacts/merge-candidates` を開く（自分の担当が絡む pending 候補がある状態）
  2. 「統合する」を押す（preview が走る）
  3. API 直呼びで `detectAllMergeCandidates()` / `mergeContactsAction(a, b)` / `rejectMergeCandidate(id)` を実行
- 期待結果:
  - 1: 画面自体は開ける（閲覧は RLS スコープ内）
  - 2〜3: いずれもエラー「連絡先の統合には manager 以上の権限が必要です」。DB 不変
- 自動化区分: PW + API

### CNT-30: 統合プレビューと talent 競合ブロック
- 対象: `previewContactMerge` → `merge_contacts_preview`、確認ダイアログの `buildMessage`
- 権限: manager
- 事前条件: 候補の片側にメール 2 件・名刺 1 枚・ディール 1 件を持たせる。別の候補は両側にタレント情報を持たせる
- 手順:
  1. 候補カードの「統合する」を押しダイアログ本文を確認（この時点では何も変更されないこと）
  2. 両側タレント持ちの候補で「統合する」を押す
- 期待結果:
  - 1: 「『後から登録側の氏名』を『先に登録側の氏名』に統合します。」+「引き継ぐもの: メール 2 件 / 名刺 1 枚 / ディール 1 件 …」+「統合した側は削除済みとして閉じられ、この操作は取り消せません。」。キャンセルすれば DB 不変
  - 2: 「両方にタレント情報があるため統合できません。どちらかを整理してからやり直してください。」と表示され、実行しても DB 関数が例外「両方にタレント情報があります。片方を整理してから統合してください」で失敗する
- 自動化区分: PW

### CNT-31: 統合実行（従属データの付け替え・履歴）
- 対象: `mergeContactsAction` → `merge_contacts`（単一トランザクション）
- 権限: manager
- 事前条件: keep 側（先に登録・memo「メモA」・kana あり）/ merge 側（メール 2 件うち 1 件は keep と同一アドレス、電話 1 件、名刺 1 枚、account_contacts 1 件、リード・ディール・契約各 1 件、memo「メモB」、keep に無い birth_date あり）
- 手順: 候補カードで「統合する」→ ダイアログで「統合する」を実行
- 期待結果:
  - success トースト「連絡先を統合しました」
  - DB（merge 側 → keep 側への付け替え）:
    - `contact_emails`: 重複しないアドレスのみ移動、keep と同一（lower 比較）の行は破棄。`contact_phones` / `account_contacts` / `email_message_contacts` も同様に重複除外で移動
    - `business_cards`: 全件移動。keep 側に is_primary の名刺がある場合、merge 側の is_primary は false に落ちる（現在の所属は勝手に切り替えない）
    - `leads`（contact_id / promoted_contact_id）、`deals.contact_id`、`contracts`（counterparty_contact_id / counterparty_manager_id）、`talents.contact_id`、`activity_logs` / `deal_activities` / `contact_change_histories` が keep に付け替わる（履歴は削除されない）
    - keep 側の空欄補完: birth_date 等は keep が NULL の項目のみ merge の値で埋まる（既存値は上書きされない）。`internal_memo` は「メモA\n---\nメモB」と連結
    - merge 側: `deleted_at` 設定 + `merged_into_contact_id` = keep（物理削除しない）
    - 当該候補が `status = 'merged'`（decided_by / decided_at 記録）、merge 側が絡む他の pending 候補は `'rejected'` に閉じられる
  - 一覧から merge 側が消え、keep 側詳細に引き継いだメール・名刺・ディールが表示される
- 自動化区分: PW（DB 検証は SQL 併用）

### CNT-32: 逆向き統合
- 対象: `MergeCandidatesView` の「逆向きで統合」
- 権限: manager
- 手順: 候補カードで「逆向きで統合」を押し実行する
- 期待結果: 後から登録された側が keep になり、先に登録された側が吸収される（既定の keep/merge が入れ替わる）。ダイアログの氏名表記も逆になる
- 自動化区分: PW

### CNT-33: 別人として閉じる（rejected）
- 対象: `rejectMergeCandidate`
- 権限: manager
- 手順:
  1. 候補カードで「別人として閉じる」
  2. 「候補を洗い直す」を再実行
- 期待結果:
  - info トースト「別人として記録しました」。候補が一覧から消える
  - DB: `status = 'rejected'`、`decided_by_user_id` / `decided_at` 記録
  - 再検出しても同じ組は再び挙がらない（ON CONFLICT により判断済みを含め再記録しない）
- 自動化区分: PW

---

### 名刺（/contacts/cards + 詳細の名刺セクション）

### CNT-34: 名刺一覧（検索・紹介者フィルタ・30 件）
- 対象: `/contacts/cards`、`getBusinessCards`
- 権限: admin / member
- 事前条件: 名刺 31 枚以上（紹介者あり・なし混在）
- 手順:
  1. admin で `/contacts` の「名刺」リンクから `/contacts/cards` を開く
  2. 連絡先の氏名の一部で検索する
  3. 紹介者フィルタを「紹介者なし」にする
  4. 行をクリックする
  5. member でも開く
- 期待結果:
  - 総枚数「N 枚」表示、30 件/ページのページネーション
  - 列: 連絡先（is_primary の名刺には「現在の所属」バッジ）/ 所属（company.name、無ければ company_name_raw）/ 部署・役職 / 紹介者（連絡先 or 自由記入メモ）/ 登録日（YYYY/MM/DD）
  - 検索は連絡先の姓・名の部分一致（内部結合）。「紹介者なし」で referrer_contact_id IS NULL のみ
  - 行クリックでその連絡先の詳細 `/contacts/{id}` へ遷移（名刺の編集 UI はこの画面に無い）
  - member は RLS の範囲（自分担当の連絡先の名刺）のみ表示
- 自動化区分: PW

### CNT-35: 詳細の名刺セクションと Eight 由来データの表示
- 対象: `BusinessCardsSection`、`getContact` の business_cards 取得
- 権限: admin
- 事前条件: Eight 取込由来の名刺（source = 'eight'、source_registered_on あり）を複数枚持つ連絡先（うち 1 枚 is_primary）
- 手順: 連絡先詳細の「名刺」セクションを確認
- 期待結果:
  - 採用中（is_primary）の名刺が先頭、以降は登録日の新しい順
  - 各名刺: 会社名（company 紐づけありならリンク、無ければ company_name_raw、どちらも無ければ「所属不明」）・「現在の所属」バッジ・部署 ・ 役職・名刺の連絡手段（紐づく contact_email / contact_phone）・「YYYY/MM/DD に Eight へ登録」（Eight の日付は名刺交換日ではなく登録日として表示される）
- 自動化区分: PW

### CNT-36: 名刺を現在の所属として反映
- 対象: `applyBusinessCardAsCurrent` → RPC `apply_business_card_as_current`
- 権限: admin（member は自分担当の連絡先のみ）
- 事前条件: is_primary でない名刺（会社 X・部署・役職付き）を持つ連絡先（現所属は会社 Y）
- 手順: 名刺セクションで対象名刺の「現在の所属にする」操作を実行
- 期待結果:
  - トースト「現在の所属を更新しました」
  - DB: 当該名刺が `is_primary = true`、他の名刺は false。`contacts` の company_id / department / job_title が名刺の値に更新される
  - 一覧・詳細の所属表示が会社 X に変わる
- 自動化区分: PW

### CNT-37: 紹介者の記録（検索・自己参照禁止・メモのみ・クリア）
- 対象: `BusinessCardReferral`、`updateBusinessCardReferral`、`searchContactsForReferrer`
- 権限: admin
- 手順:
  1. 名刺の紹介者編集で 1 文字だけ入力 → 候補が出ないこと（2 文字未満は空配列）
  2. 2 文字以上入力 → 氏名・会社名付きの候補（最大 10 件、本人は除外）から選択して保存
  3. API 直呼びで referrerContactId に名刺の持ち主本人を指定
  4. 紹介者を外し、自由記入メモ「展示会で名刺交換」を保存
  5. 両方空にして保存
- 期待結果:
  - 2: `business_cards.referrer_contact_id` 設定。名刺一覧・詳細に紹介者名が出る
  - 3: 「本人を紹介者にはできません」（CHECK 制約 chk_business_cards_referrer_not_self）
  - 4: `referral_memo` のみ記録され、一覧の紹介者列にメモが表示される
  - 5: 両方 NULL（紹介者記録の削除）
- 自動化区分: PW + API

### CNT-38: 紹介した相手の逆引き
- 対象: `ReferredContactsSection`、`getReferredContacts`
- 権限: admin
- 事前条件: 連絡先 A を紹介者とする名刺が 2 枚（別の連絡先のもの）
- 手順: 連絡先 A の詳細を開く
- 期待結果: 「紹介した相手」セクションに 2 行（紹介先の連絡先・会社・メモ・登録日）。紹介した名刺が 0 件の連絡先ではセクション自体が出ない
- 自動化区分: PW

---

### メール候補（/contacts/candidates）

### CNT-39: メール候補の承認・対象外・member 拒否
- 対象: `/contacts/candidates`、`CandidatesView`、`approveEmailContactCandidate` / `ignoreEmailContactCandidate`
- 権限: manager / member
- 事前条件: pending の email_contact_candidates が存在（display_name「山田 太郎」付き 1 件、名無し 1 件）
- 手順:
  1. member で `/contacts/candidates` を直接開く
  2. manager で開き、表示名付き候補の姓名（自動分割済み）を確認して「登録」
  3. 姓を空にして「登録」
  4. 別の候補で「対象外」
- 期待結果:
  - 1: 権限エラーメッセージ + 「連絡先一覧へ戻る」リンク（一覧は表示されない）
  - 2: 姓「山田」名「太郎」が自動プリセットされ、成功トースト「山田 太郎 を連絡先に登録しました」。行が一覧から消え、連絡先が作成される
  - 3: エラートースト「姓を入力してください」（送信されない）
  - 4: トースト「{メールアドレス} を対象外にしました」。行が消え、以後この画面に出ない
- 自動化区分: PW

---

### 語彙・UI 規約

### CNT-40: 連絡先ステータスの語彙（営業ステージ語彙の混入なし）
- 対象: `contact_statuses` マスタ、一覧フィルタ・詳細表示
- 権限: admin
- 手順:
  1. `/admin` のマスタ管理で連絡先ステータス一覧を確認
  2. `/contacts` のステータスフィルタの選択肢を確認
- 期待結果:
  - ステータスは自身の状態を表す語彙のみ（seed: 「アクティブ」「休眠」「退職」）
  - 「見込み」「ディール中」「受注」等の営業ステージ・リード温度感の語彙が選択肢に存在しない（進度はリード / ディール側で管理する規約）
- 自動化区分: PW（SQL での seed 検証併用）

---

### タレント一覧（/talents）

### TAL-01: 一覧表示・検索・ページネーション 30 件
- 対象: `/talents`、`getTalents`、`TalentsView`
- 権限: admin
- 事前条件: タレント 31 件以上（スキル数・レベルが異なるものを含む）
- 手順:
  1. `/talents` を開く
  2. 連絡先の姓の一部で検索
  3. 2 ページ目へ移動
- 期待結果:
  - 列: 連絡先名 / ポテンシャル / 総合評価（35 文字で「...」省略）/ スキル（proficiency_level 降順の上位 3 件。Lv4 以上は強調色バッジ、Lv3 以下はグレー）/ 部署・役職 / 最終更新日
  - 検索は contact の姓・名 ilike。30 件/ページ
  - 行クリックで `/talents/{id}` へ遷移
- 自動化区分: PW

### TAL-01b: ポテンシャルタイプで絞り込む
- 対象: `/talents`、`getTalents` の `potentialType`、`getPotentialTypes`
- 権限: admin
- 事前条件: 生年月日を登録済みでポテンシャルタイプの異なる連絡先を持つタレントが複数件
- 手順:
  1. `/talents` を開き「ポテンシャルタイプ」の選択肢を確認する
  2. 該当者がいるタイプ（例: IL+）を選ぶ
  3. 該当者がいないタイプを選ぶ
  4. 詳細を開いてブラウザの戻るで一覧へ戻る
  5. 生年月日が未登録の連絡先を持つタレントが、どのタイプでも出ないことを確認する
- 期待結果:
  1. 12 タイプが `IL+（左脳）` のように優位脳付きで並ぶ（記号だけでは選べないため）
  2. そのタイプの人だけが残る。「ポテンシャル」列の値が選択したタイプと一致する
  3. 「タレントが見つかりません」。**全件が出てしまわないこと**
     （タイプに対応する番号が 0 件のとき条件が無視されると全件返る）
  4. 絞り込みが残る（条件は URL の `?potentialType=IL%2B`）
  5. `potential_number` が NULL なので、いずれのタイプでも一致しない
- 自動化区分: PW

### TAL-02: 「新規作成」導線（既知の未実装: /talents/new）
- 対象: `/talents` ヘッダの「新規作成」リンク
- 権限: admin
- 手順: 「新規作成」を押す
- 期待結果: **現状は `/talents/new` のページが存在せず 404 になる**（`createTalent` Action は実装済みだが画面が無い）。修正されるまでは 404 表示を既知事象として記録する。§3 懸念 2 参照
- 自動化区分: PW（現状確認）

---

### タレント詳細（/talents/[id]）

### TAL-03: 基本性質タブ（診断の自動算出結果と手入力の区別）
- 対象: `/talents/[id]` 基本性質タブ、`getTalent`（contact の number_diagnosis / constellation JOIN）
- 権限: admin
- 事前条件: 生年月日 1990-05-01 の連絡先（CNT-08）に紐づくタレント。personality_memo / custom_strengths / custom_weaknesses / aptitude_notes / overall_assessment 入力済み
- 手順: タレント詳細を開く（既定タブ = 基本性質）
- 期待結果:
  - 「診断結果（自動）」カード: 「生年月日から算出」バッジ付き。ポテンシャルタイプ（number_diagnosis.type バッジ + 強み・弱み）、星座「牡牛座」バッジ + 特徴・キーワード・エレメント特性・性質特性・強み・弱み
  - 「強み・弱み」カードには「手入力」バッジが付き、診断の定型値と区別される
  - 右カラム: 連絡先情報（`/contacts/{id}` へのリンク）、占い情報（ポテンシャルタイプ・優位脳・脳特徴・動物占い・キャラクター・リズム・3分類・星座・エレメント・性質）
  - 生年月日未入力の連絡先のタレントでは診断カード・占い情報カードが表示されない
- 自動化区分: PW

### TAL-04: 連絡先の生年月日変更がタレント詳細へ反映される
- 対象: contacts の診断値 → talent 詳細の参照（1:1）
- 権限: admin
- 手順:
  1. 連絡先編集で生年月日を 1991-12-25 に変更して保存（CNT-19）
  2. 対応するタレント詳細を開く
- 期待結果: 占い情報の星座が「山羊座」、ポテンシャルタイプが再計算後の番号に対応する type に変わる（タレント側での再操作は不要）
- 自動化区分: PW

### TAL-05: スキルタブ（カテゴリ別・レベル強調）
- 対象: スキルタブ、`talent_skills` + `skills` + `skill_categories`
- 権限: admin
- 事前条件: 複数カテゴリのスキル（Lv1〜5）を持つタレント / スキル 0 件のタレント
- 手順: スキルタブを開く
- 期待結果:
  - カテゴリ名ごとのセクションに、レベル降順でスキル名・経験年数・「Lv.N」バッジ（Lv4 以上は強調色）
  - スキル 0 件では「スキルが登録されていません」
- 自動化区分: PW

### TAL-06: 系統の自動判定（SP 系統の具体例）
- 対象: 職種タブの系統表示、`classifySystems`、`getTalentProfile`
- 権限: admin
- 事前条件: `seed-talent-classification.sql` 投入済み。SP 判定条件 =「SP タグスキル ★4 以上 1 件かつ ★3 以上 3 件」
- 手順:
  1. SP タグ付きスキルを Lv3 で 3 件、うち 1 件を Lv4 に設定したタレント（SQL または addTalentSkill）で職種タブを開く
  2. うち 1 件を Lv2 に下げて再表示
- 期待結果:
  - 1: 系統（System）に「スペシャリスト」バッジが表示される。単一系統ならそれがプライマリ系統
  - 2: SP の条件（★3 以上 3 件）を割るため「スペシャリスト」が消える。全系統不一致なら「合致する系統がありません（スキルレベルが不足しています）」
  - 判定は画面表示のたびに `calculateTalentProfile`（純粋関数）で算出され、DB に判定結果は保存されない
- 自動化区分: PW（判定境界の網羅は unit: `system-classifier.test.ts` 既存）

### TAL-07: グレード算定と不足条件の表示（実績連動）
- 対象: 職種タブのグレード表示、`calculateGrade`、実績追加
- 権限: manager
- 事前条件: SP 系統に合致し、T 軸 ★4 以上 3 件 + M 軸 ★4 以上 2 件を満たすタレント（SP/S1 のスキル要件充足、実績なし）
- 手順:
  1. 職種タブでグレードを確認
  2. 実績「案件リード実績（LEAD_PROJECT）」を追加して再表示
- 期待結果:
  - 1: 実績 LEAD_PROJECT 未達のため S1 にならず、スキルのみで満たせる下位グレード（P4 等）が表示される。「次グレードへの不足条件: LEAD_PROJECT」相当の不足実績が表示される
  - 2: グレードが S1 に上がる。グレードバッジとともに期待役割・評価ポイント（talent_grades マスタ値）が表示される
  - L1 より上（L2〜L4）はロジック対象外（人事評価）のため自動算定されない
- 自動化区分: PW（境界の網羅は unit: `grade-calculator.test.ts` 既存）

### TAL-08: 適合職種の表示（カテゴリ別・固定色バッジ）
- 対象: 職種タブの適合職種、`classifyJobTypes`
- 権限: admin
- 事前条件: talent_job_types の rules を満たすスキル構成のタレント / 満たさないタレント
- 手順: 職種タブを開く
- 期待結果:
  - rules（AND 結合。skill_ids_any は OR、axis_filter は件数条件）を満たす職種のみ、カテゴリ（エンジニア / デザイナー / 営業 等）ごとにグルーピングされてバッジ表示。バッジ色はカテゴリ固定色マップ（JOB_CATEGORY_COLORS）
  - 満たさない場合「スキル要件を満たす職種がありません」
- 自動化区分: PW（unit: `job-type-classifier.test.ts` 既存）

### TAL-09: 分類マスタ未投入時の案内
- 対象: 職種タブのマスタ未投入分岐（profile.systems.length === 0）
- 権限: admin
- 事前条件: ローカル DB で talent_system_tags を空にする
- 手順: 職種タブを開く
- 期待結果: 「分類マスタが未登録のため、プロファイルを算定できません。」+ 登録すべきマスタ名（talent_system_tags / talent_grades / talent_grade_requirements / talent_job_types）の案内が表示され、エラーにならない
- 自動化区分: 手動

### TAL-10: 実績の追加・削除（manager 以上限定）
- 対象: 職種タブの実績管理、`addTalentAchievement` / `removeTalentAchievement`
- 権限: manager / member
- 手順:
  1. member で職種タブを開く → 実績の追加フォーム・削除ボタンが表示されないこと（canEdit = admin/manager）
  2. member で `addTalentAchievement({...})` を API 直呼び
  3. manager で実績「後輩育成実績（MENTOR_JUNIOR）」+ 達成日 + メモを追加
  4. manager で追加済み実績を削除
- 期待結果:
  - 2: 「manager 以上の権限が必要です」。DB 不変
  - 3: トースト「実績を追加しました」。一覧に実績名・コード・達成日・メモが表示され、選択済みコードは追加フォームの選択肢から消える。DB: talent_achievements に 1 行
  - 4: トースト「実績を削除しました」。物理削除
- 自動化区分: PW + API

### TAL-11: 詳細の UUID 不正 / 存在しない ID
- 対象: `/talents/abc`、`/talents/{存在しないUUID}`、`/talents/abc/edit`
- 権限: admin
- 手順: 各 URL を直接開く
- 期待結果: UUID 不正は「不正なパラメータです」、存在しない UUID は「タレントが見つかりません」。いずれも「タレント一覧へ戻る」リンク付き
- 自動化区分: PW

### TAL-12: コンタクト 1:1 の相互リンク
- 対象: 連絡先詳細の「タレント情報」セクション ⇔ タレント詳細の「連絡先情報」
- 権限: admin
- 事前条件: タレント紐づけあり / なしの連絡先
- 手順:
  1. タレント持ち連絡先の詳細 → タレント情報セクションの「タレント詳細」リンク → タレント詳細 → 連絡先情報のリンクで戻る
  2. タレント無し連絡先の詳細を確認
- 期待結果:
  - 1: 相互に遷移でき、タレント情報セクションには性格分析メモ・強み/弱み・適性メモ・総合評価・スキル（Lv・年数付きバッジ）・経歴が表示される
  - 2: タレント情報セクション自体が表示されない（talents.contact_id は UNIQUE、1 連絡先に 1 タレント）
- 自動化区分: PW

---

### タレント編集（/talents/[id]/edit）

### TAL-13: 基本情報の保存とバリデーション
- 対象: `updateTalent`、`updateTalentSchema`
- 権限: admin
- 手順:
  1. 性格分析メモ・強み・弱み・適性メモ・総合評価を入力して保存
  2. API 直呼びで personality_memo に 5001 文字を送る
- 期待結果:
  - 1: トースト「保存しました」→ タレント詳細へ遷移。DB 反映 + `last_updated_by` 記録。変更履歴は entity_change_logs トリガーが記録
  - 2: Zod max エラー（personality_memo 5000 / custom_strengths・custom_weaknesses・aptitude_notes 2000 / overall_assessment 3000）
- 自動化区分: PW + API

### TAL-14: タレントの楽観ロック競合
- 対象: `updateTalent` の expected_updated_at
- 権限: admin（2 タブ）
- 手順: 同じタレントの編集を 2 タブで開き、A で保存後に B で保存
- 期待結果: B にエラートースト「このタレントは他のユーザーによって更新されています。画面を再読み込みしてから保存してください」（約 10 秒で自動消滅）。B の変更は反映されない
- 自動化区分: PW

### TAL-15: 経歴の追加（クライアント/Zod バリデーション）
- 対象: 編集ページの経歴インラインフォーム、`addTalentCareer` / `createTalentCareerSchema`
- 権限: admin
- 手順:
  1. 組織名空で保存 → インラインエラー「組織名は必須です」
  2. 開始日 2020-04-01・終了日 2020-03-01 → 「終了日は開始日以降にしてください」
  3. 「現在進行中」を ON にすると終了日入力が非活性・値クリアされる。API 直呼びで is_current: true + end_date 指定 → 「現在進行中の場合、終了日は設定できません」
  4. 種別「職歴」・組織名「株式会社サンプル」・役職「エンジニア」・開始日 2020-04-01・現在進行中 ON で保存
- 期待結果:
  - 1〜3 はフィールド単位のインライン表示（トーストにしない）
  - 4: トースト「経歴を追加しました」。DB: talent_careers に career_type = 'work' で 1 行。sort_order は既存最大 +10 が既定。一覧が sort_order 昇順で並ぶ
- 自動化区分: PW + API

### TAL-16: 経歴の編集・削除と権限チェック
- 対象: `updateTalentCareer` / `removeTalentCareer`、`canModifyTalent`
- 権限: admin / member
- 手順:
  1. admin で既存経歴の役職を変更して保存 → 削除ボタン → ConfirmDialog → 削除
  2. member で他人（オーナーでない連絡先）のタレントの経歴を API 直呼びで更新・削除
  3. API 直呼びで id = "abc"（UUID 不正）、実在しない UUID
- 期待結果:
  - 1: トースト「経歴を更新しました」「経歴を削除しました」。削除は物理削除
  - 2: 「このタレントを編集する権限がありません」（talent_careers の RLS は USING(true) のため Server Action 層が唯一の防御。member はコンタクトのオーナーのみ可、manager/admin は全件可）
  - 3: 「不正なパラメータです」/「経歴が見つかりません」
- 自動化区分: PW + API

### TAL-17: タレントの削除は admin 限定・論理削除
- 対象: 編集ページの削除ボタン、`deleteTalent`
- 権限: admin / manager / member
- 手順:
  1. manager / member で編集ページ → 削除ボタン非表示（isAdmin のみ）
  2. member で `deleteTalent(id)` を API 直呼び
  3. admin で削除ボタン → ConfirmDialog → 実行
- 期待結果:
  - 2: 「管理者権限が必要です」
  - 3: トースト「タレントを削除しました」→ `/talents` へ遷移。DB: `deleted_at` / `deleted_by` 設定（論理削除）。一覧から消えるが、紐づく連絡先は残る
- 自動化区分: PW + API

### TAL-18: スキル増減の Server Action（UI 経路なし・API 検証）
- 対象: `addTalentSkill` / `updateTalentSkill` / `removeTalentSkill`、`createTalentSkillSchema`
- 権限: admin
- 手順（API 直呼び）:
  1. `addTalentSkill({ talent_id, skill_id, proficiency_level: 3, years_experience: 2 })`
  2. `proficiency_level: 6` で追加
  3. `updateTalentSkill(id, { proficiency_level: 5 })` → `removeTalentSkill(id)`
- 期待結果:
  - 1: talent_skills に 1 行。タレント詳細のスキルタブ・系統/グレード判定に反映される
  - 2: Zod エラー（proficiency_level は 1〜5、years_experience は 0 以上）
  - 3: 更新・物理削除が反映される
  - 注: これらの Action を呼ぶ画面は現状存在しない（§3 懸念 3）。スキルデータは seed / SQL 投入が前提
- 自動化区分: API

## 3. 実装を読んで気づいた仕様上の懸念

1. ~~**連絡先一覧の初回表示件数が 50 件**~~
   **→ 2026-08-03 に修正済み。** `contacts/page.tsx` の `perPage: 50` 直書きを `DEFAULT_PAGE_SIZE` に統一した
   （同じ不整合が companies / accounts / deals / campaigns / talents にもあり、まとめて是正した）。
2. ~~**`/talents/new` が未実装のまま導線がある**~~
   **→ 2026-08-03 に導線を削除。** ページ自体は未実装のまま（`createTalent` Action は実装済み）。
   タレントは連絡先に 1:1 で紐づくため、新規作成画面を作るなら連絡先詳細からの導線として設計すること。
3. **タレントスキルの編集 UI が無い**: `addTalentSkill` / `updateTalentSkill` / `removeTalentSkill` は
   Action・validator とも実装済みだが、どの画面からも呼ばれていない（**認可の欠落は 2026-08-03 に是正し、
   3 つとも `canModifyTalent` を通るようにした**）。UI 側の実装は未着手。
4. ~~**`updateTalent` にオーナーチェックが無い**~~
   **→ 2026-08-03 に修正済み。** 既存の `canModifyTalent` ヘルパー（親 contact の `owner_user_id` を見る。
   RLS ポリシー `talents_update_owner_admin` と同じ判定基準）を `updateTalent` とスキル系 3 Action に適用した。
   member が他人のタレントを更新すると、楽観ロック競合ではなく
   「このタレントを編集する権限がありません」が返る。
5. ~~**contacts.ts 内のチャネル系 Action が死にコード**~~
   **→ 2026-08-03 に削除済み。** `addContactEmail` / `updateContactEmail` / `deleteContactEmail` /
   `addContactPhone` / `updateContactPhone` / `deleteContactPhone` の 6 本は全画面から未参照
   （実 UI は `contact-channels.ts` を使用）で、かつオーナーチェックも contact_id スコープも
   持っていなかった。認可の無い経路を残す危険があるため削除し、
   使われなくなった `createContactEmailSchema` / `createContactPhoneSchema` も併せて消した。
   併せて `updateContact` のオーナー確認クエリに `.is("deleted_at", null)` を追加している。
6. **マージ確認ダイアログの「住所 N 件」は表示されない**: `merge-candidates-view.tsx` の `buildMessage` は `preview.addresses` を参照するが、`merge_contacts_preview` は `addresses` キーを返さない（`talents` 件数も画面に出ない）。また `merge_contacts` は `other_addresses` を付け替えるが `entity_addresses` への言及が無く、住所モデル移行（20260802000001 系）との整合は要確認。
7. **`countCardsUsingChannel` は権限エラー時に 0 を返す**: 認可失敗と「参照 0 件」が区別できないため、削除ダイアログで警告が出ないまま進める余地がある（実削除は authorize で止まるため実害は限定的）。
