# ITERRA Hub — CRM システム

営業・取引管理を一元化する CRM。ディール・コンタクト・アカウント・カンパニー・タレント情報を統合管理する。

---

## 技術スタック

### アプリケーション

| カテゴリ | 技術 | バージョン | 概要 |
|---|---|---|---|
| 言語 | TypeScript | 5.x | 型安全な JavaScript |
| フレームワーク | Next.js | 15 (App Router) | React ベースのフルスタックフレームワーク |
| UI ライブラリ | shadcn/ui | v4 (base-ui) | @base-ui/react ベースのコンポーネント集 |
| スタイリング | Tailwind CSS | v4 | ユーティリティファーストの CSS フレームワーク |
| バリデーション | Zod | 4.x | スキーマベースのバリデーション |
| アイコン | Lucide React | 1.x | SVG アイコンライブラリ |

### インフラ・サービス

| カテゴリ | サービス | 用途 |
|---|---|---|
| ホスティング | Vercel | Next.js アプリのデプロイ・配信 |
| BaaS | Supabase | PostgreSQL DB / Auth / RLS / Storage |
| DB | PostgreSQL | Supabase が提供するリレーショナル DB |

---

## 必要なツール

以下のツールを事前にインストールしておくこと。

| ツール | 最低バージョン | 用途 | インストール方法 |
|---|---|---|---|
| **Node.js** | v20 以上 | Next.js 実行環境 | https://nodejs.org/ |
| **npm** | v10 以上 | パッケージ管理 | Node.js に同梱 |
| **Git** | — | ソース管理 | https://git-scm.com/ |
| **Supabase CLI** | 最新推奨 | ローカル DB・マイグレーション | 下記参照 |
| **Vercel CLI** | 最新推奨 | デプロイ（CLI 経由の場合） | 下記参照 |

### Supabase CLI のインストール

| OS | コマンド |
|---|---|
| **Windows (Scoop)** | `scoop bucket add supabase https://github.com/supabase/scoop-bucket.git && scoop install supabase` |
| **Mac (Homebrew)** | `brew install supabase/tap/supabase` |
| **Linux (Homebrew)** | `brew install supabase/tap/supabase` |

> npm でのグローバルインストール（`npm install -g supabase`）はサポートされていない。
> Windows で Scoop が未導入の場合は PowerShell で `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser; irm get.scoop.dev | iex` を実行してインストールする。

### Vercel CLI のインストール（OS 共通）

```bash
npm install -g vercel
```

---

## ローカル開発

### 1. リポジトリをクローン

```bash
git clone <repository-url>
cd iterra-hub
```

### 2. 依存パッケージをインストール

> 実行環境: **ターミナル**

```bash
npm install
```

### 3. 環境変数を設定

`.env.local.example` をコピーして `.env.local` を作成する。

> 実行環境: **ターミナル**

| OS | コマンド |
|---|---|
| **Mac / Linux / WSL / Git Bash** | `cp .env.local.example .env.local` |
| **Windows (PowerShell)** | `Copy-Item .env.local.example .env.local` |
| **Windows (コマンドプロンプト)** | `copy .env.local.example .env.local` |

`.env.local` に以下の値を設定する。

| 変数名 | 説明 | 取得先 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクトの URL | Supabase Dashboard → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase の anon（公開）キー | 同上 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase の service role キー | 同上（**秘密鍵のため取り扱い注意**） |

> ローカル Supabase を使う場合は `supabase start` 実行後に表示される値を使用する（手順 4 参照）。

### 4. Supabase ローカル環境の起動

> 実行環境: **ターミナル（Supabase CLI）** — Docker が起動している必要がある

```bash
supabase start
```

起動後にコンソールに表示される値を `.env.local` に転記する。

> **注意:** Supabase CLI v2.90+ ではキー名が変更されている。以下の対応表を参照すること。

| `.env.local` の変数 | `supabase status` の表示名 | 例 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **Project URL** | `http://127.0.0.1:54331` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Publishable** (Authentication Keys) | `sb_publishable_...` |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** (Authentication Keys) | `sb_secret_...` |

> Storage (S3) セクションの Access Key / Secret Key は **別物**なので間違えないこと。

#### ポート設定（iterra-hub 固有）

本プロジェクトは `work-talent-hub` との同時起動を想定し、Supabase デフォルトポートから **+10** にずらしている。
設定は `supabase/config.toml` に記載済み。

| サービス | デフォルト | iterra-hub | 用途 |
|---|---|---|---|
| API | 54321 | **54331** | Project URL（`.env.local` に設定する値） |
| DB | 54322 | **54332** | PostgreSQL 接続 |
| Shadow DB | 54320 | **54330** | `db diff` 用 |
| Pooler | 54329 | **54339** | コネクションプーラー |
| Studio | 54323 | **54333** | Supabase Studio（ブラウザ） |
| Inbucket | 54324 | **54334** | メールテスト UI |
| Analytics | 54327 | **54337** | ログ分析 |
| Inspector | 8083 | **8093** | Edge Functions デバッグ |

> 他の Supabase プロジェクトが同じポートを使用している場合、`supabase start` でポート競合エラーが発生する。
> その場合は既存プロジェクトを `supabase stop --project-id <project-id>` で停止するか、`supabase/config.toml` のポートをさらにずらすこと。

### 5. DB マイグレーションの適用

> 実行環境: **ターミナル（Supabase CLI）**

#### ローカル DB に適用する場合

```bash
supabase db reset
```

`supabase/migrations/` 配下のマイグレーションがすべて適用される。

#### リモート（Supabase Cloud）に適用する場合

```bash
supabase link --project-ref <project-id>
supabase db push
```

### 6. テストユーザーの確認

`supabase db reset`（手順 5）でシードデータからテストユーザーが自動作成される。

| メールアドレス | パスワード | ロール | 用途 |
|---|---|---|---|
| `admin@iterra.jp` | `password123` | admin | 全データ CRUD、マスタ管理 |
| `manager@iterra.jp` | `password123` | manager | 全データ閲覧、自担当データ編集 |
| `member@iterra.jp` | `password123` | member | 自担当データのみ |

ユーザーの確認は Supabase Studio（http://127.0.0.1:54333 ） → **Authentication** → **Users** で行える。

#### 追加のテストユーザーを手動作成する場合

> 実行環境: **Supabase Studio（ブラウザ）**

1. http://127.0.0.1:54333 にアクセス
2. **Authentication** → **Users** → **Add User** → **Create New User**
3. Email / Password を入力し、**Auto Confirm User** にチェックを入れて作成
4. **SQL Editor** で `crm_users` テーブルにも対応するレコードを INSERT する（ロール設定が必要）:

```sql
INSERT INTO crm_users (id, email, full_name, role)
VALUES ('<auth.users の id>', '<email>', '<氏名>', 'member');
```

### 7. 開発サーバーの起動

> 実行環境: **ターミナル**

```bash
npm run dev
```

http://localhost:3000 でアクセスできる。

### ローカル確認チェックリスト

| # | 確認項目 | 方法 |
|---|---|---|
| 1 | Supabase ローカルが起動しているか | `supabase status` — Project URL が `http://127.0.0.1:54331` であること |
| 2 | 開発サーバーが起動するか | `npm run dev` → http://localhost:3000 にアクセス |
| 3 | ビルドが通るか | `npm run build` |
| 4 | Lint エラーがないか | `npm run lint` |
| 5 | テストユーザーが作成済みか | http://127.0.0.1:54333 → Authentication → Users で 3 名確認 |
| 6 | ログインできるか | http://localhost:3000 → `admin@iterra.jp` / `password123` でログイン |
| 7 | Dashboard にデータが表示されるか | ログイン後 /dashboard で KPI カードに数値が表示されること |

> 詳細なテスト手順は `docs/test-checklist.md` を参照。

---

## デプロイ

本プロジェクトは **Vercel** にデプロイし、DB は **Supabase Cloud** を使用する。

### 前提

- Vercel アカウントを持っていること
- Supabase Cloud にプロジェクトが作成済みであること
- リモート DB にマイグレーションが適用済みであること（ローカル開発 手順 5 参照）

### 方法 A: Vercel ダッシュボードからデプロイ（推奨）

> 実行環境: **Vercel ダッシュボード（ブラウザ）**

1. [Vercel](https://vercel.com/) にログイン
2. **Add New → Project** から Git リポジトリをインポート
3. **Framework Preset** が `Next.js` になっていることを確認
4. **Environment Variables** に以下を設定:

| 変数名 | 値 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Cloud の URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Cloud の anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Cloud の service role key |

5. **Deploy** をクリック

以降、`main` ブランチへの push で自動デプロイされる。

### 方法 B: Vercel CLI からデプロイ

> 実行環境: **ターミナル（Vercel CLI）**

#### 初回セットアップ

```bash
vercel login
vercel link
```

#### 環境変数の設定

> 実行環境: **Vercel ダッシュボード（ブラウザ）** または **ターミナル（Vercel CLI）**

**ダッシュボードの場合:**
Project Settings → Environment Variables から追加する。

**CLI の場合:**

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
```

対話形式で値とスコープ（Production / Preview / Development）を指定する。

#### プレビューデプロイ

```bash
vercel
```

#### プロダクションデプロイ

```bash
vercel --prod
```

### Supabase Cloud のマイグレーション適用

> 実行環境: **ターミナル（Supabase CLI）**

```bash
supabase link --project-ref <project-id>
supabase db push
```

`<project-id>` は Supabase Dashboard → Settings → General で確認できる。

### デプロイ確認チェックリスト

| # | 確認項目 | 確認先 |
|---|---|---|
| 1 | ビルドが成功しているか | Vercel ダッシュボード → Deployments |
| 2 | 環境変数が正しく設定されているか | Vercel ダッシュボード → Settings → Environment Variables |
| 3 | DB マイグレーションが適用済みか | Supabase ダッシュボード → SQL Editor or Table Editor |
| 4 | 本番 URL でアクセスできるか | デプロイ後に発行される URL をブラウザで確認 |
| 5 | ログイン・認証が動作するか | 本番 URL でログインフローを実行 |

---

## npm スクリプト一覧

> 実行環境: **ターミナル**

| コマンド | 説明 |
|---|---|
| `npm run dev` | 開発サーバー起動（http://localhost:3000） |
| `npm run build` | プロダクションビルド |
| `npm run start` | プロダクションサーバー起動（ビルド後） |
| `npm run lint` | ESLint による静的解析 |

---

## ディレクトリ構造

```
├── docs/                  # 設計書・仕様書
│   └── database-design.md # DB設計書
├── supabase/migrations/   # DBマイグレーション
├── src/
│   ├── app/(auth)/        # 認証不要ページ (login)
│   ├── app/(app)/         # 認証必須ページ
│   │   ├── dashboard/     # ダッシュボード
│   │   ├── deals/         # ディール（カンバン/一覧）
│   │   ├── contacts/      # コンタクト
│   │   ├── companies/     # カンパニー
│   │   ├── accounts/      # アカウント
│   │   ├── contracts/     # 契約
│   │   ├── talents/       # タレント
│   │   └── admin/         # マスタ管理
│   ├── app/api/           # Route Handlers
│   ├── actions/           # Server Actions
│   ├── components/ui/     # shadcn/ui コンポーネント
│   ├── components/layout/ # レイアウト (sidebar, header)
│   ├── hooks/             # カスタムフック
│   ├── lib/supabase/      # Supabaseクライアント
│   ├── lib/validators/    # Zodスキーマ
│   └── types/             # 型定義
├── src/middleware.ts       # 認証 + ロール別ルーティング
└── .env.local.example     # 環境変数テンプレート
```

---

## 開発ルール

- **コミット:** Conventional Commits 形式（`feat:`, `fix:`, `refactor:` 等）
- **shadcn/ui v4:** `asChild` ではなく `render` プロパティを使用する
- **データアクセス:** RLS でロール制御（member / manager / admin）
- **データ取得:** Server Components で実行
- **データ書き込み:** Server Actions で実行
- **DB 設計変更:** 先に `docs/database-design.md` を更新してからマイグレーションを作成する
