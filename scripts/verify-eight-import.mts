/**
 * 実 CSV 922 行を DB 関数まで通す。Server Action は認証が絡むので、
 * パース → RPC の経路を直接叩いて検証する。
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  checkEightHeader, mergeEightRows, parseEightRow, EIGHT_SOURCE_SLUG,
} from "@/lib/leads/eight-import";
import { decodeCsv, dropEmptyRows, parseCsv } from "@/lib/leads/import-helpers";

const env: Record<string, string> = {};
// JS の `.` は \r にもマッチしないため、CRLF のファイルを "\n" で割ると
// 行末の \r が残って /=(.*)$/ が外れる。\r?\n で分割する
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const bytes = new Uint8Array(readFileSync("C:/Users/bizis/Downloads/Eight20260730125644sjis.csv"));
const t0 = Date.now();
const { text, encoding } = decodeCsv(bytes);
const rows = dropEmptyRows(parseCsv(text));
const hc = checkEightHeader(rows[0]);
if (!hc.ok) throw new Error(hc.error);
const parsed = rows.slice(1).map((r, i) => parseEightRow(r, hc.indexOf, i + 1));
const { merged, errors } = mergeEightRows(parsed);
console.log(`パース: ${Date.now() - t0}ms / encoding=${encoding} / 行=${parsed.length} → Lead=${merged.length} / エラー=${errors.length}`);

// 既定値
const [stage, source, at, cs] = await Promise.all([
  db.from("lead_stages").select("id").eq("slug", "generation").single(),
  db.from("lead_sources").select("id").eq("slug", EIGHT_SOURCE_SLUG).single(),
  db.from("lead_activity_types").select("id").eq("code", "card_exchange").single(),
  db.from("lead_call_statuses").select("id").eq("code", "card_exchange").single(),
]);
const status = await db.from("lead_statuses").select("id")
  .eq("stage_id", stage.data!.id).eq("code", "card_exchanged").single();
const uid = "a0000000-0000-0000-0000-000000000001";

const before = await db.from("leads").select("id", { count: "exact", head: true }).is("deleted_at", null);
console.log("取込前の leads 件数:", before.count);

const t1 = Date.now();
const { data, error } = await db.rpc("import_eight_leads", {
  p_batch: { source_slug: EIGHT_SOURCE_SLUG, file_name: "Eight20260730125644sjis.csv",
             encoding, row_count: parsed.length, imported_by: uid },
  p_leads: merged.map((m) => ({
    external_key: m.externalKey,
    lead: m.primary.lead,
    address: m.primary.address,
    activities: [...new Set(m.rows.map((r) => r.exchangedOn).filter(Boolean))].map((d) => ({ exchanged_on: d })),
    raw_rows: m.rows.map((r) => ({ row_number: r.rowNumber, raw: r.raw })),
  })),
  p_errors: errors.map((e) => ({ row_number: e.rowNumber, raw: e.raw, error_reason: e.error })),
  p_defaults: {
    stage_id: stage.data!.id, status_id: status.data!.id, lead_source_id: source.data!.id,
    activity_type_id: at.data!.id, call_status_id: cs.data!.id, owner_user_id: uid,
  },
});
if (error) { console.error("RPC 失敗:", error.message, error.code); process.exit(1); }
console.log(`RPC: ${Date.now() - t1}ms`, JSON.stringify(data));

// 検証
const q = (t: string) => db.from(t).select("id", { count: "exact", head: true });
const [after, addr, acts, recs] = await Promise.all([
  db.from("leads").select("id", { count: "exact", head: true }).is("deleted_at", null),
  q("addresses"), q("lead_activities"), q("lead_import_records"),
]);
console.log("取込後 leads:", after.count, "/ addresses:", addr.count,
            "/ lead_activities:", acts.count, "/ import_records:", recs.count);

const eight = await db.from("leads").select("id", { count: "exact", head: true })
  .like("source_external_key", "eight:%").is("deleted_at", null);
console.log("Eight 由来の Lead:", eight.count);

const withAddr = await db.from("leads").select("id", { count: "exact", head: true })
  .like("source_external_key", "eight:%").not("address_id", "is", null);
console.log("住所が紐づいた Lead:", withAddr.count);

// スコアが入っているか
const scored = await db.from("leads").select("score").like("source_external_key", "eight:%").limit(5);
console.log("スコア例:", scored.data?.map((r) => r.score).join(", "));

// raw から Fax を引けるか
const fax = await db.from("lead_import_records").select("id", { count: "exact", head: true })
  .not("raw->>Fax", "is", null);
console.log("raw に Fax を持つレコード:", fax.count);
