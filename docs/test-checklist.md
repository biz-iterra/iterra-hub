# デプロイゲート実施記録

テスト方針とゲート定義の正本は [test-strategy.md](test-strategy.md)、
詳細テストケースは [test-cases/](test-cases/) 配下。
本ファイルは**リリースごとの実施記録**だけを残す（ケース本文をここに書かない）。

旧チェックリスト（2026-07-29 版・初期リリース時の全画面確認）は
[archive/test-checklist-2026-07-29.md](archive/test-checklist-2026-07-29.md) に保存。

## 記録テンプレート

リリースごとに以下をコピーして先頭に追記する。

```markdown
## リリース: YYYY-MM-DD <概要（例: フリガナ投入 + 商談検索改善）>

- 対象コミット: <short-sha>
- 変更領域: <src/actions/deals.ts, migrations 2 本 など>
- 回帰範囲の判定: test-strategy.md §5 により <02, 05, 08(S)> を実施

| ゲート | 実施日 | 実施者 | 結果 | 備考 |
|---|---|---|---|---|
| Gate 1 コミット前 4 チェック | | | | |
| Gate 2 CI | | | 自動 | run URL |
| Gate 3-1 db reset + 結合 (02) | | | | 実施ケース ID を列挙 |
| Gate 3-2 システム (03〜07 該当章) | | | | 実施ケース ID を列挙 |
| Gate 3-3 E2E スモーク (08 ランク S) | | | | |
| Gate 4 受入 (09) | | | | 省略時は理由を記載 |
| Gate 5 デプロイ後スモーク | | | | |

### 検出した不具合と処置
- <ケース ID / 内容 / 差し戻し先 / 再検証結果>（なければ「なし」）

### テストケースへの追記
- <この不具合を再発防止するために test-cases/*.md へ追加したケース>（なければ「なし」）
```

---

## 実施履歴

（新しいリリースを上に追記）

## リリース候補: 2026-08-03 レスポンシブ対応 + テスト基盤整備 + 整合性修正（feat/responsive-ui）

- 対象コミット: `2ec8da8`（main 比 5 コミット）+ 本ゲートで追加した修正（未コミット）
- 変更領域: `src/app` 63 / `src/lib` 17 / `src/components` 12 / `src/actions` 8 /
  `supabase/migrations` 4（+ 本ゲートで **3 本追加**: `20260803000005`〜`000007`）/
  `supabase/seeds/01-masters.sql` / `e2e` 一式
- 回帰範囲の判定: test-strategy.md §5 により **02 全体 + RLS 全ケース + E2E スモーク（08 ランク S）**
  を実施（`supabase/migrations/**` 変更のため最も広い範囲に倒した）

| ゲート | 実施日 | 実施者 | 結果 | 備考 |
|---|---|---|---|---|
| Gate 1 コミット前 4 チェック | 2026-08-03 | Claude | 通過 | typecheck 0 / Vitest 21 files 229 tests / build 成功 / lint 0（本体のみ。下記「環境ノイズ」参照） |
| Gate 2 CI | — | — | 未実施 | 未 push のため。push 時に要確認 |
| Gate 3-1 db reset + 結合 (02) | 2026-08-03 | Claude | 通過 | IT-01〜45 / IT-RLS-01〜21 / Q1〜Q14 = **242 アサーション全 PASS**（修正 3 件の適用後に db reset から再実行） |
| Gate 3-2 システム (03〜07 該当章) | 2026-08-03 | Claude | **E2E スモークで代替**（ユーザー判断） | 変更が全画面に及び手動範囲が広いため、08 ランク S の通し走行をもって代替とした |
| Gate 3-3 E2E スモーク (08 ランク S) | 2026-08-03 | Claude | 通過 | E2E-01〜05 の 5 本すべて緑。修正 3 件の適用後にも再実行して回帰なしを確認 |
| Gate 4 受入 (09) | 2026-08-03 | Claude（ブラウザ実機） | **条件付き合格** | UAT-01 / 03 の一部を実施。下記「Gate 4 の実施内容」参照 |
| Gate 5 デプロイ後スモーク | — | — | 未実施 | 未デプロイ |

### Gate 4 の実施内容（ブラウザ実機確認、localhost:2000）

実施できたもの:

| 確認項目 | ロール | 結果 |
|---|---|---|
| ログイン → ダッシュボードで担当状況を把握（UAT-01-1） | member | 合格。KPI が担当分のみ（商談 1 / 連絡先 1 / 事業者 0 / 取引先 0） |
| **事業者情報の新規作成**（修正②の実機確認） | member | 合格。`CMP-000005` が採番され作成できた。修正前は UNIQUE 衝突で作成不能だった |
| 会社名の正式表記展開・法人格の自動判定 | member | 合格。`㈱UAT受入確認` → `株式会社UAT受入確認`、法人格「株式会社」が自動設定 |
| ステータスバッジの色がマスタ由来 | member | 合格。「未確認」がグレー（`#6B7280`）で表示 |
| **担当外リードが見えない**（UAT-01-5 / 修正③の実機確認） | member | 合格。修正前は 3,008 件全件表示、修正後は「リードが見つかりません」 |
| 権限境界（サイドバー） | member / manager | 合格。member には契約メニューが出ず、manager には出る |
| リード全件の可視性 | manager | 合格。3,008 件表示（RLS どおり） |
| 契約成立時の区分自動付与（修正①） | — | 合格（DB 確認）。E2E-04 が作った `ACC-000002` に「顧客」が `assigned_by_contract=true` で付与 |

**実施できなかったもの（環境制約）**: UAT-03 の通し操作（リード新規作成 → 商談化 → 契約）、UAT-04、UAT-05。
Chrome 拡張経由のクリックがリード系画面の React イベントハンドラに届かず、
「作成」ボタンでも一覧の行クリックでも**ネットワークリクエストが 1 件も発生しない**状態だった
（事業者情報の作成は同じ手順で成功しているため、フォーム実装の差によるものと見られる）。
同じ操作は Playwright の E2E-02 / 03 / 04 で緑になっており、アプリの不具合とは断定していない。
**UAT-02（実 CSV の名刺取込）と UAT-06（D1 連携）は外部データ依存のため今回の対象外。**

→ 残りの UAT はプロダクトオーナーの実操作で実施する必要がある。

### 検出した不具合と処置

0. **【重大・セキュリティ】member が他人の担当リードを全件閲覧できた**（Gate 4 のブラウザ実機確認が検出）
   - 原因: `v_leads_with_category` に `security_invoker` が付いておらず、ビューが所有者（postgres）権限で
     基底テーブルを読むため **RLS が一切効いていなかった**。同スキーマの `activity_feed` には付いている
   - 実測: 同一 member から `SELECT count(*) FROM leads` = 0 件、
     `FROM v_leads_with_category` = **3,008 件**。`/leads` 一覧の `getLeads` は認証チェックのみで
     可視範囲を RLS に委ねる設計のため、そのまま穴になっていた
   - 影響: member ロールが担当外リードの企業名・担当者名・電話番号を含む全件を閲覧できる。**本番も同様のはず**
   - 処置: `20260803000007_lead_view_security_invoker.sql`。適用後の実測は
     member 0 件 / 小川（2,758 件担当）2,758 件 / manager 3,008 件で設計どおり。
     付け忘れ再発検出のため、security_invoker 未設定ビューを警告する DO ブロックも同マイグレーションに入れた

1. **【重大】契約が成立しても取引先に区分が付かない**（IT-36 / IT-39 が検出）
   - 原因: `20260731000008` が `account_role_types.pipeline_type_id` を
     `(SELECT id FROM pipeline_types WHERE name='営業' …)` で埋めているが、`pipeline_types` は
     seed でしか投入されない。`db reset` は「マイグレーション → seed」の順なので必ず NULL になる。
     `ON CONFLICT (code) DO NOTHING` のため seed 投入後も回復しない
   - 影響: `ensure_account_on_contract()` の区分付与が一度も動いていない
     （営業→顧客 / 仕入れ→仕入れ先 / 業務委託→外注先）。**本番も同様のはず**
   - 処置: seed 末尾に紐付け UPDATE を追加（`db reset` 経路）+
     `20260803000005_backfill_account_role_type_pipelines.sql`（既存環境）。再検証で IT-36/39 緑

2. **【重大】member ロールが事業者情報・連絡先などを新規作成できない**（IT-RLS-04 が検出）
   - 原因: `generate_*_code()` 6 関数が SECURITY INVOKER。`SELECT MAX(...)` に RLS がかかり、
     member には自分が owner の行しか見えないため既存より小さい番号を採番 → UNIQUE 衝突
   - 影響: INSERT ポリシー上は「認証済み全員」が作れる建て付けなのに、実際は member が作成不能
   - 処置: `20260803000006_number_generators_bypass_rls.sql` で 6 関数を
     SECURITY DEFINER + `SET search_path` に変更。再検証で緑

3. **テストケース文書（02）の記載が実装と食い違っていた**（多数）
   - 事前データ SQL が NOT NULL 列を欠く（`companies.company_status_id` /
     `contacts.contact_status_id` / `leads.stage_id` / `deals` の 4 列 / `lead_sources.slug` ほか）
   - `company_statuses` の id を `e1…01` と固定 UUID で書いていたが、実際は `gen_random_uuid()` 由来
   - `lead_score_rules` に存在しない `name` 列を使っていた
   - IT-28 の「下方クリップ」は `score_delta >= 0` の CHECK により**到達不能**
   - IT-RLS-20 の anon は「0 行」ではなく **42501**（GRANT を与えていないため）
   - 処置: すべて `docs/test-cases/02-integration-db.md` に反映（§1.1 に必須列の表を新設、
     §7 に申し送り 7・8 を追加）

### テストケースへの追記

- `02-integration-db.md` §1.1: 「事前データを直接 INSERT するときの必須列」表を新設。
  ステータス系マスタの id を UUID 直書きしない旨を明記
- 同 §7-2: 採番の RLS 問題（修正済み）を追記。
  **採番のような「誰が実行しても同じであるべき値」を RLS のかかる SELECT で作らない**
- 同 §7-7: **マイグレーションから seed のマスタを参照してはいけない**。
  `lead_score_rules`（08 §6.2）に続き 2 件目。この形の欠落は Q13 で検出できる
- 同 §7-8: `score_delta` の CHECK により下方クリップが到達不能である旨
- 同 §5 に **IT-RLS-21（ビュー経由でも RLS が効くこと）を新設**。
  基底テーブルとビューの件数一致をロール別に見る + 全ビューの `security_invoker` を検査する
- 同 §7-9: **ビューは既定で RLS をバイパスする**。
  `WITH (security_invoker = true)` が無いとポリシーを書いていても無効。
  `CREATE OR REPLACE` で reloptions が落ちることがあるため再作成のたびに確認する

### 環境ノイズ（不具合ではない）

`.claude/worktrees/fix-lead-status-gmail/`（ブランチ `fix/lead-status-and-gmail`、
本ゲート実施中の 19:45 に出現）を Vitest と ESLint が拾い、
テスト件数が 2 倍（21→42 files）に、lint が 11 errors で失敗する。
検出されたエラーはすべて worktree 側の `admin-view.tsx` で、本体は 0 件。
CI は clone するため影響しないが、ローカルでは
`npx eslint src e2e scripts` / `npx vitest run --dir src` のように対象を絞る必要がある。
恒久対応（ESLint の `ignores` と Vitest の `exclude` に `.claude/worktrees` を足す）は未実施。
