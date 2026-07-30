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
- フレームワーク: Next.js 16.2 (App Router / Turbopack) + React 19 + Tailwind CSS v4 + shadcn/ui v4 (base-ui)
  - `next.config.ts` で `experimental.turbopackFileSystemCacheForDev` を有効化（dev のファイルシステムキャッシュ）
- データベース: PostgreSQL (Supabase)
- BaaS: Supabase (Auth + RLS + Storage)
- バリデーション: Zod
- テスト: Vitest（判定ロジックのユニットテスト）
- インフラ: 自社 NAS 上の Docker + Cloudflare Tunnel（`hub.iterra.online`）+ Supabase (Free / Tokyo)
  - **Vercel は使用しない。** Hobby プランは商用利用が規約で認められておらず基幹システムに適さない
  - Cloudflare Access で社内メンバー限定の認証層を前置
  - イメージは CI でビルドし GHCR 経由で NAS へ配布
  - 構成と手順は `docs/deployment-nas.md`

## ディレクトリ構造

```
├── docs/                  # 設計書・手順書
│   ├── database-design.md # DB設計書
│   ├── deployment-nas.md  # 本番Supabase構築 + NASデプロイ手順
│   ├── lead-import-eight.md # Eight 名刺CSV取込の設計（実装済み: /admin/leads/import）
│   ├── operation-manual.md # 操作マニュアル（§13 バックアップと復旧）
│   ├── test-checklist.md  # テストチェックリスト
│   └── archive/           # 役目を終えたドキュメント（現行仕様の参照には使わない）
├── supabase/
│   ├── config.toml        # ローカルSupabase設定（ポート: 5433x系 / db.seed.sql_paths）
│   ├── migrations/        # DBマイグレーション
│   ├── seeds/             # 用途別に分割したseed（本番投入の可否で分ける）
│   │   ├── 01-masters.sql        # 業務マスタ（本番投入する）
│   │   ├── 02-dev-users.sql      # テストユーザー（開発専用）
│   │   ├── 03-dev-samples.sql    # サンプル取引データ（開発専用）
│   │   ├── 04-leads.sql          # リード実業務データ 3,008件（本番投入する）
│   │   ├── prod-retired-users.sql        # 退職済み担当者（本番のみ・手動実行）
│   │   └── prod-disable-system-account.sql # システム用アカウントの封じ込め（本番のみ）
│   └── seed-talent-classification.sql # スキル体系（T/D/B/M）+ タレント分類マスタ
├── scripts/               # 補助スクリプト（seed生成・UUID置換等）
├── Dockerfile             # NAS実行用イメージ（standalone出力）
├── docker-compose.yml     # app + cloudflared
├── src/
│   ├── app/(auth)/        # 認証不要ページ (login)
│   ├── app/(app)/         # 認証必須ページ
│   │   ├── dashboard/     # ダッシュボード（KPI・ファネル・最近の商談）
│   │   ├── deals/         # 商談（カンバン/テーブル切替）
│   │   ├── contacts/      # 連絡先（一覧・検索）
│   │   ├── companies/     # 会社情報（一覧・検索）
│   │   ├── accounts/      # 取引先（一覧・検索）
│   │   ├── contracts/     # 契約（一覧・検索）
│   │   ├── talents/       # タレント（一覧・検索・系統/グレード/職種の自動判定）
│   │   ├── leads/         # リード（マーケティング・スコアリング・Deal昇格）
│   │   ├── campaigns/     # キャンペーン
│   │   ├── projects/      # プロジェクト
│   │   ├── manual/        # 操作マニュアル（静的ページ）
│   │   └── admin/         # マスタ管理（7グループ・21タブ・CRUD）
│   ├── app/api/health/    # ヘルスチェック（Docker healthcheck / 外形監視用）
│   ├── actions/           # Server Actions（masters, companies, accounts, contacts, deals, contracts, talents, activities）
│   ├── components/ui/     # shadcn/ui コンポーネント
│   ├── components/layout/ # レイアウト (sidebar, header)
│   ├── hooks/             # カスタムフック
│   ├── lib/supabase/      # Supabaseクライアント (client, server, middleware, admin)
│   ├── lib/talent-classification/ # 系統・グレード・職種の判定ロジック（純粋関数）
│   ├── lib/validators/    # Zodスキーマ（common, masters, companies, accounts, contacts, deals, contracts, talents, activities）
│   └── types/             # 型定義（database.generated.ts が正本。database.ts はそこから導出）
├── src/middleware.ts       # 認証 + ロール別ルーティング
└── .env.local.example     # 環境変数テンプレート
```

## 開発ルール

- shadcn/ui v4は@base-ui/reactベース。`asChild`ではなく`render`プロパティを使う
- RLSでデータアクセス制御。ロール: member, manager, admin
- Server Actionsで書き込み処理、Server Componentsでデータ取得
- コミット: Conventional Commits形式
- DB設計は `docs/database-design.md` に基づく。変更時は設計書を先に更新する
- 操作結果（保存・削除・移動の成否）はトーストで通知する。`useToast()`（`src/components/ui/toast.tsx`）を使う
- フィールド単位のバリデーションエラー（入力必須・形式不正など、入力箇所に紐づくもの）はインライン表示のまま。トーストにしない
- エラートーストは自動消滅させない（見落とし防止のため閉じるボタンでのみ消す。success/info は約4秒で自動消滅）

### データ整合性の規約（必須遵守）

- **複数テーブルへの書き込みは DB 関数にまとめる。**
  supabase-js は複数文を単一トランザクションにできないため、アプリ側で順に INSERT すると
  途中失敗や実行中断で中途半端なデータが残る。PL/pgSQL 関数にして `.rpc()` で呼ぶ。
  値の整形は TS 側、書き込みは DB 側という分担にする（例: `promote_lead_to_deal`）
- **更新系 Server Action は楽観ロックを通す。**
  `expected_updated_at`（編集開始時点の `updated_at`）を受け取り WHERE 条件に含める。
  0 行更新なら `conflictErrorMessage()` を返す。後勝ちでの上書きを防ぐため
- **変更履歴はアプリから INSERT しない。**
  `entity_change_logs` のトリガーが全経路を自動記録する（service_role 経由や SQL 直接操作も対象）。
  スコア等の自動計算による派生値は記録対象から除外している（マイグレーション 20260728000003）
- **DB 型定義は生成物を使う。**
  `npm run db:types` で `src/types/database.generated.ts` を更新する。手書きしない。
  存在しないカラム参照をビルドで検出するための措置
- **マイグレーションのタイムスタンプは既存の最新より後にする。**
  過去日付で作ると `supabase db push` が out-of-order でスキップし、
  適用に `--include-all` が必要になる（実際に発生済み。`docs/deployment-nas.md § 0.2`）

### 品質チェック

コミット前に以下がすべて通ること。CI（`.github/workflows/ci.yml`）では typecheck / test / build を必須にしている。

```bash
npm run typecheck && npm test && npm run build
```

`npm run lint` は既存負債（`no-explicit-any` 等 216 件）が残っているため CI では失敗させていない。
新規コードでは増やさないこと。

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

## UI表示名と内部名の対応

画面上のラベルは以下の通り旧用語から刷新済み。コード・DB上の内部名（テーブル名・変数名・URL等）は変更していない。

| UI 表示名 | 内部名（コード・DB） |
|---|---|
| 商談 | deal / deals |
| 取引先 | account / accounts |
| 会社情報 | company / companies |
| 連絡先 | contact / contacts |
| マスタ・取込 | admin |

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
