# iterra-hub

## 概要

ITERRA CRM（顧客関係管理）システム。
営業・取引管理を一元化し、ディール・コンタクト・アカウント・カンパニー・タレント情報を統合管理する。

### 目的
1. **取引の可視化:** パイプライン・ステージ・ステータスによるディール進捗管理
2. **顧客情報の一元化:** コンタクト・カンパニー・アカウントの統合管理
3. **タレントマネジメント:** 占いベースの性質分析・スキルセット・経歴の管理

## 技術スタック

- 言語: TypeScript
- フレームワーク: Next.js 15 (App Router) + Tailwind CSS v4 + shadcn/ui v4 (base-ui)
- データベース: PostgreSQL (Supabase)
- BaaS: Supabase (Auth + RLS + Storage)
- バリデーション: Zod
- インフラ: Vercel (Free Tier) + Supabase (Free Tier)

## ディレクトリ構造

```
├── docs/                  # 設計書・仕様書
│   ├── database-design.md # DB設計書
│   └── test-checklist.md  # テストチェックリスト
├── supabase/
│   ├── config.toml        # ローカルSupabase設定（ポート: 5433x系）
│   ├── migrations/        # DBマイグレーション（13ファイル）
│   └── seed.sql           # シードデータ（テストユーザー+マスタ+サンプルデータ）
├── src/
│   ├── app/(auth)/        # 認証不要ページ (login)
│   ├── app/(app)/         # 認証必須ページ
│   │   ├── dashboard/     # ダッシュボード（KPI・ファネル・最近のディール）
│   │   ├── deals/         # ディール（カンバン/テーブル切替）
│   │   ├── contacts/      # コンタクト（一覧・検索）
│   │   ├── companies/     # カンパニー（一覧・検索）
│   │   ├── accounts/      # アカウント（一覧・検索）
│   │   ├── contracts/     # 契約（一覧・検索）
│   │   ├── talents/       # タレント（一覧・検索）
│   │   └── admin/         # マスタ管理（9タブ・CRUD）
│   ├── app/api/           # Route Handlers
│   ├── actions/           # Server Actions（masters, companies, accounts, contacts, deals, contracts, talents, activities）
│   ├── components/ui/     # shadcn/ui コンポーネント
│   ├── components/layout/ # レイアウト (sidebar, header)
│   ├── hooks/             # カスタムフック
│   ├── lib/supabase/      # Supabaseクライアント (client, server, middleware, admin)
│   ├── lib/validators/    # Zodスキーマ（common, masters, companies, accounts, contacts, deals, contracts, talents, activities）
│   └── types/             # 型定義（database.ts, enums.ts）
├── src/middleware.ts       # 認証 + ロール別ルーティング
└── .env.local.example     # 環境変数テンプレート
```

## 開発ルール

- shadcn/ui v4は@base-ui/reactベース。`asChild`ではなく`render`プロパティを使う
- RLSでデータアクセス制御。ロール: member, manager, admin
- Server Actionsで書き込み処理、Server Componentsでデータ取得
- コミット: Conventional Commits形式
- DB設計は `docs/database-design.md` に基づく。変更時は設計書を先に更新する

## アクセス制御ルール（必須遵守）

### 多層防御の原則
アクセス制御は以下の3層で実装する。いずれか1層だけに依存してはならない。

1. **Middleware層:** 未認証ユーザーを /login にリダイレクト
2. **Server Action層:** 認証チェック + ロールチェック + オーナーチェック
3. **RLS層:** Supabase の Row Level Security でDBレベルで制御

### Server Action 実装時の必須チェック
- **認証チェック:** 全 Server Action で `supabase.auth.getUser()` を呼び、未認証なら即リターン
- **ロールチェック:** admin 専用操作（マスタ CRUD、論理削除）は `role !== "admin"` で拒否
- **オーナーチェック:** update 系で admin 以外は `owner_user_id === user.id` を確認。RLS に依存せず Server Action 側でも検証する
- **manager/admin 限定:** contracts の全操作は `is_manager_or_above()` で制限

### 詳細ページ（[id] ルート）の必須チェック
- **UUID 形式検証:** `params.id` が UUID 形式でない場合は「不正なパラメータです」を返す。正規表現: `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`
- **存在チェック:** データ取得結果が null の場合は「見つかりません」+ 一覧へ戻るリンクを表示
- **URL の ID 直接指定によるアクセス:** RLS により他ユーザーのデータは取得不可。Server Action 側でも権限チェック済み

### RLS ポリシー設計
- **マスタテーブル:** SELECT は認証済み全員、INSERT/UPDATE/DELETE は admin のみ
- **companies/accounts/contacts/deals:** member は `owner_user_id = auth.uid()` のみ、manager/admin は全件
- **contracts:** manager/admin のみ全操作
- **従属テーブル（contact_emails 等）:** 親テーブルの `owner_user_id` を参照して制限
- **financial_info:** SELECT は manager/admin のみ、CUD は admin のみ
- **履歴テーブル:** INSERT ONLY を原則とする（UPDATE/DELETE 不可）。ただし `lead_activities` は例外で、`caller_user_id` 本人と manager/admin による UPDATE を許可（`last_edited_at` / `last_edited_by_user_id` で監査証跡を保全。マイグレーション: 20260426000001）。admin のみ DELETE 可能（誤記録修正用）

## CRMデータモデル概要

### コアエンティティ
- **ディール:** 取引。パイプライン→ステージ→ステータスの階層で進捗管理
- **コンタクト:** 個人。contact_typeに応じてCompanyまたはAccountに紐づく
- **カンパニー:** 組織の法的情報。Accountに紐づく。法人所属コンタクト（corporate_rep/employee）も直接紐づく
- **アカウント:** 取引主体。法人Account（Company紐づき）と個人Account（Contact直接）の2パターン
- **タレント:** コンタクトに1:1で紐づく人材特性情報（スキル・経歴・占い分析）

### 重要な関係性
- コンタクトの紐づけはcontact_typeで制御: corporate_rep/employee → Company直接紐づけ、individual → Account紐づけ（account_contacts経由）
- ディール登録時にはAccountの紐づけが必須（account_id必須）
- 法人所属コンタクトもディールに関与する場合はaccount_contactsでAccountに紐づける
