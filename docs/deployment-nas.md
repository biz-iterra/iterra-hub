# NAS(Docker) + Cloudflare Tunnel デプロイ手順

Vercel から自社 NAS 上の Docker へ移行するための構成と手順。

## 進捗（最終更新: 2026-07-29）

**移行は完了し、`https://hub.iterra.online` でログインできる状態。**

| # | 作業 | 状態 |
|---|---|---|
| 0 | 本番 Supabase の構築（マイグレーション / マスタ / leads 3,008 件 / ユーザー） | ✅ 完了 |
| 1 | GitHub Secrets の登録 | ✅ 完了 |
| 2 | Cloudflare Tunnel | ✅ 完了 |
| 3 | Cloudflare Access（`iterra-members` / `health-check-bypass`） | ✅ 完了 |
| 4 | Supabase Auth の URL 設定 | ✅ 完了 |
| 5 | NAS への配置と起動 | ✅ 完了（app healthy / tunnel 接続済み） |
| 6〜9 | 更新・ロールバック手順 / 動作確認 / 運用 | 手順整備済み |

### 残作業

| 作業 | 内容 |
|---|---|
| 実機検証 | § 7.2 のチェックリストを通しで実施 |
| 外部監視の設定 | UptimeRobot 等で `/api/health` を 5 分間隔監視（§ 8.1） |
| NAS の自動起動確認 | 停電復帰時に NAS と Docker が自動起動するか（§ 8） |
| DB パスワードのローテーション | 構築時に平文で扱ったため要変更。あわせて Secret `SUPABASE_DB_PASSWORD` も更新 |

### 実施済みの内容（記録）

- 本番 Supabase: `aqkesxqxrsucgrnguhnb`（Tokyo）。マイグレーション 68 本適用済み
- `admin@iterra.jp` は 35 カラムの `created_by` DEFAULT に使われるため削除せず封じ込め（§0.5）
- 退職者 3 名（小川 / 田中 / 伏見）はメール送信なしで SQL 作成。UUID を開発環境と揃えたため
  `04-leads.sql` は置換なしで投入できた
- 実運用アカウント: `ishida@iterra.jp`（admin / `is_active = true`）
- Access の認証はメール OTP（One-time PIN）。`@iterra.jp` のメールボックスが実在する
  アドレスでないとコードが届かない（未登録アドレスでも「送信しました」と表示される仕様）

### 構築時に詰まった点（再発防止）

| 症状 | 原因と対処 |
|---|---|
| `supabase link` が `AlreadyExists` | `supabase/.temp` の残骸。削除して再実行 |
| `db push` が `20260416040014` で失敗 | CLI の表示上の問題。記録は済んでおり `Remote database is up to date` になった。ポリシー数を照合して実適用を確認した |
| `psql: command not found` | Windows に psql 単体は入っていない。ローカル Supabase の PostgreSQL 17 コンテナを経由する（§0.4） |
| `could not translate host name db.<ref>.supabase.co` | Direct connection は IPv6 専用。**Session pooler を使う**（§0.4） |
| `Tenant or user not found` | pooler の `aws-0` / `aws-1` の選択誤り。DNS はどちらも解決するため試して判別 |
| Access の認証コードが届かない | 実在しないメールアドレスを入力していた。未登録でも「送信しました」と表示される（ユーザー列挙対策） |
| `cloudflared`: `Provided Tunnel token is not valid` | `.env` にプレースホルダの山括弧 `<>` が残っていた。`sed -i 's/[<>]//g' .env` で除去 |
| `git checkout` で `Deletion of directory failed` | dev サーバー（Turbopack）がファイルをロック。停止してから実行する |

## 構成

```
ブラウザ（社員）
   │  https://hub.iterra.online
   ▼
Cloudflare（TLS 終端 / Access で認証）
   │  Tunnel（NAS からの outbound 接続のみ。ポート開放なし）
   ▼
NAS: UGREEN DXP4800 GT（192.168.10.200 / amd64 / 4C8T / 8GB / UPS 有）
   ├─ cloudflared コンテナ
   └─ app コンテナ（Next.js standalone / ポート非公開）
          │ outbound
          ▼
   Supabase（Tokyo リージョン / SaaS のまま）
```

- アプリはホストにポートを公開せず、`cloudflared` からのみ到達する
- DB は Supabase の SaaS を継続利用（セルフホストしない）
- バックアップは GitHub Actions の日次 `pg_dump`（`docs/operation-manual.md § 13`）

## 0. 本番 Supabase の用意

**これまで開発はローカル Supabase（`127.0.0.1:54331`）だけで行われており、クラウドの本番プロジェクトは存在しない。**
NAS 移行の前に本番 DB を用意する必要がある。

### 0.1 プロジェクト作成とリンク

1. supabase.com でプロジェクトを新規作成する

   | 項目 | 値 |
   |---|---|
   | Region | Northeast Asia (Tokyo) |
   | Database Password | 強度の高いものを生成し、パスワードマネージャに保管 |

2. リポジトリをリンクする（`<ref>` はダッシュボード URL に含まれる文字列）

```bash
npx supabase login
npx supabase link --project-ref <ref>
```

### 0.2 マイグレーションの適用

```bash
npx supabase db push --include-all
```

`20260421*` のタイムスタンプが `20260422*` 系より過去にあるため、
`--include-all` を付けないと out-of-order としてスキップされる。

適用後、以下が作られていることを確認する。

| 確認対象 | 期待 |
|---|---|
| `promote_lead_to_deal` 関数 | 1 件 |
| `*_change_log` トリガー | 27 件（9 テーブル × 3 イベント） |
| `entity_change_logs` テーブル | 存在する |
| pg_cron のスコア再計算ジョブ | 登録済み |

### 0.3 seed の構成

本番投入の可否で 4 分割してある（`supabase/seeds/`）。

| ファイル | 内容 | 本番 |
|---|---|---|
| `01-masters.sql` | 業務マスタ（パイプライン・ステージ・リード各マスタ・診断マスタ等） | **投入する** |
| `seed-talent-classification.sql` | スキル体系 99 件 + タレント分類マスタ | **投入する** |
| `02-dev-users.sql` | テストユーザー（共通パスワード） | 投入しない |
| `03-dev-samples.sql` | サンプルの取引データ | 投入しない |
| `04-leads.sql` | 架電リスト由来の実業務データ（leads 3,008 / activities 1,008） | **投入する**（§0.6） |
| `prod-disable-system-account.sql` | システム用アカウントの封じ込め | **本番のみ**（§0.5） |
| `prod-retired-users.sql` | 退職済み担当者（メール送信なし） | **本番のみ**（§0.5） |

```bash
psql "<本番の接続文字列>" -f supabase/seeds/01-masters.sql
psql "<本番の接続文字列>" -f supabase/seed-talent-classification.sql
```

### 0.4 接続方法（重要）

**Direct connection（`db.<ref>.supabase.co`）は使えない。** IPv6 専用のため、
Docker コンテナからは名前解決に失敗する（`could not translate host name`）。
**Session pooler を使うこと。**

| 方式 | ホスト | ユーザー名 | 可否 |
|---|---|---|---|
| Direct | `db.<ref>.supabase.co:5432` | `postgres` | ✗ IPv6 のみ |
| **Session pooler** | `aws-0-ap-northeast-1.pooler.supabase.com:5432` | `postgres.<ref>` | **○** |

`aws-0` / `aws-1` はプロジェクトにより異なる。DNS はどちらも解決するため、
誤ると `Tenant or user not found` が返る。ダッシュボードの Connect パネルで確認する。

ローカルに `psql` が無い場合は、ローカル Supabase の PostgreSQL 17 コンテナを経由する。

```powershell
$env:PGPASSWORD = "<Database Password>"

docker cp <ファイル> supabase_db_iterra-hub:/tmp/x.sql
docker exec -e PGPASSWORD supabase_db_iterra-hub psql -h aws-0-ap-northeast-1.pooler.supabase.com -p 5432 -U postgres.<ref> -d postgres -v ON_ERROR_STOP=1 -f /tmp/x.sql
```

`-e PGPASSWORD` は値を書かないことでホストの環境変数を引き継ぐ。
コマンド履歴にパスワードが残らず、URL エンコードも不要になる。

Git Bash から実行する場合、`docker cp` / `docker exec` のコンテナ側パスが
Windows パスに変換されてしまうため `MSYS_NO_PATHCONV=1` を付ける（PowerShell では不要）。

### 0.5 ユーザーの用意

`crm_users.id` は `auth.users(id)` への外部キーで、**自動連携のトリガーは無い**。
Auth にユーザーを作ったうえで `crm_users` にも登録する必要がある。

#### システム用アカウント（`admin@iterra.jp`）を封じる

`20260418000009_add_audit_columns.sql` が UUID `a0000000-...-0001` を作成し、
**35 個のカラムの `created_by` DEFAULT 値**として埋め込んでいる。

```sql
ALTER TABLE pipeline_types ADD COLUMN created_by UUID NOT NULL
  DEFAULT 'a0000000-0000-0000-0000-000000000001' REFERENCES crm_users(id), ...
```

このため**削除も UUID 変更も不可**（INSERT が全て外部キー違反になる）。
レコードは残したまま、人が使えないアカウントとして封じる。

```
supabase/seeds/prod-disable-system-account.sql
```

- `banned_until = 'infinity'` … ログイン禁止
- `is_active = false` … 担当者候補（`getCrmUsers`）から除外
- `full_name = 'システム（初期投入）'` … `created_by` 表示を用途が分かる名前に

無効化しても `created_by` の DEFAULT は機能する（検証済み）。

#### 退職済み担当者（メール送信なし）

`leads` / `lead_activities` の担当者列が参照するため、退職者でもレコードが必要。
ダッシュボードの招待ではなく SQL で作成する。

```
supabase/seeds/prod-retired-users.sql
```

SQL で作る理由は 2 つある。

1. 招待メールが飛ばない
2. **UUID を開発環境と同じ値に固定できる** → `04-leads.sql` を置換なしで投入できる

`banned_until = 'infinity'` + `is_active = false` でログイン不可・担当者候補外とし、
対応履歴の担当者名だけを残す。

#### 実運用アカウント

ダッシュボード（Authentication → Users → Add user → **Create new user**）で作成する。
`Auto Confirm User` をオンにすればメール確認を省略できる。
`admin@iterra.jp` は上記のシステム用途で使用済みのため、**別アドレス**にする。

作成後、UUID を確認して `crm_users` に登録する（SQL Editor で実行可）。

```sql
INSERT INTO crm_users (id, email, full_name, full_name_kana, role, is_active) VALUES
  ('<AuthのUUID>', '<メール>', '<氏名>', '<カナ>', 'admin', TRUE);
```

#### 完了状態

```sql
SELECT c.email, c.full_name, c.role, c.is_active,
       (u.banned_until IS NOT NULL) AS banned
  FROM crm_users c JOIN auth.users u ON u.id = c.id
 ORDER BY c.is_active DESC, c.email;
```

`is_active = true` が実運用アカウントのみになっていること。

### 0.6 実業務データ（leads）の投入

`prod-retired-users.sql` で UUID を固定しているため、**置換は不要**。
そのまま投入できる。

```powershell
docker cp supabase/seeds/04-leads.sql supabase_db_iterra-hub:/tmp/leads.sql
docker exec -e PGPASSWORD supabase_db_iterra-hub psql -h aws-0-ap-northeast-1.pooler.supabase.com -p 5432 -U postgres.<ref> -d postgres -v ON_ERROR_STOP=1 --single-transaction -f /tmp/leads.sql
```

`--single-transaction` により、途中失敗時は全件ロールバックされる（部分投入が残らない）。
1.8MB あるため数十秒〜数分かかる。`statement timeout` が出る場合は先に
`alter role postgres set statement_timeout = '15min'` を実行する。

担当者 UUID を差し替える必要がある場合（実運用者へ引き継ぐ等）は変換スクリプトを使う。
置換漏れを検出して停止するため、手作業の `sed` より安全。

```powershell
node scripts/remap-lead-owners.mjs --out ./04-leads-prod.sql --map <旧UUID>=<新UUID>
```

#### 投入結果

| 対象 | 件数 |
|---|---|
| `leads` | 3,008 |
| `lead_activities` | 1,008 |

`entity_change_logs` にも INSERT のログが積まれる（トリガーによる正常な記録）。
`changed_by` は psql 経由ではセッション情報が無いため NULL になる。

---

## 1. 事前準備 — シークレットの発行と登録先

登録先は 3 か所ある。**どこで発行した値をどこに入れるか**を取り違えないこと。

| 登録先 | 用途 | 件数 |
|---|---|---|
| GitHub リポジトリの Secrets | CI（イメージビルド・日次バックアップ） | 3 |
| NAS の `.env` | コンテナ実行時 | 2 |
| NAS の `docker login` | GHCR からの pull | 1（保存しない） |

### 1.1 GitHub Secrets

登録場所: GitHub → `biz-iterra/iterra-hub` → **Settings → Secrets and variables → Actions → New repository secret**

| Secret 名 | 発行元 | 備考 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → **API** → Project URL | `https://<ref>.supabase.co`。ローカルの `.env.local` にある値と同じ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → **API Keys** → Publishable key<br>（旧方式なら Legacy API Keys タブの `anon public`） | ブラウザに配布される公開値。`.env.local` の値と同じ |
| `SUPABASE_DB_PASSWORD` | Database → Settings → Reset database password | **パスワードのみ**を登録する（接続文字列ではない） |

> **接続文字列を Secret にしないこと。** パスワードに `@ & # / : ?` が含まれると
> URL のパースが崩れ、`could not translate host name "pZ...@aws-0-..."` のように
> ホスト名を誤認識する（実際に発生した）。
> ワークフローは libpq の環境変数（`PGHOST` / `PGUSER` / `PGPASSWORD` 等）で渡すため、
> URL エンコードは不要。ホストやユーザー名は機密でないのでワークフローに直書きしている。

`NEXT_PUBLIC_*` は**イメージのビルド時に確定し、クライアントバンドルへ焼き込まれる**。
値を変えたらイメージの再ビルドが必要で、コンテナの環境変数を書き換えても反映されない。

### 1.2 NAS の `.env`

配置場所: `/volume1/docker/iterra-hub/.env`（`chmod 600`）

| キー | 発行元 | 備考 |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → **API Keys** → Secret keys<br>（旧方式なら Legacy API Keys タブの `service_role`） | **RLS をバイパスする。GitHub Secrets には登録しない**（ビルドに不要かつ漏洩面を増やさないため） |
| `CLOUDFLARE_TUNNEL_TOKEN` | Cloudflare Zero Trust → Networks → Tunnels → 作成時に表示される `--token` の値 | `eyJ...` で始まる長い文字列。**新規に発行が必要** |

### 1.3 GHCR へのログイン用トークン（ファイルに保存しない）

リポジトリが private のためイメージも private。NAS から pull するのに必要。

| 項目 | 内容 |
|---|---|
| 発行元 | GitHub → Settings → Developer settings → **Personal access tokens → Tokens (classic)** → Generate new token |
| 必要スコープ | `read:packages` のみ |
| 使い方 | NAS 上で `docker login`（§5.2）。`.env` には書かない |

### 1.4 イメージの配布

`main` への push で `.github/workflows/docker-publish.yml` が動き、GHCR に push される。

- `ghcr.io/biz-iterra/iterra-hub:latest` — 通常運用
- `ghcr.io/biz-iterra/iterra-hub:sha-<コミットSHA>` — 切り戻し用

リポジトリが private のためイメージも private。NAS 側で GHCR へのログインが必要（§5.2）。

### 1.5 Supabase の API キー方式

Supabase は API キーを新方式（`sb_publishable_...` / `sb_secret_...`）へ移行中で、
**旧来の anon / service_role キーは 2026 年末に廃止予定**。

**アプリ側のコード変更は不要。** 環境変数名は変えず、値だけを差し替える。

| 環境変数 | 旧（〜2026年末） | 新 | 取得元 |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public（`eyJ...`） | Publishable key（`sb_publishable_...`） | Settings → API Keys |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role（`eyJ...`） | Secret key（`sb_secret_...`） | 同上 |

#### 現在どちらを使っているかの判定

値の先頭で判別できる。ローカルなら次のコマンドで確認できる（値は表示しない）。

```bash
awk -F'=' '/^(NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY)=/{v=substr($0,index($0,"=")+1); print $1": "(substr(v,1,3)=="sb_" ? "新方式" : (substr(v,1,3)=="eyJ" ? "legacy（2026年末廃止）" : "未設定"))}' .env.local
```

| 先頭 | 方式 |
|---|---|
| `sb_publishable_` / `sb_secret_` | 新方式 |
| `eyJ` | legacy。廃止前に差し替えが必要 |

#### 差し替える場所

| 場所 | 対象 |
|---|---|
| ローカル `.env.local` | 両方 |
| GitHub Secrets | `NEXT_PUBLIC_SUPABASE_ANON_KEY`（**差し替え後はイメージの再ビルドが必要**） |
| NAS の `.env` | `SUPABASE_SERVICE_ROLE_KEY` → `docker compose up -d --force-recreate` |

`NEXT_PUBLIC_*` はビルド時にクライアントバンドルへ焼き込まれるため、
Secrets を変えただけでは反映されない点に注意。

#### ローカル開発環境について

ローカル Supabase は CLI v2.90+ が新方式のキーを出力するため、既に `sb_*` 形式になっている
（`npx supabase status` の Publishable / Secret）。

**`SUPABASE_SERVICE_ROLE_KEY` の設定を忘れないこと。** 未設定でも画面表示は動くが、
`createAdminClient()` を使う以下の処理が失敗する。

- リードのバルク更新（`src/actions/leads.ts`）
- スコア再計算（`src/lib/leads/recalculate-score.ts`）

RLS をバイパスするクライアントのため、1000 件超の一括処理でのみ使用している。
## 2. Cloudflare Tunnel

Zero Trust ダッシュボードの **Networks → Tunnels** で作成する。

1. **Create a tunnel** → コネクタは **Cloudflared** を選択
2. 名前を入力（例: `iterra-hub`）→ **Save tunnel**
3. インストール手順が表示される。**`--token` の後ろの文字列だけをコピー**する
   （NAS の `.env` の `CLOUDFLARE_TUNNEL_TOKEN` に設定。コマンド全体ではない）
4. **Route Traffic**（Public Hostname）を設定する

   | 項目 | 値 |
   |---|---|
   | Subdomain | `hub` |
   | Domain | `iterra.online` |
   | Path | 空欄 |
   | Type | `HTTP` |
   | URL | `app:3000` |

   `app` は compose のサービス名。同一 Docker ネットワーク内で名前解決される。
   `localhost` や NAS の IP ではないことに注意。

DNS の CNAME レコードは Tunnel 側が自動作成する。

## 3. Cloudflare Access（社内限定）

Tunnel だけでは URL を知っていれば誰でも到達できるため、Supabase 認証の手前にもう一段挟む。

**メニュー階層に注意**: アプリケーションとポリシーは別の場所で管理する。
ポリシーを先に作っておくと、アプリ作成時に選択するだけで済む。

### 3.1 ポリシーを作成する

**Zero Trust → Access controls → Policies → Add a policy**

社内メンバー用（Allow）:

| 項目 | 値 |
|---|---|
| Policy name | `iterra-members` |
| Action | **Allow** |
| Session duration | 任意（既定のままで可） |
| Rules → Include → Selector | **Emails ending in** |
| Value | `@iterra.jp` |

ヘルスチェック用（Bypass）:

| 項目 | 値 |
|---|---|
| Policy name | `health-check-bypass` |
| Action | **Bypass** |
| Rules → Include → Selector | **Everyone** |

Bypass は認証を要求せず通過させる。外形監視が Access のログイン画面を
受け取らないようにするために必要。

### 3.2 アプリケーションを 2 つ作成する

**Zero Trust → Access controls → Applications → Create new application**
→ **Self-hosted and private** → **Add public hostname**

Access は「より具体的なパスを持つアプリ」を優先して評価する。
そのためヘルスチェックだけを別アプリとして切り出し、Bypass を割り当てる。

**① アプリ本体**

| 項目 | 値 |
|---|---|
| Application name | `iterra-hub` |
| Domain | `iterra.online` |
| Subdomain | `hub` |
| Path | 空欄 |
| Access policies | `iterra-members` を選択 |

**② ヘルスチェック（Bypass 用）**

| 項目 | 値 |
|---|---|
| Application name | `iterra-hub-health` |
| Domain | `iterra.online` |
| Subdomain | `hub` |
| Path | `api/health` |
| Access policies | `health-check-bypass` を選択 |

Path は先頭のスラッシュを含めない表記（`api/health`）で入力する。

> Access アプリは**すべて既定で拒否**され、Allow ポリシーに一致した場合のみ通る。
> ①にポリシーを付け忘れると誰もアクセスできなくなる。

### 3.3 動作確認

| 対象 | 期待結果 |
|---|---|
| `https://hub.iterra.online` をブラウザで開く | Cloudflare の認証画面 → 通過後にアプリのログイン画面 |
| `@iterra.jp` 以外のメールで試行 | 拒否される |
| `curl https://hub.iterra.online/api/health` | 認証なしで `{"status":"ok"}` が返る |

3 番目が HTML（ログイン画面）を返す場合は、②のアプリまたは Bypass ポリシーの
設定が効いていない。Path の表記と、ポリシーの割り当てを確認する。

## 4. Supabase 側の設定

Authentication → **URL Configuration**

| 項目 | 値 |
|---|---|
| Site URL | `https://hub.iterra.online` |
| Redirect URLs | `https://hub.iterra.online/**` |

未設定のままだとログイン後のリダイレクト先が旧ドメインになり、ログインループになる。

## 5. NAS への配置

### 5.1 ディレクトリと設定ファイル

```bash
mkdir -p /volume1/docker/iterra-hub
cd /volume1/docker/iterra-hub
# リポジトリの docker-compose.yml と .env.example を配置し、.env を作成する
cp .env.example .env
vi .env   # SUPABASE_SERVICE_ROLE_KEY と CLOUDFLARE_TUNNEL_TOKEN を設定
chmod 600 .env
```

### 5.2 GHCR へのログイン

GitHub で `read:packages` 権限の Personal Access Token を発行し、NAS 上で:

```bash
echo "<PAT>" | docker login ghcr.io -u <GitHubユーザー名> --password-stdin
```

### 5.3 起動

```bash
docker compose pull
docker compose up -d
docker compose ps          # app が healthy になることを確認
docker compose logs -f app
```

`app` が healthy になってから `cloudflared` が起動する（`depends_on` の条件指定）。

## 6. 更新とロールバック

### 更新

```bash
cd /volume1/docker/iterra-hub
docker compose pull
docker compose up -d
docker image prune -f      # 古いイメージの掃除
```

### ロールバック

GHCR のタグ一覧から戻したいコミット SHA を確認し、`.env` に指定する。

```bash
echo "IMAGE_TAG=sha-<コミットSHA>" >> .env
docker compose up -d
```

戻し終えたら `.env` から `IMAGE_TAG` を削除して `latest` 運用に戻す。

**自動更新（Watchtower 等）は使わない。** 基幹システムでは、更新タイミングを人が握る方が安全。

## 7. 動作確認

### 7.1 経路の確認

| 確認項目 | 期待結果 |
|---|---|
| `curl https://hub.iterra.online/api/health` | `{"status":"ok"}` / HTTP 200 |
| `curl "https://hub.iterra.online/api/health?deep=1"` | `{"status":"ok","database":"ok"}` |
| ブラウザで `https://hub.iterra.online` | Access の認証 → アプリのログイン画面 |
| 未認証で `/dashboard` | `/login` へ 307 リダイレクト |

### 7.2 本番実機の検証チェックリスト

移行直後に一度通しで確認する。開発環境向けの詳細手順は `docs/test-checklist.md`。
ここでは **本番固有の観点**（データ量・レイテンシ・本番ユーザー・移行の副作用）に絞る。

#### 表示・データ

| # | 確認項目 | 期待結果 |
|---|---|---|
| 1 | ダッシュボードの KPI カード | 数値が表示される（DB 接続の確認） |
| 2 | リード一覧 `/leads` | **3,008 件**。ページネーションが 30 件単位で動く |
| 3 | リード詳細を開く | スコア・温度感・対応履歴が表示される |
| 4 | 対応履歴のある リード | `lead_activities` が時系列で並ぶ（全体で 1,008 件） |
| 5 | コンタクト・カンパニー・アカウント・ディール一覧 | **0 件**（本番はサンプル未投入。空状態の表示が崩れないこと） |
| 6 | タレント一覧 | 0 件。職種タブが「分類マスタが未登録」ではなく空表示になること |
| 7 | 管理画面 `/admin` | 7 グループ・21 タブが表示され、マスタに値が入っている |

#### 権限・ユーザー

| # | 確認項目 | 期待結果 |
|---|---|---|
| 8 | 担当者ドロップダウン（リード編集等） | **石田のみ**が候補に出る（退職者 3 名は `is_active = false` で除外） |
| 9 | 既存リードの担当者表示 | 小川 / 田中 / 伏見の名前が**表示される**（履歴として保持） |
| 10 | サイドバー | admin なので「各種設定」「契約」が表示される |
| 11 | `admin@iterra.jp` でログイン試行 | **失敗する**（`banned_until = infinity`） |

#### 書き込み・整合性

| # | 確認項目 | 期待結果 |
|---|---|---|
| 12 | リードを新規登録 | 保存でき、一覧に出る |
| 13 | リードを編集して保存 | 反映される |
| 14 | **楽観ロック**: 同じリードを 2 つのタブで開き、両方で保存 | 後から保存した側が「他のユーザーによって更新されています」で弾かれる |
| 15 | **変更履歴**: 編集後に `entity_change_logs` を確認 | 変更カラムのみ記録され、`changed_by` に石田の UUID が入る |
| 16 | **Deal 昇格**: リードを Opportunity ステージへ | Company / Contact / Account / Deal が同時に作成される |
| 17 | 昇格済みリードを再度昇格 | 「すでに Deal に昇格済みです」で拒否される |

#### パフォーマンス（本番固有）

| # | 確認項目 | 目安 |
|---|---|---|
| 18 | 各ページの初回表示 | **middleware が全リクエストで `auth.getUser()` を呼ぶ**ため、NAS ↔ Supabase(Tokyo) の往復が全ページに乗る。1 秒を大きく超えるなら要検討 |
| 19 | リード一覧（3,008 件）の表示 | ページネーションが効いているので件数の影響は小さいはず |
| 20 | 社外ネットワークからのアクセス | Cloudflare 経由なので社内と体感差が小さいこと |

18 で遅さが問題になる場合、セッション検証の間引き（毎リクエストではなく一定間隔で検証）が
最初の改善候補になる。

#### 確認用クエリ

```sql
-- 15 の変更履歴確認
SELECT table_name, operation, changed_fields, changed_by, changed_at
  FROM entity_change_logs
 ORDER BY changed_at DESC LIMIT 5;

-- 16 の昇格結果確認
SELECT promoted_deal_id, promoted_company_id, promoted_contact_id, promoted_account_id
  FROM leads WHERE promoted_deal_id IS NOT NULL;
```

## 8. 運用上の注意

- **NAS の可用性がそのまま基幹システムの可用性になる。** UPS（US3000）は接続済みだが、
  停電復帰時に NAS と Docker が自動起動する設定になっているか確認すること
- OS/DSM 更新時はサービス断が発生する。業務時間外に実施する
- `middleware` は全リクエストで Supabase の `auth.getUser()` を呼ぶため、
  NAS ↔ Supabase(Tokyo) 間のレイテンシが全ページに乗る。体感が遅い場合はここを最初に疑う
- ログは 10MB × 3 世代でローテーションする設定（`docker-compose.yml`）

### 8.1 死活監視

**分単位の監視は外部サービスに任せる。** GitHub Actions の cron は実行が数分〜数十分
遅延することがあり、private リポジトリの無料枠（2,000 分/月）も圧迫するため
（15 分間隔で約 1,440 分/月）監視用途には向かない。

| 層 | 手段 | 間隔 | 状態 |
|---|---|---|---|
| コンテナ | Docker healthcheck（`/api/health`） | 30 秒 | 設定済み。3 回失敗で unhealthy |
| 外形（分単位） | **UptimeRobot 等の無料監視サービス** | 5 分 | **要設定** |
| 外形（詳細） | GitHub Actions `health-check.yml`（`?deep=1` で DB 疎通も確認） | 日次 JST 07:00 | 設定済み |

外部監視サービスの設定値:

| 項目 | 値 |
|---|---|
| 監視 URL | `https://hub.iterra.online/api/health` |
| 期待するステータス | 200 |
| 期待する本文 | `{"status":"ok"}` |

このパスは Cloudflare Access の Bypass 対象（§3.1）なので、認証なしで監視できる。
`?deep=1` を付けると Supabase への疎通も確認するが、外部監視では付けなくてよい
（DB 障害でアプリを再起動しても復旧しないため、アプリの生存確認に絞る）。

Cloudflare の Health Checks は Pro プラン以上の機能なので、無料構成では使えない。

### 8.2 復旧の優先順位

障害時は以下の順で切り分ける。

1. `https://hub.iterra.online/api/health` — 200 なら経路は生きている
2. `docker compose ps` — `app` が healthy か
3. `docker compose logs cloudflared` — `Registered tunnel connection` が出ているか
4. Supabase のステータス — https://status.supabase.com/
5. `docker compose logs app` — アプリ側のエラー

`app` が unhealthy で再起動を繰り返す場合、多くは `.env` の環境変数の不備。
`docker compose config` で展開後の値を確認する（**出力にシークレットが含まれるため画面共有時は注意**）。

## 9. トラブルシューティング

| 症状 | 確認先 |
|---|---|
| 502 / 「Tunnel error」 | `docker compose logs cloudflared`。app が healthy か確認 |
| ログインループ | Supabase の Site URL / Redirect URLs（§4） |
| ヘルスチェックが Access のログイン画面を返す | Access の Bypass ポリシー（§3-4） |
| `docker compose pull` が 401 | GHCR のログイン（§5.2）。PAT の有効期限も確認 |
| コンテナが unhealthy を繰り返す | `docker compose logs app`。環境変数の未設定が多い |
