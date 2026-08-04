# システムテスト仕様: リード・キャンペーン・アクティビティ

最終更新: 2026-08-04

## 1. 対象範囲

| 領域 | 画面 / API | Server Action / lib |
|---|---|---|
| リード | `/leads`（一覧）、`/leads/new`、`/leads/[id]`（詳細）、`/leads/[id]/edit` | `src/actions/leads.ts`（CRUD・昇格・進捗集計）、`src/lib/leads/promote-helpers.ts`、`src/lib/leads/recalculate-score.ts` |
| 進捗 | `/progress/inbound`（mql）、`/progress/outbound`（tql）、`/progress/inquiry`（inquiry） | `getLeadProgressSummary` / `getLeadKanbanCards`（RPC `lead_progress_summary` / `lead_kanban_cards`）、`src/components/leads/LeadProgressWorkspace.tsx` |
| 社内対応 | `/leads/[id]` 内タブ | `src/actions/lead-activities.ts` |
| 顧客行動 | `/leads/[id]` 内タブ | `src/actions/leads.ts`（`createLeadCustomerActivity` ほか） |
| アクティビティ | `/activities`、`/dashboard`（最近のアクティビティ） | `src/actions/activity-feed.ts`（`activity_feed` ビュー・security_invoker） |
| キャンペーン | `/campaigns`、`/campaigns/new`、`/campaigns/[id]`、`/campaigns/[id]/edit` | `src/actions/campaigns.ts` |
| Eight 取込 | `/admin/leads/import`（admin 限定） | `src/actions/leads/eight-import.ts`、`src/lib/leads/eight-import.ts` / `import-helpers.ts`、DB 関数 `import_eight_leads` |
| 問い合わせ同期 | `POST /api/leads/inquiry-sync`（cron 用・画面なし） | `src/lib/leads/inquiry-import.ts`、DB 関数 `import_inquiry_leads` |

**テスト環境:** http://localhost:2000 ／ admin@iterra.jp・manager@iterra.jp・member@iterra.jp（いずれも password123）
**前提データ:** seed によりリード 3,008 件投入済み。マスタ（lead_stages / lead_statuses / lead_categories / lead_temperatures / lead_score_rules / lead_score_thresholds ほか）は `01-masters.sql` 投入済み。

### 実装から確認した仕様の要点（ケースの根拠）

- **スコアは手入力不可。** `recalculate_lead_score`（DB 関数）が `lead_score_rules` を全件評価して加点合算 → 0-100 にクリップ → `lead_score_thresholds` で `temperature_id` を連動更新 → `lead_score_breakdowns` を全置換する。
- **即時再計算されるのは**: リード作成（`createLead`）・リード更新（`updateLead`）・顧客行動の作成/更新/削除（`createLeadCustomerActivity` / `updateLeadCustomerActivity` / `deleteLeadCustomerActivity`）・Eight 取込 commit（`recalculate_lead_scores_for_batch`。**そのバッチのリードのみ**。全件だと 3,008 件で約 3.9 秒かかり、リードが増えるほど取込が遅くなるため 2026-08-03 に変更）。
- **社内対応（lead_activities）の CRUD ではスコアを即時再計算しない**（`src/actions/lead-activities.ts` に再計算呼び出しなし）。call_status / activity_type 条件のルールは週次 pg_cron の全件再計算、または次回のリード更新・顧客行動操作で反映される（仕様として確認済み。LD-13 参照）。
- **Deal 昇格は `updateLead` 内で自動発火**: 変更後ステージの `auto_promote_to_deal = true` かつ `promoted_deal_id` 未設定のとき `promoteLeadToDeal` を呼ぶ。書き込みは DB 関数 `promote_lead_to_deal`（単一トランザクション・lead 行 FOR UPDATE で二重昇格防止）。
- **昇格時の作成物**: 法人（account_type slug = corporate / government、または slug 未設定かつ company_name あり）→ Company + Contact(corporate_rep) + Account(見込み) + Deal。個人 → Contact(individual) + Account + Deal。`leads.url` は法人なら companies.website_url、個人なら contacts.website_url へ転記。Lead 段階では既存 Company/Contact への紐付けはしない（常に新規作成。名寄せは取込経路のみ）。
- **corporate_number**: リード作成・編集時は重複しても**警告のみ**（保存は成功、warnings 配列で返る）。昇格時は**ブロック**（`[corporate_number]` プレフィックス付きエラー）。
- **ページネーションは 30 件**（`DEFAULT_PAGE_SIZE = 30`。`src/lib/constants/pagination.ts`）。戻り値は `{ rows, total }` 規約。
- **バッジ色はマスタの `color` カラム**を SELECT してそのまま使う（stage / status / category / temperature）。
- **エラートーストは約 10 秒で自動消滅**（success / info は約 4 秒）。閉じるボタンでも消せる。

自動化区分: `自動(Playwright)` = ブラウザ E2E ／ `自動(API)` = Server Action・Route Handler 直叩き＋SQL 検証 ／ `手動` = 目視確認が必要。

---

## 2. テストケース

### LD-01: リード一覧の表示・総件数・30 件ページネーション

- 対象: `/leads`、`getLeads`
- 権限: admin
- 事前条件: seed リード 3,008 件投入済み
- 手順:
  1. admin@iterra.jp でログインし `/leads` を開く
  2. 件数表示とテーブル行数を確認する
  3. ページネーションで 2 ページ目へ移動する
- 期待結果:
  - 総件数に 3,008（+テストで増やした分）が表示される
  - 1 ページの表示は最大 30 行（`DEFAULT_PAGE_SIZE = 30`）
  - 2 ページ目は 31 件目以降が created_at 降順で表示される
  - 各行のステージ / ステータス / カテゴリ / 温度感バッジの色が対応マスタの `color` 値（`#RRGGBB`）と一致する
- 自動化区分: 自動(Playwright)

### LD-02: 一覧フィルタとステージ→ステータスの連動

- 対象: `/leads`、`leadFiltersSchema`
- 権限: admin
- 事前条件: LD-01 と同じ
- 手順:
  1. ステージフィルタで「獲得」を選ぶ
  2. ステータスフィルタの選択肢を確認する
  3. キーワードに「株式会社」を入力する
  4. 担当者・カテゴリ・温度感でも順に絞り込む
  5. 「クリア」を押す
- 期待結果:
  - ステージ選択後、ステータスの選択肢が当該ステージ所属のもの（`stage_id` 一致）だけに絞られる
  - キーワードは lead_name / company_name / company_phone / contact_phone / contact_email の部分一致（ilike）で絞られる
  - フィルタ変更のたびに 1 ページ目へ戻る
  - クリアで全条件が外れ全件表示に戻る
- 自動化区分: 自動(Playwright)

### LD-03: リード新規作成（正常系）とスコア自動算出

- 対象: `/leads/new`、`createLead`、`recalculate_lead_score`
- 権限: admin
- 事前条件: lead_score_rules に lead_source / stage 等の加点ルールが存在する（seed 投入済み）
- 手順:
  1. `/leads/new` で lead_name「テスト商事」、取引先種別「法人」、ステージ「獲得」、当該ステージのステータス、リードソース、担当者 admin を入力
  2. 保存する
  3. 作成されたリード詳細でスコアと温度感を確認する
  4. SQL: `SELECT score, temperature_id FROM leads WHERE lead_name = 'テスト商事'` と `lead_score_breakdowns` の行を確認
- 期待結果:
  - トースト「リードを作成しました」（success・約 4 秒で自動消滅）→ 詳細ページへ遷移
  - score はフォームに入力欄が存在せず、マッチしたルールの score_delta 合算（0-100 クリップ）が自動設定される
  - temperature_id は lead_score_thresholds の min_score / max_score 範囲に対応する値
  - lead_score_breakdowns にマッチしたルール分の行が作成される
  - created_by / last_updated_by = 操作ユーザー
- 自動化区分: 自動(Playwright)（DB 検証は SQL 併用）

### LD-04: リード作成のバリデーション異常系（Zod）

- 対象: `createLead`、`leadCreateSchema`
- 権限: admin
- 事前条件: なし
- 手順: 以下を個別に送信する（UI で入力可能なものは UI、それ以外は Server Action 直叩き）
  1. lead_name 空
  2. lead_name 101 文字
  3. url に「abc」（URL 形式でない）
  4. employee_count に -1、小数 1.5
  5. capital に -1
  6. corporate_number に「123」（13 桁でない）
  7. contact_email に「a@」等の不正形式
  8. contact_last_name 51 文字 / company_name 101 文字 / company_name_kana 201 文字
- 期待結果: それぞれ次のメッセージで保存が拒否される（フィールドエラーはインライン表示。トーストにしない）
  1. `[lead_name] リード名は必須です`
  2. `[lead_name] リード名は100文字以内で入力してください`
  3. `[url] URL形式で入力してください`
  4. `[employee_count] 従業員数は0以上で入力してください` / `[employee_count] 従業員数は整数で入力してください`
  5. `[capital] 資本金は0以上で入力してください`
  6. `[corporate_number] 法人番号は13桁の数字で入力してください`
  7. `[email] メール形式で入力してください`
  8. 各 max 長メッセージ（50 / 100 / 200 文字以内）
- 自動化区分: 自動(API)

### LD-05: ステージ↔ステータスの親子整合性チェック

- 対象: `createLead` / `updateLead` のステージ整合性分岐
- 権限: admin
- 事前条件: 「獲得」「育成」など複数ステージとそれぞれのステータスが存在。Opportunity ステージ（`auto_promote_to_deal = true`）にはステータス定義がない
- 手順:
  1. 通常ステージを選び status_id を null のまま送信（Server Action 直叩き）
  2. 通常ステージ A を選び、別ステージ B 所属の status_id を送信
  3. 存在しない UUID を status_id に送信
  4. UI でステージを切り替えたとき、ステータス選択がリセットされることを確認
  5. 通常ステージでステータス未選択のとき保存ボタンが disabled になることを確認（編集画面）
- 期待結果:
  1. `[status_id] ステータスは必須です。受信値: null`
  2. `[status_id] 指定したステータスは選択されたステージに属しません。受信値: stage_id=..., status_id=...`
  3. `[status_id] ステータスが見つかりません。受信値: ...`
  4. ステージ変更で status_id が空にリセットされる
  5. 保存ボタンが押せない（サーバーエラーの先制制御）
- 自動化区分: 自動(API)（4・5 は Playwright）

### LD-06: member は自分以外を担当者にできない（作成時）

- 対象: `createLead` のオーナーチェック
- 権限: member
- 事前条件: member でログイン
- 手順:
  1. Server Action 直叩きで owner_user_id に admin の ID を指定して createLead を実行
  2. UI 上でも担当者選択の挙動を確認する
- 期待結果:
  - `[owner_user_id] member は自分以外を担当者に設定できません。受信値: <admin の UUID>` で拒否される
  - manager / admin は任意の担当者を指定して作成できる
- 自動化区分: 自動(API)

### LD-07: corporate_number 重複は作成・編集では警告のみ

- 対象: `createLead` / `updateLead` の `checkCorporateNumberDuplicate`
- 権限: admin
- 事前条件: companies に corporate_number = `1234567890123` の企業「既存商事」が存在する
- 手順:
  1. `/leads/new` で corporate_number に `1234567890123` を入力し保存する
  2. 既存リードの編集でも同じ番号を入力して保存する
- 期待結果:
  - 保存は**成功**する（ブロックしない）
  - 警告「この法人番号 (1234567890123) の企業は既に登録されています (既存商事)。昇格時は既存企業との重複エラーになります。」がインライン表示される
  - 編集画面では警告表示のためページ遷移せず、その場に留まる
- 自動化区分: 自動(Playwright)

### LD-08: リード編集・保存（楽観ロック値の往復）

- 対象: `/leads/[id]/edit`、`updateLead`
- 権限: admin
- 事前条件: 任意のリードが存在
- 手順:
  1. 編集画面でリード名・カテゴリ・セグメントを変更して保存する
  2. SQL で last_updated_by / updated_at の更新を確認する
- 期待結果:
  - トースト「保存しました」→ 詳細ページ `/leads/[id]` へ戻る
  - `expected_updated_at`（編集開始時点の updated_at）が送信され、WHERE 条件に含まれて更新される
  - 変更履歴は entity_change_logs のトリガーが自動記録する（アプリからの INSERT はない）
- 自動化区分: 自動(Playwright)

### LD-09: 楽観ロック競合（後勝ち防止）

- 対象: `updateLead` の 0 行更新分岐
- 権限: admin ×2 セッション
- 事前条件: 同一リードを 2 つのブラウザ（または 2 ユーザー）で編集画面に開く
- 手順:
  1. セッション A で保存する（成功）
  2. セッション B で（古い expected_updated_at のまま）保存する
- 期待結果:
  - B の保存が拒否され、エラートースト「このリードは他のユーザーによって更新されています。画面を再読み込みしてから保存してください」が表示される
  - **エラートーストは約 10 秒で自動消滅する**（閉じるボタンでも消せる）
  - B の変更内容は DB に反映されない（A の値が残る）
- 自動化区分: 自動(Playwright)

### LD-10: member の編集権限（主担当・副担当のみ）

- 対象: `updateLead` のオーナーチェック
- 権限: member
- 事前条件: (a) member が主担当のリード、(b) member が副担当（lead_owners）のリード、(c) どちらでもないリード
- 手順: member で (a)(b)(c) それぞれを編集・保存する
- 期待結果:
  - (a)(b) は保存成功
  - (c) は「このリードを編集する権限がありません」で拒否される
  - 一覧・詳細も RLS により (c) はそもそも表示されない（表示される場合は担当分のみ）
- 自動化区分: 自動(API)

### LD-11: 副担当（lead_owners）の設定と主担当重複の除外

- 対象: `createLead` / `updateLead` の sub_owner_user_ids 処理、`/leads/[id]` の担当者編集
- 権限: admin
- 事前条件: crm_users に admin / manager / member が存在
- 手順:
  1. リード作成時に主担当 = admin、副担当 = [manager, admin]（主担当を重複指定）で保存
  2. SQL: `SELECT user_id FROM lead_owners WHERE lead_id = ...`
  3. 詳細画面から副担当を [member] に変更して保存
  4. 副担当を空にして保存
- 期待結果:
  1. lead_owners には manager のみ登録される（主担当と同一の ID は除外）
  3. 全削除 → 再 INSERT で member のみになる
  4. lead_owners が 0 行になる
  - 副担当変更も updateLead 経由のため楽観ロック・権限チェックが効く
- 自動化区分: 自動(API)

### LD-12: スコアの即時再計算トリガー（リード更新・顧客行動）

- 対象: `updateLead` / `createLeadCustomerActivity` / `deleteLeadCustomerActivity` 後の `recalculateLeadScore`
- 権限: admin
- 事前条件: customer_activity_type 条件の加点ルール（例: 資料 DL +10）と lead_source 条件のルールが存在
- 手順:
  1. リードのリードソースを加点対象の値に変更して保存 → score を確認
  2. 同リードに加点対象の顧客行動を 1 件追加 → score を確認
  3. その顧客行動を削除（admin） → score を確認
- 期待結果:
  1. 保存直後（ページ再読込後）に score がルール分増える。temperature_id も閾値に応じて変わり、温度感バッジが更新される
  2. 顧客行動の追加直後に score が +10 される（lead_score_breakdowns に行が増える）
  3. 削除直後に score が -10 に戻る（breakdowns からも消える）
- 自動化区分: 自動(API)（SQL 検証）

### LD-13: 社内対応はスコアを即時再計算しない（週次反映の仕様確認）

- 対象: `createLeadActivity`（`src/actions/lead-activities.ts`）と `recalculate_lead_score` の call_status / activity_type ルール
- 権限: admin
- 事前条件: call_status 条件の加点ルール（例: 通電 +15）が存在
- 手順:
  1. リードに call_status = 加点対象の社内対応を追加する
  2. 直後に `SELECT score FROM leads WHERE id = ...` を確認する
  3. `SELECT recalculate_lead_score('<lead_id>')` を手動実行（週次 pg_cron 相当）して score を確認する
- 期待結果:
  1. 追加は成功する（トースト「社内対応を追加しました」）
  2. **score は変わらない**（社内対応 CRUD は再計算を呼ばない実装）
  3. 手動再計算後に +15 が反映される
  - ※仕様上の留意点。即時反映が要件になった場合は実装変更が必要（本書 §3 懸念 1）
- 自動化区分: 自動(API)

### LD-14: スコアの 0-100 クリップと内訳表示

- 対象: `recalculate_lead_score` のクリップ、`/leads/[id]` のスコア内訳
- 権限: admin
- 事前条件: 合計が 100 を超えるよう加点ルールを一時的に積んだリード（admin がマスタでルール追加可能）
- 手順:
  1. 加点合計が 120 になる条件を満たすリードを作り再計算する
  2. 詳細画面のスコアと内訳（score_breakdowns）を確認する
- 期待結果:
  - leads.score = 100（100 でクリップ。負値なら 0）
  - 内訳には各ルールの score_delta が全件表示され、合計（クリップ前）と表示スコアの差が確認できる
  - temperature は最上位の閾値（例: ホット）になる
- 自動化区分: 自動(API)

### LD-15: Deal 昇格（法人）— Company / Contact / Account / Deal の新規作成

- 対象: `/leads/[id]/edit` のステージ変更 → `updateLead` → `promoteLeadToDeal` → DB 関数 `promote_lead_to_deal`
- 権限: admin
- 事前条件: 取引先種別「法人」・company_name「昇格テスト株式会社」・担当者情報（contact_last_name 等）・corporate_number 未重複・url 入力済みの未昇格リード。pipeline_types に slug=sales が存在
- 手順:
  1. 編集画面でステージを Opportunity（auto_promote_to_deal = true）に変更して保存する
  2. 昇格確認ダイアログで確定する
  3. SQL で companies / contacts / accounts / deals / leads の各行を確認する
- 期待結果:
  - トースト「商談に昇格しました。事業者情報と連絡先も作成されました」
  - companies に**新規**行（name = 昇格テスト株式会社、name_kana / representative_name / corporate_number / phone = company_phone、website_url = leads.url を転記）— 既存 Company への紐付けはしない
  - contacts に新規行（contact_type = corporate_rep、姓名 = contact_last_name / first_name、website_url = null）
  - accounts に新規行（account_status = 見込み、name = company_name）※契約前でも昇格経路では Account が作られる
  - deals に新規行（name = 「<lead_name> 案件」、sales パイプラインの先頭ステージ・先頭ステータス、owner = リード担当者）
  - leads.promoted_deal_id / promoted_company_id / promoted_contact_id / promoted_account_id が設定され、status_id は null（Opportunity にステータスなし）
- 自動化区分: 自動(Playwright)（DB 検証は SQL 併用）

### LD-16: Deal 昇格（個人）— Contact(individual) と URL 転記先の分岐

- 対象: 同上（個人分岐）
- 権限: admin
- 事前条件: 取引先種別「個人事業主」等（slug が corporate / government 以外）、company_name なし、url 入力済み、contact_phone 空・company_phone 入力済みの未昇格リード
- 手順: LD-15 と同様に Opportunity へ変更して保存する
- 期待結果:
  - トースト「商談に昇格しました。連絡先も作成されました」（事業者情報の文言なし）
  - companies は**作成されない**
  - contacts に新規行（contact_type = individual、website_url = leads.url、電話 = company_phone のフォールバック）
  - contact_last_name 未入力の場合、lead_name をスペース分割して姓・名にフォールバックする
  - accounts.name = lead_name、deals は LD-15 と同様
- 自動化区分: 自動(API)

### LD-17: 昇格時の corporate_number 重複ブロック

- 対象: `promoteLeadToDeal` の重複チェック
- 権限: admin
- 事前条件: companies に corporate_number = `9999999999999` の企業「重複商事」が存在。同番号を持つ法人リード（未昇格）
- 手順:
  1. 編集画面でステージを Opportunity に変更し、昇格確認ダイアログで確定する
  2. `SELECT stage_id, status_id, promoted_deal_id FROM leads WHERE id = ...` で状態を確認する
  3. corporate_number を別番号に修正して再度保存する（ステージは Opportunity のまま）
- 期待結果:
  1. 昇格が**ブロック**され、確認ダイアログ内にインラインでエラー「[corporate_number] 法人番号 9999999999999 の企業「重複商事」が既に登録されています。別企業なら法人番号を修正してください。同一企業への昇格はできません。受信値: 9999999999999 ステージは元に戻しましたので、内容をご確認のうえ再度保存してください」が表示される
  2. companies / contacts / accounts / deals に新規行が作られない（DB 関数トランザクションのため中間データも残らない）。`updateLead` が昇格失敗を検知すると `stage_id` / `status_id` を編集前の値へ戻す UPDATE を追加発行するため、リードは Opportunity に**留まらず**元のステージ・ステータスに戻り、`promoted_deal_id` は NULL のまま（不変条件「auto_promote_to_deal なステージのリードは promoted_deal_id を持つ」を維持。旧仕様の不整合は §3 懸念 2 参照＝解消済み）
  3. corporate_number 修正後の再保存では、ステージが既に Opportunity から戻っているため再度「Opportunity へ変更」する遷移として扱われ、`promoteLeadToDeal` が再試行されて成功する（万一ステージ変更を伴わない保存でも、現在のステージが auto_promote_to_deal かつ promoted_deal_id が NULL であれば再試行される）
- 自動化区分: 自動(Playwright)

### LD-18: 二重昇格の防止

- 対象: `updateLead` の promoted_deal_id チェック、DB 関数の FOR UPDATE ロック
- 権限: admin
- 事前条件: LD-15 で昇格済みのリード
- 手順:
  1. 昇格済みリードを再度編集し、別ステージ → Opportunity に戻して保存する
  2. Server Action 直叩きで `promoteLeadToDeal(leadId)` を呼ぶ
- 期待結果:
  1. 保存は成功するが商談は**再生成されない**（deals の件数不変。promoted_deal_id 既存のためスキップ）
  2. 「このリードはすでに商談に昇格済みです」が返る
- 自動化区分: 自動(API)

### LD-19: 昇格の必須情報・ステージ条件エラー

- 対象: `promoteLeadToDeal` の前提チェック
- 権限: admin / member
- 事前条件: (a) account_type_id 未設定の未昇格リード、(b) 通常ステージのリード、(c) member が担当者でないリード
- 手順: それぞれ Server Action 直叩きで promoteLeadToDeal を実行する
- 期待結果:
  - (a) `[ステージ遷移] Opportunity 昇格には lead_name と account_type_id が必要です`（UI では編集画面が法人名入力時に種別を自動補完するため API で検証）
  - (b) `現在のステージは商談昇格対象ではありません`
  - (c) member 実行時 `このリードを昇格させる権限がありません`
- 自動化区分: 自動(API)

### LD-23: ステージが要求する実体を欠く遷移は保存できない（2026-08-04 追加）

- 対象: `updateLead` + DB トリガー `trg_lead_stage_requirements`（`docs/database-design.md` §24）
- 権限: admin
- 事前条件: 商談を持たないリード（`promoted_deal_id IS NULL`）を用意する
- 手順:
  1. 獲得のリードを「取引先」へ直接変更して保存する
  2. 商談が自動生成されたリード（Sales / Opportunity）を「取引先」へ変更して保存する
  3. その商談に契約を 1 件作ってから、再度「取引先」へ変更して保存する
  4. Server Action を直叩きして 1 と同じ操作を行う
- 期待結果:
  1. `「取引先」へ進めるには商談が必要です。…` がトーストに出て、ステージは変わらない
  2. `「取引先」へ進めるには契約が必要です。…`
  3. 保存できる。ステージが「取引先」になる
  4. UI を介さなくても同じ文言で拒否される（**画面の出し分けに依存しない**）
- 自動化区分: 自動(Playwright + API)

### LD-24: Sales へ進めると商談が自動生成され、ステータスが消えない（2026-08-04 追加）

- 対象: `updateLead` の昇格順序 / `stageHasStatuses` 判定
- 権限: admin
- 手順:
  1. 育成のリードを「Sales」＋ステータス「商談化」に変更して保存する
  2. 保存後の詳細画面と `/deals` を確認する
  3. 続けて「Opportunity」へ変更して保存する
- 期待結果:
  1. 保存できる。**商談が自動生成される**（Sales も `auto_promote_to_deal`）
  2. ステータスが「商談化」のまま残る（**旧実装は `auto_promote_to_deal` で status を NULL にしていた**）。
     商談一覧に新しい商談が出る
  3. Opportunity はステータス定義が無いので `status_id` が NULL になる。
     **商談は二重に作られない**（`promoted_deal_id` があるため再昇格しない）
- 自動化区分: 自動(Playwright)

### LD-25: 昇格に失敗してもステージは動かない（2026-08-04 追加）

- 対象: `updateLead` の「商談を先に作る」順序
- 権限: admin
- 事前条件: 法人番号が既存企業と重複するリード（昇格が必ず失敗する状態）
- 手順:
  1. そのリードを「Sales」へ変更して保存する
  2. 保存後にリードのステージを確認する
- 期待結果:
  - `商談昇格に失敗しました: [corporate_number] …` が返る
  - **ステージは元のまま**（旧実装は先にステージを変えてから補償処理で戻していた。
    戻す処理自体が失敗すると Opportunity のまま商談なしで残る穴があった）
  - 商談は作られていない
- 自動化区分: 自動(API)

### LD-26: 商談が要るステージは新規作成では選べない（2026-08-04 追加）

- 対象: `/leads/new`（選択肢の絞り込み）+ `createLead`
- 権限: admin
- 手順:
  1. `/leads/new` のステージ選択肢を確認する
  2. Server Action を直叩きし、`stage_id` に Sales を指定して作成する
- 期待結果:
  1. 選択肢は 獲得 / 育成 / 選定 / Dead のみ。**Sales / Opportunity / 取引先 は出ない**
  2. `[stage_id] 「Sales」は商談が必要なステージのため、新規作成では選べません。…`
- 自動化区分: 自動(Playwright + API)

### LD-27: 参照されている商談・契約は削除できない（2026-08-04 追加）

- 対象: `check_deal_deletion_against_leads` / `check_contract_deletion_against_leads`
- 権限: admin
- 手順:
  1. 「取引先」ステージのリードが参照する契約を削除する
  2. 同じリードが参照する商談を削除する
  3. リードのステージを「育成」へ下げてから、1・2 をやり直す
- 期待結果:
  1. `この契約はリード「…」が参照している唯一の契約です。先にリードのステージを下げてから削除してください`
  2. `この商談はリード「…」が参照しています。…`
  3. どちらも削除できる
- 自動化区分: 自動(API)

### LD-20: リード削除（論理削除）と admin 復元

- 対象: `/leads/[id]/edit` 内の削除モーダル、`deleteLead` / `restoreLead`
- 権限: member（自分担当）/ member（他人担当）/ admin
- 事前条件: member 担当のリードと他ユーザー担当のリード
- 手順:
  1. 編集画面の削除ボタン → 確認ダイアログ「リードを削除しますか？」→「削除する」
  2. member で他人担当リードの deleteLead を直叩き
  3. admin で `/admin/deleted` から復元する
  4. member で restoreLead を直叩き
- 期待結果:
  1. トースト「リードを削除しました」→ `/leads` へ遷移。DB は deleted_at / deleted_by が設定される物理削除なしの論理削除。一覧に出なくなる
  2. `このリードを削除する権限がありません`（owner または manager/admin のみ）
  3. deleted_at / deleted_by / deletion_reason が null に戻り一覧へ再表示
  4. `管理者権限が必要です`
- 自動化区分: 自動(Playwright)（2・4 は API）

### LD-21: UUID 不正 URL・存在しない ID の詳細ページ

- 対象: `/leads/[id]`、`getLeadById`
- 権限: admin
- 事前条件: なし
- 手順:
  1. `/leads/abc` を直接開く
  2. `/leads/00000000-0000-0000-0000-000000000000`（存在しない UUID）を開く
  3. 論理削除済みリードの ID で開く
- 期待結果:
  1. 「不正なパラメータです」と「リード一覧へ戻る」リンク（アイコン付き）が表示される。500 エラーにならない
  2. 「リードが見つかりません」+ 一覧へ戻るリンク
  3. 削除済み（deleted_at IS NOT NULL）も「リードが見つかりません」
- 自動化区分: 自動(Playwright)

### LD-22: 進捗画面（inbound / outbound / inquiry）の集計が元データと一致する

- 対象: `/progress/inbound`（カテゴリ mql）、`/progress/outbound`（tql）、`/progress/inquiry`（inquiry）、RPC `lead_progress_summary` / `lead_kanban_cards`
- 権限: admin と member の両方
- 事前条件: seed リードにカテゴリが振られている（`resolve_lead_category` トリガー）
- 手順:
  1. admin で `/progress/inbound` を開き、ヘッダの合計件数を控える
  2. SQL: `SELECT COUNT(*) FROM leads l JOIN lead_categories c ON c.id = l.category_id WHERE c.code = 'mql' AND l.deleted_at IS NULL` と突き合わせる
  3. カンバン → 一覧 → 集計の 3 表示を切り替え、集計ビューのステージ×ステータス件数合計がヘッダ合計と一致することを確認
  4. 一覧ビューで `/leads` をカテゴリ mql で絞った件数と一致することを確認
  5. outbound（tql）・inquiry でも同様に確認
  6. member でも開き、件数が自分の担当分のみ（RLS）で `/leads` の絞り込み結果と揃うことを確認
- 期待結果:
  - 画面の合計件数 = SQL の件数 = `/leads` フィルタ結果の total
  - カンバンは 1 ステージ 20 件まで表示し、超過分は件数表示で補完される（全件は一覧で見る）
  - 一覧ビューは 30 件ページネーション、行クリックで `/leads/[id]` へ遷移
  - ステージバッジ・ステータスバッジの色はマスタ `color` と一致
  - member は担当外リードが数にも表にも含まれない
- 自動化区分: 自動(Playwright)（SQL 併用）

---

### ACT-01: 社内対応の記録と call_number 自動採番

- 対象: `/leads/[id]` 社内対応タブ、`createLeadActivity`
- 権限: admin
- 事前条件: 社内対応 0 件のリード
- 手順:
  1. 対応日（既定 = 当日）・対応ステータス・対応者を選び「追加」
  2. 続けてもう 1 件追加する
  3. SQL: `SELECT call_number FROM lead_activities WHERE lead_id = ... ORDER BY call_number`
- 期待結果:
  - トースト「社内対応を追加しました」、一覧の先頭に新しい記録が挿入される
  - call_number は 1, 2 と max+1 で自動採番される（フォームに入力欄なし）
  - フォームが初期状態（対応日 = 当日）にリセットされる
- 自動化区分: 自動(Playwright)

### ACT-02: 社内対応の必須・形式バリデーション

- 対象: `createLeadActivity`、`leadActivityCreateSchema`
- 権限: admin
- 事前条件: なし
- 手順:
  1. 対応ステータス・対応者を未選択で「追加」
  2. Server Action 直叩きで called_on = `2026/08/03`（スラッシュ形式）、called_at_time = `9:00`（1 桁時）、note 1001 文字を送る
- 期待結果:
  1. インラインエラー「対応ステータスと対応者は必須です」（トーストにしない）
  2. `[called_on] 架電日は YYYY-MM-DD 形式で入力してください` / `[called_at_time] 架電時刻は HH:MM または HH:MM:SS 形式で入力してください` / `[note] メモは1000文字以内で入力してください`
- 自動化区分: 自動(API)（1 は Playwright）

### ACT-03: member は他人担当リードに社内対応を追加できない

- 対象: `createLeadActivity` のオーナーチェック
- 権限: member
- 事前条件: admin 担当のリード
- 手順: member で当該リードに createLeadActivity を直叩きする
- 期待結果: 「このリードへの架電記録を追加する権限がありません」で拒否される（RLS でも二重に遮断）
- 自動化区分: 自動(API)

### ACT-04: 社内対応の編集は本人と manager/admin のみ・監査証跡

- 対象: `updateLeadActivity`
- 権限: member（記録者本人）/ member（別人）/ manager / admin
- 事前条件: member A が caller の社内対応 1 件（caller_user_id = A）
- 手順:
  1. A 本人が note を編集して保存
  2. manager が同記録を編集
  3. 別の member B が編集を試みる（直叩き）
  4. SQL: `SELECT last_edited_at, last_edited_by_user_id FROM lead_activities WHERE id = ...`
- 期待結果:
  1. 成功。トースト「社内対応を更新しました」
  2. 成功（manager/admin は他人の記録も編集可）
  3. 「このアクティビティを編集する権限がありません」で拒否
  4. 編集のたびに last_edited_at = 現在時刻、last_edited_by_user_id = 編集者 ID が設定される（監査証跡）。lead_id / call_number は変更不可（スキーマに含まれない）
- 自動化区分: 自動(API)

### ACT-04b: 社内対応の楽観ロック競合（後勝ち防止）

- 対象: `/leads/[id]` 社内対応タブの編集モーダル（`LeadActivityEditModal`）、`updateLeadActivity`
- 権限: manager ×2 セッション
- 事前条件: 同一の社内対応記録を 2 つのブラウザ（または 2 ユーザー）で編集モーダルに開く
  （モーダルを開いた時点の一覧行が保持する `updated_at` を `expected_updated_at` として送信する実装。
  `src/app/(app)/leads/[id]/lead-detail-client.tsx` の `LeadActivityEditModal`）
- 手順:
  1. セッション A で note を編集して保存する（成功）
  2. セッション B で（古い `expected_updated_at` のまま）note を編集して保存する
- 期待結果:
  - B の保存が拒否され、エラートースト「この架電記録は他のユーザーによって更新されています。画面を再読み込みしてから保存してください」が表示される
  - **エラートーストは約 10 秒で自動消滅する**（閉じるボタンでも消せる）
  - B の変更内容は DB に反映されない（A の値が残る）
- 自動化区分: 自動(Playwright)

### ACT-05: 社内対応の削除は admin のみ

- 対象: `deleteLeadActivity`、詳細画面の admin 専用削除 UI
- 権限: admin / manager / member
- 事前条件: 社内対応が 1 件以上あるリード
- 手順:
  1. admin で削除実行
  2. manager / member で直叩き
  3. manager でログインし、削除 UI が表示されないことを確認
- 期待結果:
  1. トースト「社内対応を削除しました」、一覧から消える（物理削除。誤記録修正用）
  2. 「架電記録の削除は管理者権限が必要です」
  3. 削除ボタンが admin 以外に表示されない
- 自動化区分: 自動(Playwright)（2 は API)

### ACT-06: 顧客行動の追加・編集・削除

- 対象: `/leads/[id]` 顧客行動タブ（追加・削除の UI のみ）、
  `createLeadCustomerActivity` / `updateLeadCustomerActivity`（Server Action のみ。編集 UI は未実装） / `deleteLeadCustomerActivity`
- 権限: admin（削除）/ 認証済み全ロール（追加）
- 事前条件: lead_customer_activity_types マスタ（資料 DL / 問合せフォーム送信 等）が存在
- 手順:
  1. 行動タイプ・発生日時・詳細を入れて追加
  2. `updateLeadCustomerActivity` を直叩きで更新（画面に編集ボタンは無いため API 経由のみ。§3 懸念 4 参照）
  3. admin で削除、member で削除を直叩き
- 期待結果:
  1. トースト「顧客行動を追加しました」。occurred_at 降順で一覧に並ぶ。追加直後にスコアが再計算される（LD-12）
  2. 更新成功、last_updated_by = 操作ユーザー、スコア再計算。`expected_updated_at` を渡すと `updated_at` が WHERE 条件に含まれ、一致しなければ 0 行更新で「この顧客行動は他のユーザーによって更新されています。画面を再読み込みしてから保存してください」を返す（2026-08-03 に Server Action 側のみ対応。UI からは未送信）
  3. admin: トースト「顧客行動を削除しました」＋スコア再計算 ／ member: 「管理者権限が必要です」
- 自動化区分: 自動(API)（追加・削除は Playwright、更新は API のみ）

### ACT-07: 顧客行動のバリデーション異常系

- 対象: `leadCustomerActivityCreateSchema` / `UpdateSchema`
- 権限: admin
- 事前条件: なし
- 手順: Server Action 直叩きで以下を送る
  1. lead_id に非 UUID「abc」
  2. 存在しない lead_id（正しい UUID 形式）
  3. activity_type_id 欠落
  4. occurred_at = `2026-08-03`（datetime でない）
  5. detail 2001 文字 / source 201 文字
- 期待結果:
  1. `[lead_id] リードIDは必須です`（uuid 検証）または `[lead_id] 不正なパラメータです。受信値: abc`
  2. `[lead_id] リードが見つかりません。受信値: <UUID>`
  3. `[activity_type_id] 行動タイプは必須です`
  4. `[occurred_at] 日時形式で入力してください`
  5. `[detail] 詳細は2000文字以内で入力してください` / `[source] ソースは200文字以内で入力してください`
- 自動化区分: 自動(API)

### ACT-08: アクティビティ横断フィード（/activities）の表示とフィルタ

- 対象: `/activities`、`getActivityFeed`（activity_feed ビュー）
- 権限: admin と member
- 事前条件: 社内対応・顧客行動・メール（Gmail 連携があれば）の記録が混在する
- 手順:
  1. admin で `/activities` を開き総件数を確認
  2. 記録元フィルタで「社内対応」のみに絞る
  3. 期間（from / to）で当日のみに絞る
  4. キーワードにリード名の一部を入れる
  5. 担当者フィルタで member を選ぶ
  6. 31 件以上ある状態で 2 ページ目に移動する
  7. member でも開く
- 期待結果:
  - 記録は occurred_at 降順・30 件/ページで表示。総件数表示と行数が一致
  - 記録元の絞り込みは lead_activity / lead_customer_activity / email の 3 種。件数バッジ（`getActivityFeedCounts`）と一覧件数が一致する
  - 日付境界は JST（00:00:00+09:00〜23:59:59+09:00）で解釈される
  - キーワードは相手先名（entity_label）・内容（detail）の部分一致。`,` `(` `)` を含めても壊れない（空白に置換される）
  - member は自分の担当リード・連絡先の記録だけが見える（security_invoker ビュー経由の RLS）
  - 各行の記録元/種別バッジの色はマスタの color 値
- 自動化区分: 自動(Playwright)

### ACT-09: ダッシュボード「最近のアクティビティ」とフィードの整合

- 対象: `/dashboard` の最近のアクティビティ、`activity_feed` ビュー
- 権限: admin と member
- 事前条件: アクティビティが 6 件以上
- 手順:
  1. リードに社内対応を 1 件追加する
  2. `/dashboard` を開き最近のアクティビティを確認する
  3. `/activities` の先頭 5 件と見比べる
  4. member でも同様に確認する
- 期待結果:
  - ダッシュボードには occurred_at 降順の最新 5 件が表示され、`/activities` の先頭 5 件と同一（同じビューを読むため）
  - 追加した社内対応が両画面に現れる
  - member はダッシュボードでも自分の担当分しか出ない
- 自動化区分: 自動(Playwright)

---

### CPN-01: キャンペーン一覧・フィルタ・30 件ページネーション

- 対象: `/campaigns`、`getCampaigns`
- 権限: admin
- 事前条件: キャンペーンを 31 件以上作成（または SQL 投入）
- 手順:
  1. `/campaigns` を開く
  2. 種別（generation / nurturing / qualification）・ステータス（draft / active / paused / completed / cancelled）・キーワード（name 部分一致）で絞る
  3. 2 ページ目へ移動する
- 期待結果:
  - created_at 降順・30 件/ページ・総件数表示。論理削除済みは表示されない
  - フィルタが AND で効く
- 自動化区分: 自動(Playwright)

### CPN-02: キャンペーン作成は manager 以上

- 対象: `/campaigns/new`、`createCampaign`
- 権限: manager / member
- 事前条件: なし
- 手順:
  1. manager で name「夏季セミナー」、type = generation、期間、status = draft を入力し保存
  2. member で createCampaign を直叩き
- 期待結果:
  1. トースト「キャンペーンを作成しました」。created_by / last_updated_by = manager
  2. 「manager 以上の権限が必要です」で拒否
- 自動化区分: 自動(Playwright)（2 は API）

### CPN-03: キャンペーンのバリデーション異常系

- 対象: `campaignCreateSchema` / `campaignUpdateSchema`
- 権限: manager
- 事前条件: なし
- 手順: 以下を個別に送信する
  1. name 空 / 101 文字
  2. type = `invalid`
  3. status = `unknown`
  4. start_date = 2026-08-10、end_date = 2026-08-01
  5. description 1001 文字
- 期待結果:
  1. `[name] キャンペーン名は必須です` / `[name] キャンペーン名は100文字以内で入力してください`
  2. `[type] キャンペーン種別は generation / nurturing / qualification のいずれかを指定してください`
  3. `[status] ステータスは draft / active / paused / completed / cancelled のいずれかを指定してください`
  4. `[end_date] 終了日は開始日以降にしてください`
  5. `[description] 説明は1000文字以内で入力してください`
- 自動化区分: 自動(API)

### CPN-04: キャンペーン更新（manager 以上）・削除/復元（admin のみ）

- 対象: `/campaigns/[id]/edit`、`updateCampaign` / `deleteCampaign` / `restoreCampaign`
- 権限: manager / admin / member
- 事前条件: 既存キャンペーン 1 件
- 手順:
  1. manager が status を active に変更して保存
  2. member で updateCampaign 直叩き
  3. admin が編集画面のモーダルから削除
  4. manager で deleteCampaign 直叩き
  5. admin が復元
  6. SQL で updateCampaign 実行後の updated_at 更新を確認する
- 期待結果:
  1. トースト「保存しました」
  2. 「manager 以上の権限が必要です」
  3. トースト「キャンペーンを削除しました」。deleted_at 設定の論理削除で一覧から消える
  4. 「管理者権限が必要です」
  5. 一覧に再表示される
  6. `expected_updated_at`（編集開始時点の updated_at）が送信され、WHERE 条件に含まれて更新される（2026-08-03 に編集画面が対応。§3 懸念 4 は解消）
- 自動化区分: 自動(Playwright)（直叩き系は API）

### CPN-04b: キャンペーン更新の楽観ロック競合（後勝ち防止）

- 対象: `/campaigns/[id]/edit`、`updateCampaign` の 0 行更新分岐
- 権限: manager ×2 セッション
- 事前条件: 同一キャンペーンを 2 つのブラウザ（または 2 ユーザー）で編集画面に開く
- 手順:
  1. セッション A で保存する（成功）
  2. セッション B で（古い `expected_updated_at` のまま）保存する
- 期待結果:
  - B の保存が拒否され、エラートースト「このキャンペーンは他のユーザーによって更新されています。画面を再読み込みしてから保存してください」が表示される
  - **エラートーストは約 10 秒で自動消滅する**（閉じるボタンでも消せる）
  - B の変更内容は DB に反映されない（A の値が残る）
- 自動化区分: 自動(Playwright)

### CPN-05: リードの一括紐付け（manager 以上）

- 対象: `/campaigns/[id]` の紐付けモーダル、`attachLeadsToCampaign` / `getUnassignedLeadsForCampaign`
- 権限: manager / member
- 事前条件: キャンペーン 1 件、未紐付けリードが複数
- 手順:
  1. manager で詳細画面を開き、紐付けモーダルから未紐付けリストのリードを 3 件選んで追加
  2. モーダルの候補一覧に既紐付けリードが出ないことを確認
  3. member でログインし、詳細画面に紐付け UI が出ないことを確認
  4. member で attachLeadsToCampaign を直叩き
  5. leadIds = [] で直叩き
- 期待結果:
  1. トースト「リードを3件紐付けました」。lead_campaigns に 3 行、リード一覧に assigned_at 降順で表示。リード詳細のキャンペーン欄（参照のみ）にも出る
  2. 既紐付けは候補から除外される
  3. 紐付け・解除ボタンおよび操作列が非表示
  4. 「manager 以上の権限が必要です」
  5. `[leadIds] 1件以上のリードを指定してください`
- 自動化区分: 自動(Playwright)（4・5 は API）

### CPN-09: 未紐付けリード候補のページネーション・検索

- 対象: `/campaigns/[id]` の紐付けモーダル、`getUnassignedLeadsForCampaign`
- 権限: manager
- 事前条件: リード 3,008 件 seed 済み。ある 1 キャンペーンに 1,000 件超のリードを紐付け済みにしておく（大規模紐付け時の URL 長制限を再現する事前条件）
- 手順:
  1. manager で紐付けモーダルを開き、候補が 30 件（`DEFAULT_PAGE_SIZE`）単位でページ表示されることを確認する
  2. 検索欄にリード名・会社名の一部を入力し、候補が絞り込まれることを確認する（300ms デバウンス）
  3. 2 ページ目に移動してから 1 件選択し、1 ページ目に戻ってさらに選択、「選択したリードを紐付け」を押す
  4. SQL: `SELECT count(*) FROM lead_campaigns WHERE campaign_id = ...`（紐付け済み 1,000 件超）の状態で候補取得が失敗しないことを確認する
- 期待結果:
  - 候補一覧は `getUnassignedLeadsForCampaign(campaignId, { keyword, page, perPage })` を通じてサーバー側で検索・ページネーションされ、`{ rows, total }` を返す
  - 既紐付けリードは候補に出ない。除外は `.not("id","in",[ID一覧])` のような URL 展開ではなく、
    (a) 紐付き済み lead_id をアプリ側の Set として保持し、取得したリードのバッチから除外、
    (b) 総件数は「検索条件一致の全件数」から「検索条件一致かつ `lead_campaigns!inner` で紐付き済みの件数」を差し引いて算出、
    の 2 段構成で行われるため ID 一覧が URL に載らない
  - ページをまたいで選択した複数件をまとめて紐付けできる（選択状態は行オブジェクトの Map で保持）
  - 紐付け済みが 1,000 件を超えていても候補取得が失敗しない（内部で `lead_campaigns` を 200 件ずつページングして回収する）
- 自動化区分: 自動(API)（1,000 件超の紐付けは SQL 投入で用意し、Playwright は通常規模の検索・ページ送りのみ確認）

### CPN-06: リード紐付けの解除

- 対象: `detachLeadFromCampaign`
- 権限: manager
- 事前条件: CPN-05 で紐付け済み
- 手順: 詳細画面のリード行の解除操作を実行する
- 期待結果: トースト「リードの紐付けを解除しました」。lead_campaigns から該当行が消え、未紐付け候補に戻る
- 自動化区分: 自動(Playwright)

### CPN-07: 同一リードの重複紐付け

- 対象: `attachLeadToCampaign` / `attachLeadsToCampaign`（lead_campaigns の一意制約）
- 権限: manager
- 事前条件: 紐付け済みの lead / campaign の組
- 手順: 同じ組で attach を再実行する（API 直叩き）
- 期待結果: DB の一意制約違反エラーが返り、行は増えない。※エラーメッセージは PostgREST の生文言（duplicate key ...）がそのまま出る実装のため、文言の妥当性を記録する（§3 懸念 5）
- 自動化区分: 自動(API)

### CPN-08: キャンペーンの UUID 不正・存在しない ID

- 対象: `getCampaignById` / `deleteCampaign` ほか ID を受ける全 Action
- 権限: admin
- 事前条件: なし
- 手順:
  1. `/campaigns/abc` を開く
  2. 存在しない UUID の詳細を開く
  3. attachLeadToCampaign に leadId = `xyz` を渡す
- 期待結果:
  1. 「不正なパラメータです。受信値: abc」相当の表示（500 にならない）
  2. 「キャンペーンが見つかりません」+ 一覧へ戻る導線
  3. `不正なパラメータです。受信値: leadId=xyz`
- 自動化区分: 自動(Playwright)（3 は API）

---

### IMP-01: Eight 取込画面は admin 限定

- 対象: `/admin/leads/import`、`requireAdmin`
- 権限: member / manager / admin
- 事前条件: なし
- 手順:
  1. member で `/admin/leads/import` を直接開く
  2. manager でも開く
  3. member のセッションで dryRunEightImport / commitEightImport を直叩き
  4. 未ログインで直叩き
- 期待結果:
  1. 2. いずれも `/dashboard` へリダイレクトされる（role !== 'admin'）
  3. 「管理者権限が必要です」
  4. 「認証が必要です」
- 自動化区分: 自動(Playwright)（3・4 は API）

### IMP-02: dry-run — 件数サマリと文字コード判定

- 対象: `dryRunEightImport`、`decodeCsv`
- 権限: admin
- 事前条件: Eight 形式のテスト CSV を 2 種用意する（同一内容で Shift_JIS 版 / UTF-8 版。ヘッダは「会社名,部署名,役職,姓,名,e-mail,郵便番号,住所,TEL会社,TEL部門,TEL直通,Fax,携帯電話,URL,名刺交換日,...」、データ 10 行・うち同一メール 2 行×1 組・エラー行 1 行）
- 手順:
  1. Shift_JIS 版を選択し「内容を確認」を押す
  2. サマリ（CSV の行数 / 登録するリード / 新規 / 既存に追記 / 取込できない行）と「文字コード: shift_jis」を確認
  3. UTF-8 版でも実行し「文字コード: utf-8」を確認
  4. この時点で DB にリードが増えていないことを SQL で確認
- 期待結果:
  - 行数 = 10、リード数 = 9（同一人物 2 行が 1 件に統合）、エラー = 1
  - 「同じ人との複数回の名刺交換 1 行をリードにまとめます（交換履歴は全件残ります）」の注記が出る
  - 先頭 20 件のサンプル表（行 / リード名 / 担当者名 / メール / **最終登録日** / 名刺枚数 / 新規・追記バッジ）が表示される
  - dry-run では leads / contacts / companies に一切書き込まれない
- 自動化区分: 自動(Playwright)

### IMP-03: dry-run — ヘッダ不正・空ファイル・エラー行の理由表示

- 対象: `checkEightHeader` / `parseUploadedCsv` / `parseEightRow`
- 権限: admin
- 事前条件: (a) 必須列（会社名 / 姓 / 名 / e-mail / 名刺交換日）が欠けた CSV、(b) 空ファイル、(c) ヘッダのみの CSV、(d) 会社名・氏名・メールがすべて空の行を含む CSV、(e) UTF-8 でも Shift_JIS でもないバイト列
- 手順: それぞれをアップロードして「内容を確認」を押す
- 期待結果:
  - (a) エラートースト「Eight の CSV として認識できません。次の列が見つかりませんでした: ...（受信したヘッダ: ...）」— **約 10 秒で自動消滅**
  - (b) 「ファイルが空です」
  - (c) 「データ行がありません（ヘッダ行のみ、または空のファイルです）」
  - (d) エラー行一覧に「N 行目: 会社名・氏名・メールアドレスがすべて空のため、リード名を決められません」と表示され、そのほかの行は取込対象になる
  - (e) 「CSV の文字コードを判別できませんでした（UTF-8 / Shift_JIS のいずれでもありません）」
- 自動化区分: 自動(Playwright)

### IMP-04: dry-run — 警告（切り詰め・データ化中・同姓同名）

- 対象: `clamp` / warnings / `findSameNameContacts`
- 権限: admin
- 事前条件: 役職 101 文字の行、「再データ化中の名刺」フラグ行、「'?'を含んだデータ」フラグ行、既存 contacts と同姓同名（別会社）の行を含む CSV
- 手順: dry-run を実行する
- 期待結果:
  - 「注意が必要な行」に「役職が 100 文字を超えるため切り詰めました（元は 101 文字。原文は取込記録に保持）」「Eight 側でデータ化中の名刺（内容が未確定）」「読み取れない文字を含む名刺」が行番号付きで並ぶ（警告行も取込対象のまま）
  - 「同姓同名の連絡先がすでにあります（N 件）」の警告に「**別人として取り込みます。** 取込後に統合候補として一覧に出るので、そこで判断してください」の説明と、名刺側・既存側の所属が併記される
  - 同姓同名でも**所属が同じ**場合は候補に出ない（同一人物として紐づくため）
- 自動化区分: 自動(Playwright)

### IMP-05: commit — 新規取込と名寄せ・社内対応・名刺の記録

- 対象: `commitEightImport` → DB 関数 `import_eight_leads`、`resolve_or_create_company` / `resolve_or_create_contact` / `record_business_card`
- 権限: admin
- 事前条件: IMP-02 の CSV（既存 companies に同一メールドメインの企業を 1 社仕込んでおく）。担当者に manager を選ぶ
- 手順:
  1. dry-run 後、「N 件を取り込む」→ 確認ダイアログ「N 件のリード（新規 X 件 / 既存に追記 Y 件）を「<担当者名>」の担当として登録します。よろしいですか。」→「取り込む」
  2. 結果表示と SQL で以下を確認:
     - leads（stage = 獲得 / status = 名刺交換済 / lead_source = Eight / owner = 選択した担当者 / source_external_key = `eight:mail:<メール>` or `eight:hash:<16桁>`）
     - companies / contacts（leads.company_id / contact_id が設定される）
     - lead_activities（note「名刺データの登録（Eight）」、called_on = Eight 登録日、対応種別 = 名刺交換）
     - contact_business_cards 相当の名刺記録、lead_import_batches / lead_import_records（raw 保持）
  3. 既存ドメイン一致の行が既存 Company に名寄せされたことを確認
- 期待結果:
  - 完了バナー「取込が完了しました 新規 X 件 / 追記 Y 件（/ 取込できなかった行 Z 件）」「名刺 N 枚を記録しました。連絡先の現在の所属は変更していません…」
  - 名寄せは resolve_or_create_company / resolve_or_create_contact 経由（法人番号 > メールドメイン > 住所+名称 > 名称）。ドメイン一致行は新規 Company を作らず既存に紐づく
  - 会社名の略記（`㈱`）は正式表記（`株式会社`）に開かれて保存される
  - 取込後、**このバッチに含まれるリードだけ**スコアが再計算される（`recalculate_lead_scores_for_batch`）。
    取込対象外のリードの `score` / `score_updated_at` は変化しない（全件再計算は週次 pg_cron が担う）
  - Account は作られない（契約成立まで作らない運用）
  - 取込履歴テーブルに取込日時 / ファイル名 / 文字コード / 行数 / 新規 / 追記 / エラー / 実行者の行が追加される
- 自動化区分: 自動(Playwright)（SQL 併用）

### IMP-06: commit — 再取込の冪等性（空欄のみ補完）

- 対象: `import_eight_leads` の既存更新分岐（COALESCE 既存優先）
- 権限: admin
- 事前条件: IMP-05 取込済み。取り込まれたリード 1 件の contact_department を CRM 上で「営業企画部」に書き換え、contact_job_title を空にしておく。CSV 側は部署「営業部」役職「部長」
- 手順:
  1. 同じ CSV をもう一度 dry-run する → 全件「既存に追記」（新規 0）になることを確認
  2. commit する
  3. SQL で当該リードを確認する
- 期待結果:
  - リード件数は増えない（新規 0 / 追記 N）
  - contact_department は「営業企画部」のまま（**CRM 入力値を名刺で上書きしない**）、空だった contact_job_title には「部長」が補完される
  - ステージ / ステータス / 担当者は変更されない
  - 同じ登録日の lead_activities は重複作成されない
- 自動化区分: 自動(Playwright)（SQL 併用）

### IMP-07: 同一人物の複数行統合と最新行の属性採用

- 対象: `mergeEightRows`
- 権限: admin
- 事前条件: 同一メールで会社名が異なる 2 行（名刺交換日: 古い行 = A 社 2024-01-10、新しい行 = B 社 2026-05-01）を含む CSV
- 手順: dry-run → commit → SQL 確認
- 期待結果:
  - リードは 1 件、company_name は**交換日が最新の行**の「B 社」（転職時に古い情報で上書きしない）
  - lead_activities には 2024-01-10 と 2026-05-01 の 2 件が残る（交換日の重複は 1 件に集約）
  - サンプル表の「名刺」列に「2 枚」と表示される
- 自動化区分: 自動(API)

### IMP-08: commit — 担当者の検証

- 対象: `commitEightImport` の owner 検証
- 権限: admin
- 事前条件: crm_users に is_active = false の退職済みユーザーが存在（`prod-retired-users.sql` 相当）
- 手順: FormData を直接組み立てて commit を叩く
  1. ownerUserId 空
  2. 存在しない UUID
  3. 退職済みユーザーの ID
- 期待結果:
  1. `[ownerUserId] 担当者を選択してください`
  2. `[ownerUserId] 指定された担当者が見つかりません`
  3. `[ownerUserId] 退職済みのユーザーは担当者に指定できません`
- 自動化区分: 自動(API)

### IMP-09: 「名刺交換日」は Eight 登録日である旨の表示

- 対象: `/admin/leads/import` の説明文・サンプル表、`lead_activities` の note
- 権限: admin
- 事前条件: IMP-05 取込済み
- 手順:
  1. 取込画面冒頭の説明文を確認する
  2. dry-run サンプル表の列名を確認する
  3. 取り込まれたリードの社内対応の記録を確認する
- 期待結果:
  1. 「Eight への登録日は社内対応として残します。この日付は名刺を交換した日ではありません。」と明記されている
  2. 列名は「名刺交換日」ではなく「**最終登録日**」
  3. 社内対応の note は「名刺データの登録（Eight）」（交換日を装う文言でない）。所属順序の根拠に使われていない
- 自動化区分: 自動(Playwright)

### IMP-10: commit — マスタ既定値が未登録のときのエラー

- 対象: `resolveDefaults`
- 権限: admin
- 事前条件: テスト DB で一時的に lead_sources の slug = eight を論理削除する（検証後に戻す）
- 手順: commit を実行する
- 期待結果: 「リードソース Eight が登録されていません」で取込全体が失敗し、部分的な書き込みが残らない。同様に獲得ステージ / ステータス「名刺交換済」/ 対応種別・通電状況「名刺交換」が欠けた場合も対応するメッセージで停止する
- 自動化区分: 自動(API)

### IMP-10b: 大きい CSV を送っても画面が固まらない

- 対象: `next.config.ts` の `serverActions.bodySizeLimit`、`describeTransportError()`、`runDryRun` / `runCommit` の try/catch/finally
- 権限: admin
- 背景: 既定の 1MB を超えると Server Action がサーバー側で例外になる。クライアントが
  catch していなかったため「確認中」の表示が解除されず、本番で取込が完了できなかった（2026-08-03）
- 事前条件: 3,000 行の Eight 形式 CSV（実測 1.02MB。生成は `scripts/` 相当の手順か手動）
- 手順:
  1. 3,000 行の CSV を選び「内容を確認」を押す
  2. そのまま「N 件を取り込む」まで進める
  3. `bodySizeLimit` を一時的に `512kb` に下げて再起動し、同じ CSV で 1. を実行する
- 期待結果:
  1. 事前確認が完了し「CSV の行数 3,000 / 登録するリード 3,000」が表示される（**ボタンが処理中のまま止まらない**）
  2. 取込が完了し、結果バナーが出る
  3. エラートースト「ファイルが大きすぎて送信できませんでした（{ファイル名} / 1.02MB）。分割して取り込んでください」が出て、
     「内容を確認」ボタンが押せる状態に戻る（**処理中のまま固まらない**）
- 自動化区分: 手動（3. は設定変更を伴うためリリース前検証で実施）

### IMP-10c: 通信が切れた後に同じファイルを再送しても重複しない

- 対象: `import_eight_leads` の `source_external_key` 判定
- 権限: admin
- 事前条件: IMP-05 取込済み
- 手順: 同じ CSV をもう一度 commit する
- 期待結果: リード件数は増えず、すべて「既存に追記」になる（タイムアウト時にやり直して安全であることの担保）
- 自動化区分: 自動(API)（IMP-06 と同じ経路）

### IMP-11: 問い合わせ同期 API — 認証と設定ガード

- 対象: `POST /api/leads/inquiry-sync`
- 権限: なし（Bearer シークレット認証。middleware 対象外）
- 事前条件: 環境変数 INQUIRY_SYNC_CRON_SECRET / CLOUDFLARE_*（D1）を切り替えられるテスト環境
- 手順:
  1. INQUIRY_SYNC_CRON_SECRET 未設定で POST
  2. 設定済みで Authorization ヘッダなし / 間違った Bearer で POST
  3. シークレット一致・D1 設定なしで POST
  4. 正しい Bearer で POST
- 期待結果:
  1. 503 `{"error":"問い合わせ取込は無効です（INQUIRY_SYNC_CRON_SECRET が未設定）"}`
  2. 401 `{"error":"認証に失敗しました"}`
  3. 503 `{"error":"D1 連携が未設定です（CLOUDFLARE_* を確認してください）"}`
  4. 200 で `{ fetched, created, appended, skipped }` が返る
  - 実行中の再入は `{"skipped":"前回の取込が実行中です"}` で見送られる
- 自動化区分: 自動(API)（環境変数切替を伴うため CI では手動枠でも可）

### IMP-12: 問い合わせ同期 — 新規リード作成・既存への追記・冪等性

- 対象: `import_inquiry_leads`、`toInquiryLead` / `splitPersonName` / `formatDetailJson`
- 権限: API（service_role 経由）
- 事前条件: D1（またはテスト用スタブ）に次の 3 行を用意する
  - (a) 新規メール・会社名あり（form_type = lp-consult / label = consult / detail_json あり）
  - (b) 既存リードと同じメール（seed 内リードの contact_email と一致させる）
  - (c) 前回取込済みの行（lead_customer_activities.source = `inquiry:<id>` が既にある）
- 手順:
  1. 正しい Bearer で POST し、レスポンスの created / appended / skipped を確認
  2. SQL で leads / companies / contacts / lead_customer_activities を確認
  3. もう一度 POST する
- 期待結果:
  - (a) leads 新規 1 件（stage = 獲得、status = 未対応(not_started)、lead_source = Web問い合わせ(web_form)、owner = INQUIRY_SYNC_OWNER_EMAIL のユーザーまたは最初の admin、source_external_key = `inquiry:<D1 id>`）。resolve_or_create_company / contact 経由で Company / Contact も紐づく。Account は作られない
  - (a) の顧客行動 detail が「種別: 無料相談 LP」「内容: 無料相談」「経路: ...」+ detail_json 展開の複数行で記録される。氏名は「姓 名」分割（区切りなしは姓へ）
  - (b) は新しいリードを**作らず**、既存リードに顧客行動が 1 件追加される（appended にカウント）
  - (c) は skipped にカウントされ何も書かれない
  - 再 POST では created = 0 / appended = 0 / 全件 skipped（冪等）
  - lead_import_batches に source_slug = inquiry のバッチが記録される
- 自動化区分: 自動(API)（SQL 併用）

### IMP-13: 問い合わせリードが進捗（/progress/inquiry）に載る

- 対象: `resolve_lead_category` トリガー → `/progress/inquiry`
- 権限: admin
- 事前条件: IMP-12 で web_form ソースのリードが作成済み
- 手順: `/progress/inquiry` を開き、新規リードがカテゴリ inquiry として集計に含まれることを確認する
- 期待結果: 合計件数に +1 され、カンバンの「獲得」列（ステータス: 未対応）に現れる。`/leads` のカテゴリフィルタ結果とも一致する
- 自動化区分: 自動(Playwright)

---

## 3. 実装から気づいた仕様上の懸念（テスト時に挙動を記録すること）

1. ~~**社内対応 CRUD がスコアを即時再計算しない**~~
   **→ 2026-08-03 に修正済み。** `createLeadActivity` / `updateLeadActivity` / `deleteLeadActivity` の
   3 つに `recalculateLeadScore` を追加した（顧客行動 CRUD と同じ方針: `createAdminClient()` を使い、
   再計算の失敗はログのみで本体は成功扱い）。LD-13 は「記録直後にスコアが変わること」を検証する。
2. ~~**昇格失敗時にステージだけ進む**~~（2026-08-03 修正済み）: `updateLead` は昇格失敗時に `stage_id` / `status_id` を編集前の値へ戻す UPDATE を追加発行するようになった。また昇格の発火条件を「ステージが遷移したとき」に加え「現在のステージが auto_promote_to_deal かつ promoted_deal_id が NULL のとき」にも広げ、ステージ変更を伴わない保存でも再試行できるようにした（LD-17）。ロールバック UPDATE 自体も `updated_at` を進めるため、失敗直後にクライアントが保持する `expected_updated_at` は古くなる。`ok:false` の戻り値型に `lead` を含めていないためクライアント側にその場で新しい値を渡す手段がなく、直後の再保存が「他ユーザーによる更新」として楽観ロックに弾かれるケースがある（画面を再読み込みすれば解消する。型を変えるかは要検討のため一旦許容）。
3. **`leadFiltersSchema` の perPage 既定値 20 と UI の 30 が不一致**: 画面は常に `DEFAULT_PAGE_SIZE = 30` を明示送信するため実害はないが、スキーマ既定値で直叩きすると 20 件になる。
4. ~~**campaigns / lead_activities / lead_customer_activities の更新に楽観ロックがない**~~
   → **2026-08-03 に Server Action 側は対応済み。**
   `updateCampaign` / `updateLeadActivity` / `updateLeadCustomerActivity` が `expected_updated_at` を受け取り、
   `updated_at` を WHERE 条件に含めるようになった（0 行更新なら `conflictErrorMessage()`）。
   `lead_activities` は `updated_at` 列を持っていなかったため、
   マイグレーション `20260803000002_lead_activities_updated_at.sql` で追加し、
   既存行は `COALESCE(last_edited_at, created_at)` でバックフィルした
   （`lead_customer_activities` は既存の列・トリガーをそのまま使う）。
   画面側の対応状況（2026-08-03 時点）:
   - `lead_activities`（社内対応）: `/leads/[id]` の編集モーダル（`LeadActivityEditModal`）が
     一覧行の `updated_at` を保持し `expected_updated_at` として送信するようになった（ACT-04b）
   - `lead_customer_activities`（顧客行動）: 編集 UI 自体が実装されていない
     （`/leads/[id]` 顧客行動タブは追加・削除のみ）。Server Action は楽観ロック対応済みだが、
     UI が無いため実際に送られることはない。編集 UI を作る場合はこの Action にそのまま乗せられる
   - `campaigns` の編集フォーム → **2026-08-03 に対応済み。** `CampaignEditClient`
     （`src/app/(app)/campaigns/[id]/edit/campaign-edit-client.tsx`）が読み込んだ
     キャンペーンの `updated_at` を保持し、保存時に `expected_updated_at` として送信するようになった。
     競合時のエラーはフィールド非依存のためトースト表示（約 10 秒で自動消滅）。CPN-04 / CPN-04b で検証する
5. ~~**キャンペーン重複紐付けのエラーが生文言**~~
   **→ 2026-08-03 に修正済み。** 一意制約違反（`23505`）を検出して日本語化した
   （単体: 「このリードは既にキャンペーンに登録されています」／
   一括: 「選択したリードの中に、既にこのキャンペーンに登録されているものがあります」）。
6. ~~**`getUnassignedLeadsForCampaign` が全件取得**~~
   **→ 2026-08-03 に修正済み。** `getUnassignedLeadsForCampaign(campaignId, { keyword, page, perPage })`
   がサーバー側で検索・ページネーション（`DEFAULT_PAGE_SIZE` 単位、戻り値は `{ rows, total }` 規約）を行うようになった。
   除外条件（紐付き済み lead_id）は `.not("id","in",[...])` のような URL 展開をやめ、
   (a) 紐付き済み lead_id を `lead_campaigns` から 200 件ずつページングしてアプリ側の `Set` として保持し、
   `leads` から取得したバッチのうちその `Set` に含まれる行だけを除外する、
   (b) 総件数は「検索条件一致の全件数」から「検索条件一致かつ `lead_campaigns!inner` で紐付き済みの件数」
   （PostgREST の内部結合フィルタ。存在する行だけに絞る方向は素直にサポートされる）を差し引いて算出する、
   という 2 段構成にした。PostgREST 単体では「子テーブルに存在しない」を 1 クエリで表現できない
   （`!inner` は逆に「存在する」行に絞る用途）ため、DB 側にビュー・関数を追加する案も検討したが、
   ID リストを URL に載せない・1,000 行上限を跨いでも動く、の 2 点はアプリ側の実装だけで満たせるため
   マイグレーションは追加していない。モーダル UI（`AttachLeadsModal`）も検索デバウンス・
   `Pagination` コンポーネントによるページ送りに対応した（CPN-09）。
7. ~~**一覧キーワードの ilike 直埋め**~~（2026-08-03 修正済み）: `getLeads` のキーワードは `src/lib/search-query.ts` の `buildIlikePattern` でサニタイズしてから `or(...ilike...)` に埋め込むようにした（activity-feed 側と同じ方針）。
