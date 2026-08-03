# システムテスト仕様: 事業者情報・取引先

最終更新: 2026-08-03

テスト環境: http://localhost:2000
テストユーザー: admin@iterra.jp / manager@iterra.jp / member@iterra.jp（パスワードはすべて password123）

トースト規約（全ケース共通の確認事項）:
- 成功トーストは約 4 秒で自動消滅する
- エラートーストは自動消滅せず、閉じるボタンでのみ消える
- フィールド単位のバリデーションエラー（`[field] メッセージ` 形式）はトーストではなくフォーム下にインライン表示される（`isFieldValidationError` で振り分け）

## 1. 対象範囲

### 画面（ルート）

| ルート | 内容 |
|---|---|
| `/companies` | 事業者情報一覧（検索・フィルタ 3 種・ページネーション） |
| `/companies/new` | 事業者情報の新規作成 |
| `/companies/[id]` | 事業者情報詳細（8:2 グリッド、RelationField による紐づけ変更） |
| `/companies/[id]/edit` | 事業者情報編集（住所・ドメイン・金融機関の即時反映セクション、削除モーダル） |
| `/accounts` | 取引先一覧（検索・フィルタ 3 種・ページネーション） |
| `/accounts/new` | 取引先の新規作成（※本来は契約成立時の自動生成が正。手動作成は補助経路） |
| `/accounts/[id]` | 取引先詳細（商談一覧・窓口の連絡先・区分バッジ） |
| `/accounts/[id]/edit` | 取引先編集（区分の即時付け外し、削除モーダル） |
| `/admin`（マスタ・取込 > 法人 > 実在確認タブ） | 法人番号 Web-API による実在確認バッチパネル |

### Server Action

| ファイル | 関数 |
|---|---|
| `src/actions/companies.ts` | getCompanies / getCompany / createCompany / updateCompany / deleteCompany / suggestCompanyKana / addCompanyDomain / setPrimaryCompanyDomain / deleteCompanyDomain |
| `src/actions/accounts.ts` | getAccounts / getAccount / createAccount / updateAccount / deleteAccount / addAccountContact / removeAccountContact / getAccountRoleTypes / addAccountRole / removeAccountRole |
| `src/actions/company-verification.ts` | verifyCompany / verifyCompaniesBatch / getHoujinApiStatus |
| `src/actions/entity-addresses.ts` | getEntityAddresses / addEntityAddress / updateEntityAddress / setPrimaryEntityAddress / deleteEntityAddress |
| `src/actions/financial-info.ts` | getCompanyFinancialInfo / createFinancialInfo / updateFinancialInfo / deleteFinancialInfo |

### validator / 補助

- `src/lib/validators/companies.ts`（createCompanySchema / updateCompanySchema / createCompanyDomainSchema）
- `src/lib/validators/accounts.ts`（createAccountSchema / updateAccountSchema / createAccountContactSchema / createAccountRoleSchema）
- `src/lib/validators/financial-info.ts`（金融機関コード 4 桁 / 支店コード 3 桁 / 口座番号 7 桁以内）
- `src/lib/validators/common.ts`（UUID_REGEX / expectedUpdatedAtSchema / conflictErrorMessage）
- `src/lib/company-name.ts`（略記展開 formatCompanyName / 法人格判定 detectCorporateType / 法人格除去 stripCorporateType）
- `src/lib/kana.ts`（kuromoji によるフリガナ自動生成。suggestCompanyKana 経由）
- `src/lib/houjin-bangou/*`（国税庁 法人番号 Web-API クライアント・照合ロジック）

### 関連 DB オブジェクト

- テーブル: companies / accounts / account_contacts / account_roles / account_role_types / company_domains / company_statuses / company_verification_logs / entity_addresses / addresses / financial_info / entity_change_logs
- DB 関数: upsert_company_domain / add_entity_address / set_primary_entity_address / expand_corporate_abbreviations / company_sort_key / resolve_or_create_company（取込経路）
- トリガー: contracts AFTER INSERT による Account 自動作成・区分自動付与、entity_change_logs 自動記録、参照されなくなった addresses の掃除
- マスタ値: company_statuses = 未確認(unverified `#6B7280`) / 実在確認済(verified `#4D7A65`) / 要確認(needs_review `#B88A2E`) / 閉鎖・解散(closed `#B03A2E`)

### 対象範囲の注記

- 名寄せ（resolve_or_create_company: 法人番号 > メールドメイン > 住所+名称 > 名称）は名刺取込・遡及処理の経路で使われる DB 関数であり、**`/companies/new` の画面には重複候補の提示機能は実装されていない**。画面経路の重複防止は略記展開による表記統一のみ。よって本仕様書では「画面から同名法人を二重登録できてしまうこと」を既知の仕様として扱う（CMP-06 参照）
- Deal（商談）・Contract（契約）自体の CRUD は別領域。本書では Account 自動作成の受け側検証（ACC-15）のみ扱う

## 2. テストケース

---

### CMP-01: 一覧の初期表示（並び順・列・バッジ色）

- 対象: `/companies`（getCompanies）
- 権限: member
- 事前条件: seed 投入済み（companies に複数件、うち別ステータスの法人を含む）
- 手順
  1. member@iterra.jp でログインし `/companies` を開く
  2. テーブルの列構成を確認する
  3. 任意の行のステータスバッジの色を確認する
- 期待結果
  - 列は「会社名 / ステータス / 法人格 / 代表電話 / 担当者 / 最終更新日」
  - 並びは `sort_key` 昇順（法人格を除いた名称順。「株式会社アイウエオ」は「ア」の位置に並ぶ）
  - ステータスバッジの色が company_statuses.color の値と一致する（未確認 `#6B7280`、実在確認済 `#4D7A65`、要確認 `#B88A2E`、閉鎖・解散 `#B03A2E`）。画面側で sort_order からの算出をしていないこと
  - 値のない項目は「—」表示
  - member でも RLS 上 companies は閲覧可能（一覧が空にならない）
- 自動化: Playwright候補

### CMP-02: 一覧の検索（会社名・フリガナ・会社コード）

- 対象: `/companies`（getCompanies の `.or(name/name_kana/company_code ilike)`。検索語は `src/lib/search-query.ts` の `buildIlikePattern`/`sanitizeSearchTerm` でサニタイズしてから埋め込む）
- 権限: member
- 事前条件: 「株式会社テスト商事」（フリガナ「テストショウジ」）が存在する
- 手順
  1. 検索欄に「テスト商事」を入力する
  2. 検索欄をクリアし「テストショウジ」（フリガナ）を入力する
  3. 会社コード（例: `CMP-000001`）の一部を入力する
  4. 検索欄に `,` `(` `)` を含む文字列（例: `テスト,商事(株)`）を入力する
- 期待結果
  - 1〜3 いずれも該当行のみに絞り込まれる（部分一致・大文字小文字無視）
  - 検索中は「読み込み込み中...」ではなく「読み込み中...」の表示が出て、完了後に消える
  - 検索変更時はページが 1 に戻る
  - 手順 4: `,` `(` `)` はサニタイズで除去されるため PostgREST の `.or()` 式が壊れてエラーになることはなく、残った文字列（例: `テスト 商事 株`）で通常どおり絞り込まれる。サニタイズ後が空文字になる入力（記号のみ）では検索条件なしの全件表示になる
- 自動化: Playwright候補

### CMP-03: 一覧のフィルタ（ステータス・法人格・担当者）とクリア

- 対象: `/companies`
- 権限: member
- 事前条件: ステータス・法人格・担当者が異なる複数の事業者が存在する
- 手順
  1. ステータス「実在確認済」を選択する
  2. 続けて法人格「株式会社」を選択する（AND 条件）
  3. 担当者フィルタで任意ユーザーを選択する
  4. クリアボタンを押す
- 期待結果
  - 各フィルタは AND で重なり、該当行のみ表示される
  - クリアで 3 フィルタ + 検索語がすべて初期化され、全件表示に戻る
  - フィルタ変更時はページが 1 に戻る
- 自動化: Playwright候補

### CMP-04: 一覧のページネーション（30 件単位）

- 対象: `/companies`（Pagination / DEFAULT_PAGE_SIZE = 30。Server Component の初期取得も `src/app/(app)/companies/page.tsx` で `DEFAULT_PAGE_SIZE` を使い 30 件で揃える）
- 権限: member
- 事前条件: 検索条件に合致する事業者が 31 件以上ある
- 手順
  1. `/companies` を開き、ページャの表示を確認する
  2. 「2」ページ目に移動する
  3. フィルタを 1 つ変更する
- 期待結果
  - ページャは総件数を 30 件単位で分割して表示する
  - 初期表示（1 ページ目）から 30 行で、2 ページ目に 31 行目以降が出る（重複なし）
  - 2 ページ目でフィルタ・検索条件を維持したまま次の 30 件が出る
  - フィルタ変更後はページ 1 に戻る
- 自動化: Playwright候補

### CMP-05: 新規作成の正常系（作成 → 詳細へ遷移 → 一覧反映）

- 対象: `/companies/new`（createCompany）
- 権限: member
- 手順
  1. `/companies/new` を開く
  2. 会社名「株式会社イテラテスト」、ステータス「未確認」を入力・選択する（他は空欄）
  3. 「作成」を押す
  4. 遷移先の詳細ページを確認後、`/companies` に戻る
- 期待結果
  - 成功トースト「事業者情報を作成しました」（約 4 秒で自動消滅）
  - 作成した事業者の詳細ページ `/companies/{新規id}` にリダイレクトされる
  - 一覧に新しい行が表示される
  - DB: companies に 1 行 INSERT。`owner_user_id` は未指定のため作成者自身の user id、`created_by` も同じ。`entity_change_logs` にトリガーによる作成記録が残る（SQL 検証）
- 自動化: Playwright候補 + SQL検証

### CMP-06: 会社名の略記展開が保存時に効くこと

- 対象: createCompany / updateCompany（applyCompanyNameRules → formatCompanyName）
- 権限: member
- 手順
  1. `/companies/new` で会社名に「㈱イテラ略記」と入力し、ステータスを選択して作成する
  2. 作成後の詳細ページで会社名を確認する
  3. 別の事業者の編集ページで会社名を「（株）イテラ略記２」に変更して保存する
  4. 全角スペース入りの「株式会社　テスト　　工業」でも作成する
- 期待結果
  - 手順 1: 保存された会社名は「株式会社イテラ略記」（㈱ が展開される）
  - 手順 3: 「株式会社イテラ略記２」（（株）も展開される。更新経路でも効く）
  - 手順 4: 「株式会社 テスト 工業」（全角スペースは半角へ、連続空白は 1 つに縮約）
  - 法人格が未選択の場合、展開後の名称から「株式会社」が検出され corporate_type_id が自動補完される（画面上も入力中に法人格セレクトが自動選択される）
  - 注記: 表記統一以外の重複チェックは画面経路には無く、同名法人を二重に登録できる（既知の仕様。名寄せは取込側の resolve_or_create_company が担う）
- 自動化: Playwright候補 + SQL検証

### CMP-07: フリガナ自動生成（kuromoji）と人の入力の優先

- 対象: suggestCompanyKana（`/companies/new`・`/companies/[id]/edit` の会社名 onBlur）
- 権限: member
- 手順
  1. `/companies/new` で会社名に「株式会社山田製作所」と入力し、フォーカスを外す
  2. フリガナ欄の値を確認する
  3. フリガナを手で「ヤマダセイサクジョ」に書き換えてから、会社名を「株式会社山田工業」に変えてフォーカスを外す
  4. フリガナを空にしたまま保存した場合の DB 値も確認する
- 期待結果
  - 手順 2: フリガナに片仮名の読み（例「ヤマダセイサクショ」）が下書きとして入る。法人格「カブシキガイシャ」は含まれない（stripCorporateType 経由）
  - 手順 3: 手入力済みのフリガナは上書きされない
  - 手順 4: フリガナ空で保存した場合、Server Action 側で読みが補完されて保存される（DB の name_kana が NULL でない。SQL 検証）
  - フリガナは編集可能な状態で表示される（形態素解析は正確とは限らないため）
- 自動化: Playwright候補 + SQL検証

### CMP-08: 法人番号入力によるインボイス登録番号の自動補完

- 対象: `/companies/new`・`/companies/[id]/edit`（onCorporateNumberChange）
- 権限: member
- 手順
  1. 新規作成画面で法人番号に「1234567890123」（13 桁）を入力する
  2. インボイス登録番号欄を確認する
  3. インボイス欄を「T9999999999999」に手で書き換えてから、法人番号を別の 13 桁に変更する
- 期待結果
  - 手順 2: インボイス登録番号に「T1234567890123」が自動補完される
  - 手順 3: 手入力済みの値は上書きされない
  - 保存時、登録番号があると invoice_registered = true として送信される（詳細ページの「登録有無」が「登録済み」になる）
- 自動化: Playwright候補

### CMP-09: 新規作成のバリデーション異常系

- 対象: createCompanySchema（Zod）
- 権限: member
- 手順と期待結果（各項目は独立に確認）
  1. 会社名を空で送信 → ブラウザの required で送信不可。DevTools で required を外して送信した場合は Zod「会社名は必須です」がインライン表示される
  2. ステータス未選択で送信 → required で送信不可（Zod 側は「ステータスは必須です」）
  3. 法人番号に「12345」（13 桁未満）→ エラー「法人番号は13桁の数字です」。トーストではなくフォーム下にインライン表示
  4. 法人番号に「123456789012a」（英字混在）→ 同上
  5. インボイス登録番号に「1234567890123」（T 無し）→ エラー「T+13桁の数字です」
  6. ホームページ URL に「example」（URL 形式でない）→ エラー「有効なURLを入力してください」
  7. 会社名 201 文字 / フリガナ 201 文字 / 代表者名 101 文字 / 電話 21 文字 / メモ 2001 文字 → いずれも Zod の max でエラー
  8. いずれのエラーでも DB に行が作られないこと（SQL 検証）
- 自動化: Playwright候補（3〜6）/ 手動のみ（1・2 の required 外し）/ SQL検証（8）

### CMP-10: 個人事業主の登録（屋号 + 法人格「個人事業主」）

- 対象: `/companies/new` / `/companies/[id]` / `/companies/[id]/edit`
- 権限: member
- 手順
  1. `/companies/new` で会社名（屋号）に「イテラ堂」と入力する
  2. 法人格セレクトで「個人事業主」を選択する
  3. 画面の変化を確認して作成する
  4. 詳細ページの属性情報を確認する
- 期待結果
  - 法人格に「個人事業主」を選ぶと**法人番号の入力欄が消える**（インボイス登録番号は引き続き入力できる）
  - 屋号のまま companies に登録される（Account や別の器は作られない）
  - 詳細ページの基本情報に法人番号欄が表示されない
  - 属性情報の「最終確認」が「対象外（個人事業主）」と表示される
  - 編集ページでも法人番号欄が非表示
- 自動化: Playwright候補

### CMP-11: 詳細ページの表示内容とレイアウト規約

- 対象: `/companies/[id]`（getCompany / getEntityAddresses / getCompanyFinancialInfo）
- 権限: manager
- 事前条件: 取引先・連絡先・住所・ドメイン・口座が紐づく事業者が存在する
- 手順
  1. manager で対象事業者の詳細ページを開く
  2. 左カラム（メイン側）と右カラム（サイドバー）の構成を確認する
- 期待結果
  - ヘッダー: 会社コード + 会社名 + 「編集」ボタン（アイコン付き）
  - 左: 基本情報 / 属性情報（法人格・業種・ステータス・リードソース・最終確認・確認者・ステータス更新日・確認メモ・登記事項証明書URL）/ 連絡先（代表電話・FAX・URL・メールドメイン）/ インボイス / 金融機関情報（manager 以上のみ）/ メモ（値がある時のみ）
  - メールドメインは代表が先頭・緑系の強調表示
  - 右サイドバー: 「取引先一覧」「連絡先一覧」は**リスト型**（テーブル禁止の規約どおり）。削除済み（deleted_at 非 NULL）の取引先・連絡先は出ない
  - 各リンク（取引先・連絡先への遷移）にアイコン付きの EntityLink が使われる
  - 所在地は住所マスタから主住所が先頭で並ぶ
- 自動化: 手動のみ（レイアウト目視）+ Playwright候補（表示要素の存在）

### CMP-12: 詳細ページの RelationField（担当者・社内担当者の付け替え）

- 対象: `/companies/[id]` の saveRelation（updateCompany 経由・楽観ロック付き）
- 権限: member（自分がオーナーのデータ）と member（他人のデータ）で比較
- 手順
  1. 自分がオーナーの事業者詳細を開き、「担当者」（primary_contact_id）をその会社の連絡先から選んで保存する
  2. 「社内担当者」を別ユーザーに付け替える
  3. admin 以外のユーザーで、自分がオーナーでない事業者の詳細を開く（manager で確認）
- 期待結果
  - 手順 1: 担当者の選択肢は**その会社に紐づく連絡先のみ**。保存後に表示が更新される
  - 手順 2: 社内担当者が付け替わる（以降そのユーザーの担当データになる）
  - 手順 3: canEdit = false のため RelationField が編集不可（表示のみ）
  - 編集ページには担当者・社内担当者の欄が無く、詳細ページが唯一の入口であること
- 自動化: Playwright候補

### CMP-13: 編集・保存の正常系

- 対象: `/companies/[id]/edit`（updateCompany）
- 権限: member（自分がオーナーのデータ）
- 手順
  1. 詳細ページの「編集」から編集ページへ遷移する
  2. 代表者名を「テスト太郎」、代表電話を「03-1234-5678」に変更する
  3. ステータスを「未確認」から「要確認」に変更する
  4. 「保存」を押す
- 期待結果
  - 成功トースト「保存しました」、詳細ページへ戻り変更が反映されている
  - DB: `status_updated_at` がステータス変更に伴い現在時刻へ更新される（ステータスを変えなかった場合は据え置き）。`last_updated_by` が操作ユーザーになる。`entity_change_logs` に変更差分が自動記録される（SQL 検証）
- 自動化: Playwright候補 + SQL検証

### CMP-14: 楽観ロック（2 画面同時編集の競合）

- 対象: updateCompany（expected_updated_at）
- 権限: admin（同一データを 2 タブで開くため）
- 手順
  1. 同じ事業者の編集ページをタブ A・タブ B で開く
  2. タブ A で代表者名を「A更新」にして保存する（成功）
  3. タブ B で代表者名を「B更新」にして保存する
- 期待結果
  - タブ B の保存はエラートースト「この事業者情報は他のユーザーによって更新されています。画面を再読み込みしてから保存してください」
  - エラートーストは自動消滅せず、閉じるボタンでのみ消える
  - DB の代表者名は「A更新」のまま（B の内容で上書きされない。SQL 検証）
  - タブ B を再読み込みして保存し直すと成功する
- 自動化: Playwright候補（2 コンテキスト）+ SQL検証

### CMP-15: 論理削除（編集ページ内モーダル・紐づく取引先のブロック）

- 対象: deleteCompany（`/companies/[id]/edit` の削除ボタン → ConfirmDialog）
- 権限: admin
- 手順
  1. admin で取引先が紐づいて**いない**事業者の編集ページを開く
  2. フッター左の「削除」を押し、モーダル「事業者情報を削除」で「削除する」を押す
  3. 別途、未削除の取引先が紐づく事業者でも同じ操作を行う
- 期待結果
  - 手順 2: 成功トースト「事業者情報を削除しました」、`/companies` へ遷移。一覧から消える
  - DB: 物理削除ではなく `deleted_at` / `deleted_by` がセットされる（SQL 検証）。行自体は残る
  - 手順 3: エラー「紐づく取引先が存在するため削除できません」がモーダル内に表示され、削除されない（取引先側を先に削除すれば通る）
  - モーダル文言に「紐づく取引先が存在する場合は削除できません」の注意書きがあること
- 自動化: Playwright候補 + SQL検証

### CMP-16: 削除の admin 限定（UI 非表示 + Action 拒否）

- 対象: deleteCompany
- 権限: member / manager
- 手順
  1. member で自分がオーナーの事業者の編集ページを開く
  2. manager でも同様に開く
  3. （API 直叩き検証）member のセッションで deleteCompany 相当の Server Action を直接呼ぶ
- 期待結果
  - 手順 1・2: 削除ボタン自体が表示されない（isAdmin = false）
  - 手順 3: `{ error: "管理者権限が必要です" }` が返り、DB は変化しない（多層防御が Action 層でも効く）
- 自動化: Playwright候補（1・2）/ 手動のみ（3）

### CMP-17: UUID 形式不正 URL

- 対象: `/companies/[id]` / `/companies/[id]/edit`
- 権限: member
- 手順
  1. `/companies/not-a-uuid` を直接開く
  2. `/companies/12345678-1234-1234-1234-12345678zzzz/edit` を直接開く
- 期待結果
  - いずれも「不正なパラメータです」と事業者情報一覧へ戻るリンクが表示される（DB クエリは実行されない）
  - 500 エラーにならない
- 自動化: Playwright候補

### CMP-18: 存在しない ID・削除済み ID への直 URL

- 対象: `/companies/[id]`（getCompany の `.is("deleted_at", null).single()` エラー経路）
- 権限: member
- 手順
  1. UUID 形式だが存在しない ID（例: `00000000-0000-0000-0000-000000000000`）で詳細を開く
  2. CMP-15 で削除済みにした事業者の ID で詳細を開く
  3. 削除済みの ID に対して member（元オーナー）セッションで `updateCompany` を直接呼ぶ
- 期待結果
  - 手順 1・2: いずれも「事業者情報が見つかりません」+ 一覧へ戻るリンク（getCompany が `deleted_at` を絞るため 0 件で `.single()` がエラーになり、既存のエラー経路にそのまま乗る）
  - 手順 3: 2026-08-03 に owner チェック用の存在確認クエリへ `.is("deleted_at", null)` を追加済み（`src/actions/companies.ts` の `updateCompany`）。削除済みレコードは existing が取れず「事業者情報が見つかりません」で拒否される（画面経路・直接 Action 呼び出しの両方で防御）
- 自動化: Playwright候補

### CMP-19: オーナーチェック（admin 以外は自分の担当のみ更新可）

- 対象: updateCompany（Server Action 層のオーナーチェック）
- 権限: manager（RLS では全件閲覧できるが、オーナーでないデータは更新不可）
- 事前条件: member がオーナーの事業者が存在する
- 手順
  1. manager でその事業者の編集ページを開く（閲覧は可能）
  2. 会社名を書き換えて保存する
- 期待結果
  - エラートースト「この事業者情報を編集する権限がありません」、DB は変化しない
  - admin で同じ操作をすると保存できる（admin はオーナーチェック免除）
  - member で RLS 上見えない他人のデータ ID に対して更新した場合は existing が取れず「事業者情報が見つかりません」
- 自動化: Playwright候補 + SQL検証

### CMP-20: メールドメイン管理（追加・代表切替・削除・フリーメール拒否）

- 対象: `/companies/[id]/edit` の CompanyDomainsSection（addCompanyDomain / setPrimaryCompanyDomain / deleteCompanyDomain → DB 関数 upsert_company_domain）
- 権限: member（自分がオーナーのデータ。削除可否は RLS が判定）
- 手順
  1. 編集ページのメールドメイン欄に「iterra-test.co.jp」を入力し「追加」を押す
  2. 「info@iterra-test2.co.jp」（メールアドレス形式）を入力して追加する
  3. 「gmail.com」を追加する
  4. 別の事業者に既に登録済みのドメインを追加する
  5. 2 件目のドメインの「代表にする」を押す
  6. 一方を「削除」する
- 期待結果
  - 手順 1: 成功トースト「iterra-test.co.jp を登録しました」。最初の 1 件は自動で「代表」バッジ付き。**フォームの保存ボタンを押さなくても即時反映**（ページ再読み込みで残っている）
  - 手順 2: DB 側 normalize_domain によりドメイン部分「iterra-test2.co.jp」が抽出・登録される
  - 手順 3: フリーメールは DB 側で拒否され、入力欄の下にインラインエラー表示（`[field]` 形式）またはエラートースト
  - 手順 4: 他法人との重複が拒否される
  - 手順 5: 代表バッジが付け替わる（成功トースト「〜を代表ドメインにしました」）。DB では旧代表の is_primary が false（原子的な付け替え。SQL 検証)
  - 手順 6: 行が消え、成功トースト「〜を削除しました」
  - Enter キーで追加が発火し、フォーム全体の送信にならないこと
- 自動化: Playwright候補 + SQL検証

### CMP-21: 住所の追加・主住所切替・削除（住所マスタ経由）

- 対象: `/companies/[id]/edit` の AddressesEditor（entity-addresses.ts → DB 関数 add_entity_address / set_primary_entity_address）
- 権限: member（オーナー）。オーナーでない member は拒否されること
- 手順
  1. 新規作成画面では住所欄が「作成後に編集画面から登録できます」の案内のみであることを確認する
  2. 編集ページで住所（例: 〒150-0001 / 東京都 / 渋谷区 / 神宮前1-1-1）を追加する
  3. 2 件目の住所を追加し、主住所を切り替える
  4. 全項目を空にして追加を試みる
  5. 1 件を削除する
- 期待結果
  - 手順 2: addresses + entity_addresses に 1 トランザクションで作成される（rpc）。詳細ページの「所在地」に表示される
  - 手順 3: 主住所が付け替わり、詳細の所在地で主住所が先頭に出る
  - 手順 4: エラー「住所を入力してください」
  - 手順 5: entity_addresses の行が消え、どこからも参照されない addresses 本体はトリガーが片付ける（SQL 検証）
  - オーナーでない member（manager 未満）が同じ操作をすると「この情報を変更する権限がありません」（manager 以上は可）
- 自動化: Playwright候補 + SQL検証

### CMP-22: 金融機関情報（ロール別表示・桁数バリデーション・主口座の繰り上げ）

- 対象: financial-info.ts（getCompanyFinancialInfo / createFinancialInfo / updateFinancialInfo / deleteFinancialInfo）、`/companies/[id]` と `/companies/[id]/edit` の金融機関情報セクション
- 権限: member / manager / admin の 3 者比較
- 手順
  1. member で詳細・編集ページを開き、金融機関情報セクションの有無を確認する
  2. manager で同じページを開く
  3. admin で編集ページから口座（金融機関名「テスト銀行」、金融機関コード「0001」、支店コード「001」、口座番号「1234567」、種別「普通」）を追加する
  4. admin で金融機関コード「12345」（5 桁）で追加を試みる
  5. admin で 2 件目の口座を追加し、主口座（1 件目）を削除する
- 期待結果
  - 手順 1: member にはセクション自体が表示されない（Action が「金融機関情報の閲覧には manager 以上の権限が必要です」を返し、null のため欄ごと非表示）
  - 手順 2: manager は閲覧できるが編集操作は不可（editable = admin のみ）。manager で create を直接呼ぶと「金融機関情報の変更には管理者権限が必要です」
  - 手順 3: 追加が即時反映され、1 件目は自動的に主口座（★）になる。詳細ページにも表示される
  - 手順 4: エラー「金融機関コードは半角数字 4 桁で入力してください」（支店コードは 3 桁、口座番号は 7 桁以内、金融機関名は必須）
  - 手順 5: 主口座を論理削除すると、残った口座が自動で主口座に繰り上がる（SQL 検証: 削除行は deleted_at セット + is_primary=false、次の口座が is_primary=true）
  - 補足（2026-08-03 対応）: `updateFinancialInfo` は `expected_updated_at` を受け取り、指定時は WHERE 条件に含めて楽観ロックする（0 行更新なら「この金融機関情報は他のユーザーによって更新されています。画面を再読み込みしてから保存してください」）。ただし `FinancialInfoEditor.tsx` は現状 `updated_at` を取得・送信していないため、UI 経由の保存は当面ロックなし（後方互換）で従来どおり後勝ちになる
- 自動化: Playwright候補 + SQL検証

### CMP-23: 実在確認バッチ（法人番号 Web-API 照合）

- 対象: `/admin` マスタ・取込 > 法人グループ >「実在確認」タブ（verifyCompaniesBatch / getHoujinApiStatus）
- 権限: admin（画面が admin 配下のため）。Action 自体は manager 以上で通る
- 事前条件: 環境変数 `HOUJIN_BANGOU_APP_ID` の設定有無 2 パターンで確認。法人番号あり・なし・実在しない商号の事業者を用意
- 手順
  1. APP_ID 未設定の状態でタブを開く
  2. APP_ID 設定済みで、処理件数「3」を入力して「実在確認を実行」する
  3. 処理件数に「0」を入力して実行する
  4. 実行後、各事業者の詳細ページと DB を確認する
- 期待結果
  - 手順 1: 「アプリケーションID が未設定のため実行できません」の案内が出て、実行ボタンが無効
  - 手順 2: 成功トースト「N 件を照合しました」。結果チップ（実在確認済 / 変更検知 / 特定できず / 閉鎖・解散 / エラー）が件数付きで表示され、verified 以外の明細が下に並ぶ
  - 手順 3: エラートースト「件数は 1 以上で指定してください」
  - 手順 4（DB / 画面反映。SQL 検証含む）:
    - 照合一致 → company_status = 実在確認済（verified）。商号検索で 1 件に特定できた場合は corporate_number が取り込まれる
    - 商号・所在地の差分検知 / 同名複数で特定不可 / 該当なし → 要確認（needs_review）。verification_note に差分・理由が入る
    - 登記閉鎖 → 閉鎖・解散（closed）
    - 通信エラー → ステータスは動かない（verified_at 等の確認記録のみ更新）
    - すべての結果が company_verification_logs に INSERT される（INSERT ONLY）
    - 詳細ページの「最終確認」が「YYYY/MM/DD（法人番号API）」、確認者が実行ユーザーになる
  - 対象選定は verified_at NULL（未確認）優先 → 確認が古い順。**法人格「個人事業主」は対象から除外**される
- 自動化: 手動のみ（外部 API 依存）+ SQL検証

### CMP-24: 実在確認の個人事業主ガード（単体照合）

- 対象: verifyCompany
- 権限: manager
- 事前条件: 法人格「個人事業主」の事業者（CMP-10 で作成）が存在する
- 手順
  1. manager セッションで対象の companyId を指定して verifyCompany を呼ぶ（バッチに紛れ込ませず単体で検証）
  2. member セッションでも同じ呼び出しを行う
- 期待結果
  - 手順 1: `{ error: "個人事業主は法人番号を持たないため、実在確認の対象外です" }`。ステータス・ログとも変化しない
  - 手順 2: `{ error: "manager 以上の権限が必要です" }`
- 自動化: 手動のみ（Action 直接呼び出し）+ SQL検証

---

### ACC-01: 一覧の初期表示（列・バッジ・並び順）

- 対象: `/accounts`（getAccounts）
- 権限: member
- 事前条件: 種別・ステータス・区分が異なる取引先が複数存在する（契約経由で自動作成されたものを含むとよい）
- 手順
  1. `/accounts` を開き、列構成とバッジを確認する
- 期待結果
  - 列は「取引先名 / ステータス / 区分 / 会社名 / 担当者 / 最終更新日」、並びは created_at 降順（新しい順）
  - 取引先名セルに**種別バッジ**（法人/個人事業主。account_type がある行のみ）が名前の横に付く
  - 「区分」列に顧客・仕入れ先などの LabelBadge が複数並ぶ（sort_order 順）。区分なしは「—」
  - ステータスバッジの色は account_statuses.color、区分バッジの色は account_role_types.color の DB 値そのまま
  - member は RLS 上 `owner_user_id = 自分` の行のみ見える（admin/manager は全件）
- 自動化: Playwright候補

### ACC-02: 一覧の検索・フィルタ・クリア

- 対象: `/accounts`（name / account_code の ilike。検索語は `src/lib/search-query.ts` の `buildIlikePattern`/`sanitizeSearchTerm` でサニタイズしてから埋め込む。statusId / accountTypeId / ownerUserId フィルタ）
- 権限: manager
- 手順
  1. 検索欄に取引先名の一部を入力する
  2. account_code（例: `ACC-000001`）の一部で検索する
  3. ステータス・種別・担当者フィルタを順に適用する
  4. 検索欄に `,` `(` `)` を含む文字列を入力する
  5. クリアボタンを押す
- 期待結果
  - 名称・コードの部分一致で絞り込まれる
  - 3 フィルタは AND。クリアで全条件が初期化される
  - 条件変更時はページ 1 に戻る
  - 手順 4: `,` `(` `)` はサニタイズで除去され、`.or()` 式が壊れてエラーにならない（サニタイズ後が空文字なら全件表示）
- 自動化: Playwright候補

### ACC-03: 一覧のページネーション（30 件単位）

- 対象: `/accounts`（Pagination / DEFAULT_PAGE_SIZE = 30。Server Component の初期取得も `src/app/(app)/accounts/page.tsx` で `DEFAULT_PAGE_SIZE` を使い 30 件で揃える）
- 権限: admin（全件見えるロールで件数を確保）
- 事前条件: 取引先が 31 件以上ある
- 手順
  1. ページャで 2 ページ目に移動する
- 期待結果
  - 初期表示（1 ページ目）から 30 行で、2 ページ目に続きの行が出る（重複なし）
- 自動化: Playwright候補

### ACC-04: 手動新規作成の正常系（補助経路としての位置づけ確認）

- 対象: `/accounts/new`（createAccount）
- 権限: member
- 手順
  1. `/accounts/new` を開く
  2. 取引先名「株式会社イテラテスト」、ステータス「アクティブ」を入力・選択する
  3. 事業者情報のサーチャブルセレクトで既存の事業者を紐づける（任意項目であることも確認）
  4. 「作成」を押す
- 期待結果
  - 成功トースト「取引先を作成しました」、詳細ページ `/accounts/{新規id}` へ遷移
  - DB: accounts に 1 行 INSERT。owner_user_id 未指定なら作成者、created_by = 作成者（SQL 検証）
  - 事業者情報（company_id）は**任意**。未選択でも作成できる
  - 位置づけ: Account は本来「契約成立時に contracts の AFTER INSERT トリガーで自動作成」される（docs/database-design.md § 16）。この画面は既存取引の遡及登録などのための補助経路であり、画面上で自動生成経路と競合しないこと（ACC-15 で自動経路を検証）
- 自動化: Playwright候補 + SQL検証

### ACC-05: 新規作成のバリデーション異常系

- 対象: createAccountSchema（Zod）
- 権限: member
- 手順と期待結果
  1. 取引先名を空で送信 → required で送信不可（Zod 側は「取引先名は必須です」）
  2. ステータス未選択 → required で送信不可（Zod 側は「ステータスは必須です」uuid 検証）
  3. 取引先名 201 文字 → Zod max(200) エラー
  4. 説明は textarea の maxLength=1000 で 1001 文字目が入力できない（Zod 側も max(1000)）
  5. いずれも DB に行が作られない（SQL 検証)
- 自動化: Playwright候補 + SQL検証

### ACC-06: 詳細ページの表示内容とレイアウト規約

- 対象: `/accounts/[id]`（getAccount）
- 権限: manager
- 事前条件: 事業者情報・商談・窓口連絡先・区分が紐づく取引先が存在する
- 手順
  1. 対象取引先の詳細ページを開く
- 期待結果
  - ヘッダー: account_code + 取引先名 + 「編集」ボタン
  - 左（メイン側）: 基本情報（取引先名・担当者・事業者情報・説明）/ 属性情報（種別・ステータス・リードソース・インボイス登録・登録番号・ステータス更新日・区分バッジ）/ **商談一覧テーブル**（コード・取引名・ステージ・ステータス・金額。金額は ¥ 表記）
  - インボイス登録番号は**紐づく事業者情報の値の読み取り表示**（取引先側では編集できない。編集ページにも欄が無い）
  - 右サイドバー: 「窓口の連絡先」は**リスト型**（テーブルはメイン側の商談一覧のみ）。各行に氏名・部署/役職・区分ラベル
  - 削除済み連絡先は窓口一覧に出ない
- 自動化: 手動のみ（レイアウト目視）+ Playwright候補（要素存在）

### ACC-07: 詳細ページの RelationField（事業者情報・担当者の付け替え）

- 対象: `/accounts/[id]` の saveRelation（updateAccount 経由・楽観ロック付き）
- 権限: member（オーナー）/ manager（非オーナー）
- 手順
  1. オーナーとして詳細ページで「事業者情報」を別の事業者に付け替える
  2. 「担当者」を別ユーザーに付け替える
  3. 非オーナー（manager）で開き、編集可否を確認する
- 期待結果
  - 手順 1: 事業者情報の紐づけが変わり、属性情報のインボイス表示も付け替え先の値に変わる。会社検索付きセレクト（searchKind="company"）で選べる
  - 手順 2: 担当者が付け替わる
  - 手順 3: canEdit = false で編集不可（表示のみ）
  - 編集ページには事業者情報・担当者の欄が無く、詳細ページが唯一の入口
- 自動化: Playwright候補

### ACC-08: 窓口の連絡先の追加・削除

- 対象: `/accounts/[id]`（addAccountContact / removeAccountContact）
- 権限: member（オーナー）
- 手順
  1. 詳細ページ右の「窓口の連絡先」で未紐づけの連絡先を選び、区分「その他」で追加する
  2. 同じ連絡先が候補から消えていることを確認する
  3. 追加した連絡先を削除する
- 期待結果
  - 追加後、リストに氏名 + 区分ラベルが表示される。DB: account_contacts に INSERT（created_by = 操作者。SQL 検証）
  - 既に紐づいた連絡先は追加候補に出ない
  - 削除で account_contacts の行が物理削除される（連絡先本体は消えない）
  - 区分は primary / billing / technical / other の 4 種
- 自動化: Playwright候補 + SQL検証

### ACC-09: 編集・保存の正常系

- 対象: `/accounts/[id]/edit`（updateAccount）
- 権限: member（オーナー）
- 手順
  1. 編集ページで取引先名・種別・説明を変更し、ステータスを別の値に変える
  2. 「保存」を押す
- 期待結果
  - 成功トースト「保存しました」、詳細ページへ戻り反映されている
  - DB: ステータス変更に伴い status_updated_at が更新される。last_updated_by = 操作者。entity_change_logs に差分が自動記録（SQL 検証）
- 自動化: Playwright候補 + SQL検証

### ACC-10: 楽観ロック（2 画面同時編集の競合）

- 対象: updateAccount（expected_updated_at）
- 権限: admin
- 手順
  1. 同じ取引先の編集ページをタブ A・B で開く
  2. タブ A で保存 → 成功
  3. タブ B で保存
- 期待結果
  - タブ B にエラートースト「この取引先は他のユーザーによって更新されています。画面を再読み込みしてから保存してください」（手動クローズのみ）
  - DB はタブ A の内容のまま（SQL 検証）
- 自動化: Playwright候補 + SQL検証

### ACC-11: 区分の付け外し（即時反映・契約自動付与の表示）

- 対象: `/accounts/[id]/edit` の AccountRolesSection（addAccountRole / removeAccountRole）
- 権限: member（オーナー）
- 事前条件: 契約により自動付与された区分を持つ取引先と、区分なしの取引先を用意
- 手順
  1. 編集ページの「区分」でチェックされていない区分（例: 仕入れ先）にチェックを入れる
  2. 同じ区分のチェックを外す
  3. 契約で自動付与された区分の行の注記を確認する
- 期待結果
  - 手順 1: 成功トースト「仕入れ先 を付与しました」。**保存ボタンを押さなくても即時反映**。一覧の「区分」列・詳細の区分バッジに現れる
  - 手順 2: 成功トースト「仕入れ先 を外しました」
  - 手順 3: 自動付与された区分には「契約により自動付与」、パイプライン連動の区分には「◯◯の契約で自動付与」、連動しない区分には「手動のみ」の注記
  - DB: account_roles に INSERT/DELETE（assigned_by_contract は手動付与で false。SQL 検証）
- 自動化: Playwright候補 + SQL検証

### ACC-12: 論理削除（編集ページ内モーダル・アクティブ商談のブロック)

- 対象: deleteAccount
- 権限: admin
- 手順
  1. アクティブな商談（closed_at IS NULL かつ未削除）が紐づく取引先の編集ページで「削除」→ モーダルで「削除する」
  2. 商談のない（またはすべてクローズ済みの）取引先で同じ操作を行う
- 期待結果
  - 手順 1: エラー「アクティブな商談が存在するため削除できません」。削除されない
  - 手順 2: 成功トースト「取引先を削除しました」、`/accounts` へ遷移。DB は deleted_at / deleted_by セットの論理削除（SQL 検証）
  - クローズ済み商談だけが紐づく取引先は削除できる（closed_at 条件の確認）
- 自動化: Playwright候補 + SQL検証

### ACC-13: 削除の admin 限定

- 対象: deleteAccount
- 権限: member / manager
- 手順
  1. member（オーナー）・manager それぞれで編集ページを開く
  2. member のセッションで deleteAccount を直接呼ぶ
- 期待結果
  - 手順 1: 削除ボタンが表示されない
  - 手順 2: `{ error: "管理者権限が必要です" }`、DB 変化なし
- 自動化: Playwright候補（1）/ 手動のみ（2）

### ACC-14: UUID 不正 URL・存在しない ID・削除済み ID・他人データへの直 URL

- 対象: `/accounts/[id]` / `/accounts/[id]/edit`（getAccount の `.is("deleted_at", null).single()` エラー経路）
- 権限: member
- 手順
  1. `/accounts/abc` を開く
  2. `/accounts/00000000-0000-0000-0000-000000000000` を開く
  3. member で、**他のユーザーがオーナーの取引先**の ID を直接開く（admin で ID を控えておく）
  4. 手順 3 の ID に対して member セッションで updateAccount を直接呼ぶ
  5. ACC-12 で削除済みにした取引先の ID で詳細を開く
  6. 手順 5 の削除済み ID に対して、元オーナーの member セッションで updateAccount を直接呼ぶ
- 期待結果
  - 手順 1: 「不正なパラメータです」+ 取引先一覧へ戻るリンク
  - 手順 2: 「取引先が見つかりません」+ 一覧へ戻るリンク
  - 手順 3: RLS により取得できず「取引先が見つかりません」（存在自体を漏らさない）
  - 手順 4: existing が取れず `{ error: "取引先が見つかりません" }`。DB 変化なし
  - 手順 5: getAccount が `deleted_at` を絞るため 0 件で `.single()` がエラーになり、「取引先が見つかりません」+ 一覧へ戻るリンク（削除済みレコードが直 URL で見えない）
  - 手順 6: 2026-08-03 に owner チェック用の存在確認クエリへ `.is("deleted_at", null)` を追加済み（`src/actions/accounts.ts` の `updateAccount`）。削除済みレコードは existing が取れず「取引先が見つかりません」で拒否される（画面経路・直接 Action 呼び出しの両方で防御）
- 自動化: Playwright候補 + 手動のみ（4, 6）

### ACC-15: 契約成立による Account 自動作成（受け側の検証）

- 対象: contracts AFTER INSERT トリガー → accounts / account_roles / account_contacts、`/accounts` 一覧・詳細
- 権限: manager（contracts の操作は manager 以上）
- 事前条件: account_id が NULL で company_id / contact_id を持つ商談（Lead 昇格由来）が存在する
- 手順
  1. その商談に対して契約を登録する（契約画面の操作手順は契約領域の仕様書に従う）
  2. `/accounts` 一覧を開く
  3. 自動作成された取引先の詳細を開く
- 期待結果
  - Account が自動作成され、商談の account_id に紐づく（SQL 検証: deals.account_id が非 NULL になる）
  - 詳細ページで、商談のパイプラインに対応する区分が assigned_by_contract = true で付与されている（編集ページの区分行に「契約により自動付与」と表示）
  - 商談の相手担当者が「窓口の連絡先」に主担当（primary）として入っている
  - 事業者情報（company）が紐づき、インボイス表示が事業者情報の値になる
  - 手動新規作成（ACC-04）とこの自動経路が同じ一覧・詳細で区別なく扱えること
- 自動化: Playwright候補 + SQL検証

## 3. 実装を読んで気づいた仕様上の懸念

1. ~~一覧の初期ロード件数とページサイズの不一致~~ **2026-08-03 対応済み**: `/companies` と `/accounts` の Server Component（`src/app/(app)/companies/page.tsx` / `accounts/page.tsx`）が `perPage: 50` の固定値だったのを `DEFAULT_PAGE_SIZE`（`src/lib/constants/pagination.ts`）参照に統一。初期表示とページ操作後で 30 件に揃う（CMP-04 / ACC-03）。
2. ~~検索語がクエリ構文に生で埋め込まれる~~ **2026-08-03 対応済み**: `getCompanies` / `getAccounts` の検索語を `src/lib/search-query.ts` の `buildIlikePattern`（内部で `sanitizeSearchTerm`）に通してから `.or()` へ埋め込むよう変更。`,` `(` `)` `.` `%` `_` を空白へ置換するため PostgREST の or 構文が壊れない。サニタイズ後が空文字なら検索条件を付けず全件表示になる（CMP-02 / ACC-02）。
3. **updateCompany のみ owner 不在時のメッセージが露出気味**: manager は RLS で他人のデータを閲覧できるため、編集画面自体は開けてしまい、保存時に初めて「編集する権限がありません」と分かる。UX 上、編集ページ表示時点で読み取り専用にする余地がある（accounts 側も同様）。
4. ~~getCompany / getAccount が deleted_at を絞っていない~~ **2026-08-03 対応済み**: 一覧に合わせて詳細取得（`getCompany` / `getAccount`）にも `.is("deleted_at", null)` を追加。0 件になると `.single()` がエラーになり、既存の「見つかりません」表示にそのまま乗る（CMP-18 / ACC-14）。**同日追加対応**: `updateCompany` / `updateAccount` 内の owner チェック用の存在確認クエリにも `.is("deleted_at", null)` を追加（`src/actions/companies.ts` の `updateCompany`、`src/actions/accounts.ts` の `updateAccount`）。削除済みレコードへの Server Action 直接呼び出しも既存の「見つかりません」文言で拒否される。
5. **createAccount に楽観ロック外の重複ガードがない**: 同一 company_id・同一名の取引先を手動で複数作成できる。Account は契約トリガーで自動作成される設計のため、手動経路との二重作成（契約登録前に手で作ってしまい、契約時にもう 1 つできる）を運用でどう防ぐかは仕様として未定義に見える（ACC-15 の結果に依存。トリガー側に既存 Account 再利用のロジックがあるかは contracts 領域で要確認）。
6. ~~financial_info の更新に楽観ロックがない~~ **2026-08-03 対応済み**: `financial_info` に `updated_at` 列とトリガー（`trg_financial_info_updated_at`）が既にあるため、`updateCompany` と同じパターンで `updateFinancialInfo` に `expected_updated_at` を追加（`src/actions/financial-info.ts`、`src/lib/validators/financial-info.ts`）。0 行更新時は `conflictErrorMessage("この金融機関情報")` を返す。未指定なら従来どおりロックなし（後方互換）。**画面側も同日中に対応済み**: `FinancialInfoRow` と `SELECT_COLUMNS` に `updated_at` を追加し、`FinancialInfoEditor.tsx` の編集保存と「主口座にする」の両方が `expected_updated_at` を送るようにした。競合時は `conflictErrorMessage` がエラートースト（手動クローズのみ）で表示される。
7. **verifyCompaniesBatch は manager 以上で実行可能だが、UI は admin 配下のみ**: `/admin` の「実在確認」タブにしか入口がなく、manager は Action を直接呼ばない限り使えない。権限設計（manager 以上）と画面配置（admin のみ）の意図の確認を推奨。
8. **削除済み事業者のドメイン・住所・口座**: deleteCompany は本体の論理削除のみで、company_domains は残る。削除済み法人のドメインが名刺取込の判定（ドメイン名寄せ）に使われ続ける可能性がある。運用上問題ないかの確認を推奨。
