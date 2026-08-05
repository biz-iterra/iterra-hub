# NAS(Docker) + Cloudflare Tunnel デプロイ手順

Vercel から自社 NAS 上の Docker へ移行するための構成と手順。

## 進捗（最終更新: 2026-07-30）

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
| 書き込み系の実機検証 | § 7.2 #12〜17。**テスト用の行を作らず、実業務での初回操作に合わせて確認する**（手順は § 7.3） |
| #11 / #20 | 封じ込めアカウントのログイン試行（ログアウトを伴う）と社外回線からのアクセス |

### 完了した残作業

| 作業 | 完了日 |
|---|---|
| DB パスワードのローテーション（Secret `SUPABASE_DB_PASSWORD` も更新） | 2026-07-30 |
| NAS の自動起動確認（停電復帰時） | 2026-07-30 |
| 外部監視（UptimeRobot で `/api/health` を 5 分間隔） | 2026-07-30 |
| 実機検証の読み取り系（§ 7.2 #1〜10、#18、#19） | 2026-07-30 |

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
| GitHub Environment `production` の Secrets | CI（イメージビルド・日次バックアップ） | 3 |
| NAS の `.env` | コンテナ実行時 | 2 |
| NAS の `docker login` | GHCR からの pull | 1（保存しない） |

**値の正本は Bitwarden Secrets Manager（プロジェクト `iterra-hub`）。**
ここに挙げた登録先はすべて転記先で、値の再確認・ローテーションは Bitwarden を起点に行う。
キー名と転記先の対応表は `docs/secrets-management.md`（台帳）、
全プロジェクト共通の原則は `~/.claude/docs/secrets-policy.md` を参照。

### 1.1 GitHub Secrets（Environment: production）

登録場所: GitHub → `biz-iterra/iterra-hub` → **Settings → Environments → `production` → Add environment secret**

Environment は `production` と `staging` の 2 つ。**同じ値でも両方に登録する**
（片方だけ更新して食い違う事故を防ぐため。共通方針④）。

**リポジトリレベル（Settings → Secrets and variables → Actions）には登録しない。**
Environment に無い Secret はリポジトリレベルへ静かにフォールバックするため、
両方に置くと「分離できているつもりで実は古い値で動いていた」という事故になる。
`staging` が未登録のままリポジトリレベルに本番の値が残っていると、
**STG のつもりで本番 DB を触る**ことになるので特に危険。
参照側のジョブには `environment: production` を指定済み（`docker-publish.yml` / `db-backup.yml`）。

| Secret 名 | 発行元 | 備考 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → **API** → Project URL | `https://<ref>.supabase.co`。**公開値** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → **API Keys** → Publishable key<br>（旧方式なら Legacy API Keys タブの `anon public`） | ブラウザに配布される**公開値**（RLS 前提の設計）。Secret key と取り違えないこと |
| `SUPABASE_DB_PASSWORD` | Database → Settings → Reset database password | **パスワードのみ**を登録する（接続文字列ではない） |

いずれも本番 Supabase の値。ローカル `.env.local` はローカル Supabase の別プロジェクトを指すため、
値は一致しない（`npx supabase status` から転記する）。

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

この 2 件も Bitwarden に `nas/iterra-hub:production/<キー名>` として登録する（正本）。
手元に NAS 用 `.env` の複製を増やさないこと。NAS へ再投入する値は Bitwarden から取り直す。

### 1.3 GHCR へのログイン用トークン（`.env` には書かない）

リポジトリが private のためイメージも private。NAS から pull するのに必要。

| 項目 | 内容 |
|---|---|
| 発行元 | GitHub → Settings → Developer settings → **Personal access tokens → Tokens (classic)** → Generate new token (classic) |
| 種別 | **classic 必須。** fine-grained PAT は ghcr.io に対応していない |
| トークン名（Note） | `iterra-hub nas:production GHCR pull`（使用場所がそのまま分かる名前） |
| Expiration | **1 年**。無期限にしない（期限切れが棚卸しの契機になる） |
| 必要スコープ | **`read:packages` のみ。** GHCR はパッケージ側で権限を持つため private リポジトリでも `repo` は不要 |
| 使い方 | NAS 上で `docker login`（§5.2）。`.env` には書かない |
| Bitwarden | `nas/iterra-hub:production/GHCR_PULL_TOKEN`。メモ欄にトークン名・スコープ・**有効期限**を記録する（失効すると `docker compose pull` が 401 で落ちる） |

期限を後から確認するコマンド（値は表示されない）:

```bash
read -rsp 'GHCR PAT: ' GHCR_PAT; echo
curl -sSI -H "Authorization: token $GHCR_PAT" https://api.github.com/user \
  | grep -i 'github-authentication-token-expiration'
unset GHCR_PAT
```

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
| ローカル `.env.local` | 両方（`npx supabase status` から転記。ローカル Supabase の値） |
| GitHub Environment `production` | `NEXT_PUBLIC_SUPABASE_ANON_KEY`（**差し替え後はイメージの再ビルドが必要**） |
| NAS の `.env` | `SUPABASE_SERVICE_ROLE_KEY` → `docker compose up -d --force-recreate` |

差し替えたら **Bitwarden 側も同時に更新する**（正本が古いままだと次のローテーションで迷子になる）。

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
| Session duration | **1 month**（既定の 24 時間だと毎日 OTP を入れ直すことになる） |
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

### 3.2.1 アプリのログインと一本化する

Access を通ったあとにアプリのログイン画面が出ると、同じ人が 2 回名乗ることになる。
Access が付ける `Cf-Access-Jwt-Assertion` を検証して、そのままアプリのセッションを
張るようにしてある（`src/lib/cf-access.ts` / `/auth/cf-access`）。

有効にするには `.env` に 2 つ入れる。**両方そろって初めて有効**になり、
未設定なら従来どおりログイン画面が出る（ローカル開発は未設定のままでよい）。

**①アプリ本体（`iterra-hub`）→ Overview** から次を控える。

| `.env` のキー | 取得元 |
|---|---|
| `CF_ACCESS_TEAM_DOMAIN` | `<team>.cloudflareaccess.com`（Zero Trust の左上、チーム名から） |
| `CF_ACCESS_AUD` | **Application Audience (AUD) Tag** |

入れたら `docker compose up -d` で反映する。

- **ヘッダーの存在だけでは信用しない。** 署名・発行元・AUD まで検証する。
  経路の前提（cloudflared 経由のみ）が変わっても破れないようにするため
- Access を通っても、`crm_users` に居ない／`is_active = false` の人は入れない。
  退職者を止める経路をアプリ側にも残してある
- 認証の回数を減らすのはポリシーの **Session duration**（§3.1）。
  ここを延ばさないと Access 側の OTP を繰り返し求められる

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

### 5.0 NAS への SSH 接続

以降の作業はすべて NAS（UGREEN DXP4800 GT / `192.168.10.200`）上で実行する。

#### 有効化

UGOS Pro の管理画面 → **コントロールパネル → ターミナル**（環境により「端末と SNMP」）で
**SSH を有効化**する。ポートは既定の 22 のままでよい。

**SSH をインターネットへ公開しないこと。** 本構成は Cloudflare Tunnel の outbound 接続だけで
成立しており、ルーターのポート開放は一切不要（§構成）。SSH は LAN 内からのみ使う。

#### 鍵認証にする（推奨）

作業 PC（Windows）側で鍵を作り、公開鍵を NAS に登録する。

```powershell
ssh-keygen -t ed25519 -C "iterra-hub nas"      # パスフレーズを設定する
```

```powershell
# NAS_USER に NAS の管理者ユーザー名を入れる
$NAS_USER = ""
Get-Content "$env:USERPROFILE\.ssh\id_ed25519.pub" |
  ssh "$NAS_USER@192.168.10.200" "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

鍵でログインできることを確認してから、管理画面でパスワード認証を無効化する。

#### 接続

```powershell
ssh nas-user@192.168.10.200      # nas-user は実際のユーザー名に置き換える
```

`~/.ssh/config` に登録しておくと `ssh iterra-nas` で繋がる。

```
Host iterra-nas
  HostName 192.168.10.200
  User nas-user
  IdentityFile ~/.ssh/id_ed25519
```

#### 接続後の確認

```bash
docker version                   # 権限エラーなら sudo docker で実行する
ls -ld /volume1/docker           # 作業先の存在確認
```

`permission denied` が出る場合は各コマンドを `sudo` 付きで実行する
（以降の `docker` / `docker compose` も同様）。

#### 作業時の注意（シークレット）

- **シークレットを引数やヒアドキュメントで直接渡さない。** シェル履歴（`~/.bash_history`）に残る。
  値の入力は `vi` か `read -rs` を使う（§5.1・§5.2）
- **`.env` を作業 PC から scp しない。** 値の正本は Bitwarden。NAS 上で直接作成する
- 作業後に履歴を確認する: `grep -c 'sb_secret\|eyJ' ~/.bash_history`（0 であること）

### 5.1 ディレクトリと設定ファイル

`docker-compose.yml` はリポジトリからコピーする。`.env` は**転記せず NAS 上で作成し**、
値は Bitwarden（`nas/iterra-hub:production/*`）から入力する。

```bash
mkdir -p /volume1/docker/iterra-hub
cd /volume1/docker/iterra-hub
# リポジトリの docker-compose.yml と .env.example を配置し、.env を作成する
cp .env.example .env
vi .env   # Bitwarden の nas/iterra-hub:production/* を転記する
chmod 600 .env
```

設定するキー:

| キー | 未設定だとどうなるか |
|---|---|
| `APP_ORIGIN` | 起動はする。**Gmail 連携が Google に拒否される**（§9 の `invalid_request`）。`https://hub.iterra.online` |
| `SUPABASE_SERVICE_ROLE_KEY` | **起動しない**（compose が `:?` で止める） |
| `CLOUDFLARE_TUNNEL_TOKEN` | **公開されない**（トンネルが繋がらない） |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` / `GMAIL_TOKEN_ENCRYPTION_KEY` | 起動はする。Gmail 連携が「未設定」表示になる |
| `GMAIL_SYNC_CRON_SECRET` | 起動はする。`/api/gmail/sync` が 503 で無効（定期同期が動かない） |
| `HOUJIN_BANGOU_APP_ID` | 起動はする。法人の実在確認が「未設定」表示になる |
| `FREEE_CLIENT_ID` / `FREEE_CLIENT_SECRET` / `FREEE_TOKEN_ENCRYPTION_KEY` | 起動はする。`/admin/freee` が「未設定」表示になり、接続ボタンが出ない |
| `FREEE_SYNC_CRON_SECRET` | 起動はする。`/api/freee/sync` が 503 で無効（定期同期が動かない。画面の「今すぐ同期」は使える） |
| `GOOGLE_CONTACTS_CLIENT_ID` / `GOOGLE_CONTACTS_CLIENT_SECRET` / `GOOGLE_CONTACTS_TOKEN_ENCRYPTION_KEY` | 起動はする。`/profile` の Google コンタクト連携が「未設定」表示になり、接続ボタンが出ない |
| `GOOGLE_CONTACTS_SYNC_CRON_SECRET` | 起動はする。`/api/google-contacts/sync` が 503 で無効（定期同期が動かない） |
| `GOOGLE_CONTACTS_ALLOWED_DOMAIN` | 起動はする。**個人の Google アカウントでも接続できてしまう**（秘密値ではないが必ず設定する） |

貼り付け事故の検証（山括弧が残っていないか。値は表示されない）:

```bash
grep -c '[<>]' .env              # 0 であること
awk -F= '{print $1": "length($2)"文字"}' .env    # キーごとの桁数だけ確認
```

### 5.2 GHCR へのログイン

トークンの発行手順は §1.3。NAS 上で次を実行する。
**トークンをコマンドラインに直接書かない**（シェル履歴に残るため `read -rs` で受け取る）。

```bash
GH_USER=biz-iterra
read -rsp 'GHCR PAT: ' GHCR_PAT; echo
echo "$GHCR_PAT" | docker login ghcr.io -u "$GH_USER" --password-stdin
unset GHCR_PAT
```

検証:

```bash
docker pull ghcr.io/biz-iterra/iterra-hub:latest
```

`docker login` は認証情報を `~/.docker/config.json` に **base64 で保存する（暗号化ではない）**。
`.env` に書かないだけで、ファイルには残る点に注意する。

```bash
chmod 600 ~/.docker/config.json
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

**アプリのイメージだけでは足りないリリースがある。** 環境変数を追加した回は
`docker-compose.yml` と `.env` も配置し直す必要がある。イメージを新しくしても、
compose に `environment:` の行が無ければその値はコンテナに渡らない。

```bash
# リポジトリの docker-compose.yml を配置し直したあと
grep -c 'GMAIL_SYNC_CRON_SECRET' docker-compose.yml   # 1 以上であること
awk -F= '{print $1": "length($2)"文字"}' .env         # 値は出さず桁数だけ確認

# コンテナに実際に渡っているか（値は出さない）
docker exec iterra-hub-app sh -c 'for k in GOOGLE_OAUTH_CLIENT_ID GOOGLE_OAUTH_CLIENT_SECRET GMAIL_TOKEN_ENCRYPTION_KEY GMAIL_SYNC_CRON_SECRET HOUJIN_BANGOU_APP_ID; do v=$(printenv "$k"); echo "$k: ${#v} 文字"; done'

# freee 連携（2026-08-04 追加分）
docker exec iterra-hub-app sh -c 'for k in FREEE_CLIENT_ID FREEE_CLIENT_SECRET FREEE_TOKEN_ENCRYPTION_KEY FREEE_SYNC_CRON_SECRET; do v=$(printenv "$k"); echo "$k: ${#v} 文字"; done'
```

動いているイメージがどのコミットかは次で分かる。

```bash
docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' iterra-hub-app
```

### ロールバック

GHCR のタグ一覧から戻したいコミット SHA を確認し、`.env` に指定する。

山括弧のプレースホルダを `.env` に書き込まないこと
（`CLOUDFLARE_TUNNEL_TOKEN` に `<>` が残って Tunnel が起動しなかった事故がある。§0 のトラブル一覧）。
変数に入れてから追記し、書けた内容を必ず読み返す。

```bash
SHA=                                  # 戻したいコミット SHA を入れる
echo "IMAGE_TAG=sha-$SHA" >> .env
grep '^IMAGE_TAG=' .env               # 検証: 山括弧が無く SHA が入っていること
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
| ブラウザで `https://hub.iterra.online` | Access の認証 → そのままダッシュボード（§3.2.1 未設定ならアプリのログイン画面） |
| 未認証で `/dashboard` | `/login` へ 307 リダイレクト |

### 7.2 本番実機の検証チェックリスト

移行直後に一度通しで確認する。開発環境向けの詳細手順は `docs/test-checklist.md`。
ここでは **本番固有の観点**（データ量・レイテンシ・本番ユーザー・移行の副作用）に絞る。

**実施状況（2026-07-30）:** 読み取り系（#1〜10 / #18 / #19）は実施済みで全て期待どおり。
書き込み系（#12〜17）は本番データに行が残るため未実施。#11 はログアウトを伴うため未実施。
#20 は社外回線が必要なため未実施。

#### 表示・データ

| # | 確認項目 | 期待結果 |
|---|---|---|
| 1 | ダッシュボードの KPI カード | 数値が表示される（DB 接続の確認） |
| 2 | リード一覧 `/leads` | **3,008 件**。ページネーションが 30 件単位で動く<br>✅ 2026-07-30: 「1〜30 / 3,008件」「1 / 101」を確認 |
| 3 | リード詳細を開く | スコア・温度感・対応履歴が表示される |
| 4 | 対応履歴のある リード | `lead_activities` が時系列で並ぶ（全体で 1,008 件） |
| 5 | コンタクト・カンパニー・アカウント・ディール一覧 | **0 件**（本番はサンプル未投入。空状態の表示が崩れないこと） |
| 6 | タレント一覧 | 0 件で空表示になること。系統/グレード/職種の分類 UI は**詳細画面**（`/talents/[id]`）にあるため、タレントが 0 件のうちは確認できない<br>✅ 2026-07-30: 一覧の空表示を確認。分類マスタ（スキルカテゴリ T/D/B/M）は `/admin` に投入済み |
| 7 | 管理画面 `/admin` | 7 グループ・**22 タブ**（`admin-view.tsx` の `GROUPS`: 3+2+2+1+12+1+1）が表示され、マスタに値が入っている<br>✅ 2026-07-30: 7 グループを確認。パイプライン種別・スキルカテゴリに値あり |

#### 権限・ユーザー

| # | 確認項目 | 期待結果 |
|---|---|---|
| 8 | 担当者ドロップダウン（リード編集等） | **石田のみ**が候補に出る（退職者 3 名は `is_active = false` で除外）<br>✅ 2026-07-30: 候補は「石田優輝」1 件のみ |
| 9 | 既存リードの担当者表示 | 小川 / 田中 / 伏見の名前が**表示される**（履歴として保持）<br>✅ 2026-07-30: 一覧で「小川」「田中」を確認 |
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
| 18 | 各ページの初回表示 | **middleware が全リクエストで `auth.getUser()` を呼ぶ**ため、NAS ↔ Supabase(Tokyo) の往復が全ページに乗る。1 秒を大きく超えるなら要検討<br>✅ 2026-07-30: 70〜420ms（dashboard 420 / leads 364 / deals 292 / projects 275 / contacts 227 / campaigns 182 / admin 70）。`/api/health?deep=1` は 109ms で `database: ok` |
| 19 | リード一覧（3,008 件）の表示 | ページネーションが効いているので件数の影響は小さいはず<br>✅ 2026-07-30: 364ms。0 件の contacts（227ms）と同水準で件数の影響なし |
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

### 7.3 書き込み系の検証（実業務の操作に合わせて実施）

§ 7.2 の #12〜17 は本番データに行が残るため、**検証専用のリードを作らず、実際の業務操作の
ついでに確認する**。削除ポリシーは論理削除のみ（物理削除禁止）なので、テスト用の行を作ると
消しても DB に残り続ける。

順番に意味がある。**#14 → #12 → #13 → #15 → #16 → #17** の順で通すと、
1 件のリードを普通に育てていく流れの中で全項目を消化できる。

#### #14 楽観ロック（最初にやる。データを汚さない）

1. 任意のリードの編集画面を **2 つのタブ**で開く
2. タブ A で何か 1 項目（例: メモ）を変えて保存 → 成功する
3. タブ B でも別の項目を変えて保存

**期待:** タブ B が「このリードは他のユーザーによって更新されています。画面を再読み込みしてから
保存してください」で弾かれる。タブ B の変更は失われる（＝後勝ちの上書きが起きていない）。

弾かれずに保存できた場合、`expected_updated_at` が送られていない。`updateLead` の
実装と編集画面の hidden field を確認する。

#### #12 リードの新規登録

次に新規リードを登録するときに確認する。

**期待:** 保存でき、一覧の先頭（`created_at` 降順）に出る。スコアと温度感が自動で入る。

#### #13 リードの編集

**期待:** 変更が詳細画面に反映される。ステージ／ステータスを変えた場合はスコアも再計算される。

#### #15 変更履歴（#13 の直後に確認）

Supabase Studio の SQL Editor で実行する。

```sql
-- 誰が変更したかを名前で確認できるよう crm_users を JOIN する
SELECT l.table_name, l.operation, l.changed_fields, u.full_name, l.changed_at
  FROM entity_change_logs l
  LEFT JOIN crm_users u ON u.id = l.changed_by
 ORDER BY l.changed_at DESC LIMIT 5;
```

**期待:**
- `changed_fields` に**変更したカラムだけ**が入る（全カラムが並んでいたら差分検出が効いていない）
- `full_name` が操作した本人（石田）
- `score` / `score_updated_at` / `temperature_id` は**含まれない**（自動計算による派生値は
  記録対象外。マイグレーション 20260728000003）

#### #16 Deal 昇格（実際に商談化するリードで）

リードのステージを Opportunity（`auto_promote_to_deal = true` のステージ）へ変更する。

**期待:** Company / Contact / Account / Deal が同時に作成される。
昇格後に Studio で確認する。

```sql
SELECT lead_name, promoted_deal_id, promoted_company_id, promoted_contact_id, promoted_account_id
  FROM leads WHERE promoted_deal_id IS NOT NULL;
```

4 つの ID がすべて埋まっていること。**1 つでも NULL なら**トランザクションが期待どおりに
働いていない（`promote_lead_to_deal` は単一トランザクションなので、本来は全部入るか全部
入らないかのどちらか）。

画面側でも確認する。

- `/companies` に企業が 1 件増える（法人昇格の場合）
- `/contacts` に担当者が 1 件増える（`contact_type` は法人なら `corporate_rep`）
- `/accounts` に取引主体が 1 件増える
- `/deals` のカンバン先頭ステージにディールが 1 件増える

#### #17 二重昇格の拒否（#16 の直後）

同じリードをもう一度 Opportunity ステージへ変更する。

**期待:** 「このリードはすでに Deal に昇格済みです」で拒否され、Company / Contact /
Account / Deal が**増えない**。増えていたら二重発火の防止が効いていない。

#### 残りの 2 項目

| # | 内容 | 実施のタイミング |
|---|---|---|
| 11 | `admin@iterra.jp` でログイン試行 → 失敗すること（`banned_until = infinity`） | ログアウトを伴うので業務終了時に |
| 20 | 社外ネットワーク（スマホのテザリング等）からアクセスして体感差がないこと | 社外にいるときに |

## 8. 運用上の注意

- **NAS の可用性がそのまま基幹システムの可用性になる。** UPS（US3000）は接続済みだが、
  停電復帰時に NAS と Docker が自動起動する設定になっているか確認すること
- OS/DSM 更新時はサービス断が発生する。業務時間外に実施する
- `middleware` は全リクエストで Supabase の `auth.getUser()` を呼ぶため、
  NAS ↔ Supabase(Tokyo) 間のレイテンシが全ページに乗る。体感が遅い場合はここを最初に疑う
- ログは 10MB × 3 世代でローテーションする設定（`docker-compose.yml`）

### 8.0 Gmail の定期同期

連携した Gmail は放っておくと取り込まれない。NAS のタスクスケジューラから
`/api/gmail/sync` を叩いて差分を取り込む。

**アプリのコンテナはポートを公開していない**ので、外から到達する経路は無い。
`docker exec` でコンテナの中から叩く。

| 項目 | 値 |
|---|---|
| 種類 | ユーザー定義スクリプト |
| 実行ユーザー | root（`docker` コマンドの実行に必要） |
| スケジュール | 15 分ごと |

登録するコマンド（`$GMAIL_SYNC_CRON_SECRET` は `.env` から読ませ、
スクリプトに値を直書きしない）:

```bash
cd /volume1/docker/iterra-hub
( set -a; . ./.env; set +a
  docker exec iterra-hub-app wget -qO- --post-data=''     --header="Authorization: Bearer $GMAIL_SYNC_CRON_SECRET"     http://127.0.0.1:3000/api/gmail/sync )
```

**括弧（サブシェル）を外さないこと。** 外すと `.env` の値が対話シェルに残り、
`docker compose` は **シェルの環境変数を `.env` より優先する**ため、
以降 `.env` を直しても古い値がコンテナに渡り続ける。
実際にこれで `.env` は正しいのにコンテナ側だけ古い、という状態になった（2026-08-01）。
その場合は `unset <キー名>` するか、SSH に入り直してから `up -d` する。

**間隔を 15 分にする理由。** Gmail の `historyId`（差分同期の起点）は数日で失効する。
15 分ならまず当たらない。API の消費も 1 回あたり数リクエストで、割り当てに対して
桁違いに余裕がある。

**戻り値の読み方。** 正常時は取り込み件数の JSON が返る。タスクの実行ログに残るので
「動いているが 0 件」と「落ちている」を区別できる。

イメージは Alpine で、`wget` は busybox 版のため **HTTP エラー時は本文を捨てて**
`wget: server returned error: HTTP/1.1 401 Unauthorized` のようにステータス行だけを出す。
本文まで見たいときは `-S -O-`（ヘッダを stderr に出す）で手動実行する。

| 応答 | 意味 | 対処 |
|---|---|---|
| `{"connections":n,"recorded":n,...}` | 正常 | — |
| `{"skipped":true,...}`（409） | 前回の同期が実行中 | 次の実行に任せる。頻発するなら間隔を延ばす |
| `{"error":"認証に失敗しました"}`（401） | 合言葉が違う | `.env` の値と Bitwarden を突き合わせる |
| `{"error":"定期同期は無効です..."}`（503） | `GMAIL_SYNC_CRON_SECRET` 未設定 | `.env` に設定してコンテナを再起動 |
| `results[].error` に文言 | その連携だけ失敗 | プロフィール画面の連携欄にも同じ理由が出る。「連携の承認が失効」なら再連携 |

1 つの連携が失敗しても他は続行する。全体は止まらない。

### 8.0.1 freee 取引先の定期同期

freee 会計の取引先を CRM へ取り込む。**定期同期は取り込みのみで freee 側に書かない。**
（画面から人が差分を確認して反映したときだけ、取引先の更新・新規登録を行う）
Gmail と同じく `docker exec` でコンテナの中から叩く。

| 種別 | スケジュール | コマンドの末尾 |
|---|---|---|
| 差分 | 1 日 1 回（深夜） | `http://127.0.0.1:3000/api/freee/sync` |
| 全件 | 週 1 回 | `http://127.0.0.1:3000/api/freee/sync?full=1` |

```bash
cd /volume1/docker/iterra-hub
( set -a; . ./.env; set +a
  docker exec iterra-hub-app wget -qO- --post-data='' --header="Authorization: Bearer $FREEE_SYNC_CRON_SECRET" http://127.0.0.1:3000/api/freee/sync )
```

**サブシェルの括弧を外さない理由は 8.0 と同じ。**

**全件同期を別枠で回す理由。** 差分同期は freee の `start_update_date`（更新日での絞り込み）を
使うため、**freee 側で削除された取引先を検出できない**。全件同期のときだけ、今回出現
しなかった行に「freee 側から消えていた」印を付ける（行と紐付けは残す。会計側の削除で
CRM 側の判断まで消さないため）。

**間隔を 15 分にしない理由。** 取引先マスタは日に何度も変わるものではなく、
突合は人が画面で行う作業なので日次で足りる。

| 応答 | 意味 | 対処 |
|---|---|---|
| `{"connections":n,"full":false,"failed":0,...}` | 正常 | — |
| `{"skipped":true,...}`（409） | 前回の同期が実行中 | 次の実行に任せる |
| `{"error":"認証に失敗しました"}`（401） | 合言葉が違う | `.env` の値と Bitwarden を突き合わせる |
| `{"error":"定期同期は無効です..."}`（503） | `FREEE_SYNC_CRON_SECRET` 未設定 | `.env` に設定してコンテナを再起動 |
| `{"error":"freee 連携が未設定です"}`（503） | クライアント ID / シークレット / 暗号鍵のいずれか未設定 | `.env` を確認 |
| `results[].error` に文言 | その接続だけ失敗 | `/admin/freee` の接続欄にも同じ理由が出る。「接続が切れています」なら管理画面から接続し直す |

**接続そのものは画面から行う。** `/admin/freee` の「freee と接続する」で OAuth を通す。
事前に freee 開発者コンソールのアプリへコールバック URI
`https://hub.iterra.online/api/freee/callback` を登録しておくこと（未登録だと
`redirect_uri` の不一致で認可が通らない）。

### 8.0.2 Google コンタクトの定期同期

CRM の連絡先を各メンバーの Google コンタクト（「ITERRA CRM」グループ）へ配る。
**CRM が正本で、CRM 側の変更は自動で Google へ反映する**（`docs/google-contacts-sync.md`）。
Gmail・freee と同じく `docker exec` でコンテナの中から叩く。

| 項目 | 値 |
|---|---|
| 種類 | ユーザー定義スクリプト |
| 実行ユーザー | root |
| スケジュール | 1 時間ごと |

```bash
cd /volume1/docker/iterra-hub
( set -a; . ./.env; set +a
  docker exec iterra-hub-app wget -qO- --timeout=300 --post-data='' --header="Authorization: Bearer $GOOGLE_CONTACTS_SYNC_CRON_SECRET" http://127.0.0.1:3000/api/google-contacts/sync )
```

**サブシェルの括弧を外さない理由は 8.0 と同じ。**

**`--timeout` を必ず付ける。** busybox の wget は既定でタイムアウトを持たず、
応答が返らないと無限に待つ。手で叩いたときに「固まった」ように見える
（2026-08-06 に実際に起きた）。

**1 回の実行に 10 分ほどかかる。** People API の書き込みには 1 分あたりの上限があり、
1 回 **150 件**で区切ったうえ **1 件ごとに 120ms 空けて**いる。それでも上限に当たり、
`withRetry` が 2 秒 → 4 秒 → 8 秒と待ち直す。**手で叩いてすぐ返らないのは正常。**

実測（2026-08-06 本番、連絡先 751 件）: **300 件に 21 分 42 秒**（1 件あたり約 4.3 秒）。
コードの間隔は 120ms なので、差はすべて上限待ち。**この待ちは失敗として記録されない**
ので、`google_contact_sync_logs` に失敗 0 のまま時間だけかかる。異常ではない。

初回の全件登録にかかる時間の目安は **連絡先の件数 ÷ 150 × 11 分**。
751 件なら約 1 時間。**初回だけスケジュールを 30 分間隔にし、送り切ったら 1 時間へ戻す**
（10 分間隔にしても前回が終わる前に叩いて 409 になるだけで速くならない）。

**1 回の実行で全部は送らない。** **応答の `remaining` が 0 でなければ残りがある**ので、
初回の全件登録が終わるまでは実行間隔を詰める（または画面の「同期」を繰り返す）。
連絡先の件数 ÷ 150 回だけ必要になる。
定常運用に入れば 1 時間ごとで十分（変更のあった連絡先しか送らない）。

**進み具合は DB で見る**（`sync.ts` はログを出さないのでコンテナのログには出ない）。

```sql
-- 直近 1 時間の実績。「最終」が数分以内なら動いている
SELECT count(*) FILTER (WHERE succeeded)     AS 成功,
       count(*) FILTER (WHERE NOT succeeded) AS 失敗,
       max(performed_at) AS 最終,
       max(performed_at) - min(performed_at) AS 所要
  FROM google_contact_sync_logs
 WHERE performed_at > now() - interval '1 hour';

-- 全体の進み具合。「送信済み」が「連絡先の総数」に届けば完了
SELECT (SELECT count(*) FROM google_contact_connections WHERE is_active) AS 接続数,
       (SELECT count(*) FROM contacts WHERE deleted_at IS NULL)          AS 連絡先の総数,
       (SELECT count(*) FROM google_contact_links
         WHERE status = 'active' AND last_pushed_at IS NOT NULL)         AS 送信済み;
```

**前回が終わる前に叩くと 409 を返す。** これは異常ではない。
なお **409 は認証と設定チェックの後にある**ので、409 が返った時点で
合言葉・クライアント ID・シークレット・暗号鍵の 4 つは正しく渡っている
（切り分けに使える）。

| 応答 | 意味 | 対処 |
|---|---|---|
| `{"connections":n,"created":..,"remaining":0,...}` | 正常・送り切った | — |
| `remaining` が 0 でない | 上限で次回へ持ち越した | 続けて実行すれば進む。初回の全件登録では正常 |
| `{"skipped":true,...}`（409） | 前回の同期が実行中 | 次の実行に任せる |
| `{"error":"認証に失敗しました"}`（401） | 合言葉が違う | `.env` の値と Bitwarden を突き合わせる |
| `{"error":"定期同期は無効です..."}`（503） | `GOOGLE_CONTACTS_SYNC_CRON_SECRET` 未設定 | `.env` に設定してコンテナを再起動 |
| `{"error":"Google コンタクト連携が未設定です"}`（503） | クライアント ID / シークレット / 暗号鍵のいずれか未設定 | `.env` を確認 |
| `errors[]` に文言 | その接続だけ失敗 | `/profile` の連携欄にも同じ理由が出る |

**接続は各メンバーが `/profile` から行う**（管理者がまとめて繋ぐものではない）。
事前に **Gmail 連携と同じ GCP プロジェクト**へ OAuth クライアントを新しく作り
（プロジェクトは増やさない。`google-contacts-sync.md` §2）、コールバック URI
`https://hub.iterra.online/api/google-contacts/callback` を登録しておくこと。
**同意画面は「内部」**（Gmail 連携のために既にそうなっている）で、
`GOOGLE_CONTACTS_ALLOWED_DOMAIN` も設定する
（個人 Google アカウントへ顧客情報を配らないため）。

### 8.1 死活監視

**分単位の監視は外部サービスに任せる。** GitHub Actions の cron は実行が数分〜数十分
遅延することがあり、private リポジトリの無料枠（2,000 分/月）も圧迫するため
（15 分間隔で約 1,440 分/月）監視用途には向かない。

| 層 | 手段 | 間隔 | 状態 |
|---|---|---|---|
| コンテナ | Docker healthcheck（`/api/health`） | 30 秒 | 設定済み。3 回失敗で unhealthy |
| 外形（分単位） | UptimeRobot（無料プラン） | 5 分 | 設定済み（2026-07-30） |
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
| Gmail 連携で `エラー 400: invalid_request` | `.env` の `APP_ORIGIN`（下記） |

### プロキシの内側では公開 URL をリクエストから復元できない

Gmail 連携が Google の画面で `invalid_request`（「OAuth 2.0 ポリシーに準拠していない」）に
なった事象の記録（2026-08-01）。**`redirect_uri_mismatch` ではない**点が手掛かりだった。

standalone の Next は Host ヘッダを信用せず、サーバーの `HOSTNAME`（Docker では `0.0.0.0`）で
リクエストの絶対 URL を組む。そのため `request.nextUrl.origin` が `https://0.0.0.0` になり、
`https://0.0.0.0/api/gmail/callback` を Google へ送っていた。IP アドレスのリダイレクト先は
Google のポリシーで禁止されているため、URI の登録有無に関係なく弾かれる。

- **middleware と Route Handler で挙動が違う。** middleware の `NextResponse.redirect` は
  同一オリジンなら相対 URL に畳まれるため表面化しない。Route Handler は絶対 URL を
  そのまま `Location` に入れるので、連携後に `https://0.0.0.0:3000/profile` へ飛ばされた
  （redirect_uri を直した後にこれが残っていた）。**画面へ戻すリダイレクトも公開 URL 基準にする**
- 開発機は直アクセスで正しい値になるため、ローカルでは再現しない
- 対処: `.env` に `APP_ORIGIN=https://hub.iterra.online` を設定する。
  実装は `src/lib/app-origin.ts`（未設定かつリクエスト由来の値も使えない場合は、
  連携ボタンを押した時点で理由が画面に出る）

---

## 10. STG 環境（Supabase）

本番と同じスキーマで検証するための staging 環境。**アプリの実行環境は無く、Supabase のみ**
（NAS 上に STG コンテナは置かない。必要になった時点で別途検討する）。

| 項目 | 内容 |
|---|---|
| 組織 | `iterra`（`zvirytyjijykmekbrwvd`） |
| リージョン | `ap-northeast-1`（本番と同じ Tokyo） |
| プロジェクト名 | `iterra-hub-stg` |
| 投入データ | `01-masters` + `02-dev-users` + `03-dev-samples`。**実業務データ（`04-leads.sql`）は入れない** |
| Secrets | GitHub Environment `staging`（台帳: `docs/secrets-management.md`） |

### 10.1 プロジェクトの作成（ユーザー作業）

DB パスワードを扱うため手作業で行う。**先に Bitwarden でパスワードを生成**し、
`gh/env:staging/SUPABASE_DB_PASSWORD` を新しい値に更新してから作成する
（正本を先に作る。共通方針セクション 9）。

```bash
# STG_DB_PASSWORD は Bitwarden で生成した値。履歴に残さないため read -rs で受け取る
read -rsp 'STG DB パスワード: ' STG_DB_PASSWORD; echo
npx supabase projects create iterra-hub-stg \
  --org-id zvirytyjijykmekbrwvd \
  --region ap-northeast-1 \
  --db-password "$STG_DB_PASSWORD"
unset STG_DB_PASSWORD
```

作成後、ref を控える（秘密値ではない）。

```bash
npx supabase projects list | tr ',' '\n' | grep -A1 iterra-hub-stg
```

**Free プランはアクティブ 2 プロジェクトまで。** 現在 `iterra-hub`（ACTIVE）と
`subscription-management-app`（INACTIVE）があり、STG を足すとアクティブ 2 でちょうど上限になる。
3 つ目をアクティブにしたくなったら、いずれかを一時停止するか有料プランを検討する。

### 10.2 マイグレーションと seed（スクリプト）

ローカル Supabase を起動した状態で実行する（psql をコンテナ経由で使うため）。

```bash
npx supabase start
bash scripts/setup-staging.sh
```

スクリプトは「STG へリンク → `db push` → seed 投入 → **本番リンクへ復帰**」を行う。
途中で失敗しても `trap` で本番リンクへ戻すため、STG を向いたまま本番へ `db push` する事故は起きない。

投入順は依存関係で決まっている。**入れ替えないこと。**

| 順 | seed | 再実行 | 備考 |
|---|---|---|---|
| 1 | `seeds/01-masters.sql` | **不可** | `ON CONFLICT` が無く重複キーで失敗する |
| 2 | `seed-talent-classification.sql` | 可 | スキル体系。**3 より先に入れる必要がある** |
| 3 | `seeds/02-dev-users.sql` | 可 | `ON CONFLICT` あり |
| 4 | `seeds/03-dev-samples.sql` | **不可** | `talent_skills` が `skills` を `skill_code` で引くため 2 に依存 |

途中で失敗した分だけ流し直す場合はファイル名を引数で渡す。

```bash
bash scripts/setup-staging.sh seed-talent-classification.sql 03-dev-samples.sql
```

最後に件数が出るので次を確認する。

- **`leads=0`** — 実業務データが入っていないこと
- **`skills>0`** — 0 だと 4 が `talent_skills` で必ず失敗する
- **`deals>0` / `talent_skills>0`** — サンプルデータが入ったこと

### 10.3 GitHub Environment `staging` の更新

プロジェクト作成後、STG 実物の値へ差し替える。Bitwarden を先に更新してから GitHub へ転記する。

| キー | 値の取得元 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | STG プロジェクト → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | STG プロジェクト → Settings → API Keys → Publishable key |
| `SUPABASE_DB_PASSWORD` | 10.1 で生成した値 |

差し替えが済むと台帳の「同値グループ」は解消される（production と STG で値が別になるため）。

### 10.4 自動一時停止への対策

Free プランは 1 週間アクセスが無いと一時停止する。
`.github/workflows/staging-keepalive.yml` が **月・木の JST 06:00** に PostgREST へ疎通して防ぐ。

- 手動実行: `gh workflow run staging-keepalive.yml`
- 失敗したら STG が停止している可能性が高い。ダッシュボードから再開する

### 10.5 STG のテストユーザーについて

`02-dev-users.sql` は共通パスワード `password123` のユーザーを作る。
**STG の Supabase はインターネットから到達可能**なため、以下を前提に運用する。

- STG に実顧客データを置かない（`04-leads.sql` を投入しない理由）
- 本番と同じパスワードを使わない
- 検証以外の用途で STG に情報を入れない

より強い分離が必要になったら、STG のユーザーだけパスワードを変更する
（`02-dev-users.sql` は開発環境用のため、STG 用の派生 seed を別途用意する）。
