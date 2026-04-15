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
│   ├── lib/supabase/      # Supabaseクライアント (client, server, middleware, admin)
│   ├── lib/validators/    # Zodスキーマ
│   └── types/             # 型定義
├── middleware.ts           # 認証 + ロール別ルーティング
└── .env.example           # 環境変数テンプレート
```

## 開発ルール

- shadcn/ui v4は@base-ui/reactベース。`asChild`ではなく`render`プロパティを使う
- RLSでデータアクセス制御。ロール: member, manager, admin
- Server Actionsで書き込み処理、Server Componentsでデータ取得
- コミット: Conventional Commits形式
- DB設計は `docs/database-design.md` に基づく。変更時は設計書を先に更新する

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
