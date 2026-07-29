# ITERRA Hub — CRM システム

営業・取引管理を一元化する CRM。リード・ディール・コンタクト・アカウント・カンパニー・タレント情報を統合管理する。

---

## 技術スタック

### アプリケーション

| カテゴリ | 技術 | バージョン | 概要 |
|---|---|---|---|
| 言語 | TypeScript | 5.x | 型安全な JavaScript |
| フレームワーク | Next.js | **16.2**（App Router / Turbopack） | React ベースのフルスタックフレームワーク |
| UI ランタイム | React | 19.2 | — |
| UI ライブラリ | shadcn/ui | v4 (base-ui) | @base-ui/react ベースのコンポーネント集 |
| スタイリング | Tailwind CSS | v4 | ユーティリティファーストの CSS フレームワーク |
| バリデーション | Zod | 4.x | スキーマベースのバリデーション |
| アイコン | Lucide React | 1.x | SVG アイコンライブラリ |
| テスト | Vitest | 4.x | ユニットテスト（判定ロジック） |

### インフラ・サービス

| カテゴリ | サービス | 用途 | 状態 |
|---|---|---|---|
| ホスティング | 自社 NAS 上の Docker + Cloudflare Tunnel | アプリの実行・公開（`hub.iterra.online`） | **移行作業中** |
| アクセス制御 | Cloudflare Access | 社内メンバー限定の認証層 | 設定済み |
| BaaS | Supabase（Tokyo リージョン） | PostgreSQL / Auth / RLS / Storage | 本番稼働 |
| イメージ配布 | GitHub Container Registry (GHCR) | CI でビルドしたイメージの配布 | 設定済み |
| バックアップ | GitHub Actions（日次 `pg_dump`） | Supabase Free に PITR が無いための代替 | 設定済み |

> Vercel は使用しない。Hobby プランは商用利用が規約で認められておらず、
> 基幹システムの運用に適さないため NAS 上の Docker へ移行した。
> 構成と手順は **`docs/deployment-nas.md`** を参照。

---

## 必要なツール

| ツール | 最低バージョン | 用途 | インストール方法 |
|---|---|---|---|
| **Node.js** | v20 以上（開発は v24） | Next.js 実行環境 | https://nodejs.org/ |
| **npm** | v10 以上 | パッケージ管理 | Node.js に同梱 |
| **Git** | — | ソース管理 | https://git-scm.com/ |
| **Docker** | — | ローカル Supabase / イメージビルド | Docker Desktop |
| **Supabase CLI** | 最新推奨 | ローカル DB・マイグレーション | 下記参照 |

### Supabase CLI のインストール

| OS | コマンド |
|---|---|
| **Windows (Scoop)** | `scoop bucket add supabase https://github.com/supabase/scoop-bucket.git && scoop install supabase` |
| **Mac / Linux (Homebrew)** | `brew install supabase/tap/supabase` |

> npm でのグローバルインストール（`npm install -g supabase`）はサポートされていない。
> `npx supabase <command>` でも実行できる。

---

## ローカル開発

### 1. リポジトリをクローン

```bash
git clone <repository-url>
cd iterra-hub
```

### 2. 依存パッケージをインストール

```bash
npm install
```

> **Windows での注意**: Linux 専用の optional dependency が lock に入らないことがある。
> Docker イメージのビルドで `npm ci` が失敗する場合は、Linux コンテナ内で lock を再生成する。
> ```bash
> docker run --rm -v "$(pwd):/app" -w /app node:24-alpine npm install --package-lock-only
> ```

### 3. 環境変数を設定

`.env.local.example` をコピーして `.env.local` を作成する。

| OS | コマンド |
|---|---|
| **Mac / Linux / WSL / Git Bash** | `cp .env.local.example .env.local` |
| **Windows (PowerShell)** | `Copy-Item .env.local.example .env.local` |

必要な値は 3 つだけ。

| 変数名 | 説明 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase の Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable（旧 anon）キー |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret（旧 service role）キー。**取り扱い注意** |

> **DB 接続文字列（`postgresql://...`）は `.env.local` に書かない。**
> アプリは Supabase API 経由で接続するため不要で、平文の DB パスワードを増やすだけになる。
> 接続文字列が必要なのは日次バックアップのみで、GitHub Secrets に登録する。

### 4. Supabase ローカル環境の起動

Docker が起動している必要がある。

```bash
npx supabase start
```

起動後に表示される値を `.env.local` に転記する。

| `.env.local` の変数 | `supabase status` の表示名 | 例 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **API URL** | `http://127.0.0.1:54331` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Publishable** | `sb_publishable_...` |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** | `sb_secret_...` |

> Storage (S3) セクションの Access Key / Secret Key は別物なので間違えないこと。

#### ポート設定（iterra-hub 固有）

`work-talent-hub` との同時起動を想定し、Supabase デフォルトポートから **+10** にずらしている（`supabase/config.toml`）。

| サービス | デフォルト | iterra-hub |
|---|---|---|
| API | 54321 | **54331** |
| DB | 54322 | **54332** |
| Shadow DB | 54320 | **54330** |
| Pooler | 54329 | **54339** |
| Studio | 54323 | **54333** |
| Inbucket（メールテスト） | 54324 | **54334** |
| Analytics | 54327 | **54337** |

### 5. DB のセットアップ

```bash
npx supabase db reset
```

マイグレーション適用後、`supabase/config.toml` の `sql_paths` の順に seed が投入される。

| ファイル | 内容 | 本番投入 |
|---|---|---|
| `seeds/01-masters.sql` | 業務マスタ | する |
| `seed-talent-classification.sql` | スキル体系 99 件 + タレント分類マスタ | する |
| `seeds/02-dev-users.sql` | テストユーザー（共通パスワード） | **しない** |
| `seeds/03-dev-samples.sql` | サンプル取引データ | **しない** |
| `seeds/04-leads.sql` | リード実業務データ（3,008 件） | する |

> 本番へは開発用の 2 ファイルを投入しない。手順は `docs/deployment-nas.md § 0` を参照。

### 6. テストユーザー（開発環境のみ）

`db reset` で自動作成される。**共通パスワードのため本番では使用しない。**

| メールアドレス | パスワード | ロール |
|---|---|---|
| `admin@iterra.jp` | `password123` | admin |
| `manager@iterra.jp` | `password123` | manager |
| `member@iterra.jp` | `password123` | member |

このほか、リードの担当者として `ogawa@` / `tanaka@` / `fushimi@` が作成される（いずれも退職者。本番では `is_active = false` かつログイン禁止）。

### 7. 開発サーバーの起動

```bash
npm run dev
```

http://localhost:2000 でアクセスできる（ポートは 2000）。

---

## 品質チェック

コミット前に以下がすべて通ることを確認する。

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest（判定ロジックのユニットテスト）
npm run build       # プロダクションビルド
npm run lint        # ESLint
```

CI（`.github/workflows/ci.yml`）では typecheck / test / build を必須にしている。
`lint` は既存の負債（`no-explicit-any` 等）が残っているため、現時点では失敗させず参考実行に留めている。

---

## デプロイ

**NAS 上の Docker で動かし、Cloudflare Tunnel で公開する。**

```
ブラウザ → Cloudflare（Access で認証 / TLS 終端）
        → Tunnel（NAS からの outbound のみ。ポート開放なし）
        → NAS: cloudflared + app コンテナ
        → Supabase（Tokyo）
```

イメージは `main` への push で CI がビルドし、GHCR に push される。NAS は GHCR から pull する。

| 手順 | 参照 |
|---|---|
| 本番 Supabase の構築（マイグレーション / seed / ユーザー） | `docs/deployment-nas.md` § 0 |
| シークレットの発行と登録先 | § 1 |
| Cloudflare Tunnel / Access | § 2〜3 |
| NAS への配置・更新・ロールバック | § 5〜6 |
| バックアップと復旧 | `docs/operation-manual.md` § 13 |

---

## npm スクリプト一覧

| コマンド | 説明 |
|---|---|
| `npm run dev` | 開発サーバー起動（http://localhost:2000） |
| `npm run build` | プロダクションビルド（standalone 出力） |
| `npm run start` | プロダクションサーバー起動（ビルド後） |
| `npm run lint` | ESLint による静的解析 |
| `npm run typecheck` | TypeScript の型チェック |
| `npm test` | Vitest でユニットテストを実行 |
| `npm run test:watch` | Vitest のウォッチモード |
| `npm run db:types` | ローカル DB から型定義を生成（`src/types/database.generated.ts`） |

---

## ディレクトリ構造

```
├── docs/                       # 設計書・手順書（下記「ドキュメント」参照）
│   └── archive/                # 役目を終えたドキュメント
├── supabase/
│   ├── config.toml             # ローカル設定（ポート +10 / seed の読み込み順）
│   ├── migrations/             # DB マイグレーション
│   ├── seeds/                  # 用途別に分割した seed
│   └── seed-talent-classification.sql  # スキル体系 + タレント分類マスタ
├── scripts/                    # 補助スクリプト（seed 生成・UUID 置換等）
├── src/
│   ├── app/(auth)/             # 認証不要ページ (login)
│   ├── app/(app)/              # 認証必須ページ
│   │   ├── dashboard/          # ダッシュボード
│   │   ├── leads/              # リード（MA）
│   │   ├── campaigns/          # キャンペーン
│   │   ├── deals/              # ディール（カンバン/一覧）
│   │   ├── projects/           # プロジェクト
│   │   ├── contracts/          # 契約
│   │   ├── contacts/           # コンタクト
│   │   ├── companies/          # カンパニー
│   │   ├── accounts/           # アカウント
│   │   ├── talents/            # タレント（系統・グレード・職種の自動判定）
│   │   ├── manual/             # 操作マニュアル（静的ページ）
│   │   └── admin/              # マスタ管理（7 グループ / 21 タブ）
│   ├── app/api/health/         # ヘルスチェック（Docker / 外形監視用）
│   ├── actions/                # Server Actions
│   ├── components/ui/          # UI コンポーネント
│   ├── components/layout/      # レイアウト (sidebar, header)
│   ├── lib/supabase/           # Supabase クライアント（client / server / admin）
│   ├── lib/talent-classification/  # 系統・グレード・職種の判定ロジック（純粋関数）
│   ├── lib/validators/         # Zod スキーマ
│   └── types/                  # 型定義（database.generated.ts が正本）
├── src/middleware.ts           # 認証 + ロール別ルーティング
├── Dockerfile                  # NAS 実行用イメージ（standalone）
├── docker-compose.yml          # app + cloudflared
└── .env.local.example          # 開発用の環境変数テンプレート
```

---

## ドキュメント

| ファイル | 内容 |
|---|---|
| `CLAUDE.md` | プロジェクトの前提・開発ルール（AI エージェント向けの指示を含む） |
| `docs/database-design.md` | DB 設計書。テーブル定義・RLS・判定ロジックの仕様 |
| `docs/deployment-nas.md` | 本番 Supabase 構築と NAS デプロイの手順 |
| `docs/operation-manual.md` | 利用者向け操作マニュアル。§ 13 にバックアップと復旧 |
| `docs/screen-design.md` | 画面設計書 |
| `docs/test-checklist.md` | テストチェックリスト |
| `docs/glossary.md` | 用語集 |
| `docs/team-structure.md` | エージェントチーム体制 |

---

## 開発ルール

- **コミット:** Conventional Commits 形式（`feat:`, `fix:`, `refactor:` 等）
- **shadcn/ui v4:** `asChild` ではなく `render` プロパティを使用する
- **データ取得:** Server Components で実行
- **データ書き込み:** Server Actions で実行
- **アクセス制御:** middleware / Server Action / RLS の 3 層で担保する（いずれか 1 層に依存しない）
- **複数テーブルの書き込み:** DB 関数にまとめて単一トランザクションにする（例: `promote_lead_to_deal`）
- **更新処理:** 楽観ロック（`expected_updated_at`）を通す。後勝ちの上書きを防ぐ
- **変更履歴:** `entity_change_logs` のトリガーが自動記録する。アプリ側で履歴を INSERT しない
- **DB 型定義:** `npm run db:types` で生成する。手書きしない
- **DB 設計変更:** 先に `docs/database-design.md` を更新してからマイグレーションを作成する
