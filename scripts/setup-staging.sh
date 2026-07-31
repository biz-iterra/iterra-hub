#!/usr/bin/env bash
# ============================================================
# STG 用 Supabase プロジェクトの初期構築
#
#   マイグレーション適用 → seed 投入 → 本番リンクへ復帰 までを行う。
#   プロジェクトの「作成」自体は含まない（DB パスワードを扱うためユーザーが実行する。
#   手順は docs/deployment-nas.md § 10）。
#
# 前提:
#   - Supabase CLI にログイン済み（npx supabase projects list が通ること）
#   - ローカル Supabase が起動中（psql をコンテナ経由で使うため）
#       npx supabase start
#   - Windows は Git Bash で実行する
#
# 使い方:
#   bash scripts/setup-staging.sh
#
# シークレットの扱い:
#   DB パスワードは read -rs で受け取り、コマンドライン引数には渡さない
#   （引数は ps や履歴から見えるため）。環境変数経由で子プロセスに渡す。
# ============================================================
set -euo pipefail

# Git Bash はコンテナ側のパス（/tmp/...）を Windows パスへ変換してしまう。
# docker cp / docker exec の引数が壊れるため無効化する（docs/deployment-nas.md § 0.4）。
export MSYS_NO_PATHCONV=1

PROD_REF="aqkesxqxrsucgrnguhnb"          # 本番。作業後にここへリンクを戻す
POOLER_HOST="aws-0-ap-northeast-1.pooler.supabase.com"
POOLER_PORT="5432"
CONTAINER="supabase_db_iterra-hub"       # ローカル Supabase の DB コンテナ（psql 提供元）

# 投入する seed。実業務データ（04-leads.sql）は STG に入れない。
SEEDS=(01-masters 02-dev-users 03-dev-samples)

# ---- 事前チェック ------------------------------------------------
command -v docker >/dev/null || { echo "docker が見つかりません" >&2; exit 1; }
docker ps --format '{{.Names}}' | grep -qx "$CONTAINER" || {
  echo "ローカル Supabase が起動していません。先に 'npx supabase start' を実行してください" >&2
  exit 1
}

read -rp 'STG プロジェクト ref: ' STG_REF
[ -n "$STG_REF" ] || { echo "ref が空です" >&2; exit 1; }
case "$STG_REF" in
  *[\<\>]*) echo "山括弧が含まれています。値だけを貼り付けてください" >&2; exit 1 ;;
  "$PROD_REF") echo "本番の ref が指定されました。中止します" >&2; exit 1 ;;
esac

read -rsp 'STG DB パスワード: ' SUPABASE_DB_PASSWORD; echo
[ -n "$SUPABASE_DB_PASSWORD" ] || { echo "パスワードが空です" >&2; exit 1; }
export SUPABASE_DB_PASSWORD
export PGPASSWORD="$SUPABASE_DB_PASSWORD"

# 途中で失敗してもリンクを本番へ戻す（STG を向いたまま db push する事故を防ぐ）
relink_prod() {
  echo "--- リンクを本番へ戻します ---"
  npx supabase link --project-ref "$PROD_REF" >/dev/null 2>&1 || \
    echo "!! 本番へのリンク復帰に失敗しました。手動で 'npx supabase link --project-ref $PROD_REF' を実行してください" >&2
}
trap relink_prod EXIT

# ---- 1. マイグレーション ------------------------------------------
echo "=== 1/3 マイグレーションを適用 ==="
npx supabase link --project-ref "$STG_REF"
npx supabase db push

# ---- 2. seed -----------------------------------------------------
echo "=== 2/3 seed を投入 ==="
for f in "${SEEDS[@]}"; do
  echo "--- $f.sql ---"
  docker cp "supabase/seeds/$f.sql" "$CONTAINER:/tmp/$f.sql"
  # crypt() / gen_salt() はホスト環境では extensions スキーマにあるため search_path を補う
  docker exec -e PGPASSWORD -e PGOPTIONS='-c search_path=public,extensions' "$CONTAINER" \
    psql -h "$POOLER_HOST" -p "$POOLER_PORT" -U "postgres.$STG_REF" -d postgres \
         -v ON_ERROR_STOP=1 --single-transaction -f "/tmp/$f.sql"
done

# ---- 3. 確認 ------------------------------------------------------
echo "=== 3/3 投入結果を確認 ==="
docker exec -e PGPASSWORD "$CONTAINER" \
  psql -h "$POOLER_HOST" -p "$POOLER_PORT" -U "postgres.$STG_REF" -d postgres -At -c "
    SELECT 'pipelines=' || (SELECT count(*) FROM pipelines)
        || ' users='     || (SELECT count(*) FROM users)
        || ' deals='     || (SELECT count(*) FROM deals)
        || ' leads='     || (SELECT count(*) FROM leads);"

echo
echo "完了。leads が 0 であること（実業務データを入れていないこと）を確認してください。"
