/**
 * フリガナが空の事業者に読みの下書きを入れる。
 *
 * 一覧の並び順は `name_kana` があればそちらを優先する（20260802000008）。
 * 空のままだと漢字の社名が読み順に並ばないため、形態素解析の読みで埋める。
 *
 * **読みは正確とは限らない。** 人が入れた値は触らない（空欄だけを対象にする）。
 *
 * 実行:
 *   npx tsx scripts/backfill-company-kana.mts          … 反映する
 *   npx tsx scripts/backfill-company-kana.mts --dry-run … 内容だけ見る
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { toKatakanaReading } from "@/lib/kana";

const dryRun = process.argv.includes("--dry-run");

const env: Record<string, string> = {};
// CRLF のファイルを "\n" で割ると行末の \r が残るため \r?\n で分割する
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// PostgREST は 1 回に 1000 行しか返さない。ページを送って全件を集める
const PAGE = 1000;
const targets: { id: string; name: string }[] = [];
for (let from = 0; ; from += PAGE) {
  const { data, error } = await db
    .from("companies")
    .select("id, name")
    .is("deleted_at", null)
    .or("name_kana.is.null,name_kana.eq.")
    .order("created_at")
    .range(from, from + PAGE - 1);

  if (error) throw new Error(error.message);
  targets.push(...(data ?? []));
  if (!data || data.length < PAGE) break;
}

console.log(`対象 ${targets.length} 件${dryRun ? "（ドライラン）" : ""}`);

const t0 = Date.now();
let filled = 0;
let skipped = 0;
const samples: string[] = [];

// 更新は 1 行ずつ投げる。upsert だと指定しなかった列が既定値で
// 上書きされてしまうため使えない。件数が多いので少しずつ並行させる
const CONCURRENCY = 20;
const pending: { id: string; reading: string }[] = [];

for (const c of targets) {
  const reading = await toKatakanaReading(c.name);

  // 読みが引けない（記号だけの社名など）ものは空欄のままにする。
  // 表記と同じ結果しか出ないなら入れても手掛かりにならない
  if (!reading || reading === c.name) {
    skipped += 1;
    continue;
  }

  if (samples.length < 10) samples.push(`${c.name} → ${reading}`);
  pending.push({ id: c.id, reading });
  filled += 1;
}

if (!dryRun) {
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const chunk = pending.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map((p) =>
        db.from("companies").update({ name_kana: p.reading }).eq("id", p.id)
      )
    );
    for (const [index, r] of results.entries()) {
      if (r.error) {
        console.error(`失敗 ${chunk[index].id}: ${r.error.message}`);
        filled -= 1;
      }
    }
  }
}

console.log(`\n例:\n${samples.map((s) => `  ${s}`).join("\n")}`);
console.log(
  `\n${dryRun ? "入る予定" : "入れた"} ${filled} 件 / 変換できず据え置き ${skipped} 件 / ${Date.now() - t0}ms`
);
