# シークレット管理台帳（iterra-hub）

> 2026-07-31 制定。共通方針 `~/.claude/docs/secrets-policy.md` に基づく iterra-hub のリポジトリ台帳。
> **値は書かない。** 記録するのは「Bitwarden キー名 = 転記先」の対応と用途だけ。
> 共通方針とこのファイルが矛盾した場合は**共通方針が優先**（このファイルを直す）。

- Bitwarden Secrets Manager のプロジェクト名: **`iterra-hub`**（規約どおりリポジトリ名と同一）
- 転記先は 5 か所: GitHub Environment `production` / `staging` / NAS の `.env` / NAS の `docker login` / ローカル `.env.local`

## 1. キー名のプレフィックス（本リポジトリで使うもの）

| プレフィックス | 転記先 |
|---|---|
| `gh/env:production/` | GitHub Environment secrets（`production`） |
| `gh/env:staging/` | GitHub Environment secrets（`staging`） |
| `nas/iterra-hub:production/` | 自社 NAS 上の実行時シークレット（`/volume1/docker/iterra-hub/.env` と `docker login`） |

**同じ値でも転記先ごとに 1 エントリ**（共通方針④）。片方だけ更新して食い違う事故を防ぐため。
同値のものが生じたらセクション 2 の「同値グループ」に記載し、まとめて更新する
（現在は production / staging が別プロジェクトのため同値グループなし）。

共通方針セクション 3 の表にある `vercel/<プロジェクト>:<環境>/`（ホスティングの環境変数）の
自社 NAS 版として `nas/<プロジェクト>:<環境>/` を使う。共通方針側にも同じ行を追加済み。

**GitHub Repository secrets は 0 件で運用する。** 環境依存の値をリポジトリレベルに残すと
Environment に無いときへ静かにフォールバックし、分離できているつもりで動いてしまう
（共通方針セクション 7 の既知の落とし穴）。本リポジトリには環境非依存のビルド基盤トークンが
無いため、リポジトリレベルは空が正しい状態。

## 2. 台帳（あるべき姿）

### GitHub — Environment: production（3 件）

参照側は `.github/workflows/docker-publish.yml`（ビルド引数）と `db-backup.yml`（pg_dump）。
どちらのジョブにも `environment: production` を指定してある。

| Bitwarden キー名 | 用途 | 発行元 | 備考 |
|---|---|---|---|
| `gh/env:production/NEXT_PUBLIC_SUPABASE_URL` | イメージのビルド引数。クライアントバンドルへ焼き込む | Supabase → Settings → API → Project URL | **公開値**（メモ欄に明記すること） |
| `gh/env:production/NEXT_PUBLIC_SUPABASE_ANON_KEY` | 同上 | Supabase → Settings → API Keys → Publishable key | **公開値**（RLS 前提の設計。Secret key と取り違えないこと） |
| `gh/env:production/SUPABASE_DB_PASSWORD` | 日次バックアップの `PGPASSWORD` | Supabase → Database → Settings → Reset database password | **パスワードのみ**。接続文字列は登録しない（`@ & # / : ?` で URL パースが壊れる事故あり） |

`GITHUB_TOKEN`（GHCR への push に使用）は GitHub が実行時に自動発行するため**登録対象外**。

### GitHub — Environment: staging（3 件）

登録済み（2026-07-31）。参照側は `.github/workflows/staging-keepalive.yml`。
値は STG 用プロジェクト `iterra-hub-stg`（`mddtzqixxnzdixceoxuc`）の実物。
構成は `docs/deployment-nas.md § 10`。

| Bitwarden キー名 | 用途 | 備考 |
|---|---|---|
| `gh/env:staging/NEXT_PUBLIC_SUPABASE_URL` | STG イメージのビルド引数 | **公開値** |
| `gh/env:staging/NEXT_PUBLIC_SUPABASE_ANON_KEY` | 同上 | **公開値** |
| `gh/env:staging/SUPABASE_DB_PASSWORD` | STG DB のバックアップ／検証用 | パスワードのみ |

### GitHub — Repository secrets（0 件）

登録なしが正（2026-07-31 に旧 3 件を削除済み）。
何か増えていたら「本当に環境非依存か」を確認し、環境依存なら Environment へ移す。

**リポジトリレベルに環境依存の値を戻さないこと。** `staging` の Secret が欠けた状態で
`environment: staging` のジョブを回すと、リポジトリレベルに残った**本番の値**へ静かに
フォールバックし、STG のつもりで本番 DB を触ってしまう。

### NAS — `/volume1/docker/iterra-hub/.env`（6 件）

`docker-compose.yml` がコンテナ実行時に読む。ファイルは `chmod 600`。

| Bitwarden キー名 | 用途 | 発行元 | 備考 |
|---|---|---|---|
| `nas/iterra-hub:production/SUPABASE_SERVICE_ROLE_KEY` | `createAdminClient()` 経由の RLS バイパス処理（リードのバルク更新・スコア再計算） | Supabase → Settings → API Keys → Secret keys | **GitHub Secrets には登録しない**（ビルドに不要。漏洩面を増やさない） |
| `nas/iterra-hub:production/CLOUDFLARE_TUNNEL_TOKEN` | `cloudflared` の Tunnel 接続 | Cloudflare Zero Trust → Networks → Tunnels の `--token` の値 | コマンド全体ではなくトークン部分のみ。プレースホルダの山括弧混入で `not valid` になる事故あり |
| `nas/iterra-hub:production/HOUJIN_BANGOU_APP_ID` | 法人情報の実在確認（国税庁 法人番号 Web-API） | https://www.houjin-bangou.nta.go.jp/webapi/ の利用申請 | 無償。未設定でも起動は通り、画面に「未設定」と出るだけ |
| `nas/iterra-hub:production/GOOGLE_OAUTH_CLIENT_ID` | Gmail 連携の OAuth クライアント | Google Cloud → APIs & Services → 認証情報 → OAuth 2.0 クライアント ID（ウェブアプリケーション） | 秘密値ではない（同意画面で利用者に見える）が、シークレットと組で管理するため同じ場所に置く |
| `nas/iterra-hub:production/GOOGLE_OAUTH_CLIENT_SECRET` | 同上 | 同上 | 再発行すると既存の連携が切れる |
| `nas/iterra-hub:production/GMAIL_TOKEN_ENCRYPTION_KEY` | リフレッシュトークンの暗号化鍵（pgcrypto） | 自分のターミナルで生成（PowerShell: `[System.Security.Cryptography.RandomNumberGenerator]::Fill($b)` → `[Convert]::ToBase64String($b)`）。値をチャットやログに残さないこと | **変更・紛失すると保存済みトークンを復号できず全員が再連携になる**。ローテーション時は再連携の案内とセットで |

`IMAGE_TAG` は切り戻し時のみ使う運用値で、秘密値ではないため登録対象外。

### NAS — `docker login`（1 件・ファイルには保存しない）

| Bitwarden キー名 | 用途 | 発行元 | 備考 |
|---|---|---|---|
| `nas/iterra-hub:production/GHCR_PULL_TOKEN` | private な GHCR イメージの pull | GitHub → Developer settings → PAT (classic)、スコープ `read:packages` のみ | **有効期限をメモ欄に必ず記録**。失効すると NAS で `docker compose pull` が落ちる |

### ローカル `.env.local`（登録対象外）

| キー | 値の出どころ |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | `npx supabase status` の出力 |

ローカル Supabase が起動時に生成するローカル専用値で、**本番の値を一切含まない**。
`npx supabase status` でいつでも再取得できる＝正本が別にあるため Bitwarden には登録しない。
（共通方針セクション 2 の「ローカル `.env` は転記先」に対する明示的な例外。
本番値をローカル `.env.local` に入れる運用に変えるなら、その時点で登録対象にする）

### ローカル `.env`（NAS 用の作業コピー / STG 実行）

`docker-compose.yml` を手元で扱うためのファイルで、キー構成は NAS の `.env` と同一。
**正本は Bitwarden の `nas/iterra-hub:production/*`。** 値の再確認は必ず Bitwarden を起点にする。

このファイルは削除しないこと。開発機から SSH で NAS の docker を操作するほか、
**STG をこのマシンの docker compose で動かしている**ため実行時に読まれる。

### 同値グループ（ローテーション時にまとめて更新するもの）

**現在なし**（2026-07-31 解消）。STG 用 Supabase プロジェクト `iterra-hub-stg`（`mddtzqixxnzdixceoxuc`）の
作成に伴い、`gh/env:staging/*` を STG 実物の値へ差し替えたため、production と staging は別の値になった。

- ローカル `.env.local` はローカル Supabase の別プロジェクトを指すため、どのグループにも属さない
- NAS の `SUPABASE_SERVICE_ROLE_KEY` は本番のみで、GitHub 側に同値の転記先を持たない

同値のエントリが再び生じたら、この表を復活させてまとめて更新する対象を明記すること。

### Bitwarden Vault 側（Secrets Manager ではない）

管理画面へ人間がログインするための資格情報は Vault に置く（Secrets Manager と混在させない）。

- Supabase ダッシュボード
- Cloudflare（Zero Trust / Access）
- GitHub

## 3. 対象外として扱うもの（判断の記録）

**登録するのは「転記先があるもの」だけ。** サービスが発行できる全キーではない。
転記先の無いキーは規約どおりのキー名（`<場所>/<スコープ>/<Secret 名>`）を付けられず、
棚卸しの対象だけが増える（共通方針⑥「用途不明のトークンを残さない」）。

| 対象 | 判断 | 理由 |
|---|---|---|
| Supabase の **S3 アクセスキー**（access key ID / secret access key） | **発行しない**。発行済みなら Revoke | Storage を S3 プロトコルで操作する実装が無い（`@aws-sdk` 未導入、`supabase.storage` の呼び出しも無し）。Storage への広い権限を持つため放置は危険 |
| Supabase の **Publishable key** | 登録済み。別エントリは作らない | `NEXT_PUBLIC_SUPABASE_ANON_KEY` がこれ。同じ値を別名で二重登録すると片方だけ更新して食い違う（共通方針④） |
| Supabase の **Secret key**（`sb_secret_`）— **STG 分** | 対象外 | STG はアプリ実行環境が無く、どこにも転記されていない。本番分は `nas/iterra-hub:production/SUPABASE_SERVICE_ROLE_KEY` として登録済み |
| Supabase の **JWT secret** / legacy anon・service_role | 対象外 | 未使用。新方式（`sb_*`）へ移行済み |
| `scripts/test-*.py` の `PASSWORD = "password123"` | 対象外 | `supabase/seeds/02-dev-users.sql` の開発専用ユーザーの値。本番に該当ユーザーは存在しない |
| `db-backup.yml` の `PGHOST` / `PGUSER` / `PGDATABASE` | 対象外 | 機密でないためワークフローに直書き。Supabase プロジェクト ref も同様 |
| `GITHUB_TOKEN` | 対象外 | Actions が実行時に自動発行する |
| `IMAGE_TAG` | 対象外 | 秘密値ではない運用値 |

**将来 Storage を使い始めたら**、その時点で転記先（サーバー側の環境変数名）を決めてから登録する。
「先に発行しておく」はしない。

## 4. Supabase API キー方式の移行（期限あり）

旧方式（`eyJ...`）は **2026 年末に廃止予定**。新方式（`sb_publishable_...` / `sb_secret_...`）へ
差し替える際は、以下すべてを更新し、Bitwarden も同時に更新する。
手順の詳細は `docs/deployment-nas.md § 1.5`。

| 転記先 | 対象キー | 反映方法 |
|---|---|---|
| `gh/env:production/NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable key | **イメージの再ビルドが必要**（ビルド時に焼き込まれる） |
| `gh/env:staging/NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable key | STG プロジェクトの値。production とは別物なので取り違えない |
| `nas/iterra-hub:production/SUPABASE_SERVICE_ROLE_KEY` | Secret key | `docker compose up -d --force-recreate` |
| ローカル `.env.local` | 両方 | `npx supabase status` から転記 |

## 5. 移行チェックリスト（2026-07-31 着手）

**Bitwarden 側（ユーザー作業。値を扱うため Claude は実施しない）**
- [x] Secrets Manager にプロジェクト `iterra-hub` を作成
- [x] セクション 2 の 9 件を登録
      `gh/env:production/` 3 件・`gh/env:staging/` 3 件・`nas/iterra-hub:production/` 3 件
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
- [x] 同値グループを解消（セクション 2）

**未了（設計判断が残っているもの）**
- [ ] STG へのマイグレーション自動適用。現状 `db push` は手動のため、本番と STG のスキーマがずれ得る
      （Supabase Branching なら構造的に防げる部分。セクション 7 の判断記録を参照）
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

## 6. 運用ルール（このリポジトリ固有）

- シークレットを 1 つ増やすときは「Bitwarden へ登録 → 転記先へ登録 → 参照側の実装を確認 → この台帳に追記」の順で行う
- **登録しただけでは動かない。** ワークフローやコードから参照して初めて効く
- **環境をまたぐ値は production / staging の両方に登録する。** 同値でもエントリは分ける
- `NEXT_PUBLIC_*` に秘密値を入れない。RLS をバイパスする値は必ずサーバー側の変数名にする
- 不要になったトークンはその場で Revoke する

### Environment の中身を確認するコマンド（値は表示されない）

```bash
gh api repos/:owner/:repo/environments --jq '.environments[].name'
gh secret list --env production
gh secret list --env staging
gh secret list                      # 0 件が正しい状態
```

## 7. 判断の記録: なぜ Supabase Branching ではなく別プロジェクトなのか

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
ワークフローを足せば、無料のままこの弱点だけを潰せる（セクション 5 の未了項目）。

### 見直す条件

以下のいずれかで Pro へ上げる判断が出たら、Branching を再検討する。

- PITR が必要になった（現在は `db-backup.yml` の日次 `pg_dump` で代替）
- Free の**アクティブ 2 プロジェクト上限**が支障になった（`iterra-hub` + `iterra-hub-stg` で現在ちょうど上限）
- PR 単位の preview 環境が欲しくなった

**移行時に捨てるのは `scripts/setup-staging.sh` と `.github/workflows/staging-keepalive.yml` の 2 つだけ。**
`supabase/migrations` と seed の構成、GitHub Environment によるシークレット分離はそのまま流用できる。
