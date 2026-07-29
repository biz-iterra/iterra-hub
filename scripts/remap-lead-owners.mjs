#!/usr/bin/env node
/**
 * 04-leads.sql の担当者 UUID を本番ユーザーの UUID に置換する。
 *
 * 開発環境の crm_users UUID（a0000000-...-0010/0011/0012）は本番に存在しないため、
 * そのまま投入すると外部キー違反になる。置換漏れがあると一部だけ失敗して
 * 原因が分かりにくいので、変換後に旧 UUID の残存を検査して落とす。
 *
 * 使い方:
 *   node scripts/remap-lead-owners.mjs \
 *     --in  supabase/seeds/04-leads.sql \
 *     --out ./04-leads-prod.sql \
 *     --map a0000000-0000-0000-0000-000000000010=<小川の本番UUID> \
 *     --map a0000000-0000-0000-0000-000000000011=<田中の本番UUID> \
 *     --map a0000000-0000-0000-0000-000000000012=<伏見の本番UUID>
 */

import { readFileSync, writeFileSync } from "node:fs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---- 引数解析 ----
const args = process.argv.slice(2);
let inPath = "supabase/seeds/04-leads.sql";
let outPath = null;
const mappings = [];

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--in") inPath = args[++i];
  else if (a === "--out") outPath = args[++i];
  else if (a === "--map") {
    const [from, to] = (args[++i] ?? "").split("=");
    if (!UUID_RE.test(from ?? "") || !UUID_RE.test(to ?? "")) {
      console.error(`--map の形式が不正です: ${args[i]}`);
      console.error("  期待: --map <旧UUID>=<新UUID>");
      process.exit(1);
    }
    mappings.push({ from, to });
  } else {
    console.error(`不明な引数: ${a}`);
    process.exit(1);
  }
}

if (!outPath) {
  console.error("--out は必須です");
  process.exit(1);
}
if (mappings.length === 0) {
  console.error("--map を少なくとも 1 つ指定してください");
  process.exit(1);
}

// 同じ新 UUID を複数の旧 UUID に割り当てていないか（担当者の取り違え防止）
const dupTo = mappings.map((m) => m.to.toLowerCase());
if (new Set(dupTo).size !== dupTo.length) {
  console.error("同じ新 UUID が複数の --map に指定されています。担当者の対応を確認してください");
  process.exit(1);
}

// ---- 置換 ----
let sql = readFileSync(inPath, "utf8");
console.log(`入力: ${inPath}`);

for (const { from, to } of mappings) {
  const before = sql.split(from).length - 1;
  if (before === 0) {
    console.warn(`  警告: ${from} は 1 件も見つかりませんでした`);
    continue;
  }
  sql = sql.replaceAll(from, to);
  console.log(`  ${from} → ${to} : ${before} 件`);
}

// ---- 検証: 開発環境の UUID が残っていないか ----
const leftover = sql.match(/a0000000-0000-0000-0000-[0-9a-f]{12}/gi);
if (leftover) {
  const counts = {};
  for (const u of leftover) counts[u.toLowerCase()] = (counts[u.toLowerCase()] ?? 0) + 1;
  console.error("\n置換されていない開発環境 UUID が残っています:");
  for (const [u, n] of Object.entries(counts)) console.error(`  ${u}: ${n} 件`);
  console.error("\n対応する --map を追加してください。このまま投入すると外部キー違反になります。");
  process.exit(1);
}

// 1.8MB 超を一括投入するため、既定の statement_timeout（2 分）では足りない場合がある。
// また途中失敗で部分投入が残らないよう単一トランザクションで囲む。
const preamble =
  "-- 本ファイルは scripts/remap-lead-owners.mjs が生成したものです（直接編集しないこと）\n" +
  "SET statement_timeout = '15min';\n" +
  "BEGIN;\n\n";
const epilogue = "\nCOMMIT;\n";

writeFileSync(outPath, preamble + sql + epilogue, "utf8");
console.log(`\n出力: ${outPath}`);
console.log("開発環境 UUID の残存: なし（検証 OK）");
console.log("statement_timeout=15min / 単一トランザクションで囲みました");
