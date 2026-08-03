# E2E テスト仕様（Playwright）

画面をまたぐ業務ジャーニーの通し走行のみを扱う。画面内の細部（表示・バリデーション・権限の網羅）は
システムテスト（03〜07）の守備範囲であり、E2E では繰り返さない。

最終更新: 2026-08-03

## 1. 実行方式

| 項目 | 値 |
|---|---|
| フレームワーク | `@playwright/test`（TypeScript。§4 のとおり導入する。旧 `scripts/test-*.py` は移行後に廃止） |
| 置き場所 | `e2e/`（シナリオ 1 本 = 1 spec ファイル） |
| ベース URL | `E2E_BASE_URL`（既定 `http://localhost:2000`） |
| ブラウザ | headless Chromium、1440x900 |
| 前提 | `npx supabase start` 済み + `npx supabase db reset` 直後の状態 + `npm run dev` 起動中 |
| 認証 | ロール別に `storageState`（admin / manager / member）を global setup で作成し再利用 |
| データ規約 | 生成データは名称に接頭辞 `E2E-` を付け、シナリオ末尾で論理削除する |
| 実行コマンド | `npm run test:e2e`（スモークのみ: `npm run test:e2e -- --grep @smoke`） |

## 2. ランク定義

- **S（@smoke）**: デプロイ毎に必須（Gate 3）。基幹業務の生命線
- **A**: リリース前に対象領域へ変更がある場合に実施。nightly 自動実行の対象
- **B**: 月次または大型リリース時

## 3. シナリオ一覧

### E2E-01 [S] ログイン → ダッシュボード → ログアウト

1. 未認証で `/dashboard` へ → `/login` にリダイレクトされる
2. admin でログイン → `/dashboard` 表示、KPI カードとファネルが描画される
3. ログアウト → `/login` へ戻り、`/deals` への直アクセスが再び弾かれる

### E2E-02 [S] リード管理の基本線: 検索 → 詳細 → 社内対応の記録

1. admin で `/leads` を開く（seed 3,008 件・ページネーション 30 件表示）
2. 検索でリードを 1 件特定 → 詳細へ遷移
3. 社内対応（架電記録）を追加 → 一覧に反映・トースト表示
4. スコアが再計算されること（記録前後で値を比較）

### E2E-03 [S] リード → Deal 昇格 → Company / Contact 自動生成

1. admin で昇格対象リードの詳細を開き「商談化」を実行
2. Deal が作成され、Company / Contact が新規作成されて紐づく（Lead 段階の既存紐付けはない仕様）
3. `/deals` カンバンに新規 Deal が現れる。相手先表示は company へフォールバック（account は未作成）
4. 元リードのステージ/ステータスが昇格後の状態になる

### E2E-04 [S] 商談進行 → 契約 → Account 自動作成

1. manager で E2E-03 の Deal をステージ移動（カンバン D&D またはテーブルから変更）
2. stage_updated_at と履歴（deal_stage_histories）が更新される
3. `/contracts/new` で当該 Deal に契約を作成
4. AFTER INSERT トリガーで Account が自動作成され、Deal に紐づく
5. Deal 詳細の相手先表示が account 優先に切り替わる。`/accounts` に新規 Account が現れる

### E2E-05 [S] 権限境界の通し確認（member）

1. member でログイン
2. `/contracts` が閲覧不可（0 件 or 拒否）であること
3. `/admin` への直 URL が拒否されること（middleware）
4. 他人の company 詳細へ直 URL → **閲覧できる**（2026-08-03 変更）。
   参照は認証済み全員に広げたため（`20260803000008`）。
   続けて編集ページで保存すると「編集する権限がありません」で拒否されること
   （**書き込みの範囲は変えていない**ので、権限境界は更新の可否で見る）
5. サイドバーに管理・契約メニューが出ないこと

### E2E-06 [A] Eight 名刺 CSV 取込 → 名寄せ確認

1. admin で `/admin/leads/import` を開き、テスト用 CSV（既存事業者と同一法人番号 1 行 + 新規 2 行 + 不正 1 行）を dry-run
2. 件数・エラー行・マスタ未登録の一覧が期待どおり
3. commit → リードが作成され、法人番号一致の行は既存 Company に名寄せされる（重複 Company が増えない）
4. `㈱` 表記の行が `株式会社` に展開されて保存される

### E2E-07 [A] 連絡先の作成 → 編集 → 楽観ロック競合

1. admin で individual の連絡先を新規作成（メール・電話チャネル付き）
2. 編集ページを 2 タブで開き、片方で保存 → もう片方の保存が競合エラー（conflictErrorMessage）
3. エラートーストが自動消滅せず、閉じるボタンで消えること

### E2E-08 [A] 論理削除 → 削除済み一覧 → 復元

1. admin が E2E- 接頭辞の company を編集ページ内モーダルから削除
2. 一覧から消え、`/admin/deleted` に表示される
3. 復元 → 一覧に戻る。`entity_change_logs` に削除・復元が記録されている

### E2E-09 [A] マスタ変更の波及: color 編集 → バッジ反映

1. admin が `/admin` でステータス系マスタの color を変更
2. 該当エンティティ一覧のバッジ色が変更後の色で表示される（DB の color をそのまま使う規約の検証）

### E2E-10 [B] 問い合わせ同期 → 進捗画面

1. `/api/leads/inquiry-sync` にテストペイロードを送る（D1 連携の受け口）
2. リードが作成され `/progress/inquiry` の集計に反映される

### E2E-11 [B] キャンペーン → リード紐付け → 進捗確認

1. admin がキャンペーンを作成しリードを紐付け
2. キャンペーン詳細の集計と `/progress` 系画面の数字が一致する

## 4. 導入手順（Phase 1）

```bash
npm install -D @playwright/test
npx playwright install chromium
```

- `playwright.config.ts`: baseURL 環境変数、global setup で 3 ロールの storageState 生成
- `package.json` に `"test:e2e": "playwright test"` を追加
- CI への組み込みは test-strategy.md §7 Phase 3（supabase start が必要なため nightly）

## 5. 実装優先順位

1. E2E-01, 05（認証・権限。最小コストで多層防御を毎回確認できる）
2. E2E-03, 04（Lead → Deal → 契約 → Account はこのシステムの生命線かつ手動確認が最も面倒）
3. E2E-02, 06（日次業務と取込）
4. 残り

## 6. 実装状況（2026-08-03）

ランク S（`@smoke`）5 本を実装済み。実行コマンド `npm run test:e2e`。

| シナリオ | ファイル | 結果 | 備考 |
|---|---|---|---|
| E2E-01 | `e2e/06-login-logout.e2e.ts` | 緑 | ファイル名が 06 なのは意図的。§6.1 参照 |
| E2E-02 | `e2e/02-lead-search-activity.e2e.ts` | 緑 | シードの加点ルール不具合を検出した。§6.2 参照 |
| E2E-03 | `e2e/03-lead-promote-deal.e2e.ts` | 緑 | |
| E2E-04 | `e2e/04-deal-progress-contract.e2e.ts` | 緑 | |
| E2E-05 | `e2e/05-member-permission-boundary.e2e.ts` | 緑 | |

E2E-06〜11（ランク A/B）は未実装。

### 6.1 保存後の自動遷移（2026-08-03 修正済み）

- ~~**`router.push(id); router.refresh();` の直後連続呼び出しでクライアント遷移が固まることがある**~~
  **→ 2026-08-03 に修正した。**
  App Router では `router.refresh()` が現在ルートの再フェッチを開始するため、
  直前の `router.push()` による進行中のナビゲーションがそれに差し替わり、遷移が起きなかった。
  保存自体は成功しているので「押しても何も起きない」ように見え、二重登録を誘発する。

  **Gate 4 のプロダクトオーナー実操作で「契約・商談・連絡先の保存後に画面が変わらない」として
  報告されるまで検知できなかった。** E2E 側が「その操作自身の自動遷移を待たない」回避を
  していたため、テストは緑のまま実害だけが残っていた。
  **テストを実装の都合に合わせて緩めると、その分だけ検知できなくなる。**

  - 修正: `router.refresh()` を除去し、キャッシュ更新は Server Action の
    `revalidatePath` に寄せた（contracts / deals / contacts / companies / accounts /
    talents / campaigns / leads の CUD）
  - 例外: 同一ページ内の再描画のために単独で呼ぶ `router.refresh()`
    （タレント詳細の経歴追加など）は正しい使い方なので残している
  - **回帰検知**: E2E-05 の事業者情報作成が保存後の自動遷移を `waitForURL` で
    明示的に待つ。ここが赤くなったら同じ退行を疑う
- Tailwind preflight が `<ul>` に `list-style: none` を当てているため、Chromium が
  `list`/`listitem` の暗黙 ARIA ロールを外す（HTML-AAM 仕様どおりの挙動）。モーダル内の
  箇条書きを判定する際は `role` ではなくテキスト一致 + 適切なスコープで見る。

### 6.2 スコアリングのシード不具合（2026-08-03 修正済み）

**症状**: 架電結果を記録してもリードスコアが動かない。E2E-02 がこれを検出した。

**原因**: `supabase/seeds/01-masters.sql` の `lead_score_rules`（M26）が、
`condition_value_id` を決めるサブクエリで参照する `lead_large_segments`（M14）と
`lead_call_statuses`（M16）より **前** に置かれていた。seed は上から順に流れる 1 本の SQL なので、
INSERT 時点でこれらのテーブルは空で、サブクエリが NULL を返していた。
`recalculate_lead_score()` は `condition_value_id IS NULL` の行を評価対象外にするため、
エラーも警告も出ないまま以下 5 ルールが一生マッチしない状態だった:

- call_status: 資料送付済み(+10) / 見込み判定(+25) / アポ獲得(+40)
- large_segment: 製造業(+10) / IT・SaaS(+10)

**本番にも同じ欠落があったはず**（同じ seed を使うため）。

**対応**:

1. seed の M26 ブロックを全マスタの後ろへ移動し、順序依存であることをコメントで明記した
2. 既存環境（本番含む）は seed 再実行では直らないため、
   `20260803000004_backfill_lead_score_rule_targets.sql` で NULL 行を description から
   引き当てて補正し、`recalculate_all_lead_scores()` で全リードのスコアを揃えた

**検証済み**: 育成ステージのリード（score 10）に「アポ」の架電記録を足すと 50 になる
（修正前は 10 のまま）。db reset 後も NULL 0 件。

### 6.3 その他の確認済み事実（修正不要 or 別途要検討）

- ~~リードを Opportunity へ昇格しても昇格トーストが出ない~~ **2026-08-03 修正済み**:
  `src/actions/leads.ts` の `updateLead()` が `promoteLeadToDeal()` の後も昇格前に取得した
  stale な行を返しており、クライアントの `justPromoted` 判定が常に false になっていた
  （昇格自体は成功し Company/Contact/Deal は正しく作られるが、トーストが通常の「保存しました」になる）。
  昇格成功後にリードを取り直して返すよう修正。E2E-03 / E2E-04 は
  「商談に昇格しました」を期待する形に更新済みで、通常の保存トーストに戻ったら気づける。
- `src/actions/deals.ts` の `updateDeal`/`moveDealCard` は `role !== "admin"` の場合オーナー
  本人以外の更新を拒否する。CLAUDE.md の RLS 設計(`manager/admin は全件`) は SELECT の話であり、
  UPDATE 系の owner チェックは admin 以外は所有者限定という実装になっている。E2E-04 は
  この前提に合わせ、リード作成時点で担当者をあらかじめ manager に設定することで対応した
  （manager が他人の商談のステージを動かす操作は本仕様のままでは失敗する）。
