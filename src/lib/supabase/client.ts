import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database.generated";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase 環境変数が設定されていません。.env.local を作成してください。"
    );
  }

  return createBrowserClient<Database>(url, key);
}
