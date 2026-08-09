# テスト戦略

ITERRA CRM (iterra-hub) のテスト全体方針。**デプロイ判定の正本はこの文書**であり、
各テストレベルの詳細ケースは `docs/test-cases/` 配下に置く。
実施結果の記録は `docs/test-checklist.md`（デプロイゲート実施記録）に残す。

最終更新: 2026-08-03

## 1. 背景と原則

- 本システムは基幹業務 (CRM) であり、**テスト未実施のままのデプロイを禁止する**
- テストは「書いたら終わり」ではなく、**デプロイゲート**として毎回のリリース判定に組み込む
- テストケースは実装から導出し、実装変更時は**テストケース文書を同じ PR で更新する**
  （DB 設計変更時に `database-design.md` を先に更新するのと同じ規律）
- 場当たりの検証スクリプト（旧 `scripts/test-*.py`）は資産化しない。
  自動テストは Vitest / Playwright の正規の置き場所に置く（§7）

## 2. テストレベル定義（V モデル対応）

| レベル | 対象 | 手段 | 正本 | 実施タイミング |
|---|---|---|---|---|
| 単体テスト | `src/lib/` 純粋関数・Zod validator | Vitest (`npm test`) | `test-cases/01-unit.md` | コミット毎 + CI |
| 結合テスト | DB 関数・トリガー・RLS・制約 | ローカル Supabase + SQL / service-role スクリプト | `test-cases/02-integration-db.md` | マイグレーション変更時 + リリース前 |
| システムテスト | 画面単位の機能・バリデーション・権限 | 手動 + Playwright | `test-cases/03〜07-system-*.md` | 変更領域はリリース前必須 |
| E2E テスト | 業務ジャーニーの通し走行 | Playwright | `test-cases/08-e2e-scenarios.md` | スモークセットはリリース前必須 |
| 受入テスト (UAT) | ロール別業務シナリオ | プロダクトオーナーの実操作 | `test-cases/09-acceptance.md` | 新機能・仕様変更を含むリリース前 |

各レベルの守備範囲を重複させない:

- **単体**: 入出力が閉じたロジック（名寄せの表記ゆれ展開、スコア計算、判定ロジック、バリデーション境界値）。
  DB・ネットワークに触れるものは単体に置かない
- **結合**: supabase-js からは見えない DB 側の振る舞い（PL/pgSQL 関数、トリガー、RLS、CHECK 制約、採番）。
  「複数テーブル書き込みは DB 関数にまとめる」規約 (CLAUDE.md) の検証はここが本丸
- **システム**: 1 画面 / 1 Server Action の振る舞い（表示・入力・トースト・権限・楽観ロック）
- **E2E**: 画面をまたぐ業務フロー（リード取込 → 昇格 → ディール → 契約 → Account 生成）だけを扱う。
  画面内の細部はシステムテストに委ね、E2E で網羅しない
- **受入**: 「業務として使えるか」。機能の合否ではなく業務シナリオの完遂で判定する

## 3. テスト環境

| 環境 | 用途 | 構成 |
|---|---|---|
| ローカル | 単体〜E2E | `npm run dev` (port 2000) + ローカル Supabase (port 54331 系)。`npx supabase db reset` で seed 込み初期化 |
| CI | 単体 + 静的検証 | GitHub Actions (`.github/workflows/ci.yml`)。DB 非接続 |
| ステージング | 結合・システム・E2E の本番相当確認 | `scripts/setup-staging.sh` 参照 |
| 本番 | デプロイ後スモークのみ | NAS Docker + Cloudflare Tunnel (`hub.iterra.online`)。**テストデータを作らない**（作った場合は必ず論理削除まで実施） |

テストユーザー（ローカル/ステージングのみ）: `admin@iterra.jp` / `manager@iterra.jp` / `member@iterra.jp`（password123）。
ロール別テストは必ず 3 ロールとも実施する（多層防御の検証は admin だけでは成立しない）。

## 4. デプロイゲート（必須・スキップ不可）

デプロイは以下 5 ゲートを **順番に** 通過した場合のみ実施できる。
各ゲートの実施結果は `docs/test-checklist.md` に日付・実施者・結果を記録する。

### Gate 1 — コミット前（開発者/engineer エージェント）

```bash
npm run typecheck && npm test && npm run build && npm run lint -- --max-warnings 0
```

### Gate 2 — CI（自動）

main への push / PR で Gate 1 と同一の 4 チェックが自動実行される。**CI が赤のままのデプロイは禁止。**

### Gate 3 — リリース前検証（qa エージェント）

1. `npx supabase db reset` でローカル DB を初期化
2. **結合テスト**: マイグレーションを追加したリリースでは `02-integration-db.md` の該当ケース + RLS ケースを実施。
   追加が無くても §6 の整合性チェッククエリは毎回流す
3. **システムテスト**: 変更したルート/Action に対応する `03〜07` の該当章を実施（対応表は §5）。
   セキュリティ観点（UUID 検証・他人データ直 URL・ロール制限・楽観ロック）は変更領域では必ず再実施
4. **E2E スモーク**: `08-e2e-scenarios.md` のランク S シナリオを全件実施

### Gate 4 — 受入テスト（プロダクトオーナー）

新機能・仕様変更・UI 刷新を含むリリースでは、`09-acceptance.md` から該当シナリオを
プロダクトオーナーが実操作で確認する。バグ修正のみのリリースでは省略可（省略の判断も記録する）。

### Gate 5 — デプロイ後スモーク（operator エージェント）

本番デプロイ直後に実施:

1. `https://hub.iterra.online/api/health` が 200
2. 実ユーザーでログイン → ダッシュボード表示
3. 主要 3 画面（/leads, /deals, /contacts）の一覧表示と件数の妥当性
4. `02-integration-db.md` §6 の整合性チェッククエリ（孤児・採番重複・CHECK 違反ゼロ）
5. 直前リリースの主変更点を 1 件実操作で確認（書き込みを伴う場合は論理削除までセットで）

失敗時は `docs/deployment-nas.md` のロールバック手順に従い、原因判明までデプロイを巻き戻す。

## 5. 回帰範囲の決定ルール（変更ファイル → 実施テスト対応表)

| 変更ファイル | Gate 3 で実施するもの |
|---|---|
| `supabase/migrations/**` | 02 全体 + 影響エンティティのシステムテスト章 + E2E スモーク |
| `src/actions/<entity>.ts` | 該当エンティティの章（03〜07）+ 権限系ケース |
| `src/lib/validators/**` | 01 の該当ケース + 該当画面のバリデーション異常系 |
| `src/lib/**`（純粋関数） | 01 の該当ケース（Vitest に追加してから通す） |
| `src/app/(app)/<entity>/**` | 該当エンティティの章 + designer レビュー |
| `src/middleware.ts` / `src/lib/supabase/**` | 07 の AUTH 全ケース + 08 ランク S 全件 |
| `src/components/ui|layout/**` | 07 の CMN 章 + 影響画面のスポット確認 |
| `Dockerfile` / `docker-compose.yml` / CI | ビルド検証 + Gate 5 を入念に（環境変数の増減は compose 差し替え確認） |

複数該当時は和集合。判断に迷う場合は広い方に倒す。

## 6. テストデータ管理

- 正本は `supabase/seeds/`。**テストケースが前提にするデータは seed に入れる**（手作業前提のケースを作らない）
- 大量データ検証（ページネーション・スコア再計算・バルク取込）はリード実データ 3,008 件 (`04-leads.sql`) を使う
- E2E が生成するデータは接頭辞 `E2E-` を付け、テスト末尾で論理削除する

## 7. 自動化方針とロードマップ

現状: 単体 = Vitest 自動化済み / E2E = `scripts/test-*.py` に散在（使い捨て・回帰資産になっていない）。

1. ~~**Phase 1**~~ **完了（2026-08-03）**: `@playwright/test` を導入し、`e2e/` に
   ランク S シナリオ 5 本を実装。`npm run test:e2e` で実行する（全件緑）。
   spec は `*.e2e.ts`（Vitest の `*.test.ts` と衝突しないため `npm test` には拾われない）。
   実行前に `npx supabase db reset` と `npm run dev` が要る。
   `test-results/` `playwright-report/` と、Claude Code の worktree 置き場 `.claude/**` は
   ESLint / Vitest の対象外にしてある（`eslint.config.mjs` / `vitest.config.ts`）。
   worktree を作ったまま Gate 1 を回すと、別ブランチの作業コピーとその `.next` 生成物まで
   検査・実行されてしまうため（2026-08-04 に lint 4,353 件のエラーと
   単体テストの二重実行として顕在化した）
2. **Phase 2**: 結合テストの SQL ケース（02）を `scripts/db-tests/` に SQL + 実行スクリプトとして固定化し、
   `npm run test:db` を追加
3. **Phase 3**: GitHub Actions で `supabase start` → test:db → test:e2e を nightly 実行
4. 移行完了後、`scripts/test-*.py` は削除する（歴史的経緯は git にある）

自動化済みかどうかは各テストケースの「自動化」欄で管理する（Vitest済み / Playwright済み / Playwright候補 / 手動のみ / SQL検証）。

## 8. 役割分担（エージェント体制との対応）

| ゲート | 一次責任 | 備考 |
|---|---|---|
| Gate 1 | engineer（実装者） | 実装完了報告の前提条件 |
| Gate 2 | CI（自動） | — |
| Gate 3 | qa | 失敗時は engineer に再現手順付きで差し戻し。qa は修正しない |
| Gate 4 | プロダクトオーナー | qa がシナリオと環境を準備する |
| Gate 5 | operator | 失敗時はロールバック判断を最優先 |

体制の詳細は `docs/team-structure.md` を参照。

## 9. 不具合の扱い

- Gate 3 以降で見つかった不具合は「再現手順・期待・実際・該当ケース ID」を添えて差し戻す
- 修正後は **Gate 1 からやり直す**（修正が別領域を壊すことは実際にある）
- テストケースの漏れ（ケースに無い不具合）を見つけたら、修正と同じ PR で該当 `test-cases/*.md` にケースを追記する


## 画面を変えたときの確認（2026-08-04 追加）

**Gate 1 が通ることと、画面が使えることは別。**

利用者から指摘された不具合（住所が Enter で消える / IME の変換確定が奪われる /
個人事業主に法人向けの項目が出る）は、いずれも**自分で画面を開いて操作すれば
気づけた**もので、typecheck・単体・E2E スモークはすべて緑だった。
「自分が書いたシナリオが通る」ことしか見ていなかったのが原因。

UI を変えたら、コミット前に次を行う。

1. `npm run test:sweep` — 主要画面が開き、出し分けが効いているかを機械的に見る
2. **変更した画面を実際に操作する**（作成・保存・削除まで通す）
3. 入力欄を足したら **Enter と日本語入力**を試す（フォーム送信・変換確定の事故が多い）
4. 表示の出し分けを入れたら、**説明文やヘルプテキストも**確認する
   （欄は隠したのに説明文に残っていた事例が 2 件あった）
