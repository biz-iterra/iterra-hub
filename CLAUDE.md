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
- 形態素解析: kuromoji（事業者名のフリガナ自動生成。辞書 17MB はサーバー側でのみ読む）
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
│   ├── lead-import-inquiry.md # コーポレートサイトの問い合わせ取込（D1 → /api/leads/inquiry-sync）
│   ├── operation-manual.md # 操作マニュアル（§13 バックアップと復旧）
│   ├── test-strategy.md   # テスト戦略（テストレベル定義とデプロイゲートの正本）
│   ├── test-cases/        # レベル別詳細テストケース（01-unit 〜 09-acceptance）
│   ├── test-checklist.md  # デプロイゲート実施記録（リリースごとに追記）
│   ├── team-structure.md  # エージェント体制（engineer/qa/reviewer/designer/operator の 5 ロール）
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
│   │   ├── companies/     # 事業者情報（一覧・検索）
│   │   ├── accounts/      # 取引先（一覧・検索）
│   │   ├── contracts/     # 契約（一覧・検索）
│   │   ├── talents/       # タレント（一覧・検索・系統/グレード/職種の自動判定）
│   │   ├── leads/         # リード（マーケティング・スコアリング・Deal昇格）
│   │   ├── campaigns/     # キャンペーン
│   │   ├── projects/      # プロジェクト
│   │   ├── manual/        # 操作マニュアル（静的ページ）
│   │   └── admin/         # マスタ管理（7グループ・23タブ・CRUD）
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
- トーストは種別ごとの時間で自動消滅する（error は約10秒、success/info は約4秒）。
  error を長く取るのは読む時間の確保のため。どれも閉じるボタンで即座に消せる
- **利用者に見えるエラー文言の正本は `docs/error-messages.md`。** 文言を足す・直すときは同書を先に更新する。
  英語の生エラー（Zod 既定 / Postgres / 外部 API）を画面に出さない。DB エラーは
  `toUserMessage()`（`src/lib/db-error.ts`）を必ず通してから返す

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

### 品質チェックとデプロイゲート

テスト方針の正本は `docs/test-strategy.md`。**デプロイは同書 §4 の 5 ゲート
（コミット前 → CI → リリース前検証 → 受入 → デプロイ後スモーク）を順に通過した場合のみ**行い、
実施結果を `docs/test-checklist.md` に記録する。実装を変更したら、対応する
`docs/test-cases/` の文書を同じ作業内で更新すること。

コミット前に以下がすべて通ること。CI（`.github/workflows/ci.yml`）は
typecheck / test / build / lint の 4 つを必須にしている。

```bash
npm run typecheck && npm test && npm run build && npm run lint -- --max-warnings 0
```

**lint は error / warning ともに 0 件が条件。** `no-explicit-any` の負債は
Server Action の戻り値型を `src/types/relations.ts` に集約して解消済みで、
`any` を足すと CI が落ちる。未使用の import / 定数もエラーになるため、
参照を消したら定義も併せて消すこと。

`package-lock.json` は **`npm install` で更新し、`--os` / `--cpu` を付けない。**
付けると `integrity` が大量に欠落した lock ができ、それでインストールした
`node_modules` から作り直しても戻らなくなる（2026-08-03 に発生）。
lock を触ったら push 前に `npm ci` がローカルで通ることを確認する。

### シークレット管理（必須遵守）

方針の正本は `~/.claude/docs/secrets-policy.md`（全プロジェクト共通）、
本リポジトリのキー名と転記先の対応は `docs/secrets-management.md`（台帳）。
シークレットを追加・確認・移行する作業の前に必ず両方を参照する。要点:

- **値の正本は Bitwarden Secrets Manager**（プロジェクト名 `iterra-hub`）。
  GitHub Environment / NAS の `.env` / ローカル `.env.local` はすべて転記先
- **GitHub Secrets は Environment（`production` / `staging`）に置く。リポジトリレベルは 0 件。**
  Environment に無い Secret はリポジトリレベルへ静かにフォールバックするため重複を残さない。
  **同じ値でも環境ごとに別エントリで登録する**（片方だけ更新して食い違う事故を防ぐ）
- **シークレットはコードに書かない。** 実行時に `process.env` / `os.environ` から読む
- `.env` など実値を含むファイルは読まない。必要なのは常にキー名で、`.env.example` と台帳で足りる。
  `.claude/settings.json` の `permissions.deny` で Read / Bash / PowerShell の各経路を実際に塞いである
  （この設定だけは `.gitignore` の例外にしてリポジトリで共有する。`*.example` は対象外で読める）
- **シークレットの生成コマンドをエージェント経由で実行しない。** 出力が会話履歴に残る。
  自分のターミナルで実行し、値は Bitwarden へ直接登録する
- `NEXT_PUBLIC_*` に秘密値を入れない（クライアントバンドルへ焼き込まれる）。
  RLS をバイパスする `SUPABASE_SERVICE_ROLE_KEY` は必ずサーバー側の変数名のまま扱う
- シークレットを 1 つ増やすときは「Bitwarden へ登録 → 転記先へ登録 → 参照側の実装を確認 → 台帳に追記」の順

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
| 事業者情報 | company / companies |
| 連絡先 | contact / contacts |
| マスタ・取込 | admin |
| アクティビティ | activity / activities（活動の記録の総称） |
| 社内対応 | lead_activities |
| 顧客行動 | lead_customer_activities |

「事業者情報」は 2026-08-02 に「法人情報」から改称した。法人だけでなく個人事業主も
同じ器に入れる運用にしたため（`docs/database-design.md § 22.2.1`）。

活動の記録は「アクティビティ」を総称とし、記録元は **社内対応 / 顧客行動 / メール** の
3 つで呼ぶ。「対応履歴」「行動ログ」「やり取り履歴」は使わない（同じものが画面ごとに
別名で出ていたため 2026-07-31 に統一）。

## CRMデータモデル概要

### コアエンティティ
- **ディール:** 取引。パイプライン→ステージ→ステータスの階層で進捗管理
- **コンタクト:** 個人。contact_typeに応じてCompanyまたはAccountに紐づく
- **カンパニー:** 組織の法的情報。Accountに紐づく。法人所属コンタクト（corporate_rep/employee）も直接紐づく
- **アカウント:** 取引主体。法人Account（Company紐づき）と個人Account（Contact直接）の2パターン
- **タレント:** コンタクトに1:1で紐づく人材特性情報（スキル・経歴・占い分析）

### 重要な関係性
- コンタクトの紐づけはcontact_typeで制御: corporate_rep/employee → Company直接紐づけ、individual → Account紐づけ（account_contacts経由）
- 法人所属コンタクトもディールに関与する場合はaccount_contactsでAccountに紐づける

### 取引先（Account）が作られるタイミング

**Account は契約主体なので、契約が成立するまで作らない**（2026-07-31 変更、`docs/database-design.md § 16`）。

```
Lead ─取込→ Company + Contact          名刺はリードであると同時に連絡先
     ─昇格→ Deal（account_id = NULL、company_id / contact_id で相手を示す）
     ─契約→ Account 作成 + Deal に紐付け（contracts の AFTER INSERT トリガー）
```

- `deals.account_id` は **任意**。ただし account / company / contact のいずれか 1 つは必須（CHECK 制約）
- 商談の相手先表示は `src/lib/deal-counterparty.ts` を使う。取引先 → 事業者情報 → 連絡先の順にフォールバックする。画面ごとに分岐を書かない
- 事業者の名寄せは **法人番号 > メールドメイン（`company_domains`）> 住所+名称 > 名称** の順。
  **住所だけでは決めない**（雑居ビルやレンタルオフィスには何社も入っている）。同名の会社を区別する決め手として使う。
  判定は DB 関数 `resolve_or_create_company` / `resolve_or_create_contact` に集約されており、取込と遡及処理が同じ関数を通る
- 会社名は保存前に略記を正式表記へ開く（`㈱` → `株式会社`）。規則は TS 側 `src/lib/company-name.ts` と
  DB 関数 `expand_corporate_abbreviations` の対で持つので、**片方だけ直さないこと**
- 個人事業主も屋号で `companies`（事業者情報）に登録する。法人格「個人事業主」で区別し、器は分けない。
  インボイス登録番号は事業者に付く番号なので `companies` が正本（`accounts` は持たない）

### バッジ色

ステータス／ステージ系マスタは `color`（`#RRGGBB`）を持ち、表示側は DB の値をそのまま使う。
画面ごとに sort_order から算出すると同じ値が別の色になるため、**バッジを出す箇所は必ず `color` まで SELECT する**。
既定色は意味カテゴリで横断統一している（「アクティブ」は取引先でも法人でも同じ色）。
