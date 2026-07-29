import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";

/**
 * service_role キーで接続するクライアント。**RLS をバイパスする。**
 *
 * 使用は admin 限定の処理（1000 件超のバルク INSERT 等）に留めること。
 * このクライアント経由の変更も entity_change_logs のトリガーで記録されるが、
 * `changed_by` はセッション情報がないため NULL になる。
 */
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
