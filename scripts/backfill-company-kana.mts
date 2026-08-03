/**
 * フリガナが空の事業者に読みの下書きを入れる。
 *
 * 一覧の並び順は `name_kana` があればそちらを優先する（20260802000008）。
 * 空のままだと漢字の社名が読み順に並ばないため、形態素解析の読みで埋める。
 *
 * **読みは正確とは限らない。** 人が入れた値は触らない（空欄だけを対象にする）。
 *
 * 実行:
 *   npx tsx scripts/backfill-company-kana.mts           … 空欄を埋める
 *   npx tsx scripts/backfill-company-kana.mts --rebuild … 法人格が入ってしまった分も作り直す
 *   npx tsx scripts/backfill-company-kana.mts --dry-run … 内容だけ見る
 *
 * 接続先は既定で `.env.local`（ローカル Supabase）。本番へ流すときは
 * `--env <ファイル>` で切り替える。`.env.local` を本番の値に書き換えると、
 * 戻し忘れたときに以降の開発作業がすべて本番を触ることになるため。
 *   npx tsx scripts/backfill-company-kana.mts --env .env.production.local --dry-run
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { stripCorporateType } from "@/lib/company-name";
import { toKatakanaReading } from "@/lib/kana";

const dryRun = process.argv.includes("--dry-run");
const rebuild = process.argv.includes("--rebuild");

/**
 * 読みに現れる法人格。--rebuild ではこれを含むフリガナだけを作り直す。
 * 人が入れた「法人格を含まないフリガナ」を上書きしないため。
 */
const KANA_CORPORATE_FORMS =
  /カブシキ[ガカ]イシャ|ユウゲン[ガカ]イシャ|ゴウドウ[ガカ]イシャ|ゴウシ[ガカ]イシャ|ゴウメイ[ガカ]イシャ|ホウジン|キョウドウクミアイ/;

const envArg = process.argv.indexOf("--env");
const envFile = envArg >= 0 ? process.argv[envArg + 1] : ".env.local";
if (envArg >= 0 && !envFile) {
  throw new Error("--env にはファイル名が要る（例: --env .env.production.local）");
}

const env: Record<string, string> = {};
// CRLF のファイルを "\n" で割ると行末の \r が残るため \r?\n で分割する
for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!env[k]) throw new Error(`${envFile} に ${k} が無い`);
}

// どこへ書くのかを毎回出す。URL は公開値なので表示してよい
console.log(`接続先 ${new URL(env.NEXT_PUBLIC_SUPABASE_URL).host}（${envFile}）`);

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// PostgREST は 1 回に 1000 行しか返さない。ページを送って全件を集める
const PAGE = 1000;
const targets: { id: string; name: string; name_kana: string | null }[] = [];
for (let from = 0; ; from += PAGE) {
  let query = db
    .from("companies")
    .select("id, name, name_kana")
    .is("deleted_at", null);

  // 通常は空欄だけ。--rebuild では埋まっているものも見て、
  // 法人格が入ってしまったものだけを対象にする
  if (!rebuild) query = query.or("name_kana.is.null,name_kana.eq.");

  const { data, error } = await query
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
  // 既に人が入れたフリガナ（法人格を含まないもの）は触らない
  if (c.name_kana && !KANA_CORPORATE_FORMS.test(c.name_kana)) {
    skipped += 1;
    continue;
  }

  // フリガナは事業者の呼び名なので法人格は含めない
  const base = stripCorporateType(c.name);
  const reading = await toKatakanaReading(base);

  if (!reading || reading === c.name_kana) {
    skipped += 1;
    continue;
  }

  // 空欄に入れる場合だけ、表記と同じ結果しか出ないものを見送る
  // （手掛かりにならないため）。既に入っているものは法人格を落とすだけでも意味がある
  if (!c.name_kana && reading === base) {
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
