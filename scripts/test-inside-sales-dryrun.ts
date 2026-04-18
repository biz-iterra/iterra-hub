/**
 * インサイドセールスCSV取込の dry-run テスト
 * 使い方: npx tsx scripts/test-inside-sales-dryrun.ts
 *
 * 対話型のServer Actionを使わず、importのコアロジックのみ検証する。
 * 実行にはローカルSupabase(`npx supabase start`)が必要。
 */
import { readFileSync, readdirSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import {
  parseCsv,
  normalizeCompanyName,
  normalizePhone,
  normalizeDate,
  normalizeTime,
  extractDomain,
  CALL_STATUS_NAME_TO_CODE,
  CALL_STATUS_TO_STAGE,
  STAGE_CODE_TO_NAME,
} from "../src/lib/inside-sales/import-helpers";

const SUPABASE_URL = "http://127.0.0.1:54331";  // iterra-hubポート(+10)
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SERVICE_ROLE_KEY) {
  console.error("環境変数 SUPABASE_SERVICE_ROLE_KEY が必要です");
  console.error("例: export SUPABASE_SERVICE_ROLE_KEY=$(npx supabase status -o env | grep SERVICE_ROLE_KEY | cut -d= -f2)");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
  const files = readdirSync(".").filter((f) => f.endsWith(".csv"));
  if (files.length === 0) {
    console.error("カレントディレクトリに CSV が見つかりません");
    process.exit(1);
  }
  const csvPath = files[0];
  console.log(`入力: ${csvPath}`);
  const content = readFileSync(csvPath, "utf-8");

  const rows = parseCsv(content);
  console.log(`ヘッダ: ${rows[0].length} cols`);
  console.log(`データ行: ${rows.length - 1}`);

  // マスタロード
  const [pipeline, large, small, statuses, callers, stages, allStatuses] = await Promise.all([
    supabase.from("pipeline_types").select("id").eq("slug", "inside_sales").single(),
    supabase.from("inside_sales_large_segments").select("id, name").is("deleted_at", null),
    supabase.from("inside_sales_small_segments").select("id, large_segment_id, name").is("deleted_at", null),
    supabase.from("inside_sales_call_statuses").select("id, code").is("deleted_at", null),
    supabase.from("inside_sales_callers").select("id, name").is("deleted_at", null),
    supabase.from("deal_stages").select("id, name, phase_id, pipeline_type_id").is("deleted_at", null),
    supabase.from("deal_statuses").select("id, name, deal_stage_id, sort_order, pipeline_type_id").is("deleted_at", null),
  ]);

  const pipelineId = pipeline.data?.id;
  const largeByName = new Map((large.data ?? []).map((r) => [r.name, r.id] as const));
  const smallByLargeAndName = new Map(
    (small.data ?? []).map((r) => [`${r.large_segment_id}::${r.name}`, r.id] as const)
  );
  const statusByCode = new Map((statuses.data ?? []).map((r) => [r.code, r.id] as const));
  const callerByName = new Map((callers.data ?? []).map((r) => [r.name, r.id] as const));
  const stagesByName = new Map(
    (stages.data ?? []).filter((r) => r.pipeline_type_id === pipelineId).map((r) => [r.name, r.id] as const)
  );

  console.log(`マスタ: large=${largeByName.size}, small=${smallByLargeAndName.size}, status=${statusByCode.size}, caller=${callerByName.size}, stages=${stagesByName.size}`);

  // 集計
  let validRows = 0;
  let errorRows = 0;
  const errorSamples: string[] = [];
  const unknownMasters = new Map<string, number>();
  const stageDistribution = new Map<string, number>();

  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    if (cols.every((s) => !s.trim())) continue;
    const pad = [...cols];
    while (pad.length < 18) pad.push("");
    const [
      largeSeg, smallSeg, companyName, url, phone, callerName,
      d1, t1, s1, , d2, t2, s2, , d3, t3, s3,
    ] = pad;

    const errors: string[] = [];
    const cname = normalizeCompanyName(companyName);
    if (!cname) errors.push("企業名が空");

    const lid = largeByName.get(largeSeg.trim()) ?? null;
    if (largeSeg.trim() && !lid) {
      errors.push(`大セグメント未登録: ${largeSeg.trim()}`);
      unknownMasters.set(`大セグメント:${largeSeg.trim()}`, (unknownMasters.get(`大セグメント:${largeSeg.trim()}`) ?? 0) + 1);
    }
    if (smallSeg.trim() && lid) {
      const sid = smallByLargeAndName.get(`${lid}::${smallSeg.trim()}`);
      if (!sid) {
        errors.push(`小セグメント未登録: ${largeSeg.trim()} > ${smallSeg.trim()}`);
        unknownMasters.set(`小セグメント:${largeSeg.trim()}>${smallSeg.trim()}`, (unknownMasters.get(`小セグメント:${largeSeg.trim()}>${smallSeg.trim()}`) ?? 0) + 1);
      }
    }
    if (callerName.trim() && !callerByName.get(callerName.trim())) {
      errors.push(`架電者未登録: ${callerName.trim()}`);
      unknownMasters.set(`架電者:${callerName.trim()}`, (unknownMasters.get(`架電者:${callerName.trim()}`) ?? 0) + 1);
    }

    // call statuses
    const callStatuses: Array<{ d: string; t: string; s: string; idx: number }> = [
      { d: d1, t: t1, s: s1, idx: 1 },
      { d: d2, t: t2, s: s2, idx: 2 },
      { d: d3, t: t3, s: s3, idx: 3 },
    ];
    const latestCalls = callStatuses.filter((c) => c.d.trim() || c.s.trim());
    for (const c of latestCalls) {
      if (c.s.trim()) {
        const code = CALL_STATUS_NAME_TO_CODE[c.s.trim()];
        if (!code || !statusByCode.get(code)) {
          errors.push(`[${c.idx}回目] 架電ステータス未登録: ${c.s.trim()}`);
          unknownMasters.set(`架電ステータス:${c.s.trim()}`, (unknownMasters.get(`架電ステータス:${c.s.trim()}`) ?? 0) + 1);
        }
      }
      if (c.d.trim() && !normalizeDate(c.d)) errors.push(`[${c.idx}回目] 架電日形式不正: ${c.d}`);
      if (c.t.trim() && !normalizeTime(c.t)) errors.push(`[${c.idx}回目] 架電時間形式不正: ${c.t}`);
    }

    // stage 判定
    let stageName: string;
    if (latestCalls.length === 0) {
      stageName = STAGE_CODE_TO_NAME.untouched;
    } else {
      const last = latestCalls[latestCalls.length - 1];
      const code = CALL_STATUS_NAME_TO_CODE[last.s.trim()];
      const mapping = code ? CALL_STATUS_TO_STAGE[code] : null;
      stageName = mapping ? STAGE_CODE_TO_NAME[mapping.stage_code] : STAGE_CODE_TO_NAME.calling;
    }
    stageDistribution.set(stageName, (stageDistribution.get(stageName) ?? 0) + 1);

    if (errors.length > 0) {
      errorRows++;
      if (errorSamples.length < 10) errorSamples.push(`row ${i + 1}: ${errors.join(" / ")}`);
    } else {
      validRows++;
    }
  }

  console.log("\n=== Dry-Run 結果 ===");
  console.log(`有効行: ${validRows}`);
  console.log(`エラー行: ${errorRows}`);
  console.log("\n=== ステージ分布（stage自動判定） ===");
  for (const [s, n] of [...stageDistribution.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n.toString().padStart(5)}  ${s}`);
  }
  if (unknownMasters.size > 0) {
    console.log("\n=== マスタ未登録 ===");
    for (const [k, n] of [...unknownMasters.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${n.toString().padStart(5)}  ${k}`);
    }
  }
  if (errorSamples.length > 0) {
    console.log("\n=== エラー行サンプル ===");
    for (const s of errorSamples) console.log(`  ${s}`);
  }
}

main().then(() => process.exit(0));
