"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { toUserMessage } from "@/lib/db-error";
import {
  checkEightHeader,
  EIGHT_SOURCE_SLUG,
  mergeEightRows,
  parseEightRow,
  type MergedEightLead,
  type ParsedEightRow,
} from "@/lib/leads/eight-import";
import { decodeCsv, dropEmptyRows, parseCsv, type CsvEncoding } from "@/lib/leads/import-helpers";
import { revalidatePath } from "next/cache";

type ActionResult<T> = { data: T | null; error: string | null };

/** 取込先のマスタ既定値 */
type ImportDefaults = {
  stage_id: string;
  status_id: string;
  lead_source_id: string;
  activity_type_id: string;
  call_status_id: string;
  owner_user_id: string;
};

export type EightImportSample = {
  rowNumber: number;
  leadName: string;
  companyName: string | null;
  personName: string | null;
  email: string | null;
  exchangedOn: string | null;
  /** 同一人物として統合された行数（1 なら統合なし） */
  cardCount: number;
  isNew: boolean;
};

export type EightImportPreview = {
  fileName: string;
  encoding: CsvEncoding;
  /** CSV のデータ行数（ヘッダを除く） */
  rowCount: number;
  /** 統合後の Lead 件数 */
  leadCount: number;
  newCount: number;
  updateCount: number;
  errorCount: number;
  /** 同一人物として統合された行数 */
  mergedRowCount: number;
  errors: { rowNumber: number; reason: string }[];
  warnings: { rowNumber: number; messages: string[] }[];
  /** 画面確認用の先頭数件 */
  samples: EightImportSample[];
  /**
   * 同姓同名の既存連絡先がある行。取り込むと統合候補として挙がる。
   * **別人として取り込まれる**ので、事前に見えるようにしておく。
   */
  sameNameCount: number;
  sameNames: {
    rowNumber: number;
    personName: string;
    /** 名刺の会社名 */
    companyName: string | null;
    /** 既存の連絡先の所属先 */
    existingCompanyName: string | null;
    existingContactId: string;
  }[];
};

export type EightImportResult = {
  batchId: string;
  createdCount: number;
  updatedCount: number;
  errorCount: number;
  /** 記録した名刺の枚数 */
  cardCount: number;
  /** 姓名だけが一致し、同一人物か判断が要る組の数 */
  mergeCandidateCount: number;
};

// ------------------------------------------------------------
// 認証・権限
// ------------------------------------------------------------

async function requireAdmin(): Promise<{ userId: string } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証が必要です" };

  const { data: crmUser } = await supabase
    .from("crm_users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (crmUser?.role !== "admin") return { error: "管理者権限が必要です" };
  return { userId: user.id };
}

/**
 * service_role クライアントが実際に RLS をバイパスできているか確かめる。
 *
 * SUPABASE_SERVICE_ROLE_KEY に新形式キー（sb_secret_...）を設定すると、
 * PostgREST が service_role として扱わず **エラーを出さずに 0 件を返す**。
 * この状態で取込を走らせると「既存 Lead が 0 件」と誤判定して
 * 全行を新規作成してしまうため、事前に検知する。
 *
 * 認証済みなら誰でも読めるマスタ（必ず行がある）を引いて確認する。
 */
async function verifyAdminClient(
  supabase: ReturnType<typeof createAdminClient>
): Promise<string | null> {
  const { data, error } = await supabase.from("lead_stages").select("id").limit(1);
  if (error) {
    return `取込用の接続が利用できません。${toUserMessage(error)}`;
  }
  if (!data || data.length === 0) {
    return (
      "service_role クライアントが機能していません（マスタが 0 件に見えています）。" +
      "SUPABASE_SERVICE_ROLE_KEY が JWT 形式か確認してください"
    );
  }
  return null;
}

// ------------------------------------------------------------
// CSV の読み取りとパース（dry-run / commit で共通）
// ------------------------------------------------------------

type ParsedFile = {
  fileName: string;
  encoding: CsvEncoding;
  rowCount: number;
  merged: MergedEightLead[];
  errors: ParsedEightRow[];
};

async function parseUploadedCsv(file: File): Promise<ParsedFile | { error: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length === 0) return { error: "ファイルが空です" };

  let text: string;
  let encoding: CsvEncoding;
  try {
    const decoded = decodeCsv(bytes);
    text = decoded.text;
    encoding = decoded.encoding;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "ファイルを読み取れませんでした" };
  }

  const rows = dropEmptyRows(parseCsv(text));
  if (rows.length < 2) return { error: "データ行がありません（ヘッダ行のみ、または空のファイルです）" };

  const headerCheck = checkEightHeader(rows[0]);
  if (!headerCheck.ok) return { error: headerCheck.error };

  // rowNumber は CSV 上のデータ行番号（1 = ヘッダの次の行）
  const parsed = rows.slice(1).map((r, i) => parseEightRow(r, headerCheck.indexOf, i + 1));
  const { merged, errors } = mergeEightRows(parsed);

  return { fileName: file.name, encoding, rowCount: parsed.length, merged, errors };
}

/**
 * 既存 Lead のうち、外部キーが一致するものを引く。
 * キーの件数が多いため（実データで 800 件超）分割して問い合わせる。
 */
async function findExistingKeys(
  supabase: ReturnType<typeof createAdminClient>,
  keys: string[]
): Promise<Set<string>> {
  const found = new Set<string>();
  const CHUNK = 100;
  for (let i = 0; i < keys.length; i += CHUNK) {
    const chunk = keys.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("leads")
      .select("source_external_key")
      .in("source_external_key", chunk)
      .is("deleted_at", null);
    if (error) throw new Error(`既存リードの確認に失敗しました。${toUserMessage(error)}`);
    for (const row of data ?? []) {
      if (row.source_external_key) found.add(row.source_external_key);
    }
  }
  return found;
}

/**
 * 同姓同名の既存連絡先を探す。
 *
 * 取り込んだ後に統合候補として挙がる組を、取り込む前に見せるためのもの。
 * 姓でまとめて引いてから姓名で突き合わせる（1 行ずつ問い合わせない）。
 *
 * **ここで判定できるのは「同姓同名がいる」ことまで。** 転職か異動かは
 * 法人の名寄せ（メールドメインが一次キー）を通さないと決まらず、
 * それは取込時にしか走らせられないため、ドライランでは踏み込まない。
 */
async function findSameNameContacts(
  supabase: ReturnType<typeof createAdminClient>,
  names: { lastName: string; firstName: string }[]
): Promise<Map<string, { id: string; companyName: string | null }>> {
  const found = new Map<string, { id: string; companyName: string | null }>();
  const lastNames = [...new Set(names.map((n) => n.lastName).filter(Boolean))];
  if (lastNames.length === 0) return found;

  const wanted = new Set(names.map((n) => nameKey(n.lastName, n.firstName)));

  const CHUNK = 100;
  for (let i = 0; i < lastNames.length; i += CHUNK) {
    const chunk = lastNames.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("contacts")
      .select("id, last_name, first_name, company:companies!contacts_company_id_fkey(name)")
      .in("last_name", chunk)
      .is("deleted_at", null);
    if (error) {
      throw new Error(`同姓同名の確認に失敗しました。${toUserMessage(error)}`);
    }
    for (const row of data ?? []) {
      const key = nameKey(row.last_name, row.first_name ?? "");
      if (!wanted.has(key) || found.has(key)) continue;
      const company = row.company as { name: string } | null;
      found.set(key, { id: row.id, companyName: company?.name ?? null });
    }
  }
  return found;
}

function nameKey(lastName: string | null, firstName: string | null): string {
  return `${(lastName ?? "").trim()} ${(firstName ?? "").trim()}`;
}

// ------------------------------------------------------------
// dry-run
// ------------------------------------------------------------

export async function dryRunEightImport(
  formData: FormData
): Promise<ActionResult<EightImportPreview>> {
  const auth = await requireAdmin();
  if ("error" in auth) return { data: null, error: auth.error };

  const file = formData.get("file");
  if (!(file instanceof File)) return { data: null, error: "ファイルが指定されていません" };

  const parsed = await parseUploadedCsv(file);
  if ("error" in parsed) return { data: null, error: parsed.error };

  // 既存判定は RLS をバイパスして全件見る必要がある（他ユーザー担当の Lead とも
  // 重複しうるため）。admin チェックは上で通している
  const admin = createAdminClient();
  const clientError = await verifyAdminClient(admin);
  if (clientError) return { data: null, error: clientError };

  let existing: Set<string>;
  try {
    existing = await findExistingKeys(
      admin,
      parsed.merged.map((m) => m.externalKey)
    );
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "既存リードの確認に失敗しました" };
  }

  const newCount = parsed.merged.filter((m) => !existing.has(m.externalKey)).length;
  const mergedRowCount = parsed.merged.reduce((sum, m) => sum + (m.rows.length - 1), 0);

  const warnings = parsed.merged
    .flatMap((m) => m.rows)
    .filter((r) => r.warnings.length > 0)
    .map((r) => ({ rowNumber: r.rowNumber, messages: r.warnings }));

  const samples: EightImportSample[] = parsed.merged.slice(0, 20).map((m) => {
    const p = m.primary;
    const personName =
      [p.lead.contact_last_name, p.lead.contact_first_name].filter(Boolean).join(" ") || null;
    return {
      rowNumber: p.rowNumber,
      leadName: p.lead.lead_name,
      companyName: p.lead.company_name,
      personName,
      email: p.lead.contact_email,
      exchangedOn: p.exchangedOn,
      cardCount: m.rows.length,
      isNew: !existing.has(m.externalKey),
    };
  });

  // 同姓同名は「別人として取り込まれ、統合候補に挙がる」ので事前に見せる。
  // 新規に作られる行だけが対象（既存キーに一致する行は同じ連絡先に紐づく）
  const newLeads = parsed.merged.filter((m) => !existing.has(m.externalKey));
  let sameNames: EightImportPreview["sameNames"] = [];
  try {
    const found = await findSameNameContacts(
      admin,
      newLeads.map((m) => ({
        lastName: m.primary.lead.contact_last_name ?? "",
        firstName: m.primary.lead.contact_first_name ?? "",
      }))
    );

    sameNames = newLeads.flatMap((m) => {
      const last = m.primary.lead.contact_last_name ?? "";
      const first = m.primary.lead.contact_first_name ?? "";
      if (!last) return [];
      const hit = found.get(nameKey(last, first));
      if (!hit) return [];
      // 所属先が同じなら同一人物として紐づくので、候補にはならない
      if (
        hit.companyName &&
        m.primary.lead.company_name &&
        hit.companyName === m.primary.lead.company_name
      ) {
        return [];
      }
      return [
        {
          rowNumber: m.primary.rowNumber,
          personName: [last, first].filter(Boolean).join(" "),
          companyName: m.primary.lead.company_name,
          existingCompanyName: hit.companyName,
          existingContactId: hit.id,
        },
      ];
    });
  } catch (e) {
    // 事前確認の付加情報なので、取得できなくても取込自体は続けられる
    console.warn("[dryRunEightImport] 同姓同名の確認 WARN:", e);
  }

  return {
    data: {
      fileName: parsed.fileName,
      encoding: parsed.encoding,
      rowCount: parsed.rowCount,
      leadCount: parsed.merged.length,
      newCount,
      updateCount: parsed.merged.length - newCount,
      errorCount: parsed.errors.length,
      mergedRowCount,
      errors: parsed.errors.map((e) => ({
        rowNumber: e.rowNumber,
        reason: e.error ?? "取込できません",
      })),
      warnings,
      samples,
      sameNameCount: sameNames.length,
      sameNames: sameNames.slice(0, 20),
    },
    error: null,
  };
}

// ------------------------------------------------------------
// commit
// ------------------------------------------------------------

/** 取込に使うマスタの既定値を解決する */
async function resolveDefaults(
  supabase: ReturnType<typeof createAdminClient>,
  ownerUserId: string
): Promise<ImportDefaults | { error: string }> {
  const [stage, source, activityType, callStatus] = await Promise.all([
    supabase.from("lead_stages").select("id").eq("slug", "generation").maybeSingle(),
    supabase.from("lead_sources").select("id").eq("slug", EIGHT_SOURCE_SLUG).maybeSingle(),
    supabase.from("lead_activity_types").select("id").eq("code", "card_exchange").maybeSingle(),
    supabase.from("lead_call_statuses").select("id").eq("code", "card_exchange").maybeSingle(),
  ]);

  if (!stage.data) return { error: "獲得ステージが見つかりません" };
  if (!source.data) return { error: "リードソース Eight が登録されていません" };
  if (!activityType.data) return { error: "対応種別「名刺交換」が登録されていません" };
  if (!callStatus.data) return { error: "通電状況「名刺交換」が登録されていません" };

  const status = await supabase
    .from("lead_statuses")
    .select("id")
    .eq("stage_id", stage.data.id)
    .eq("code", "card_exchanged")
    .maybeSingle();
  if (!status.data) return { error: "ステータス「名刺交換済」が登録されていません" };

  return {
    stage_id: stage.data.id,
    status_id: status.data.id,
    lead_source_id: source.data.id,
    activity_type_id: activityType.data.id,
    call_status_id: callStatus.data.id,
    owner_user_id: ownerUserId,
  };
}

export async function commitEightImport(
  formData: FormData
): Promise<ActionResult<EightImportResult>> {
  const auth = await requireAdmin();
  if ("error" in auth) return { data: null, error: auth.error };

  const file = formData.get("file");
  if (!(file instanceof File)) return { data: null, error: "ファイルが指定されていません" };

  const ownerUserId = formData.get("ownerUserId");
  if (typeof ownerUserId !== "string" || !ownerUserId) {
    return { data: null, error: "[ownerUserId] 担当者を選択してください" };
  }

  const parsed = await parseUploadedCsv(file);
  if ("error" in parsed) return { data: null, error: parsed.error };
  if (parsed.merged.length === 0) {
    return { data: null, error: "取込できる行がありません" };
  }

  // 1,000 行規模の bulk insert は RLS 経由で statement_timeout に達するため
  // service_role を使う。admin チェックは上で通している
  const admin = createAdminClient();
  const clientError = await verifyAdminClient(admin);
  if (clientError) return { data: null, error: clientError };

  // 担当者が実在し在籍していることを確認（UI の選択値を信用しない）
  const { data: owner } = await admin
    .from("crm_users")
    .select("id, is_active")
    .eq("id", ownerUserId)
    .maybeSingle();
  if (!owner) return { data: null, error: "[ownerUserId] 指定された担当者が見つかりません" };
  if (owner.is_active === false) {
    return { data: null, error: "[ownerUserId] 退職済みのユーザーは担当者に指定できません" };
  }

  const defaults = await resolveDefaults(admin, ownerUserId);
  if ("error" in defaults) return { data: null, error: defaults.error };

  const leadsPayload = parsed.merged.map((m) => ({
    external_key: m.externalKey,
    lead: m.primary.lead,
    address: m.primary.address,
    // 交換日は重複を除いて渡す（同じ日の名刺が複数行あっても履歴は 1 件）
    activities: [...new Set(m.rows.map((r) => r.exchangedOn).filter(Boolean))].map((d) => ({
      exchanged_on: d,
    })),
    raw_rows: m.rows.map((r) => ({ row_number: r.rowNumber, raw: r.raw })),
  }));

  const errorsPayload = parsed.errors.map((e) => ({
    row_number: e.rowNumber,
    raw: e.raw,
    error_reason: e.error ?? "取込できません",
  }));

  const { data, error } = await admin.rpc("import_eight_leads", {
    p_batch: {
      source_slug: EIGHT_SOURCE_SLUG,
      file_name: parsed.fileName,
      encoding: parsed.encoding,
      row_count: parsed.rowCount,
      imported_by: auth.userId,
    },
    p_leads: leadsPayload,
    p_errors: errorsPayload,
    p_defaults: defaults,
  });

  if (error) {
    console.error("[commitEightImport] RPC FAILED:", error.message, error.code);
    return {
      data: null,
      error: `取込に失敗しました。${toUserMessage(error, { entityLabel: "リード", operation: "create" })}`,
    };
  }

  const result = data as {
    batch_id: string;
    created_count: number;
    updated_count: number;
    error_count: number;
    card_count?: number;
    merge_candidate_count?: number;
  };

  // スコアは名刺交換の活動を含めて再計算する。
  // 全件（recalculate_all_lead_scores）だと 3,008 件で約 3.9 秒かかり、
  // リードが増えるほど取込のたびに遅くなる。今回のバッチ分だけ計算する。
  // 全件の再計算は週次の pg_cron が担う。
  // 失敗しても取込自体は成立しているのでログのみ
  const { error: scoreError } = await admin.rpc("recalculate_lead_scores_for_batch", {
    p_batch_id: result.batch_id,
  });
  if (scoreError) {
    console.warn("[commitEightImport] スコア再計算 WARN:", scoreError.message);
  }

  revalidatePath("/leads");
  revalidatePath("/admin/leads/import");

  return {
    data: {
      batchId: result.batch_id,
      createdCount: result.created_count,
      updatedCount: result.updated_count,
      errorCount: result.error_count,
      cardCount: result.card_count ?? 0,
      mergeCandidateCount: result.merge_candidate_count ?? 0,
    },
    error: null,
  };
}

// ------------------------------------------------------------
// 取込履歴
// ------------------------------------------------------------

export type ImportBatchRow = {
  id: string;
  source_slug: string;
  file_name: string;
  encoding: string;
  row_count: number;
  created_count: number;
  updated_count: number;
  error_count: number;
  imported_at: string;
  imported_by_name: string | null;
};

export async function getImportBatches(): Promise<ActionResult<ImportBatchRow[]>> {
  const auth = await requireAdmin();
  if ("error" in auth) return { data: null, error: auth.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_import_batches")
    .select(
      "id, source_slug, file_name, encoding, row_count, created_count, updated_count, error_count, imported_at, importer:crm_users!lead_import_batches_imported_by_fkey(full_name)"
    )
    .order("imported_at", { ascending: false })
    .limit(30);

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "取込履歴" }) };

  const rows = (data ?? []) as (Omit<ImportBatchRow, "imported_by_name"> & {
    importer: { full_name: string } | null;
  })[];

  return {
    data: rows.map((r) => ({
      id: r.id,
      source_slug: r.source_slug,
      file_name: r.file_name,
      encoding: r.encoding,
      row_count: r.row_count,
      created_count: r.created_count,
      updated_count: r.updated_count,
      error_count: r.error_count,
      imported_at: r.imported_at,
      imported_by_name: r.importer?.full_name ?? null,
    })),
    error: null,
  };
}
