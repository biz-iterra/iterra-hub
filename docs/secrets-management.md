# シークレット管理（iterra-hub のリポジトリ固有事項）

> **台帳の正本は `~/.claude/secrets/ledger/iterra-hub.md`**（全プロジェクト横断で管理）。
> キー名 ↔ 転記先の対応・同値グループ・対象外の判断はそちらを見る。
> 共通方針はスキル `secrets-management`（`~/.claude/skills/secrets-management/SKILL.md`）。
> **このファイルにも台帳にも値は書かない。**

このファイルには、**コードと一緒に動くもの**だけを書く。
参照側の実装・期限のある移行作業・設計判断の記録の 3 つ。

- Bitwarden プロジェクト: `iterra-hub`（専用枠）
- 転記先は 5 か所: GitHub Environment `production` / `staging` / NAS の `.env` /
  NAS の `docker login` / ローカル `.env.local`
- 暗号鍵・合言葉の生成手順 → スキルの `references/secret-generation.md`
  （**自分のターミナルで実行する。エージェント経由で実行しない**）

## 1. 参照側の実装（どこが読んでいるか）

**登録しただけでは動かない。** ワークフローやコードから参照して初めて効く。
シークレットを増やすときは、ここに行を足すところまでが 1 セット。

| キー | 読んでいる場所 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.github/workflows/docker-publish.yml`（**ビルド引数**。イメージへ焼き込む） |
| `SUPABASE_DB_PASSWORD` | `.github/workflows/db-backup.yml`（`PGPASSWORD`） |
| STG の `NEXT_PUBLIC_*` / `SUPABASE_DB_PASSWORD` | `.github/workflows/staging-keepalive.yml` |
| `SUPABASE_SERVICE_ROLE_KEY` | `createAdminClient()`（`src/lib/supabase/admin.ts`）経由の RLS バイパス処理 |
| `CLOUDFLARE_TUNNEL_TOKEN` | `docker-compose.yml` の `cloudflared` サービス |
| `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` | `src/lib/cf-access.ts`（**両方そろって初めて有効**） |
| `HOUJIN_BANGOU_APP_ID` | 事業者情報の実在確認（国税庁 法人番号 Web-API） |
| `GOOGLE_OAUTH_*` / `GMAIL_TOKEN_ENCRYPTION_KEY` | Gmail 連携（`src/lib/gmail/`） |
| `GMAIL_SYNC_CRON_SECRET` | `/api/gmail/sync` の Bearer 検証（未設定なら 503） |
| `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_D1_DATABASE_ID` / `CLOUDFLARE_API_TOKEN` | 問い合わせ取込（D1 の読み取り） |
| `INQUIRY_SYNC_CRON_SECRET` / `INQUIRY_SYNC_OWNER_EMAIL` | `/api/leads/inquiry-sync`（未設定なら 503） |
| `FREEE_CLIENT_*` / `FREEE_TOKEN_ENCRYPTION_KEY` | freee 会計連携 |
| `FREEE_SYNC_CRON_SECRET` | `/api/freee/sync`（未設定なら 503） |
| `GOOGLE_CONTACTS_*` | Google コンタクト連携 |
| `GOOGLE_CONTACTS_SYNC_CRON_SECRET` | `/api/google-contacts/sync`（未設定なら 503） |

`GITHUB_TOKEN`（GHCR への push）は Actions が実行時に自動発行する。

### Environment の中身を確認するコマンド（値は表示されない）

```bash
gh api repos/:owner/:repo/environments --jq '.environments[].name'
gh secret list --env production
gh secret list --env staging
gh secret list                      # 0 件が正しい状態
```

## 2. Supabase API キー方式の移行（期限あり）

旧方式（`eyJ...`）は **2026 年末に廃止予定**。新方式（`sb_publishable_...` / `sb_secret_...`）へ
差し替える際は、以下すべてを更新し、Bitwarden も同時に更新する。
手順の詳細は `docs/deployment-nas.md § 1.5`。

| 転記先 | 対象キー | 反映方法 |
|---|---|---|
| `gh/env:production/NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable key | **イメージの再ビルドが必要**（ビルド時に焼き込まれる） |
| `gh/env:staging/NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable key | STG プロジェクトの値。production とは別物なので取り違えない |
| `nas/iterra-hub:production/SUPABASE_SERVICE_ROLE_KEY` | Secret key | `docker compose up -d --force-recreate` |
| ローカル `.env.local` | 両方 | `npx supabase status` から転記 |

## 3. 移行チェックリスト（2026-07-31 着手）

**Bitwarden 側（ユーザー作業。値を扱うため Claude は実施しない）**
- [x] Secrets Manager にプロジェクト `iterra-hub` を作成
- [x] `gh/env:production/` 3 件・`gh/env:staging/` 3 件・`nas/iterra-hub:production/` 3 件を登録
- [ ] 公開値 4 件（両環境の `NEXT_PUBLIC_*`）のメモ欄に「公開値」と明記
- [ ] `GHCR_PULL_TOKEN` のメモ欄に PAT の**有効期限**を記録
- [ ] `gh/env:staging/*` を STG 実物の値へ差し替えた分、Bitwarden 側も更新済みか確認

**GitHub 側**
- [x] Environment `production` / `staging` を作成（2026-07-31）
- [x] `production` に 3 件を登録（2026-07-31 確認）
- [x] `staging` に 3 件を登録（2026-07-31 確認）
- [x] リポジトリレベルの 3 件を削除（2026-07-31 確認。現在 0 件）

**STG 用 Supabase（2026-07-31 着手。手順は `docs/deployment-nas.md § 10`）**
- [x] `staging` を参照するワークフローを追加（`staging-keepalive.yml`。Free プランの自動一時停止対策）
- [x] 構築スクリプトを用意（`scripts/setup-staging.sh`。マイグレーション + seed + 本番リンク復帰）
- [x] Bitwarden で STG DB パスワードを生成し `gh/env:staging/SUPABASE_DB_PASSWORD` を更新
- [x] `iterra-hub-stg`（`mddtzqixxnzdixceoxuc` / ap-northeast-1）を作成
- [x] `bash scripts/setup-staging.sh` でマイグレーションと seed を投入
- [x] `gh/env:staging/NEXT_PUBLIC_*` を STG 実物の値へ差し替え（2026-07-31 03:42 更新を確認）
- [x] 同値グループを解消（production と staging は別の値になった）

**未了（設計判断が残っているもの）**
- [ ] STG へのマイグレーション自動適用。現状 `db push` は手動のため、本番と STG のスキーマがずれ得る
      （Supabase Branching なら構造的に防げる部分。セクション 4 の判断記録を参照）
- [ ] STG 向けのアプリ実行環境。現状は Supabase のみで、NAS 上に STG コンテナは置いていない。
      必要になったら `docker-publish.yml` に環境選択を足し、`latest` ではなく `staging` タグで push する

**リポジトリ側（実施済み）**
- [x] `docker-publish.yml` / `db-backup.yml` のジョブに `environment: production` を追加
- [x] `.gitignore` が `.env` / `.env.*`（テンプレート除く）を除外していることを確認
- [x] `.env.example` / `.env.local.example` が実キーを網羅し、実値を含まないことを確認
- [x] git 履歴に実値ファイルが混入していないことを確認（`.env.example` と `.env.local.example` のみ）
- [x] `scripts/test-lead-activities-edit.py` のハードコードされたローカル Secret key を環境変数化

**ローカル側**
- [x] 重複していた `.env.nas` を削除（2026-07-31。`SUPABASE_SERVICE_ROLE_KEY` が空の
      不完全なコピーだった。Tunnel トークンは `.env` と同値）
- 残るローカルの実値ファイルは `.env`（NAS 用の作業コピー）と `.env.local`（ローカル Supabase）の 2 つ

**検証**
- [ ] `docker-publish` を手動実行して成功すること（**リポジトリレベル削除後**に実施した結果であること。
      削除前の成功はフォールバックの可能性があり、分離できた証拠にならない）
- [ ] `db-backup` を手動実行して成功すること（同上）

## 4. 判断の記録: なぜ Supabase Branching ではなく別プロジェクトなのか

> 2026-07-31 決定。STG 環境の作り方として Supabase Branching（Preview / Persistent branch）を
> 検討したうえで、**別プロジェクト（`iterra-hub-stg`）を常設する方式を採用**した。

### 確認した事実（Supabase 公式ドキュメント / CLI）

| 項目 | 内容 |
|---|---|
| プラン要件 | Branching は **Pro Plan 以上**。Free では利用できない |
| 課金 | Preview branch に固定費は無く従量課金。Micro Compute で **$0.01344/時** |
| 常時稼働の概算 | 約 **$9.7/月**（ブランチ 1 本）＋ Pro **$25/月** ＝ 月 $35 前後 |
| 現状 | `npx supabase branches list --project-ref aqkesxqxrsucgrnguhnb` → `{"branches":[]}`（未有効） |

### 採用理由

1. **本プロジェクトは Free プラン。** 別プロジェクト方式は $0 で成立する
2. **用途が違う。** Branching の主な価値は「PR ごとに使い捨ての検証環境が自動で立つ」こと。
   今回必要なのは「常設の STG が 1 つ」であり、目的が一致しない

### この方式の弱点（承知のうえで採用）

**本番と STG のスキーマがずれ得る。** Branching は本番から分岐して migrations を自動適用するが、
本方式では STG への `db push` が手動のため、適用漏れがあると古いスキーマのまま検証してしまう。

対策として「`main` への push 時に `staging` Environment で `supabase db push` を STG へ流す」
ワークフローを足せば、無料のままこの弱点だけを潰せる（セクション 3 の未了項目）。

### 見直す条件

以下のいずれかで Pro へ上げる判断が出たら、Branching を再検討する。

- PITR が必要になった（現在は `db-backup.yml` の日次 `pg_dump` で代替）
- Free の**アクティブ 2 プロジェクト上限**が支障になった（`iterra-hub` + `iterra-hub-stg` で現在ちょうど上限）
- PR 単位の preview 環境が欲しくなった

**移行時に捨てるのは `scripts/setup-staging.sh` と `.github/workflows/staging-keepalive.yml` の 2 つだけ。**
`supabase/migrations` と seed の構成、GitHub Environment によるシークレット分離はそのまま流用できる。
