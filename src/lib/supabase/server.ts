import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database.generated";

// Database 型を渡すことで、存在しないテーブル・カラムの参照がビルド時に検出される。
// コード採番カラム（account_code 等）は 20260729000001 で DEFAULT を付与したため
// Insert 型では optional として扱われる。
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component では set できないが無視して良い
          }
        },
      },
    }
  );
}
