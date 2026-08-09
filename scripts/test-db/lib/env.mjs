/**
 * 接続先の解決。
 *
 * 既定はローカル Supabase の DB 直結（supabase/config.toml の [db].port）。
 * このリポジトリは「デフォルト+10」のポートを使う（reference_supabase_ports）ため 54332。
 * CI / ステージングなど別ポートで動かす場合は環境変数で上書きする。
 */
export function resolveDbUrl() {
  return (
    process.env.TEST_DB_URL ||
    process.env.SUPABASE_DB_URL ||
    "postgresql://postgres:postgres@127.0.0.1:54332/postgres"
  );
}
