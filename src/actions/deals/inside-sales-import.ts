"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
} from "@/lib/inside-sales/import-helpers";

type ActionResult<T> = { data: T | null; error: string | null };

// ============================================================
// 期待するCSVヘッダ（順序厳密）
// ============================================================
const EXPECTED_HEADER = [
  "大セグメント", "小セグメント", "企業名", "URL", "電話番号", "架電者",
  "架電日", "架電時間", "架電ステータス", "備考",
  "架電日", "架電時間", "架電ステータス", "備考",
  "架電日", "架電時間", "架電ステータス", "備考",
];
const MAX_CALL_ATTEMPTS = 3;
const INSIDE_SALES_SLUG = "inside_sales";

// ============================================================
// 型定義
// ============================================================
type ParsedCall = {
  called_on: string | null;    // YYYY-MM-DD
  called_at_time: string | null; // HH:MM:SS
  status_name: string;          // CSV原文
  status_code: string | null;   // 解決後
  call_status_id: string | null;
  note: string | null;
};

type ParsedRow = {
  row_number: number;
  raw: {
    large_segment: string;
    small_segment: string;
    company_name: string;
    url: string;
    phone: string;
    caller: string;
  };
  errors: string[];
  resolution: {
    large_segment_id: string | null;
    small_segment_id: string | null;
    caller_id: string | null;
    latest_stage_id: string | null;
    latest_status_id: string | null;
    existing_company_id: string | null;
    existing_account_id: string | null;
    normalized_phone: string | null;
    domain: string | null;
  };
  calls: ParsedCall[];  // 非空の回のみ
};

export type DryRunReport = {
  total_rows: number;
  error_rows: number;
  valid_rows: number;
  new_companies: number;
  existing_companies_reused: number;
  unknown_masters: { type: string; value: string; count: number }[];
  sample_errors: { row: number; messages: string[] }[];
};

export type CommitReport = {
  imported_deals: number;
  imported_calls: number;
  errors: { row: number; message: string }[];
};

// ============================================================
// マスタキャッシュ
// ============================================================
type MasterCaches = {
  largeSegmentsByName: Map<string, string>;
  smallSegmentsByLargeAndName: Map<string, string>; // key: `${large_id}::${name}`
  callStatusesByCode: Map<string, string>;
  callersByName: Map<string, string>;
  stagesByName: Map<string, { id: string; phase_id: string | null }>;
  statusesByStageId: Map<string, Array<{ id: string; name: string; sort_order: number }>>;
  insideSalesPipelineId: string | null;
  prospectAccountStatusId: string | null;
  prospectCompanyStatusId: string | null;
};

async function loadMasters(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<MasterCaches> {
  const [pipeline, large, small, statuses, callers, stages, allStatuses, accountStatus, companyStatus] =
    await Promise.all([
      supabase.from("pipeline_types").select("id").eq("slug", INSIDE_SALES_SLUG).single(),
      supabase.from("inside_sales_large_segments").select("id, name").is("deleted_at", null),
      supabase.from("inside_sales_small_segments").select("id, large_segment_id, name").is("deleted_at", null),
      supabase.from("inside_sales_call_statuses").select("id, code").is("deleted_at", null),
      supabase.from("inside_sales_callers").select("id, name").is("deleted_at", null),
      supabase.from("deal_stages").select("id, name, phase_id, pipeline_type_id").is("deleted_at", null),
      supabase.from("deal_statuses").select("id, name, deal_stage_id, sort_order, pipeline_type_id").is("deleted_at", null),
      supabase.from("account_statuses").select("id").eq("code", "prospect").is("deleted_at", null).single(),
      supabase.from("company_statuses").select("id").eq("name", "見込み").is("deleted_at", null).single(),
    ]);

  const pipelineId = pipeline.data?.id ?? null;

  const largeSegmentsByName = new Map<string, string>();
  for (const row of large.data ?? []) largeSegmentsByName.set(row.name, row.id);

  const smallSegmentsByLargeAndName = new Map<string, string>();
  for (const row of small.data ?? []) {
    smallSegmentsByLargeAndName.set(`${row.large_segment_id}::${row.name}`, row.id);
  }

  const callStatusesByCode = new Map<string, string>();
  for (const row of statuses.data ?? []) callStatusesByCode.set(row.code, row.id);

  const callersByName = new Map<string, string>();
  for (const row of callers.data ?? []) callersByName.set(row.name, row.id);

  const stagesByName = new Map<string, { id: string; phase_id: string | null }>();
  for (const row of stages.data ?? []) {
    if (row.pipeline_type_id === pipelineId) {
      stagesByName.set(row.name, { id: row.id, phase_id: row.phase_id });
    }
  }

  const statusesByStageId = new Map<string, Array<{ id: string; name: string; sort_order: number }>>();
  for (const row of allStatuses.data ?? []) {
    if (row.pipeline_type_id !== pipelineId || !row.deal_stage_id) continue;
    const arr = statusesByStageId.get(row.deal_stage_id) ?? [];
    arr.push({ id: row.id, name: row.name, sort_order: row.sort_order });
    statusesByStageId.set(row.deal_stage_id, arr);
  }
  for (const arr of statusesByStageId.values()) arr.sort((a, b) => a.sort_order - b.sort_order);

  return {
    largeSegmentsByName,
    smallSegmentsByLargeAndName,
    callStatusesByCode,
    callersByName,
    stagesByName,
    statusesByStageId,
    insideSalesPipelineId: pipelineId,
    prospectAccountStatusId: accountStatus.data?.id ?? null,
    prospectCompanyStatusId: companyStatus.data?.id ?? null,
  };
}

// ============================================================
// 行のパース・解決
// ============================================================
function parseRow(
  rowNumber: number,
  cols: string[],
  masters: MasterCaches
): ParsedRow {
  const pad = [...cols];
  while (pad.length < 18) pad.push("");
  const [
    largeSeg, smallSeg, companyName, url, phone, callerName,
    d1, t1, s1, n1,
    d2, t2, s2, n2,
    d3, t3, s3, n3,
  ] = pad;

  const errors: string[] = [];

  const trimmedCompany = normalizeCompanyName(companyName);
  if (!trimmedCompany) errors.push("企業名が空です");

  // マスタ解決
  const large_segment_id = masters.largeSegmentsByName.get(largeSeg.trim()) ?? null;
  if (largeSeg.trim() && !large_segment_id) errors.push(`大セグメント未登録: ${largeSeg.trim()}`);

  let small_segment_id: string | null = null;
  if (smallSeg.trim() && large_segment_id) {
    small_segment_id =
      masters.smallSegmentsByLargeAndName.get(`${large_segment_id}::${smallSeg.trim()}`) ?? null;
    if (!small_segment_id) errors.push(`小セグメント未登録: [${largeSeg.trim()}] > [${smallSeg.trim()}]`);
  }

  const caller_id = masters.callersByName.get(callerName.trim()) ?? null;
  if (callerName.trim() && !caller_id) errors.push(`架電者未登録: ${callerName.trim()}`);

  const phoneNorm = normalizePhone(phone);
  const domain = extractDomain(url);

  // 架電3回分のパース
  const raw3 = [
    [d1, t1, s1, n1],
    [d2, t2, s2, n2],
    [d3, t3, s3, n3],
  ];
  const calls: ParsedCall[] = [];
  for (let i = 0; i < MAX_CALL_ATTEMPTS; i++) {
    const [d, t, s, n] = raw3[i];
    const hasAny = d.trim() || t.trim() || s.trim() || n.trim();
    if (!hasAny) continue;

    const statusName = s.trim();
    const statusCode = CALL_STATUS_NAME_TO_CODE[statusName] ?? null;
    const statusId = statusCode ? masters.callStatusesByCode.get(statusCode) ?? null : null;
    if (statusName && !statusId) errors.push(`[${i + 1}回目] 架電ステータス未登録: ${statusName}`);

    const called_on = normalizeDate(d);
    if (d.trim() && !called_on) errors.push(`[${i + 1}回目] 架電日の形式が不正: ${d}`);

    const called_at_time = normalizeTime(t);
    if (t.trim() && !called_at_time) errors.push(`[${i + 1}回目] 架電時間の形式が不正: ${t}`);

    if (!called_on) errors.push(`[${i + 1}回目] 架電日が必須（記録ありの回）`);

    calls.push({
      called_on,
      called_at_time,
      status_name: statusName,
      status_code: statusCode,
      call_status_id: statusId,
      note: n.trim() || null,
    });
  }

  // stage/phase 自動決定
  let latest_stage_id: string | null = null;
  let latest_status_id: string | null = null;
  if (calls.length === 0) {
    // 未架電 → '未架電' ステージ
    const stage = masters.stagesByName.get(STAGE_CODE_TO_NAME.untouched);
    latest_stage_id = stage?.id ?? null;
  } else {
    // 直近の架電ステータスから stage 解決
    const last = calls[calls.length - 1];
    if (last.status_code) {
      const mapping = CALL_STATUS_TO_STAGE[last.status_code];
      if (mapping) {
        const stage = masters.stagesByName.get(STAGE_CODE_TO_NAME[mapping.stage_code]);
        latest_stage_id = stage?.id ?? null;
      }
    }
    if (!latest_stage_id) {
      // fallback: 架電試行中
      const stage = masters.stagesByName.get(STAGE_CODE_TO_NAME.calling);
      latest_stage_id = stage?.id ?? null;
    }
  }

  if (latest_stage_id) {
    const statuses = masters.statusesByStageId.get(latest_stage_id);
    latest_status_id = statuses?.[0]?.id ?? null;
  }
  if (!latest_stage_id) errors.push("stage解決失敗: deal_stages seed を確認");
  if (!latest_status_id) errors.push("status解決失敗: deal_statuses seed を確認");

  return {
    row_number: rowNumber,
    raw: {
      large_segment: largeSeg.trim(),
      small_segment: smallSeg.trim(),
      company_name: trimmedCompany,
      url: url.trim(),
      phone: phone.trim(),
      caller: callerName.trim(),
    },
    errors,
    resolution: {
      large_segment_id,
      small_segment_id,
      caller_id,
      latest_stage_id,
      latest_status_id,
      existing_company_id: null,   // DB問い合わせで後埋め
      existing_account_id: null,
      normalized_phone: phoneNorm,
      domain,
    },
    calls,
  };
}

// ============================================================
// 既存Company/Account 探索（名前→ドメイン→電話の優先順で重複判定）
// ============================================================
async function resolveExistingCompany(
  supabase: Awaited<ReturnType<typeof createClient>>,
  row: ParsedRow
): Promise<{ company_id: string | null; account_id: string | null }> {
  // 1. 企業名完全一致（normalize後）
  let found: { id: string } | null = null;
  const { data: byName } = await supabase
    .from("companies")
    .select("id, name")
    .eq("name", row.raw.company_name)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (byName) found = { id: byName.id };

  // 2. URLドメイン一致（domainがある場合のみ）
  if (!found && row.resolution.domain) {
    const { data: byDomain } = await supabase
      .from("companies")
      .select("id")
      .ilike("website_url", `%${row.resolution.domain}%`)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (byDomain) found = { id: byDomain.id };
  }

  // 3. 電話番号一致
  // companies.phone は存在する（seed で使用済み）。正規化後の phone で検索したいが、
  // DB 側に normalized column はないので、前方・後方一致で近似する
  if (!found && row.resolution.normalized_phone) {
    const last8 = row.resolution.normalized_phone.slice(-8);
    const { data: byPhone } = await supabase
      .from("companies")
      .select("id, phone")
      .like("phone", `%${last8}%`)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (byPhone) found = { id: byPhone.id };
  }

  if (!found) return { company_id: null, account_id: null };

  // 既存Companyに紐づくAccount（同名）を探す
  const { data: existingAccount } = await supabase
    .from("accounts")
    .select("id")
    .eq("company_id", found.id)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  return { company_id: found.id, account_id: existingAccount?.id ?? null };
}

// ============================================================
// 認証・権限
// ============================================================
async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase: null, user: null, error: "認証が必要です" };
  const { data: crmUser } = await supabase
    .from("crm_users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (crmUser?.role !== "admin") {
    return { supabase: null, user: null, error: "管理者権限が必要です" };
  }
  return { supabase, user, error: null };
}

// ============================================================
// 既存Company一括プリロード＋ルックアップ構築
// 大量取込時の個別クエリを避けるため、全companiesを先読みしてメモリ上で重複判定する
// ============================================================
type CompanyLookup = {
  byName: Map<string, string>;
  byDomain: Map<string, string>;
  byPhoneLast8: Map<string, string>;
};

async function buildCompanyLookup(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<CompanyLookup> {
  const byName = new Map<string, string>();
  const byDomain = new Map<string, string>();
  const byPhoneLast8 = new Map<string, string>();

  // ページ分割取得（Supabase はデフォルト1000件までなので range でページング）
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("companies")
      .select("id, name, website_url, phone")
      .is("deleted_at", null)
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    for (const c of data) {
      if (c.name) byName.set(c.name.trim(), c.id);
      const d = extractDomain(c.website_url);
      if (d && !byDomain.has(d)) byDomain.set(d, c.id);
      const p = normalizePhone(c.phone);
      if (p) {
        const last8 = p.slice(-8);
        if (!byPhoneLast8.has(last8)) byPhoneLast8.set(last8, c.id);
      }
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return { byName, byDomain, byPhoneLast8 };
}

function resolveCompanyIdFromLookup(
  row: ParsedRow,
  lookup: CompanyLookup
): string | null {
  const cid = lookup.byName.get(row.raw.company_name);
  if (cid) return cid;
  if (row.resolution.domain) {
    const byD = lookup.byDomain.get(row.resolution.domain);
    if (byD) return byD;
  }
  if (row.resolution.normalized_phone) {
    const byP = lookup.byPhoneLast8.get(row.resolution.normalized_phone.slice(-8));
    if (byP) return byP;
  }
  return null;
}

// ============================================================
// Dry-run（取込前プレビュー）
// プリロードしたcompaniesで重複判定するため、全件正確に集計
// ============================================================
export async function dryRunInsideSalesImport(
  csvContent: string
): Promise<ActionResult<DryRunReport>> {
  const { supabase, error: authErr } = await requireAdmin();
  if (!supabase || authErr) return { data: null, error: authErr };

  const rows = parseCsv(csvContent);
  if (rows.length < 2) return { data: null, error: "CSVが空またはヘッダのみです" };

  const header = rows[0].map((s) => s.trim());
  for (let i = 0; i < EXPECTED_HEADER.length; i++) {
    if (header[i] !== EXPECTED_HEADER[i]) {
      return {
        data: null,
        error: `ヘッダ不一致 (col ${i + 1}): 期待='${EXPECTED_HEADER[i]}' 実際='${header[i] ?? ""}'`,
      };
    }
  }

  const masters = await loadMasters(supabase);
  if (!masters.insideSalesPipelineId) {
    return { data: null, error: "pipeline_types に slug='inside_sales' が存在しません" };
  }

  const parsedRows: ParsedRow[] = [];
  const unknownMasters = new Map<string, number>();
  const sampleErrors: { row: number; messages: string[] }[] = [];

  for (let i = 1; i < rows.length; i++) {
    if (rows[i].every((s) => !s.trim())) continue;
    const parsed = parseRow(i + 1, rows[i], masters);
    parsedRows.push(parsed);
    if (parsed.errors.length > 0) {
      for (const msg of parsed.errors) {
        if (msg.startsWith("大セグメント未登録:") || msg.startsWith("小セグメント未登録:") ||
            msg.startsWith("架電者未登録:") || (msg.startsWith("[") && msg.includes("架電ステータス未登録"))) {
          unknownMasters.set(msg, (unknownMasters.get(msg) ?? 0) + 1);
        }
      }
      if (sampleErrors.length < 20) {
        sampleErrors.push({ row: parsed.row_number, messages: parsed.errors });
      }
    }
  }

  const validRows = parsedRows.filter((r) => r.errors.length === 0);

  // 全Company一括プリロード→メモリ上で重複判定
  const lookup = await buildCompanyLookup(supabase);
  const uniqueNewKeys = new Set<string>();
  let reused = 0;
  for (const row of validRows) {
    const existingId = resolveCompanyIdFromLookup(row, lookup);
    if (existingId) {
      reused++;
    } else {
      uniqueNewKeys.add(row.raw.company_name);
    }
  }

  const unknownMastersArr = Array.from(unknownMasters.entries())
    .map(([msg, count]) => {
      const [typePart, valuePart] = msg.split(": ");
      return { type: typePart, value: valuePart ?? "", count };
    })
    .sort((a, b) => b.count - a.count);

  return {
    data: {
      total_rows: rows.length - 1,
      error_rows: parsedRows.filter((r) => r.errors.length > 0).length,
      valid_rows: validRows.length,
      new_companies: uniqueNewKeys.size,
      existing_companies_reused: reused,
      unknown_masters: unknownMastersArr,
      sample_errors: sampleErrors,
    },
    error: null,
  };
}

// ============================================================
// Commit（バルクインサート方式）
// 処理順序:
//   1. 全行パース（メモリ上）
//   2. 既存Company一括プリロード
//   3. 新規Company一括insert（チャンク500件）
//   4. 既存/新規Accountをcompany_id単位で解決し、新規Account一括insert
//   5. Deal一括insert（チャンク500件。戻り値のIDで後続紐付け）
//   6. deal_ext_inside_sales / calls を一括insert
// 3000件規模で数万クエリ → 数十クエリまで削減
// ============================================================
const CHUNK = 500;

async function chunkedInsert<T, R>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  rows: T[],
  selectColumns?: string
): Promise<{ data: R[]; error: string | null }> {
  const result: R[] = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const query = supabase.from(table).insert(chunk as never);
    const { data, error } = selectColumns
      ? await query.select(selectColumns)
      : await query.select();
    if (error) return { data: [], error: `${table} chunk ${i}: ${error.message}` };
    if (data) result.push(...(data as R[]));
  }
  return { data: result, error: null };
}

export async function commitInsideSalesImport(
  csvContent: string,
  ownerUserId: string
): Promise<ActionResult<CommitReport>> {
  // 認証・権限チェックは authenticated クライアントで実施
  const { supabase: authClient, user, error: authErr } = await requireAdmin();
  if (!authClient || !user || authErr) return { data: null, error: authErr };

  // バルクINSERT本体は service-role クライアントで実行（RLS回避・3000件で数百msを実現）
  // admin認証済みで、このServer Actionは admin以外呼べないため安全
  const supabase = createAdminClient();

  const rows = parseCsv(csvContent);
  if (rows.length < 2) return { data: null, error: "CSVが空またはヘッダのみです" };

  const header = rows[0].map((s) => s.trim());
  for (let i = 0; i < EXPECTED_HEADER.length; i++) {
    if (header[i] !== EXPECTED_HEADER[i]) {
      return { data: null, error: `ヘッダ不一致 (col ${i + 1})` };
    }
  }

  const masters = await loadMasters(supabase);
  if (!masters.insideSalesPipelineId || !masters.prospectAccountStatusId) {
    return { data: null, error: "マスタ初期化不足（pipeline_type/account_status）" };
  }

  const report: CommitReport = { imported_deals: 0, imported_calls: 0, errors: [] };
  const t0 = Date.now();

  // ----- 1. 全行パース -----
  const parsedRows: ParsedRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].every((s) => !s.trim())) continue;
    parsedRows.push(parseRow(i + 1, rows[i], masters));
  }
  const validRows = parsedRows.filter((r) => r.errors.length === 0);
  for (const r of parsedRows) {
    if (r.errors.length > 0) {
      report.errors.push({ row: r.row_number, message: r.errors.join(" / ") });
    }
  }
  console.log(`[IS import] parsed ${validRows.length} valid rows (${Date.now() - t0}ms)`);

  if (validRows.length === 0) return { data: report, error: null };

  // ----- 2. 既存Company一括プリロード -----
  const lookup = await buildCompanyLookup(supabase);
  console.log(`[IS import] loaded ${lookup.byName.size} existing companies`);

  // 各valid row の既存Company ID を解決（メモリ上のみ）
  const rowToCompanyId = new Map<number, string | null>();
  const newCompanySeen = new Map<string, number>(); // name → first-rowIdx（バッチ内重複排除）
  const newCompanyInserts: Array<{
    name: string;
    company_status_id: string | null;
    phone: string | null;
    website_url: string | null;
    owner_user_id: string;
    created_by: string;
  }> = [];

  for (let i = 0; i < validRows.length; i++) {
    const row = validRows[i];
    const existingId = resolveCompanyIdFromLookup(row, lookup);
    if (existingId) {
      rowToCompanyId.set(i, existingId);
    } else if (newCompanySeen.has(row.raw.company_name)) {
      rowToCompanyId.set(i, null); // あとで埋める（同名既出）
    } else {
      newCompanySeen.set(row.raw.company_name, i);
      newCompanyInserts.push({
        name: row.raw.company_name,
        company_status_id: masters.prospectCompanyStatusId,
        phone: row.raw.phone || null,
        website_url: row.raw.url || null,
        owner_user_id: ownerUserId,
        created_by: ownerUserId,
      });
      rowToCompanyId.set(i, null);
    }
  }

  // ----- 3. 新規Company 一括insert -----
  if (newCompanyInserts.length > 0) {
    const r = await chunkedInsert<typeof newCompanyInserts[0], { id: string; name: string }>(
      supabase,
      "companies",
      newCompanyInserts,
      "id, name"
    );
    if (r.error) return { data: null, error: `Company一括insert失敗: ${r.error}` };
    for (const c of r.data) lookup.byName.set(c.name, c.id);
    console.log(`[IS import] inserted ${r.data.length} new companies (${Date.now() - t0}ms)`);
  }

  // rowToCompanyId を埋め直し
  for (let i = 0; i < validRows.length; i++) {
    if (rowToCompanyId.get(i) === null) {
      const cid = lookup.byName.get(validRows[i].raw.company_name) ?? null;
      rowToCompanyId.set(i, cid);
    }
  }

  // ----- 4. Account 解決（company_id単位で1アカウント） -----
  const companyIdsInUse = Array.from(
    new Set(Array.from(rowToCompanyId.values()).filter((v): v is string => !!v))
  );
  const accountByCompanyId = new Map<string, string>();

  if (companyIdsInUse.length > 0) {
    // 既存Accountを一括取得（.in は1000件超あるので分割）
    for (let i = 0; i < companyIdsInUse.length; i += 1000) {
      const chunk = companyIdsInUse.slice(i, i + 1000);
      const { data } = await supabase
        .from("accounts")
        .select("id, company_id")
        .in("company_id", chunk)
        .is("deleted_at", null);
      for (const a of data ?? []) {
        if (a.company_id && !accountByCompanyId.has(a.company_id)) {
          accountByCompanyId.set(a.company_id, a.id);
        }
      }
    }
    console.log(`[IS import] loaded ${accountByCompanyId.size} existing accounts`);
  }

  // 新規Accountを一括insert
  const newAccountInserts: Array<{
    name: string;
    company_id: string;
    account_status_id: string;
    owner_user_id: string;
    created_by: string;
  }> = [];
  const companyToFirstRowIdx = new Map<string, number>();
  for (let i = 0; i < validRows.length; i++) {
    const cid = rowToCompanyId.get(i);
    if (!cid || accountByCompanyId.has(cid)) continue;
    if (companyToFirstRowIdx.has(cid)) continue;
    companyToFirstRowIdx.set(cid, i);
    newAccountInserts.push({
      name: validRows[i].raw.company_name,
      company_id: cid,
      account_status_id: masters.prospectAccountStatusId!,
      owner_user_id: ownerUserId,
      created_by: ownerUserId,
    });
  }

  if (newAccountInserts.length > 0) {
    const r = await chunkedInsert<typeof newAccountInserts[0], { id: string; company_id: string }>(
      supabase,
      "accounts",
      newAccountInserts,
      "id, company_id"
    );
    if (r.error) return { data: null, error: `Account一括insert失敗: ${r.error}` };
    for (const a of r.data) accountByCompanyId.set(a.company_id, a.id);
    console.log(`[IS import] inserted ${r.data.length} new accounts (${Date.now() - t0}ms)`);
  }

  // ----- 5. Deal一括insert -----
  type DealInsert = {
    name: string;
    pipeline_type_id: string;
    deal_stage_id: string;
    deal_status_id: string;
    account_id: string;
    owner_user_id: string;
    stage_updated_at: string;
    created_by: string;
    last_updated_by: string;
  };
  const dealInserts: DealInsert[] = [];
  const dealRowMap: number[] = []; // dealInserts index → validRows index

  const nowIso = new Date().toISOString();
  for (let i = 0; i < validRows.length; i++) {
    const row = validRows[i];
    const cid = rowToCompanyId.get(i);
    if (!cid) {
      report.errors.push({ row: row.row_number, message: "company_id解決失敗" });
      continue;
    }
    const aid = accountByCompanyId.get(cid);
    if (!aid) {
      report.errors.push({ row: row.row_number, message: "account_id解決失敗" });
      continue;
    }
    if (!row.resolution.latest_stage_id || !row.resolution.latest_status_id) {
      report.errors.push({ row: row.row_number, message: "stage/status解決失敗" });
      continue;
    }
    dealInserts.push({
      name: row.raw.company_name,
      pipeline_type_id: masters.insideSalesPipelineId!,
      deal_stage_id: row.resolution.latest_stage_id,
      deal_status_id: row.resolution.latest_status_id,
      account_id: aid,
      owner_user_id: ownerUserId,
      stage_updated_at: nowIso,
      created_by: ownerUserId,
      last_updated_by: ownerUserId,
    });
    dealRowMap.push(i);
  }

  const dealResult = await chunkedInsert<DealInsert, { id: string }>(
    supabase,
    "deals",
    dealInserts,
    "id"
  );
  if (dealResult.error) return { data: null, error: `Deal一括insert失敗: ${dealResult.error}` };
  if (dealResult.data.length !== dealInserts.length) {
    return {
      data: null,
      error: `Deal insert数が不一致: expected=${dealInserts.length} got=${dealResult.data.length}`,
    };
  }
  report.imported_deals = dealResult.data.length;
  console.log(`[IS import] inserted ${dealResult.data.length} deals (${Date.now() - t0}ms)`);

  // ----- 6. 拡張レコード + 架電記録 一括insert -----
  const extInserts: Array<{
    deal_id: string;
    large_segment_id: string | null;
    small_segment_id: string | null;
    prospect_company_name: string;
    url: string | null;
    phone: string | null;
    primary_caller_id: string | null;
    created_by: string;
  }> = [];
  const callInserts: Array<{
    deal_id: string;
    call_number: number;
    called_on: string;
    called_at_time: string | null;
    call_status_id: string;
    caller_id: string;
    note: string | null;
    created_by: string;
  }> = [];

  for (let k = 0; k < dealResult.data.length; k++) {
    const dealId = dealResult.data[k].id;
    const row = validRows[dealRowMap[k]];

    extInserts.push({
      deal_id: dealId,
      large_segment_id: row.resolution.large_segment_id,
      small_segment_id: row.resolution.small_segment_id,
      prospect_company_name: row.raw.company_name,
      url: row.raw.url || null,
      phone: row.raw.phone || null,
      primary_caller_id: row.resolution.caller_id,
      created_by: ownerUserId,
    });

    for (let j = 0; j < row.calls.length; j++) {
      const call = row.calls[j];
      if (!call.call_status_id || !call.called_on || !row.resolution.caller_id) continue;
      callInserts.push({
        deal_id: dealId,
        call_number: j + 1,
        called_on: call.called_on,
        called_at_time: call.called_at_time,
        call_status_id: call.call_status_id,
        caller_id: row.resolution.caller_id,
        note: call.note,
        created_by: ownerUserId,
      });
    }
  }

  if (extInserts.length > 0) {
    const r = await chunkedInsert<typeof extInserts[0], { deal_id: string }>(
      supabase,
      "deal_ext_inside_sales",
      extInserts,
      "deal_id"
    );
    if (r.error) {
      report.errors.push({ row: 0, message: `拡張一括insert失敗: ${r.error}` });
    } else {
      console.log(`[IS import] inserted ${r.data.length} extensions (${Date.now() - t0}ms)`);
    }
  }

  if (callInserts.length > 0) {
    const r = await chunkedInsert<typeof callInserts[0], { id: string }>(
      supabase,
      "deal_ext_inside_sales_calls",
      callInserts,
      "id"
    );
    if (r.error) {
      report.errors.push({ row: 0, message: `架電記録一括insert失敗: ${r.error}` });
    } else {
      report.imported_calls = r.data.length;
      console.log(`[IS import] inserted ${r.data.length} calls (${Date.now() - t0}ms)`);
    }
  }

  console.log(`[IS import] DONE in ${Date.now() - t0}ms`);
  return { data: report, error: null };
}
