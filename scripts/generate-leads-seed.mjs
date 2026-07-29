#!/usr/bin/env node
// ============================================================
// ITERRA Academy 架電リスト CSV → leads / lead_activities SQL 生成
// ============================================================
// Usage: node scripts/generate-leads-seed.mjs
// Output: supabase/seed-leads-generated.sql に書き出す
// ============================================================

import fs from "node:fs";
import { parse } from "csv-parse/sync";

const CSV_PATH = "ITERRA Academy　架電リスト - 架電リスト.csv";
const OUT_PATH = "supabase/seed-leads-generated.sql";

// ---- マスタ ID マッピング（seed.sql と一致させる）----
const LARGE_SEGMENT_ID = {
  製造業: "b2000000-0000-0000-0000-000000000001",
  IT会社: "b2000000-0000-0000-0000-000000000002",
  "IT・SaaS": "b2000000-0000-0000-0000-000000000003",
  "介護・福祉": "b2000000-0000-0000-0000-000000000004",
  教育: "b2000000-0000-0000-0000-000000000005",
  建設: "b2000000-0000-0000-0000-000000000006",
  不動産: "b2000000-0000-0000-0000-000000000007",
  人材: "b2000000-0000-0000-0000-000000000008",
};

// (large, small) → small_segment_id
const SMALL_SEGMENT_ID = {
  "製造業|食品製造のDX推進": "b3000000-0000-0000-0000-000000000001",
  "製造業|金属加工・部品加工の業務効率化": "b3000000-0000-0000-0000-000000000002",
  "製造業|DX支援": "b3000000-0000-0000-0000-000000000003",
  "製造業|DX推進／業務効率化": "b3000000-0000-0000-0000-000000000004",
  "製造業|IT/DX軸": "b3000000-0000-0000-0000-000000000005",
  "IT会社|IT/DX軸": "b3000000-0000-0000-0000-000000000006",
  "IT・SaaS|IT支援": "b3000000-0000-0000-0000-000000000007",
  "介護・福祉|訪問看護／介護施設": "b3000000-0000-0000-0000-000000000008",
  "教育|生成AI研修": "b3000000-0000-0000-0000-000000000009",
  "建設|IT支援": "b3000000-0000-0000-0000-000000000010",
  "不動産|IT支援": "b3000000-0000-0000-0000-000000000011",
  "人材|IT/DX軸": "b3000000-0000-0000-0000-000000000012",
};

// 架電ステータス CSV 値 → lead_call_statuses.code
const CALL_STATUS_TO_CODE = {
  担当不在: "absent",
  受付NG: "gatekeep",
  不出: "no_answer",
  担当NG: "refused",
  現アナ: "voicemail",
  NT: "nt",
  新規フォーム: "form_sent",
  資料送付: "material_sent",
  アポ: "appointment",
  見込み: "promising",
};

const CALL_STATUS_ID = {
  nt: "b4000000-0000-0000-0000-000000000001",
  no_answer: "b4000000-0000-0000-0000-000000000002",
  absent: "b4000000-0000-0000-0000-000000000003",
  voicemail: "b4000000-0000-0000-0000-000000000004",
  gatekeep: "b4000000-0000-0000-0000-000000000005",
  refused: "b4000000-0000-0000-0000-000000000006",
  form_sent: "b4000000-0000-0000-0000-000000000007",
  material_sent: "b4000000-0000-0000-0000-000000000008",
  promising: "b4000000-0000-0000-0000-000000000009",
  appointment: "b4000000-0000-0000-0000-000000000010",
};

// 温度感分類
const STATUS_TEMPERATURE = {
  nt: "cold",
  no_answer: "cold",
  absent: "cold",
  voicemail: "cold",
  gatekeep: "warm",
  refused: "warm",
  form_sent: "warm",
  material_sent: "warm",
  promising: "hot",
  appointment: "hot",
};

const TEMPERATURE_ID = {
  cold: "b1000000-0000-0000-0000-000000000001",
  warm: "b1000000-0000-0000-0000-000000000002",
  hot: "b1000000-0000-0000-0000-000000000003",
};

// 架電者 → crm_users
const CALLER = {
  小川: {
    userId: "a0000000-0000-0000-0000-000000000010",
  },
  田中: {
    userId: "a0000000-0000-0000-0000-000000000011",
  },
  伏見: {
    userId: "a0000000-0000-0000-0000-000000000012",
  },
};
const DEFAULT_USER_ID = "a0000000-0000-0000-0000-000000000010";

// stage id
const STAGE_ID = {
  generation: "a1000000-0000-0000-0000-000000000001",
  nurturing: "a1000000-0000-0000-0000-000000000002",
  qualification: "a1000000-0000-0000-0000-000000000003",
};

// status id (code → id)
const STATUS_ID = {
  list_ready: "a2000000-0000-0000-0000-000000000001",
  not_called: "a2000000-0000-0000-0000-000000000002",
  calling: "a2000000-0000-0000-0000-000000000005",
  continuing_call: "a2000000-0000-0000-0000-000000000006",
  awaiting_recall: "a2000000-0000-0000-0000-000000000007",
  material_sent: "a2000000-0000-0000-0000-000000000008",
  appointment_obtained: "a2000000-0000-0000-0000-000000000009",
  appointment_confirmed: "a2000000-0000-0000-0000-000000000010",
};

// category id
const CATEGORY_ID = {
  inquiry: "b6000000-0000-0000-0000-000000000001",
  mql: "b6000000-0000-0000-0000-000000000002",
  tql: "b6000000-0000-0000-0000-000000000003",
};

// lead_activity_types（全アクティビティは「call」に固定）
const ACTIVITY_TYPE_CALL_ID = "b7000000-0000-0000-0000-000000000001";

// ---- ユーティリティ ----
function esc(s) {
  if (s === null || s === undefined) return "NULL";
  return `'${String(s).replace(/'/g, "''")}'`;
}

function cleanPhone(raw) {
  if (!raw) return null;
  // 全角→半角、各種ハイフンを - に正規化、記号類除去し数字+ハイフン+括弧だけ残す
  const normalized = raw
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[‐‑‒–—―−ー－]/g, "-")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .trim();
  // 20 文字以内に収める（VARCHAR(20) 制約）
  return normalized.length > 20 ? normalized.slice(0, 20) : normalized;
}

function cleanUrl(raw) {
  if (!raw) return null;
  const s = raw.trim();
  return s.length > 500 ? s.slice(0, 500) : s;
}

function normalizeDate(raw) {
  if (!raw) return null;
  // 2026/2/20 形式 → 2026-02-20
  const m = String(raw).match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (!m) return null;
  const y = m[1];
  const mo = m[2].padStart(2, "0");
  const d = m[3].padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

function normalizeTime(raw) {
  if (!raw) return null;
  const n = parseInt(raw, 10);
  if (isNaN(n) || n < 0 || n > 23) return null;
  return `${String(n).padStart(2, "0")}:00:00`;
}

function truncate(s, max) {
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

// ---- CSV 読み込み ----
const content = fs.readFileSync(CSV_PATH, "utf8");
const rows = parse(content, {
  columns: false,
  skip_empty_lines: true,
  relax_column_count: true,
});

const headers = [
  "大セグメント",
  "小セグメント",
  "企業名",
  "URL",
  "電話番号",
  "架電者",
  "架電日1",
  "架電時間1",
  "架電ステータス1",
  "備考1",
  "架電日2",
  "架電時間2",
  "架電ステータス2",
  "備考2",
  "架電日3",
  "架電時間3",
  "架電ステータス3",
  "備考3",
];

// 先頭行をスキップ
const data = rows.slice(1).map((r) => {
  const obj = {};
  headers.forEach((h, i) => {
    obj[h] = (r[i] ?? "").trim();
  });
  return obj;
});

console.error(`[info] ${data.length} rows read from CSV`);

// ---- SQL 生成 ----
const leadRows = [];
const activityRows = [];

let leadCounter = 0;
let skipped = 0;

for (const row of data) {
  if (!row.企業名) {
    skipped++;
    continue;
  }

  const large = row.大セグメント;
  const small = row.小セグメント;
  const largeId = LARGE_SEGMENT_ID[large] ?? null;
  const smallId = SMALL_SEGMENT_ID[`${large}|${small}`] ?? null;

  const callerName = row.架電者;
  const caller = CALLER[callerName] ?? null;
  const ownerId = caller?.userId ?? DEFAULT_USER_ID;

  // 3 回分の架電情報を整理
  const calls = [];
  for (let i = 1; i <= 3; i++) {
    const dateRaw = row[`架電日${i}`];
    const timeRaw = row[`架電時間${i}`];
    const statusRaw = row[`架電ステータス${i}`];
    const noteRaw = row[`備考${i}`];
    const date = normalizeDate(dateRaw);
    const statusCode = CALL_STATUS_TO_CODE[statusRaw];
    if (!date || !statusCode) continue;
    calls.push({
      callNumber: calls.length + 1,
      date,
      time: normalizeTime(timeRaw),
      statusCode,
      note: truncate(noteRaw || null, 1000),
      callerUserId: caller?.userId ?? CALLER.小川.userId,
    });
  }

  // lead の stage/status/temperature/category を決定
  let stageCode = "generation";
  let statusCode = "list_ready";
  let temperatureCode = null;
  let categoryCode = "inquiry";

  if (calls.length === 0) {
    // 未架電
    stageCode = "generation";
    statusCode = "list_ready";
    temperatureCode = "cold";
    categoryCode = "inquiry";
  } else {
    const lastStatus = calls[calls.length - 1].statusCode;
    temperatureCode = STATUS_TEMPERATURE[lastStatus] ?? "cold";
    if (lastStatus === "appointment" || lastStatus === "promising") {
      stageCode = "qualification";
      statusCode =
        lastStatus === "appointment"
          ? "appointment_confirmed"
          : "appointment_obtained";
      categoryCode = "tql";
    } else if (lastStatus === "material_sent" || lastStatus === "form_sent") {
      stageCode = "nurturing";
      statusCode = "material_sent";
      categoryCode = "mql";
    } else {
      // cold 系 (absent/gatekeep/no_answer/refused/voicemail/nt)
      stageCode = "nurturing";
      statusCode = calls.length > 1 ? "continuing_call" : "calling";
      categoryCode = "inquiry";
    }
  }

  // generate deterministic-ish UUID: c1xxxxxx-0000-4000-8000-000000000000 + counter
  leadCounter++;
  const hex = leadCounter.toString(16).padStart(12, "0");
  const leadId = `c1000000-0000-4000-8000-${hex}`;

  const leadName = truncate(row.企業名, 300);
  const companyName = truncate(row.企業名, 200);
  const url = cleanUrl(row.URL);
  const company_phone = cleanPhone(row.電話番号);

  leadRows.push({
    id: leadId,
    lead_name: leadName,
    company_name: companyName,
    stage_id: STAGE_ID[stageCode],
    status_id: STATUS_ID[statusCode],
    temperature_id: temperatureCode ? TEMPERATURE_ID[temperatureCode] : null,
    large_segment_id: largeId,
    small_segment_id: smallId,
    category_id: CATEGORY_ID[categoryCode],
    owner_user_id: ownerId,
    url,
    company_phone,
  });

  for (const c of calls) {
    activityRows.push({
      lead_id: leadId,
      call_number: c.callNumber,
      called_on: c.date,
      called_at_time: c.time,
      call_status_id: CALL_STATUS_ID[c.statusCode],
      caller_user_id: c.callerUserId,
      note: c.note,
    });
  }
}

console.error(
  `[info] leads=${leadRows.length}, activities=${activityRows.length}, skipped=${skipped}`
);

// ---- SQL 文字列化 ----
const chunks = [];
chunks.push(`-- ============================================================`);
chunks.push(`-- ITERRA Academy 架電リストから生成された leads + lead_activities`);
chunks.push(`-- 生成元: ITERRA Academy　架電リスト - 架電リスト.csv`);
chunks.push(`-- 生成: scripts/generate-leads-seed.mjs`);
chunks.push(`-- レコード数: leads=${leadRows.length}, activities=${activityRows.length}`);
chunks.push(`-- ============================================================`);
chunks.push(``);

// ---- leads INSERT（500件ごとにチャンク）----
const LEAD_CHUNK = 500;
for (let i = 0; i < leadRows.length; i += LEAD_CHUNK) {
  const slice = leadRows.slice(i, i + LEAD_CHUNK);
  chunks.push(
    `INSERT INTO leads (id, lead_name, company_name, stage_id, status_id, temperature_id, large_segment_id, small_segment_id, category_id, owner_user_id, created_by, last_updated_by, url, company_phone) VALUES`
  );
  const valueLines = slice.map((r, idx) => {
    const v = `(${esc(r.id)}, ${esc(r.lead_name)}, ${esc(r.company_name)}, ${esc(r.stage_id)}, ${esc(r.status_id)}, ${r.temperature_id ? esc(r.temperature_id) : "NULL"}, ${r.large_segment_id ? esc(r.large_segment_id) : "NULL"}, ${r.small_segment_id ? esc(r.small_segment_id) : "NULL"}, ${esc(r.category_id)}, ${esc(r.owner_user_id)}, ${esc(r.owner_user_id)}, ${esc(r.owner_user_id)}, ${esc(r.url)}, ${esc(r.company_phone)})`;
    return `  ${v}${idx === slice.length - 1 ? ";" : ","}`;
  });
  chunks.push(...valueLines);
  chunks.push(``);
}

// ---- lead_activities INSERT（500件ごと）----
const ACT_CHUNK = 500;
for (let i = 0; i < activityRows.length; i += ACT_CHUNK) {
  const slice = activityRows.slice(i, i + ACT_CHUNK);
  chunks.push(
    `INSERT INTO lead_activities (lead_id, call_number, called_on, called_at_time, call_status_id, caller_user_id, note, activity_type_id) VALUES`
  );
  const valueLines = slice.map((r, idx) => {
    const v = `(${esc(r.lead_id)}, ${r.call_number}, ${esc(r.called_on)}, ${r.called_at_time ? esc(r.called_at_time) : "NULL"}, ${esc(r.call_status_id)}, ${esc(r.caller_user_id)}, ${esc(r.note)}, ${esc(ACTIVITY_TYPE_CALL_ID)})`;
    return `  ${v}${idx === slice.length - 1 ? ";" : ","}`;
  });
  chunks.push(...valueLines);
  chunks.push(``);
}

fs.writeFileSync(OUT_PATH, chunks.join("\n"), "utf8");
console.error(`[done] wrote ${OUT_PATH}`);
