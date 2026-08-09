# システムテスト仕様: ディール・契約・プロジェクト

最終更新: 2026-08-03

## 1. 対象範囲

| 区分 | 対象 |
|---|---|
| 画面 | `src/app/(app)/deals/**`（カンバン/テーブル・新規・詳細・編集）、`src/app/(app)/contracts/**`（一覧・新規・詳細・編集）、`src/app/(app)/projects/**`（一覧・新規・詳細・編集） |
| Server Action | `src/actions/deals.ts`（getDeals / getDealsForKanban / getDeal / createDeal / updateDeal / moveDealCard / deleteDeal / addDealService / removeDealService）、`src/actions/contracts.ts`、`src/actions/projects.ts` |
| validator | `src/lib/validators/deals.ts`、`contracts.ts`、`projects.ts`、`common.ts` |
| 補助 | `src/lib/deal-counterparty.ts`（相手先フォールバック）、`src/lib/deals/expected-close-date.ts`（クローズ予定日既定値） |
| DB | `deals_counterparty_check` CHECK 制約（20260731000006）、`ensure_account_on_contract` AFTER INSERT トリガー（20260731000007 / 20260731000008 で差し替え）、`deal_stage_histories` / `deal_status_histories`、RLS（deals: 20260416040013 §3-8、contracts: §3-9、projects: 20260418000011） |

- テスト環境: http://localhost:2000
- テストユーザー: admin@iterra.jp / manager@iterra.jp / member@iterra.jp（いずれも password123）
- ページサイズ: 30 件（`DEFAULT_PAGE_SIZE`）
- コード自動採番: deals = `DL-` + 6桁、contracts = `CTR-` + 6桁、projects = `PRJ-` + 6桁
- UI 規約（全ケース共通で確認）:
  - エラートーストは約 10 秒、success は約 4 秒で自動消滅する（どちらも閉じるボタンで即座に消せる）
  - ステージ/ステータス/プロジェクトステータスのバッジ色・カンバン列色はマスタの `color` カラム値（`#RRGGBB`）由来であること（画面側で sort_order から算出していないこと）

### 実装上の前提（ケース設計の根拠）

- **deals の相手先 CHECK 制約**: DB は `account_id / company_id / contact_id` のいずれか 1 つで可（`deals_counterparty_check`）。ただし**画面の新規作成フォームと `createDealSchema` は取引先（account_id）必須**。company / contact だけを持つディールはリード昇格（`promote_lead_to_deal`）経由でのみ生まれる。テストでは両経路を扱う
- **deals の削除 UI は実装済み**（編集ページ内・admin のみ・紐づく契約ありは拒否）。論理削除（`deleted_at`）
- **カンバン D&D の成功フィードバックはトーストではなくカードのハイライト**（テラコッタ色リング約 1.6 秒）。トーストが出るのは失敗時のみ
- **contracts の RLS は SELECT も manager/admin 限定**。member は一覧が 0 件になる

## 2. テストケース

---

### DL-01（deals）: カンバン初期表示と列構成

- 対象: `/deals`（`deals-view.tsx` KanbanView、`getDealsForKanban`）
- 権限: admin
- 事前条件: パイプライン「営業」にステージ・ステータスマスタとディール（03-dev-samples）が存在する
- 手順:
  1. admin@iterra.jp でログインし `/deals` を開く
  2. 初期表示を確認する
- 期待結果:
  - カンバンビューが既定で表示され、ビュー切替は「カンバン」が選択状態
  - グループは「ステージ別」が既定。既定パイプラインのステージが `sort_order` 昇順で列表示される
  - 各列ヘッダーの背景色はステージマスタの `color` 由来（`kanbanColorFrom`）。件数バッジに列内のディール数が出る
  - ディール 0 件の列は「ディールなし」プレースホルダ表示
  - カードにディール名・ステータスバッジ（マスタ `color`）・金額（`¥1,234,567` 形式、null は「—」）・相手先名・担当者名が表示される
- 自動化区分: 自動化可（Playwright）

### DL-02: パイプライン切替でステージ/ステータス列が連動する

- 対象: `/deals`（`handlePipelineChange` → `getDealsForKanban(pipelineTypeId)`）
- 権限: admin
- 事前条件: パイプラインが複数（例: 営業 / 仕入れ）あり、それぞれ別のステージ/ステータスマスタを持つ
- 手順:
  1. `/deals` でパイプライン選択ドロップダウンを開き「仕入れ」を選ぶ
  2. グループを「ステータス別」に切り替える
- 期待結果:
  - 列が「仕入れ」パイプラインに属するステージだけに入れ替わる（他パイプラインのステージ列は出ない）
  - 表示されるディールも「仕入れ」のディールのみ
  - ステージ絞り込み select の選択はパイプライン切替でリセットされる
  - 「ステータス別」でも同様に「仕入れ」に属するステータス列のみ表示される
- 自動化区分: 自動化可（Playwright）

### DL-03: カンバンの列絞り込みと検索

- 対象: `/deals`（stageFilter / statusFilter / searchQuery）
- 権限: admin
- 手順:
  1. ステージ別カンバンで絞り込み select から特定ステージ（例: ディール中）を選ぶ
  2. 検索欄にディール名の一部（例: 「LP」）を入力する
  3. 相手先名（取引先/事業者/連絡先の表示名）の一部でも検索する
- 期待結果:
  - 絞り込み時も**列自体は全ステージ表示のまま**、選択外の列はカードのみ非表示になる
  - 検索はディール名・相手先ラベル（`getDealCounterpartyLabel`）の大文字小文字を区別しない部分一致。クライアントサイドで即時反映
- 自動化区分: 自動化可（Playwright）

### DL-04: D&D ステージ移動（正常系）— 履歴 INSERT と stage_updated_at

- 対象: `moveDealCard`（groupBy="stage"）、`deal_stage_histories` / `deal_status_histories`
- 権限: admin（または対象ディールの owner）
- 事前条件: ステージ「初回接触」にディール A がある。移動先ステージ「ディール中」に紐づくステータスがマスタに定義済み
- 手順:
  1. ステージ別カンバンでディール A のカードを「ディール中」列へドラッグ&ドロップする
  2. DB を確認する
- 期待結果:
  - カードが即座に移動（楽観的 UI）し、確定後カードにテラコッタ色のリングが約 1.6 秒表示される。**成功トーストは出ない**（実装仕様）
  - DB: `deals.deal_stage_id` = 移動先、`deals.deal_status_id` = 移動先ステージに属する有効ステータスのうち `sort_order` 最小のもの、`stage_updated_at` が現在時刻に更新
  - `deal_stage_histories` に 1 行 INSERT（from = 旧ステージ、to = 新ステージ、changed_by = 操作者）
  - ステータスも変わった場合は `deal_status_histories` に 1 行 INSERT（stage_id = 新ステージ、NOT NULL）
  - ステージ別・ステータス別の両ビューでカードの所属列が整合する（サーバー確定値で両列を再配置）
- 自動化区分: 自動化可（Playwright + SQL 検証）

### DL-05: D&D ステータス移動 — ステージ追随

- 対象: `moveDealCard`（groupBy="status"）
- 権限: admin
- 事前条件: ステータスマスタに `deal_stage_id` を持つステータスがある
- 手順:
  1. グループを「ステータス別」に切り替え、ディールカードを別ステータス列へドロップする
- 期待結果:
  - `deals.deal_status_id` が移動先ステータスに更新される
  - 移動先ステータスが `deal_stage_id` を持つ場合、`deals.deal_stage_id` もそのステージに追随し `stage_updated_at` 更新 + `deal_stage_histories` INSERT
  - ステータス変更分の `deal_status_histories` も INSERT される
- 自動化区分: 自動化可（Playwright + SQL 検証）

### DL-06: D&D 同一列へのドロップ — 変更なし

- 対象: `moveDealCard`（変更なし分岐）
- 権限: admin
- 手順:
  1. カードを同じ列内（現在のステージ列）へドロップする
- 期待結果:
  - `handleDropDeal` が現在列と同一のためサーバー呼び出し自体が発生しない（またはサーバー側で変更なしと判定され UPDATE 0 件）
  - `deals.updated_at` / `stage_updated_at` 不変、履歴テーブルに INSERT なし、トーストなし
- 自動化区分: 自動化可（Playwright + SQL 検証）

### DL-07: D&D 異常系 — 移動先ステージにステータス未定義

- 対象: `moveDealCard`（statusRow 不在分岐）
- 権限: admin
- 事前条件: あるステージに紐づく有効な `deal_statuses` が 1 件もない（テスト用にマスタを一時的に論理削除して作る）
- 手順:
  1. そのステージ列へカードをドロップする
- 期待結果:
  - エラートースト「移動先ステージにステータスが未定義です」が表示され、**閉じるボタンを押すまで消えない**
  - カードは元の列へロールバックされる（楽観的更新の巻き戻し）
  - DB は無変更
- 自動化区分: 自動化可（Playwright）

### DL-08: D&D 楽観ロック競合

- 対象: `moveDealCard`（`expectedUpdatedAt` による WHERE 条件）
- 権限: admin × 2 セッション
- 手順:
  1. ブラウザ 2 窓で同じカンバンを開く
  2. 窓 1 でディール A をステージ移動して成功させる
  3. 窓 2（古い `updated_at` を保持）で同じディール A を別ステージへドロップする
- 期待結果:
  - 窓 2 にエラートースト「このディールは他のユーザーによって更新されています。画面を再読み込みしてから保存してください」（約 10 秒で自動消滅）
  - 窓 2 のカードは元の位置へロールバック。窓 1 の変更のみ DB に残る
- 自動化区分: 自動化可（Playwright 2 コンテキスト）

### DL-09: D&D 権限 — manager は他人のディールを動かせない

- 対象: `moveDealCard` の owner チェック（`role !== "admin" && owner_user_id !== user.id`）
- 権限: manager
- 事前条件: member が owner のディールがカンバンに見えている（manager は RLS で全件閲覧可）
- 手順:
  1. manager@iterra.jp でログインし、member 担当のディールカードを別ステージへドロップする
- 期待結果:
  - エラートースト「このディールを編集する権限がありません」（約 10 秒で自動消滅）、カードはロールバック
  - DB 無変更。admin が同操作をした場合は成功する（対照確認）
- 自動化区分: 自動化可（Playwright）

### DL-10: member のカンバン表示範囲（RLS）

- 対象: `getDealsForKanban` + deals RLS（`is_manager_or_above() OR owner_user_id = auth.uid()`）
- 権限: member
- 事前条件: member 担当のディールと、他ユーザー担当のディールが同一パイプラインにある
- 手順:
  1. member@iterra.jp でログインし `/deals` を開く
- 期待結果:
  - カンバン・テーブルとも自分（member）が owner のディールだけが表示される
  - 自分のディールは D&D で移動できる（DL-04 と同じ挙動）
- 自動化区分: 自動化可（Playwright）

### DL-11: テーブルビュー — フィルタとページネーション

- 対象: `/deals` TableView、`getDeals`
- 権限: admin
- 事前条件: ディールが 31 件以上ある
- 手順:
  1. ビュー切替で「テーブル」を選ぶ
  2. ステージ / ステータス / 担当者フィルタをそれぞれ設定・解除する
  3. 検索欄にディール名の一部を入れる
  4. ページ送りする
- 期待結果:
  - 列: 取引名 / ステージ（バッジ）/ ステータス（バッジ）/ クローズ予定日 / 金額 / 取引先 / 担当者 / 最終更新日
  - フィルタは AND 条件で `getDeals` に渡り、変更時にページが 1 に戻る
  - 検索はディール名 + deal_code の部分一致（サーバーサイド ilike）
  - 30 件/ページで total 件数に応じたページネーションが出る。「クリア」で全条件リセット
  - 行クリックで `/deals/{id}` へ遷移
- 自動化区分: 自動化可（Playwright）

### DL-12: カードの時間軸表示 — 停滞バッジと期日

- 対象: `deals-view.tsx`（`getStagnation` / `getDueInfo`）
- 権限: admin
- 事前条件: SQL で以下のディールを用意（クローズ日時 `closed_at` は NULL）:
  - A: `stage_updated_at` = 20 日前
  - B: `stage_updated_at` = 35 日前
  - C: `expected_close_date` = 昨日
  - D: `expected_close_date` = 3 日後
  - E: `closed_at` あり + `expected_close_date` 過去
- 手順:
  1. カンバンで各カードを確認する
- 期待結果:
  - A: 「20日 停滞」バッジ（グレー枠・警告アイコンなし）。14 日未満のディールにはバッジが出ない
  - B: 「35日 停滞」バッジ（赤枠 + AlertTriangle アイコン、文字色 #B91C1C）
  - C: 「期日超過 MM/DD」が赤系太字 + AlertTriangle
  - D: 「予定 MM/DD」がアンバー系（#B45309）
  - E: クローズ済みは停滞・期日表示とも出ない
  - テーブルビューのクローズ予定日列も C/D と同じ色分け
- 自動化区分: 自動化可（Playwright、日付データは SQL 投入）

### DL-13: ディール新規作成（正常系）— 取引先必須・コード採番・初回履歴

- 対象: `/deals/new`（`deal-new-form.tsx`、`createDeal`）
- 権限: admin
- 手順:
  1. `/deals` の「新規作成」から `/deals/new` を開く
  2. 取引名「テストディールA」、金額「500000」、取引先を検索選択、パイプライン「営業」→ ステージ / ステータスを選択
  3. 「作成」を押す
- 期待結果:
  - 成功トースト「ディールを作成しました」（約 4 秒で自動消滅）→ `/deals/{新規id}` の詳細へ遷移
  - DB: `deals` 1 行（`deal_code` = `DL-` + 6 桁連番、`owner_user_id` = 未指定なら操作者、`created_by` / `last_updated_by` = 操作者）
  - `deal_stage_histories` に初回 1 行（from_stage_id = NULL）、`deal_status_histories` に初回 1 行（from_status_id = NULL、stage_id = 作成時ステージ）
  - 注: 画面・validator とも**取引先（account_id）が必須**。company / contact のみのディールは本フォームからは作れない（リード昇格経由のみ。DB の CHECK 制約 `deals_counterparty_check` はいずれか 1 つで許容）
- 自動化区分: 自動化可（Playwright + SQL 検証）

### DL-14: 新規作成 — パイプライン連動とクローズ予定日の自動設定

- 対象: `/deals/new`（`handlePipelineChange`、`calculateDefaultCloseDate` / `addMonthsClamped`）
- 権限: admin
- 事前条件: パイプライン「営業」の `default_close_months` が設定済み（例: 1）。別パイプラインは NULL
- 手順:
  1. パイプライン未選択の状態でステージ / ステータス select を確認する
  2. パイプライン「営業」を選ぶ
  3. パイプラインを別のものへ切り替える
  4. クローズ予定日を手で変更してからパイプラインを再度切り替える
- 期待結果:
  - パイプライン未選択の間、ステージ / ステータス select は disabled
  - 選択後、そのパイプラインに属するステージ / ステータスだけが選択肢に出る。パイプラインを替えるとステージ / ステータス選択はクリアされる
  - 「営業」選択でクローズ予定日に today + 1 ヶ月が自動入力され、ヘルパーテキスト「営業パイプラインの既定（1ヶ月後）を設定しました。変更できます」が出る。`default_close_months` が NULL のパイプラインでは自動設定なし
  - 月末繰り上がりのクランプ: 1/31 起点 + 1 ヶ月 → 2/28（29）になる（`addMonthsClamped` のユニットテストで担保。E2E では日付が入ることのみ確認）
  - 手動編集後はパイプラインを替えてもクローズ予定日が上書きされない
- 自動化区分: 自動化可（Playwright。クランプは Vitest）

### DL-15: 新規作成 — バリデーション異常系

- 対象: `createDealSchema` / フォームのクライアント検証
- 権限: admin
- 手順と期待結果（各項目で「作成」を押す）:
  1. 取引名を空にする → ブラウザの required で送信不可（HTML required）。Server Action 直呼びでは「取引名は必須です」
  2. 金額に「-100」→ インラインエラー「金額は 0 以上の数値を入力してください」（クライアント検証。トーストにしない）
  3. 申請日 2026-08-10・審査完了日 2026-08-01 → インラインエラー「審査完了日は申請日以降にしてください」
  4. 取引先未選択 → Server Action で「取引先は必須です」（`uuidString` の UUID 形式検証）
  5. 取引名 201 文字 → Zod max(200) エラー
- 補足: フィールド起因のエラー（`isFieldValidationError` 判定）はフォーム下部にインライン表示、それ以外はエラートースト
- 自動化区分: 自動化可（Playwright + Vitest）

### DL-16: 詳細ページ — 相手先フォールバック表示

- 対象: `/deals/[id]`、`src/lib/deal-counterparty.ts`
- 権限: admin
- 事前条件: 以下 3 ディールを用意:
  - A: `account_id` あり
  - B: `account_id` = NULL、`company_id` あり（リード昇格で作成）
  - C: `account_id` = NULL、`company_id` = NULL、`contact_id` あり
- 手順:
  1. 各詳細ページの「取引先」フィールドを確認する
  2. 一覧（カンバンカード・テーブルの「取引先」列）でも同じ 3 件を確認する
- 期待結果:
  - A: 取引先名が `/accounts/{id}` へのリンクで表示。法人紐づきなら「取引先名 (事業者名)」
  - B: 事業者名が `/companies/{id}` リンクで表示され、注記「取引先は契約時に作成」が付く
  - C: 連絡先の姓名が `/contacts/{id}` リンクで表示 + 同注記
  - **優先順位は常に 取引先 → 事業者情報 → 連絡先**で、一覧・カンバン・詳細の全箇所で同じラベルになる
  - B/C では取引先の付け替え UI が無効（`editable` = account_id があるときのみ）。A では変更可能（nullable=false のため外すことはできない）
- 自動化区分: 自動化可（Playwright）

### DL-17: 詳細ページ — 不正 URL・不存在・RLS 遮断

- 対象: `/deals/[id]`
- 権限: admin / member
- 手順と期待結果:
  1. `/deals/abc`（UUID 形式でない）→ 「不正なパラメータです」+ ディール一覧への戻りリンク。DB クエリは発行されない
  2. `/deals/00000000-0000-0000-0000-000000000999`（存在しない UUID）→ 「ディールが見つかりません」+ 戻りリンク
  3. member でログインし、他ユーザー owner のディール UUID を直接開く → RLS で取得 0 件になり「ディールが見つかりません」（存在の有無を漏らさない）
- 自動化区分: 自動化可（Playwright）

### DL-18: 編集保存 — ステージ/ステータス変更の履歴と stage_updated_at

- 対象: `/deals/[id]/edit`（`updateDeal`）
- 権限: admin
- 手順:
  1. 編集ページでステージとステータスを両方変更し「保存」
  2. 別のディールで金額のみ変更し「保存」
- 期待結果:
  - 1: トースト「保存しました」→ 詳細へ戻る。`stage_updated_at` 更新、`deal_stage_histories` / `deal_status_histories` に各 1 行 INSERT（status 履歴の `stage_id` は新ステージ）
  - 2: `stage_updated_at` は**不変**。履歴テーブルに INSERT なし。`entity_change_logs` にはトリガー経由で金額変更が記録される（アプリからの履歴 INSERT はない）
  - 編集フォームのパイプライン変更時、現ステージ/ステータスが新パイプラインに属さなければ選択がクリアされ、属していれば維持される
- 自動化区分: 自動化可（Playwright + SQL 検証）

### DL-19: 編集 — 楽観ロック競合

- 対象: `updateDeal`（`expected_updated_at`）
- 権限: admin × 2 セッション
- 手順:
  1. 2 窓で同じディールの編集ページを開く
  2. 窓 1 で保存 → 成功
  3. 窓 2 で別の値を保存する
- 期待結果:
  - 窓 2 にエラートースト「このディールは他のユーザーによって更新されています。画面を再読み込みしてから保存してください」（約 10 秒で自動消滅）
  - 窓 2 の変更は DB に反映されない（0 行更新）
- 自動化区分: 自動化可（Playwright 2 コンテキスト）

### DL-20: 編集権限 — member は他人のディールを更新できない

- 対象: `updateDeal` の owner チェック + RLS
- 権限: member
- 手順:
  1. member 自身が owner のディールを編集・保存する
  2. （API レベル）member のセッションで他人のディール id に対し `updateDeal` を呼ぶ
- 期待結果:
  - 1: 保存成功「保存しました」
  - 2: RLS で対象が見えないため「ディールが見つかりません」（owner チェック手前の existing 取得で弾かれる）。DB 無変更
- 自動化区分: 手動（2 は Server Action 直呼びのため統合テスト/手動）

### DL-21: ディール削除 — admin 限定・契約ガード・論理削除

- 対象: `/deals/[id]/edit` の削除ボタン、`deleteDeal`
- 権限: admin / manager
- 事前条件: 契約が紐づくディール A（deleted_at IS NULL の契約あり）と、契約のないディール B
- 手順:
  1. manager で編集ページを開く → 削除ボタンが表示されないことを確認
  2. admin でディール A の編集ページ → 「削除」→ 確認ダイアログ（「『{ディール名}』を削除します。紐づく契約が存在する場合は削除できません。復元はシステム管理者に依頼してください。」）→ 「削除する」
  3. admin でディール B に同操作
- 期待結果:
  - 2: エラー「紐づく契約が存在するため削除できません」（ダイアログ内 or トースト・約 10 秒で自動消滅）。DB 無変更
  - 3: トースト「ディールを削除しました」→ `/deals` へ遷移。DB は物理削除ではなく `deleted_at` / `deleted_by` が設定され、一覧・カンバンから消える
- 自動化区分: 自動化可（Playwright + SQL 検証）

### DL-22: 詳細ページ — サービス・プロジェクト紐づけの付け外し

- 対象: `/deals/[id]`（`RelationMultiField` → `addDealService` / `removeDealService`、`RelationListSection` → `addDealProject` / `removeDealProject`）
- 権限: admin（サービス）、manager（プロジェクト紐づけは RLS が manager+）
- 手順:
  1. 詳細ページ「サービス」でサービスを 2 つ選択し保存 → 1 つ外して保存
  2. 「プロジェクト」でプロジェクトを追加 → 削除
  3. member 自身のディール詳細で 2 と同じ操作を試みる
- 期待結果:
  - 1: `deal_services` に差分だけが INSERT / DELETE される（全消し再作成しない）
  - 2: `deal_projects` に INSERT / DELETE。プロジェクト詳細側にも反映（revalidatePath）
  - 3: member はプロジェクト紐づけ操作で「manager 以上の権限が必要です」エラートースト（Server Action + RLS の二重ガード）
  - 論理削除済みプロジェクトは紐づけ一覧に表示されない
- 自動化区分: 自動化可（Playwright + SQL 検証）

---

### CTR-01（contracts）: member は契約を閲覧できない（RLS SELECT 遮断）

- 対象: `/contracts`、contracts RLS（SELECT/INSERT/UPDATE: manager/admin、DELETE: admin）
- 権限: member
- 事前条件: 契約データが存在する（manager で確認できる状態）
- 手順:
  1. member@iterra.jp でログインし `/contracts` を開く
- 期待結果:
  - 一覧は「0 件の契約」+ 空状態表示「契約がまだありません」（RLS により SELECT 0 行。エラーにはならない）
  - 「新規作成」ボタンが disabled（グレー・`title="作成権限がありません"`）
  - ディール詳細ページの契約テーブルも member には空になる
- 自動化区分: 自動化可（Playwright）

### CTR-02: member の直 URL・Server Action ガード（多層防御）

- 対象: `/contracts/new`、`/contracts/[id]/edit`、`createContract` / `updateContract` / `deleteContract`
- 権限: member
- 手順と期待結果:
  1. `/contracts/new` を直接開く → 「作成権限がありません」+ 契約一覧へ戻るリンク（フォーム自体が出ない）
  2. 既知の契約 UUID で `/contracts/{id}/edit` を開く → 「編集権限がありません」（それ以前に getContract が RLS で 0 件なら「契約が見つかりません」）
  3. （API レベル）member セッションで `createContract` を呼ぶ → `{ error: "manager 以上の権限が必要です" }`。`deleteContract` は manager でも `{ error: "管理者権限が必要です" }`
- 自動化区分: 1・2 は自動化可（Playwright）、3 は統合テスト/手動

### CTR-03: 契約新規作成（正常系）— manager・コード採番

- 対象: `/contracts/new`（`contract-new-form.tsx`、`createContract`）
- 権限: manager
- 手順:
  1. manager@iterra.jp でログインし `/contracts` → 「新規作成」
  2. ディールを検索選択（必須）、契約書名「業務委託基本契約」、契約方法「電子」、契約種別を選択、契約開始日 2026-08-01・終了日 2027-07-31 を入力
  3. 「作成」を押す
- 期待結果:
  - トースト「契約を作成しました」→ `/contracts/{新規id}` へ遷移
  - DB: `contracts` 1 行。`contract_code` = `CTR-` + 6 桁連番（トリガー採番）、`registered_by` / `created_by` = 操作者
  - **契約はディールへの紐づけ必須**: ディール未選択で送信するとインラインエラー「ディールは必須です」で送信されない（`deal_id` は DB でも NOT NULL 相当の必須）
- 自動化区分: 自動化可（Playwright + SQL 検証）

### CTR-04: 契約 AFTER INSERT — Account 自動作成（法人ディール）

- 対象: `ensure_account_on_contract` トリガー（20260731000008 版）
- 権限: manager
- 事前条件: リード昇格で作られたディール X（`account_id` = NULL、`company_id` あり、`contact_id` あり、営業パイプライン、owner = member）。事業者は「株式会社テスト商事」
- 手順:
  1. manager がディール X を対象に契約を新規作成する
  2. SQL で accounts / account_contacts / deals / leads / account_roles を確認する
- 期待結果（契約と同一トランザクションで全て成立）:
  - `accounts` に 1 行自動作成: `name` = 「株式会社テスト商事」（法人名優先）、`company_id` = ディールの company、`account_type_id` = slug `corporate`、`account_status_id` = 「アクティブ」、`owner_user_id` = ディール owner（member）、`account_code` 採番
  - `account_contacts` に (account, ディールの contact, role='primary') が 1 行
  - `deals.account_id` が新 Account に更新される（SECURITY DEFINER のため契約者がディール owner でなくても更新される）
  - 昇格元リードの `promoted_account_id` に新 Account が入る
  - `account_roles` に営業パイプライン対応の区分「顧客」が `assigned_by_contract = TRUE` で付与される
  - 画面: ディール X の詳細で「取引先は契約時に作成」注記が消え、取引先リンク表示に変わる
- 自動化区分: 自動化可（Playwright + SQL 検証）

### CTR-05: 契約 AFTER INSERT — 個人ディール（contact のみ）

- 対象: 同上
- 権限: manager
- 事前条件: ディール Y（`account_id` = NULL、`company_id` = NULL、`contact_id` = 連絡先「山田 太郎」）
- 手順:
  1. ディール Y に契約を作成し、SQL で確認する
- 期待結果:
  - Account 名 = 「山田 太郎」（姓 + 半角スペース + 名）、`account_type_id` = slug `sole_proprietor`、`company_id` = NULL
  - `account_contacts` primary 紐づけあり
- 自動化区分: 自動化可（Playwright + SQL 検証）

### CTR-06: 契約 AFTER INSERT — 既に取引先があるディールは Account を増やさない

- 対象: 同上（`v_deal.account_id IS NOT NULL` 分岐）
- 権限: manager
- 事前条件: `account_id` 設定済みのディール Z（例: 仕入れパイプライン）。その取引先は既に「顧客」区分を持つ
- 手順:
  1. ディール Z に 2 本目の契約を作成する
  2. accounts 件数と account_roles を確認する
- 期待結果:
  - `accounts` の行数は増えない（既存 Account を触らない）
  - `account_roles` に仕入れパイプライン対応の「仕入れ先」が追加され、既存「顧客」と併存する（UNIQUE (account_id, role_type_id) により同一区分は重複しない）
- 自動化区分: 自動化可（SQL 検証）

### CTR-07: 契約作成 — バリデーション異常系

- 対象: `createContractSchema`
- 権限: manager
- 手順と期待結果（各項目で「作成」）:
  1. 契約開始日 2026-08-01・終了日 2026-07-01 → インラインエラー「終了日は開始日以降にしてください」
  2. 契約送付日 2026-08-10・サインバック日 2026-08-01 → 「サインバック日は送付日以降にしてください」
  3. 原本 URL に「abc」→ Zod url() エラー（type="url" のブラウザ検証と二重）
  4. 契約内容に 5001 文字 → max(5000)。textarea の maxLength=5000 で入力段階でも制限
  5. いずれの異常系でも DB に行は作られず、トリガーによる Account 作成も起きない
- 自動化区分: 自動化可（Playwright + Vitest）

### CTR-08: 契約詳細 — 表示と紐づけ付け替え

- 対象: `/contracts/[id]`（RelationField、`updateContract`）
- 権限: manager / member
- 手順:
  1. manager で契約詳細を開く
  2. 「ディール」の付け替え UI を確認し、別ディールへ変更する
  3. 契約相手先区分が「法人」の契約と「個人」の契約をそれぞれ確認する
- 期待結果:
  - ヘッダーに `contract_code` + 契約書名。編集ボタンは manager/admin のみ表示
  - ディールの RelationField は **nullable=false（外せない・選び替えのみ）**。変更成功でディールリンクが更新される
  - 相手先区分 = 法人: 事業者情報 + 契約担当者フィールド表示 / 個人: 連絡先フィールド表示
  - 契約方法バッジ（紙面 / 電子 / 口頭）、日程 6 項目、自動更新の有無、登録者が表示される
  - 楽観ロック: 付け替えは画面表示時点の `updated_at` を使うため、他者更新後は「この契約は他のユーザーによって更新されています。画面を再読み込みしてから保存してください」
- 自動化区分: 自動化可（Playwright）

### CTR-09: 契約編集・楽観ロック・削除（admin 限定）

- 対象: `/contracts/[id]/edit`（`contract-edit-form.tsx`、`updateContract` / `deleteContract`）
- 権限: manager / admin
- 手順:
  1. manager で契約を編集・保存する
  2. 2 窓で競合させる（DL-19 と同手順）
  3. manager の編集ページで削除ボタンの有無を確認する
  4. admin で削除 → 確認ダイアログ「契約を削除」（『{契約書名}』を削除します。この操作は取り消せません。）→ 「削除する」
- 期待結果:
  - 1: トースト「保存しました」→ 詳細へ戻る
  - 2: 競合トースト（約 10 秒で自動消滅）・後発の変更は反映されない
  - 3: manager には削除ボタン非表示（isAdmin のみ）
  - 4: トースト「契約を削除しました」→ 一覧へ。DB は `deleted_at` / `deleted_by` の論理削除。一覧・ディール詳細の契約テーブルから消える。**削除しても自動作成済み Account は残る**（トリガーは INSERT 時のみ）
- 自動化区分: 自動化可（Playwright + SQL 検証）

### CTR-10: 契約一覧 — フィルタ・検索・不正 URL

- 対象: `/contracts`（`getContracts`）、`/contracts/[id]`
- 権限: manager
- 手順:
  1. 契約種別・契約方法（紙面/電子/口頭）で絞り込む
  2. 検索欄に契約書名の一部を入力する（300ms デバウンス）
  3. `/contracts/abc` と存在しない UUID を直接開く
- 期待結果:
  - フィルタは AND 条件・ページ 1 に戻る。検索は `contract_code` + `contract_name` の部分一致
  - 30 件/ページのページネーション
  - `/contracts/abc` → 「不正なパラメータです」、存在しない UUID → 「契約が見つかりません」+ 一覧へ戻るリンク
- 自動化区分: 自動化可（Playwright）

---

### PRJ-01（projects）: 一覧表示 — 全ロール閲覧可・フィルタ

- 対象: `/projects`（`projects-view.tsx`、`getProjects`）、projects RLS（SELECT: 認証済み全員）
- 権限: member
- 手順:
  1. member@iterra.jp でログインし `/projects` を開く
  2. ステータス・責任者で絞り込み、プロジェクト名で検索、ページ送りする
- 期待結果:
  - member でも全プロジェクトが閲覧できる（閲覧全員 / 編集 manager+ / 削除 admin の方針）
  - 列: プロジェクト名 / ステータス（`ProjectStatusBadge`、色はマスタ `color`）/ 期間 / 責任者 / 最終更新日
  - 検索は名前 + `project_code` の部分一致、30 件/ページ、「クリア」で全解除
  - 2026-08-03 対応: 一覧の「新規作成」ボタンは manager/admin にのみ活性表示。member には非活性ボタン（title「作成権限がありません」、contracts 一覧と同じ出し分け）が出る
- 自動化区分: 自動化可（Playwright）

### PRJ-02: プロジェクト新規作成（正常系）— manager

- 対象: `/projects/new`（`project-new-form.tsx`、`createProject`）
- 権限: manager
- 手順:
  1. `/projects` → 「新規作成」
  2. プロジェクト名「サイトリニューアル PJ」、ステータス（既定で先頭が選択済み）、開始日 2026-08-01、終了予定日 2026-12-31、責任者未指定で「作成」
- 期待結果:
  - トースト「プロジェクトを作成しました」→ `/projects/{新規id}` へ遷移
  - DB: `project_code` = `PRJ-` + 6 桁連番、`owner_user_id` = 未指定なら操作者、`status_updated_at` = 作成時刻
- 自動化区分: 自動化可（Playwright + SQL 検証）

### PRJ-03: member のプロジェクト作成・編集 — ページ側ロールガード + Server Action での二重拒否

- 対象: `/projects/new`、`/projects/[id]/edit`（`getCurrentUser` によるページ側ロールガード）、`createProject` / `updateProject` のロールチェック
- 権限: member
- 手順:
  1. member で `/projects/new` を直接開く
  2. member で既存プロジェクトの `/projects/{id}/edit` を直接開く
  3. ページガードを迂回して、member セッションで `createProject` / `updateProject` を直接呼ぶ
- 期待結果:
  - 手順 1: フォームは表示されず「作成権限がありません」+ プロジェクト一覧へ戻るリンク（contracts の `/contracts/new` と同じ表示パターン）
  - 手順 2: フォームは表示されず「編集権限がありません」+ プロジェクト詳細へ戻るリンク
  - 手順 3: いずれもエラートースト相当「manager 以上の権限が必要です」。DB に行は作られない／更新されない（Server Action + RLS `projects_insert_manager` 相当の二重ガードはページガード追加後も維持）
- 自動化区分: 自動化可（Playwright）

### PRJ-04: 作成/編集 — バリデーション異常系

- 対象: `createProjectSchema` / `updateProjectSchema`
- 権限: manager
- 手順と期待結果:
  1. プロジェクト名を空で送信 → HTML required で送信不可。Server Action 直では「[name] プロジェクト名は必須です / 受信値: ""」形式のエラー
  2. 開始日 2026-12-01・終了予定日 2026-08-01 → 「終了予定日は開始日以降にしてください」（インライン。DB の `chk_projects_date_range` でも二重に防御）
  3. 説明 1001 文字 / メモ 2001 文字 → max 超過エラー
  4. エラー文言は `[フィールド名] メッセージ / 受信値: ...` 形式で返ること（projects 固有のエラー整形）
- 自動化区分: 自動化可（Playwright + Vitest）

### PRJ-05: ステータス遷移 — status_updated_at の更新

- 対象: `/projects/[id]/edit`（`updateProject`）
- 権限: manager
- 事前条件: プロジェクトステータスマスタに複数値（例: 進行中 / 保留 / 完了）がある
- 手順:
  1. 編集ページでステータスを「進行中」→「保留」に変更して保存
  2. 続けて名前だけ変更して保存
- 期待結果:
  - 1: トースト「保存しました」。`project_status_id` 更新 + `status_updated_at` が現在時刻に更新。詳細ページの「ステータス更新日」に反映され、ヘッダーのバッジがマスタ `color` で新ステータス表示になる
  - 2: `status_updated_at` は**不変**（ステータスが変わらない更新では触らない）
  - 変更内容は `entity_change_logs` トリガーが記録（アプリからの履歴 INSERT なし）
- 自動化区分: 自動化可（Playwright + SQL 検証）

### PRJ-06: 編集 — 楽観ロック競合

- 対象: `updateProject`（`expected_updated_at`）
- 権限: manager × 2 セッション
- 手順: DL-19 と同手順を `/projects/{id}/edit` で行う
- 期待結果:
  - 後発の保存にエラートースト「このプロジェクトは他のユーザーによって更新されています。画面を再読み込みしてから保存してください」（約 10 秒で自動消滅）。後発の変更は反映されない
  - 詳細ページの責任者 RelationField（画面表示時点の `updated_at` を使用）でも同様に競合検知される
- 自動化区分: 自動化可（Playwright 2 コンテキスト）

### PRJ-07: 削除 — admin 限定・論理削除 + is_active

- 対象: `/projects/[id]/edit` の削除ボタン、`deleteProject`
- 権限: manager / admin
- 手順:
  1. manager で編集ページ → 削除ボタンが表示されないことを確認（isAdmin のみ）
  2. admin で「削除」→ 確認ダイアログ「プロジェクトを削除」→ 「削除する」
- 期待結果:
  - トースト「プロジェクトを削除しました」→ `/projects` へ遷移
  - DB: `deleted_at` / `deleted_by` 設定 + `is_active` = false（物理削除しない）。一覧・ディール詳細のプロジェクト紐づけから消える
- 自動化区分: 自動化可（Playwright + SQL 検証）

### PRJ-08: 詳細 — メンバーの追加/削除

- 対象: `/projects/[id]`（`addProjectMember` / `removeProjectMember`）
- 権限: manager / member
- 手順:
  1. manager でプロジェクト詳細を開き、メンバーにユーザーを追加 → 削除する
  2. 同じユーザーを二重に追加しようとする
  3. member で同じ詳細ページを開く
- 期待結果:
  - 1: `project_members` に INSERT / DELETE。メンバー数見出し「メンバー（N名）」が更新される
  - 2: 追加済みユーザーは候補リストに出ない（UI 側で除外）。API 直でも UNIQUE (project_id, user_id) で拒否
  - 3: member は閲覧のみ（追加/削除コントロール非表示。editable = manager/admin）
- 自動化区分: 自動化可（Playwright + SQL 検証）

### PRJ-09: 詳細 — ディール紐づけ（ディール受注後のプロジェクト運用）

- 対象: `/projects/[id]`（`project-deals-section.tsx`、`addDealProject` / `removeDealProject`）
- 権限: manager
- 手順:
  1. プロジェクト詳細下段「紐づくディール」でディールを選択して追加する
  2. ディール未選択のまま追加を押す
  3. 追加したディールを外す
  4. 紐づけたディールを admin が論理削除した後、プロジェクト詳細を再表示する
- 期待結果:
  - 1: トースト「保存しました」。テーブルに deal_code / ディール名 / パイプラインバッジ / ステージバッジ（マスタ color）/ 金額 / 取引先名が表示される。ディール詳細側の「プロジェクト」にも同時反映
  - 2: エラートースト「ディールを選んでください」（約 10 秒で自動消滅）
  - 3: 行が消え `deal_projects` から DELETE
  - 4: 論理削除済みディールは一覧から除外される（`deleted_at === null` フィルタ）
- 自動化区分: 自動化可（Playwright + SQL 検証）

### PRJ-10: 詳細 — 不正 URL・不存在

- 対象: `/projects/[id]`
- 権限: admin
- 手順と期待結果:
  1. `/projects/abc` → 「不正なパラメータです」+ プロジェクト一覧へ戻るリンク
  2. 存在しない UUID → 「プロジェクトが見つかりません」+ 戻るリンク
- 自動化区分: 自動化可（Playwright）

## 3. 実装確認時に見つかった仕様上の留意点

テスト実施者への注記（本仕様書はすべて実装の現状に合わせている）:

1. **手動のディール作成は取引先必須**: DB の CHECK 制約（account/company/contact いずれか 1 つ）に対し、`createDealSchema` と新規フォームは `account_id` を必須にしている。company/contact 起点のディールはリード昇格経由のみ
2. **カンバン D&D の成功時はトーストなし**（ハイライトのみ）。失敗時のみエラートースト
3. **deals の削除 UI は実装済み**（admin・編集ページ内・契約ありは拒否・論理削除）
4. ~~projects の新規/編集ページにはロールガードがない~~ **2026-08-03 対応済み**: contracts（`/contracts/new`・`/contracts/[id]/edit`）と同じ型で、`/projects/new`・`/projects/[id]/edit` に `getCurrentUser` によるページ側ロールガードを追加（member はフォームを開けず「作成権限がありません」/「編集権限がありません」+ 戻るリンクを表示）。一覧の「新規作成」ボタンも `isManagerOrAbove` で活性/非活性を出し分け。Server Action（`createProject` / `updateProject`）側の `role !== "manager" && role !== "admin"` チェックと RLS は従来どおり維持し、多層防御を崩していない
5. `bulkAddMembersFromDeals`（配下ディール担当者の一括メンバー化）は Server Action として存在するが UI から呼ばれていないため、画面テストケースは設けない
