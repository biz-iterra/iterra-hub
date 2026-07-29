import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// NOTE: createServerClient<Database>() で完全な型付けにすると、
// account_code / company_code / contract_code など DB トリガーで採番する列が
// insert 時に必須と判定され 37 件のエラーになる。
// 適用には各コードカラムへの DEFAULT 付与か insert 型の整備が必要なため、
// 現時点では読み取り型（src/types/database.ts）の生成型導出に留めている。
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
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
