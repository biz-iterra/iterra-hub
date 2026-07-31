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

# 投入する seed（依存順）。実業務データ（04-leads.sql）は STG に入れない。
#
# 03-dev-samples は talent_skills で `SELECT id FROM skills WHERE skill_code = ...` を
# 引くため、先に seed-talent-classification.sql が必要。順序を入れ替えないこと。
SEEDS=(
  "supabase/seeds/01-masters.sql"
  "supabase/seed-talent-classification.sql"
  "supabase/seeds/02-dev-users.sql"
  "supabase/seeds/03-dev-samples.sql"
)

# 冪等性（再実行の可否）:
#   01-masters.sql               ON CONFLICT なし → 再実行不可（重複キーで失敗する）
#   seed-talent-classification   ON CONFLICT あり → 再実行可
#   02-dev-users.sql             ON CONFLICT あり → 再実行可
#   03-dev-samples.sql           ON CONFLICT なし → 再実行不可
#
# 途中で失敗した分だけ流し直したい場合は、ファイル名を引数で指定する。
#   bash scripts/setup-staging.sh seed-talent-classification.sql 03-dev-samples.sql
if [ "$#" -gt 0 ]; then
  SELECTED=()
  for want in "$@"; do
    for s in "${SEEDS[@]}"; do
      [ "$(basename "$s")" = "$want" ] && SELECTED+=("$s")
    done
  done
  [ "${#SELECTED[@]}" -eq "$#" ] || { echo "指定した seed が見つかりません: $*" >&2; exit 1; }
  SEEDS=("${SELECTED[@]}")
  echo "指定された seed のみ投入します: $*"
fi

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
  base=$(basename "$f")
  echo "--- $base ---"
  docker cp "$f" "$CONTAINER:/tmp/$base"
  # crypt() / gen_salt() はホスト環境では extensions スキーマにあるため search_path を補う
  docker exec -e PGPASSWORD -e PGOPTIONS='-c search_path=public,extensions' "$CONTAINER" \
    psql -h "$POOLER_HOST" -p "$POOLER_PORT" -U "postgres.$STG_REF" -d postgres \
         -v ON_ERROR_STOP=1 --single-transaction -f "/tmp/$base"
done

# ---- 3. 確認 ------------------------------------------------------
echo "=== 3/3 投入結果を確認 ==="
docker exec -e PGPASSWORD "$CONTAINER" \
  psql -h "$POOLER_HOST" -p "$POOLER_PORT" -U "postgres.$STG_REF" -d postgres -At -c "
    SELECT 'pipeline_types=' || (SELECT count(*) FROM pipeline_types)
        || ' skills='        || (SELECT count(*) FROM skills)
        || ' crm_users='     || (SELECT count(*) FROM crm_users)
        || ' companies='     || (SELECT count(*) FROM companies)
        || ' deals='         || (SELECT count(*) FROM deals)
        || ' talent_skills=' || (SELECT count(*) FROM talent_skills)
        || ' leads='         || (SELECT count(*) FROM leads);"

echo
echo "確認してください:"
echo "  - leads = 0        （実業務データを入れていないこと）"
echo "  - skills > 0       （0 なら 03-dev-samples が talent_skills で失敗する）"
echo "  - deals / talent_skills > 0（サンプルデータが入ったこと）"
