/**
 * Supabase JS のバルクinsert性能検証
 * 3000件のダミー company を chunk 500 で一括投入し、所要時間を測定
 */
import { createClient } from "@supabase/supabase-js";

const URL = "http://127.0.0.1:54331";
const ANON = process.env.SUPABASE_ANON_KEY || "";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!KEY || !ANON) { console.error("KEYS missing"); process.exit(1); }

// admin ユーザー認証で作成（RLS 経由）
const sb = createClient(URL, ANON, { auth: { persistSession: false } });

async function main() {
  await sb.auth.signInWithPassword({ email: "admin@iterra.jp", password: "password123" });
  console.log("Signed in as admin (RLS enabled)");
  // admin のID（seed由来）
  const ownerUserId = "a0000000-0000-0000-0000-000000000001";
  // 見込みステータス
  const { data: cs } = await sb.from("company_statuses").select("id").eq("name", "見込み").single();
  const statusId = cs?.id;

  const rows = Array.from({ length: 3000 }, (_, i) => ({
    name: `バルクテスト企業_${i.toString().padStart(4, "0")}`,
    company_status_id: statusId,
    owner_user_id: ownerUserId,
    created_by: ownerUserId,
  }));

  console.log(`Total: ${rows.length} rows`);

  const CHUNK = 500;
  const t0 = Date.now();
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const ts = Date.now();
    const { data, error } = await sb.from("companies").insert(chunk).select("id, name");
    if (error) { console.error(`Chunk ${i}: ERROR`, error); break; }
    console.log(`Chunk ${i}: inserted ${data?.length ?? 0} (${Date.now() - ts}ms)`);
  }
  console.log(`TOTAL ${Date.now() - t0}ms`);

  const { count } = await sb.from("companies").select("*", { count: "exact", head: true });
  console.log(`Final count: ${count}`);

  // cleanup（service-roleでpurge）
  const srv = createClient(URL, KEY, { auth: { persistSession: false } });
  await srv.from("companies").delete().like("name", "バルクテスト企業_%");
}

main().then(() => process.exit(0));
