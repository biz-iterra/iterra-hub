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

## リリース候補: 2026-08-04（4 回目） freee 会計連携（取引先の突合）

- 対象コミット: 未コミット（作業ツリー。T-0021）
- 変更領域: `supabase/migrations` 1 本（`20260805000001`）/ `src/lib/freee/*` /
  `src/actions/freee.ts` / `src/app/api/freee/{auth,callback,sync}` /
  `src/app/(app)/admin/freee/**` / `middleware.ts`（matcher に `api/freee/sync`）/
  `sidebar.tsx` / `header.tsx` / `list-sort.ts` / `relations.ts` / `database.generated.ts` /
  `.env.example` / `.env.local.example` / `docker-compose.yml`
- 回帰範囲の判定: test-strategy.md §5 により **02（freee の DB 関数）+ 07（管理・共通基盤）
  + E2E スモーク**。共通部分（middleware / サイドバー）に触れたため E2E は省略しない

| ゲート | 実施日 | 実施者 | 結果 | 備考 |
|---|---|---|---|---|
| Gate 1 コミット前 4 チェック | 2026-08-04 | Claude | 通過 | typecheck 0 / Vitest **29 files 341 tests** / build 成功 / lint 0 |
| Gate 2 CI | — | — | **未実施** | 未コミットのため |
| Gate 3-1 db reset + 結合 (02) | 2026-08-04 | Claude | 通過 | **IT-FREEE-01 / IT-FREEE-02**（下記）。`migration up` で正規適用し直して検証 |
| Gate 3-2 システム (03〜07 該当章) | 2026-08-04 | Claude | **一部未実施** | FRE-01〜06 は **freee の実接続が要るため未実施**（本番の認証情報とアプリ登録待ち） |
| Gate 3-3 E2E スモーク (08 ランク S) | 2026-08-04 | Claude | 通過 | **5 本全緑**（1.9 分）。middleware / サイドバーの変更による回帰なし |
| Gate 4 受入 (09) | — | — | 未実施 | 実接続後にまとめて |
| Gate 5 デプロイ後スモーク | — | — | 未実施 | — |

### 検出した不具合と処置

1. **マイグレーションがローカル DB に手で流されただけで履歴に無かった**（前セッションの
   中断による）。`supabase migration up` が `relation "freee_connections" already exists` で
   落ちて発覚。オブジェクトを DROP して `migration up` で正規に適用し直し、**SQL 全体が
   最初から最後まで通ることを確認**した。→ 処置済み
2. **`is_admin()` の NULL 伝播で権限チェックがすり抜ける**（`confirm_freee_partner_link` /
   `register_freee_partner_company`）。`is_admin()` は `crm_users` に行の無い認証ユーザーに
   対して NULL を返し、`IF NOT is_admin()` は分岐しない。検証中、拒否の理由が権限では
   なく外部キー違反だったことから判明。`COALESCE(is_admin(), FALSE)` に修正。あわせて
   確定系 3 関数に `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO authenticated` を追加。→ 処置済み
3. **候補検出が同じ会社を複数行返していた**（名称も電話も一致する場合）。画面に同じ会社が
   並んで選択の助けにならないため、`DISTINCT ON` で 1 社 1 行にし、最も強い理由
   （名称 > ドメイン > 電話）を返すよう修正。→ 処置済み
4. **突合一覧の検索語をサニタイズしていなかった**。`.or()` に生の入力を埋めており、
   `,` `(` `)` `.` を含む語でフィルタ式が壊れる。他の一覧と同じく
   `buildIlikePattern()`（`src/lib/search-query.ts`）を通すよう修正。→ 処置済み
5. `linked_by` に呼び出し元が渡した値を優先していた（`COALESCE(p_actor, auth.uid())`）。
   監査証跡なので実行者を優先する順（`COALESCE(auth.uid(), p_actor)`）に変更。→ 処置済み

### テストケースへの追記

- `01-unit.md` **UT-61 / UT-62**（インボイス番号の形式判定と法人番号の導出 / `toPartnerRow`）
- `02-integration-db.md` **IT-FREEE-01 / IT-FREEE-02**（取込と自動紐付け / 紐付け操作の権限と副作用）。
  IT-FREEE-02 には「**拒否が権限の文言で起きること**を確認する」を明記した（上記 2 の再発防止）
- `07-system-platform-admin.md` **FRE-01〜06**（設定画面・権限・突合一覧・3 つの操作・手動同期・定期同期エンドポイント）

### 残作業（本番反映の前に必要）

1. freee 開発者コンソールでアプリを作成し、コールバック URI に
   `https://hub.iterra.online/api/freee/callback`（開発機を使う場合は
   `http://localhost:2000/api/freee/callback` も）を登録する — **ユーザー作業**
2. `FREEE_CLIENT_ID` / `FREEE_CLIENT_SECRET` / `FREEE_TOKEN_ENCRYPTION_KEY` /
   `FREEE_SYNC_CRON_SECRET` を Bitwarden へ登録し、NAS の `.env` へ転記する
   （`docs/secrets-management.md`）— **ユーザー作業**
3. 本番 DB へ `20260805000001` を適用する
4. NAS のタスクスケジューラに日次（差分）・週次（全件）を登録する（`deployment-nas.md` §8.0.1）
5. 接続後に FRE-01〜06 を実施する

## リリース候補: 2026-08-04（3 回目） 名刺取込の非同期化

- 対象コミット: `f9ccd1e`
- 起点: **利用者の指摘「なぜ重い処理を非同期でやらないのか」**（T-0019）。
  同期実行のまま制限に当たるたび回避策を足してきたが、HTTP 層のタイムアウトは
  DB 側では外せず、行数が増えれば再発する構造だった
- 変更領域: `supabase/migrations` 1 本（`20260804000002`）/ `src/actions/leads/eight-import.ts` /
  `src/app/(app)/admin/leads/import/eight-import-view.tsx`
- 回帰範囲の判定: test-strategy.md §5 により **02 全体 + 06 の該当章 + E2E スモーク**

| ゲート | 実施日 | 実施者 | 結果 | 備考 |
|---|---|---|---|---|
| Gate 1 コミット前 4 チェック | 2026-08-04 | Claude | 通過 | typecheck 0 / Vitest **28 files 321 tests** / build 成功 / lint 0 |
| Gate 2 CI | 2026-08-04 | GitHub Actions | 通過 | `f9ccd1e`。CI / Docker Publish とも success |
| Gate 3-1 db reset + 結合 (02) | 2026-08-04 | Claude | 通過 | **IT-JOB-01**（下記）。`db reset` 後も cron 登録・ポリシーが再現 |
| Gate 3-2 システム (03〜07 該当章) | 2026-08-04 | Claude | 実機で確認 | 587 行の取込を画面から通した（下記） |
| Gate 3-3 E2E スモーク (08 ランク S) | 2026-08-04 | Claude | 通過 | **5 本全緑**（2.0 分） |
| Gate 4 受入 (09) | | | | 実 CSV での確認（T-0005）を本番で行う |
| Gate 5 デプロイ後スモーク | | | 実施中 | DB 適用済み（`20260804000002`）。**NAS のイメージ更新待ち** |

### 本番反映の記録（2026-08-04、3 回目）

| 手順 | 結果 |
|---|---|
| `npx supabase db push` | `20260804000002` を適用 |
| `/api/health?deep=1` | `{"status":"ok","database":"ok"}` |
| NAS のイメージ更新 | 待ち（`f9ccd1e` のイメージが GHCR にある） |

**この変更はアプリ側の更新が要る。** DB にジョブ表と cron を入れても、
アプリが古いままでは Server Action が従来どおり同期実行するため、症状は変わらない。

### IT-JOB-01 の実施結果（2026-08-04）

| 確認 | 結果 |
|---|---|
| cron 登録 | `process_lead_import_jobs` / `* * * * *` / active |
| 投入直後 | `queued` / attempts 0 / started_at NULL。**画面は即座に応答**（待たされない） |
| ワーカーが拾う | 次の分の 00 秒に起動し、**587 件・名刺 587 枚**を取り込んで `succeeded` |
| 空振り | 待ちが無いとき `0` を返す（落ちない） |
| **失敗時に中途半端な取込を残さない** | payload を壊して実行 → `failed` + 理由が入り、**leads は増えない**（EXCEPTION で巻き戻る） |
| RLS | SELECT / INSERT / DELETE の 3 ポリシーのみ。**UPDATE は誰にも無い**（状態を書くのはワーカーだけ） |
| 多重起動（SKIP LOCKED） | **未実施**。2 セッション同時実行の検証手段が要る（`npm run test:db` の整備待ち） |

### 画面での確認（2026-08-04）

- 587 行の CSV を投入 → **即座に「取込の順番を待っています / この画面を閉じても取込は続きます」**
- ワーカー完了後、ポーリングが拾って「取込が完了しました 新規 587 件」＋成功トースト
- 取込履歴が初期表示のままだったため、完了時に `router.refresh()` を呼ぶよう修正

### E2E が 2 回続けて赤くなった件（実装の問題ではない）

global setup のログインがタイムアウトし、手動でも Supabase auth へのリクエストが
飛ばなかった。**dev サーバーを起動したまま `npm run build` を回したため、
同じ `.next` を共有する dev 側の状態が壊れていた。**
dev を止めて `.next` を消し、起動し直したら 5 本とも緑。
切り分け方と再発防止は `test-cases/08-e2e-scenarios.md` §6.0.1。

## リリース候補: 2026-08-04（2 回目） 取込タイムアウト + エラー文言の全面適用

- 対象コミット: `65a822b`（`bebc236` からの 3 コミット）
- 起点: **Gate 5 で検出した本番の不具合 2 件**（T-0001 / T-0002）。台帳は `docs/tasks.md`
- 変更領域: `supabase/migrations` 1 本（`20260804000001`）/ `src/actions/**` 全域の
  エラー返却経路 / `src/lib/gmail/sync.ts` / `vitest.config.ts`（`@/` の解決）
- 回帰範囲の判定: test-strategy.md §5 により **02 全体 + E2E スモーク**
  （`supabase/migrations/**` と全 Server Action にまたがる変更のため）

| ゲート | 実施日 | 実施者 | 結果 | 備考 |
|---|---|---|---|---|
| Gate 1 コミット前 4 チェック | 2026-08-04 | Claude | 通過 | typecheck 0 / Vitest **28 files 321 tests** / build 成功 / lint 0 |
| Gate 2 CI | 2026-08-04 | GitHub Actions | 通過 | `97d81c8`。CI / Docker Publish とも success |
| Gate 3-1 db reset + 結合 (02) | 2026-08-04 | Claude | 通過 | **IT-PERF-01 合格**。`db reset` 後も 5 関数に制限が入り、`search_path` も保たれる |
| Gate 3-2 システム (03〜07 該当章) | 2026-08-04 | Claude | E2E スモークで代替 | エラー返却経路の変更は型で担保。文言は §4 の表が正本 |
| Gate 3-3 E2E スモーク (08 ランク S) | 2026-08-04 | Claude | 通過 | **5 本全緑**（2.1 分） |
| Gate 4 受入 (09) | | | | 名刺取込の実 CSV 確認（T-0005）を本番で行う |
| Gate 5 デプロイ後スモーク | | | 実施中 | DB 適用済み（`20260804000001`）。**NAS のイメージ更新待ち** |

### 本番反映の記録（2026-08-04、2 回目）

| 手順 | 結果 |
|---|---|
| `npx supabase db push` | `20260804000001` を適用。リモートに反映を確認 |
| `/api/health?deep=1` | `{"status":"ok","database":"ok"}` |
| NAS のイメージ更新 | 待ち（`97d81c8` のイメージが GHCR にある） |

**DB 側（取込のタイムアウト）はアプリ更新を待たずに効く。** エラー文言の日本語化は
アプリ側の変更なので、イメージを更新するまで反映されない。

**エラー文言の変更をどう確かめたか**: 192 箇所の置換は型チェックと lint で
構文の正しさを担保し、`toUserMessage()` 自体の変換規則は既存の単体テスト
（`src/lib/db-error.test.ts` の 21 ケース）が担保している。**変換規則は変えていない**ため、
今回の変更点は「通す経路が増えた」ことに限られる。

## リリース候補: 2026-08-04 一覧 UX / 名刺取込 / エラー文言の統合（feat/list-ux）

- 対象コミット: `7c4a6e5`（`d1446b9` = `feat/list-ux` のマージ + 本ゲートで追加した 5 コミット）
- 引き継ぎ: 別エージェントからのエスカレーション（`docs/handoff-list-ux-and-fixes.md` として
  参照されていたが、リポジトリにはコミットされていない。要点は本節に転記済み）
- 変更領域: 一覧の URL クエリ化（`useListView` / `list-sort.ts`）/ マスタ登録の必須カラム /
  エラー文言の日本語化（`db-error.ts` / `docs/error-messages.md`）/ Gmail 同期 /
  名刺取込のサイズ上限（`next.config.ts` の `bodySizeLimit` 16mb）/
  `supabase/migrations` 2 本（`20260803000020` `20260803000021`）
- 回帰範囲の判定: test-strategy.md §5 により **02 全体 + RLS 全ケース + E2E スモーク**
  （`supabase/migrations/**` と `src/lib/supabase/**` 相当の広い変更のため）

| ゲート | 実施日 | 実施者 | 結果 | 備考 |
|---|---|---|---|---|
| Gate 1 コミット前 4 チェック | 2026-08-04 | Claude | 通過 | typecheck 0 / Vitest **28 files 321 tests** / build 成功 / lint 0。**下記の不具合修正後に再実行して通過** |
| Gate 2 CI | 2026-08-04 | GitHub Actions | 通過 | `7c4a6e5` を push。CI success（1m34s） |
| Gate 3-1 db reset + 結合 (02) | 2026-08-04 | Claude | 通過 | **258 アサーション全 PASS**（IT-RLS-22 の 16 件を含む） |
| Gate 3-2 システム (03〜07 該当章) | 2026-08-04 | Claude | E2E スモークで代替 | 前リリースと同じ判断 |
| Gate 3-3 E2E スモーク (08 ランク S) | 2026-08-04 | Claude | 通過 | **5 本全緑**（1.3 分）。初回は 3 本赤 → 下記の処置を経て緑 |
| Gate 4 受入 (09) | 2026-08-04 | Claude | 一部を本番へ持ち越し | 機械確認は合格。名刺取込と楽観ロックは**本番で確認する判断**（ユーザー） |
| Gate 5 デプロイ後スモーク | 2026-08-04 | Claude / 利用者 | **不具合を検出** | 名刺取込が statement timeout で失敗。§ Gate 5 の検出 |

### 本番反映の記録（2026-08-04）

| 手順 | 結果 |
|---|---|
| 適用前バックアップ（`db-backup.yml` を手動実行） | success（run 30830514171） |
| `npx supabase db push` | **10 本適用**（`20260803000001`〜`000008` + `000020` `000021`） |
| 適用後の本数照合 | ローカル 128 / リモート 128、未適用 0、最新 `20260803000021`。**out-of-order のスキップなし** |
| `/api/health?deep=1`（アプリ更新前） | `{"status":"ok","database":"ok"}` |
| NAS のイメージ更新 | 完了（利用者が実施） |

`docker-compose.yml` に差分がないため（環境変数の増減なし）、compose の差し替えは不要。

### Gate 5 の検出（2026-08-04）

**名刺取込が本番で失敗した。** 画面には
`取込に失敗しました: canceling statement due to statement timeout` と出た。
2 つの問題が重なっている。

**1. 8 秒で打ち切られていた（T-0001）**

PostgREST は `authenticator` ロールで接続してから `SET ROLE service_role` するため、
**service_role で呼んでも `authenticator` の `statement_timeout = 8s` が効く**。
RLS を避けるために `createAdminClient()` へ切り替えても 8 秒の壁は消えていなかった
（この誤解が「service_role にすれば大量取込が通る」という前提を作っていた）。

処置: 一括処理の関数にだけ実行時間の制限を与える（`20260804000001`）。
ロール側の設定は変えない。検証は `test-cases/02-integration-db.md` の IT-PERF-01。

**2. 英語の生エラーがそのまま画面に出た（T-0002）**

`toUserMessage()` は `masters.ts` の 4 箇所にしか入っておらず、
**31 ファイル 192 箇所が `error.message` を素通しで返していた**。
CLAUDE.md に規約はあったが実装に行き渡っていなかった。

処置: Server Action が DB エラーを返す経路をすべて `toUserMessage()` 経由に統一
（削除系は `operation: "delete"` も渡す）。適用範囲は `docs/error-messages.md` §4。

**再発防止**: 依頼・不具合を台帳（`docs/tasks.md`）で追う体制を作った
（`docs/task-management.md`）。「実装した」と「本番で使える」を別の列で持つ。

### Gate 3-3 で検出した実装の不具合と処置（2026-08-04）

**一覧の条件を続けて変えると、直前の変更が URL から消える。**
E2E-02 / 03 / 04 が同時に赤くなって判明した。今回のリリースで入れた
「一覧の条件を URL に載せる」変更（`useListParams` / `useListView`）に由来する退行。

- **再現**: 表示モードを「テーブル」に切り替えた直後に検索する → カンバン表示に戻る。
  検索に限らず「ステージを選んだ直後にステータスを選ぶ」「並び替えた直後にページを送る」も同じ
- **原因**: `router.replace` はサーバーコンポーネントの取り直しが終わってから履歴を
  書き換えるため、続けて操作すると直前の変更が `searchParams` にも `window.location` にも
  現れていない。`apply()` がそれを起点にしていたため、間の変更が捨てられていた
- **処置**: 未反映の条件を ref に保持し、次の変更をそこへ重ねる
  （URL に現れたら ref を捨てて URL を正に戻す）。`src/hooks/useListParams.ts`
- 機序と再発防止は `docs/test-cases/08-e2e-scenarios.md § 6.0`

**未修正で残した論点**: 検索欄に打鍵してから 300ms 以内に行を押すと、debounce 明けの
`router.replace` がクリックによる遷移を打ち消して詳細ページへ入れない。
実操作でこの速さは出にくいため今回は記録のみ（08 § 6.0 に修正案）。

### Gate 4 実施手順（2026-08-04 リリース分）

対象は今回の変更領域に絞る。UAT-03（リード→契約）は E2E-04 が通し確認済み、
UAT-06（問い合わせ連携）は今回変更なしのため対象外。
実施環境は**ローカル**（`npm run dev` / `npx supabase db reset` 直後）。
seed のテストユーザー（admin / manager / member、password123）を使う。

**A. 一覧の条件保持（UAT-01 / 04。今回の主変更 + 不具合修正の確認）**

1. `/leads` でステージ・ステータス・担当者を絞り、検索語も入れる
2. 一覧の行から詳細へ入り、ブラウザの戻るで一覧へ戻る → **条件がすべて残っていること**
3. 列見出しを押して並び替える → URL に `sort=` が付き、並びが変わること
4. **表示モードを「テーブル」に切り替えた直後に検索する → テーブル表示のままであること**
   （カンバンに戻ったら faef69b の退行）
5. **ステージを選んだ直後に続けてステータスを選ぶ → ステージが消えないこと**
6. 条件付きの URL をコピーして新しいタブで開く → 同じ絞り込みで表示されること
7. `/deals` `/contacts` `/companies` `/accounts` `/contracts` `/talents` でも 1〜2 を確認
8. `/talents` でポテンシャルタイプの絞り込みが効くこと

**B. 名刺取込（UAT-02）**

1. `/admin/leads/import` で実 CSV を dry-run → 件数・エラー行・未登録マスタが出ること
2. **取込中に画面が固まらず、完了まで進むこと**（a4740b7 の修正確認）
3. commit 後、法人番号一致の行が既存事業者へ名寄せされ、重複が増えていないこと
4. `㈱` 表記が `株式会社` に開かれて保存されていること

**C. マスタと表示（UAT-05）**

1. `/admin` でステータス系マスタを**色を空欄のまま**保存 → 自動で色が付くこと（df4109c）
2. その色が該当エンティティ一覧のバッジに反映されること
3. 必須欄の印（`*`）が実際の必須項目と一致していること（6e33023）
4. マスタ登録で必須カラムを空にすると、**日本語のエラー文言**が出ること（英語の生エラーが出ない）

**D. エラー文言（全般）**

1. 楽観ロック競合（同じ行を 2 タブで開いて両方保存）→「他のユーザーによって更新されています」
2. エラートーストが約 10 秒で自動消滅し、閉じるボタンでも消せること
3. 画面に出る文言が `docs/error-messages.md` と一致していること

**判定**: 各項目を 合格 / 条件付き合格（差異を明記）/ 不合格 で記録する。
不合格があれば test-strategy.md §9 に従い Gate 1 からやり直す。

| シナリオ | 実施日 | 結果 | 指摘 |
|---|---|---|---|
| A 一覧の条件保持 | 2026-08-04 | 機械確認は合格（下記） | プロダクトオーナーの実操作は未 |
| B 名刺取込 | | 未実施 | 実 CSV が要るためプロダクトオーナー待ち |
| C マスタと表示 | 2026-08-04 | 機械確認は合格（下記） | |
| D エラー文言 | 2026-08-04 | 一部のみ | 楽観ロック競合（2 タブ）は未 |

**qa による事前確認（2026-08-04、ローカル・admin ロール）**

判定の主体はプロダクトオーナーだが、機械的に判定できる項目を先に確認した。

| 項目 | 結果 |
|---|---|
| A-2 商談一覧で条件を付け、詳細へ入って戻る | 合格。`stageId` + `statusId` + `view=table` がすべて復元 |
| A-3 列見出しで並び替え | 合格。既存条件を保ったまま `sort=amount:asc` が付く |
| A-5 **ステージを選んだ直後に続けてステータスを選ぶ** | **合格。3 条件とも残る**（修正前はここで消えていた） |
| A-8 タレントのポテンシャルタイプ絞り込み | 合格。`?potentialType=IL%2B` が載り該当 1 件 |
| C-1 バッジ色を空欄で保存 | 合格。既存 3 色と重複しない `#2563EB` が自動付与 |
| C-3 必須マークの表示 | 合格。マスタ追加の「名前 *」に付く |
| C-4 必須未入力で保存 | 合格。「名称を入力してください」を**インライン**表示（トーストにしない規約どおり） |
| 削除の確認モーダルと成功トースト | 合格。確認用に足した行は削除して元に戻した |

**確認中に出た事象（アプリの不具合ではない）**: dev オーバーレイに hydration mismatch が
出るが、差分は `<body>` の `cz-shortcut-listen="true"`。**ブラウザ拡張が挿入した属性**で、
React 自身が原因候補に挙げているケース。本番ビルドとは無関係。

### Gate 1 の検査漏れと処置（2026-08-04）

`.claude/worktrees/` 配下の別ブランチ作業コピーが lint と Vitest の対象に入っていた。

- lint は生成物（worktree 側の `.next`）由来のエラー **4,353 件**で赤。`src/` 由来は 0 件
- Vitest は同じテストを二重実行していた（28 → **56 ファイル**）
- 処置: `eslint.config.mjs` の `globalIgnores` に `.claude/**` `test-results/**`
  `playwright-report/**` を追加。`vitest.config.ts` を新設して `exclude` に `.claude/**` を追加
- **ローカルに worktree がある間だけ起きる**（CI では作られないため素通りしていた）

### handoff §3 の依頼（統合後の IT-RLS-21 再実施）への回答

`20260803000021` は「実行時点の `pg_policies`」を書き換えるため、
main 側の `20260803000005`〜`000008`（タイムスタンプが前）が作るポリシーも変換対象に入る。
**統合後の状態で再検証し、差分なしを確認した。**

- 裸の `auth.uid()` / `is_admin()` / `is_manager_or_above()`: **0 件**
- InitPlan 化済み: **205 件**（全 300 ポリシー中。残りは `true` や引数あり関数で対象外）
- 引数あり関数（`is_lead_accessible(lead_id)` 等）が包まれていないこと: 確認済み
- ロール別可視件数: member はリード 0 件・顧客情報は全件・`financial_info` 0 件、
  小川は担当 2,758 件、manager は 3,008 件。**ビューと基底テーブルの件数も一致**
- 書き込み範囲が広がっていないこと（他人の行の UPDATE / DELETE が 0 行、マスタ INSERT が 42501）

### 統合時に見つかった不整合と処置

1. **`IT-RLS-21` の番号衝突** — 双方が同じ番号で別のケースを起票していた
   （main 側「ビュー経由でも RLS が効く」/ list-ux 側「述語の InitPlan 化」）。
   後者を **IT-RLS-22** へ振り直した
2. **CLAUDE.md の従属テーブル記述の矛盾** — main 側で参照を全員可にした際、
   「従属テーブルは親の `owner_user_id` を参照して制限」という旧記述が残っていた。
   書き込みに限る旨へ修正
3. **E2E が `RequiredMark` に追随していなかった** — list-ux 側でラベルの `*` が
   コンポーネント化され、ラベルの textContent が「リード名 *（必須）」に変わった。
   `fieldByLabel` は `^リード名 \*$` の厳密一致だったため全シナリオが壊れる状態だった。
   ヘルパー側で必須マークの有無を吸収するようにした（呼び出し側は変更不要）
4. `expectErrorToastAndClose` のコメントが「エラートーストは自動消滅しない」のまま
   だったため、10 秒自動消滅に変わった旨へ更新
5. **E2E が一覧の検索反映を待っていなかった** — 絞り込み前に並んでいた行を押していたため、
   「検索で 1 件に特定してから選ぶ」という手順自体を通っていなかった。
   `searchInList()`（`e2e/helpers.ts`）で反映を待ってから押す形にした。
   この待ちを入れたことで上記の実装不具合が表に出た

## リリース候補: 2026-08-03 レスポンシブ対応 + テスト基盤整備 + 整合性修正（feat/responsive-ui）

- 対象コミット: `2ec8da8`（main 比 5 コミット）+ 本ゲートで追加した修正
  （`f424bd8` / `3d8cced` と、Gate 4 の指摘に対する修正）
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
| Gate 4 受入 (09) | 2026-08-03 | Claude + プロダクトオーナー | **合格**（差し戻し 1 回） | 実操作で 4 件の指摘 → 3 件を不具合として修正、1 件は仕様変更。**修正後の再確認で合格**。下記参照 |
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

#### プロダクトオーナーの実操作で報告された事象（2026-08-03）

| 報告 | 判定 | 処置 | 再確認 |
|---|---|---|---|
| 契約の新規追加で「保存」を押しても詳細ページに遷移しない | **不合格** | 不具合 4 として修正 | **合格** |
| 商談の新規作成後に画面遷移しない | **不合格** | 同上 | **合格** |
| 連絡先の新規作成後に画面遷移しない | **不合格** | 同上 | **合格** |
| member で取引先を選択できない | **仕様どおり。ただし業務が回らない** | 不具合 5 として仕様変更 | **合格** |

修正後の再確認（2026-08-03、プロダクトオーナー実操作）で 4 件とも解消を確認。
併せて UAT-03 の「契約成立で取引先が自動作成され区分『顧客』が付く」も画面で確認済み。

なお Claude 側の環境でリード新規作成の submit が発生しなかった件も、
同じ「遷移しない」事象だった（保存は成功していたが画面が変わらなかった）。

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

4. **【重大】新規作成・保存・削除の後に画面遷移しない**（Gate 4 のプロダクトオーナー実操作が検出）
   - 原因: `router.push(...)` の直後に同期で `router.refresh()` を呼んでいた。
     App Router では refresh が現在ルートの再フェッチを開始するため、
     進行中のナビゲーションがそれに差し替わり遷移が起きない
   - 影響: 契約・商談・連絡先・事業者情報・リード・取引先・キャンペーン・プロジェクト・
     タレントの新規作成／編集保存／削除。保存自体は成功しているため
     「押しても何も起きない」ように見え、二重登録を誘発する
   - 08-e2e-scenarios.md §6.1 に「既知の問題」として記録されていたが
     「別課題とする」で放置されていたもの。E2E 側は遷移を待たない回避をしていたため検知できなかった
   - 処置: `router.refresh()` を削除し、キャッシュ更新は Server Action の
     `revalidatePath` に寄せた（contracts / deals / contacts / companies / accounts /
     talents / campaigns / leads の CUD に追加）。
     talents 詳細の経歴追加などページ内再描画のための単独 `router.refresh()` は残している

5. **member が取引先・事業者情報を選択できない**（Gate 4 のプロダクトオーナー実操作が検出）
   - 判定: RLS の仕様どおり（`accounts` / `companies` / `contacts` の SELECT が
     「manager 以上 or owner」）。バグではないが、他の担当者が管理する取引先に対して
     商談を起こせず業務が回らない
   - 処置（**仕様変更**。ユーザー判断）: `20260803000008` で
     **参照のみ**を認証済み全員に広げた。作成・更新・削除の範囲は一切変えていない
     （他人の行の UPDATE / DELETE が 0 行であることを検証済み）。
     `financial_info`（口座情報）・`talents` 系・`leads`・`deals` は広げていない
   - 併せて更新: CLAUDE.md「RLS ポリシー設計」、02 §2.3 の表と IT-RLS-01 / 05 / 10 / 16、
     08 の E2E-05（「他人の company が見つかりません」→「閲覧できるが編集は拒否される」）

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
