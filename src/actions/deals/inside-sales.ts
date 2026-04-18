"use server";

import { createClient } from "@/lib/supabase/server";
import {
  createInsideSalesLeadSchema,
  createInsideSalesCallSchema,
  updateInsideSalesCallSchema,
  insideSalesExtensionSchema,
  type CreateInsideSalesLeadInput,
  type CreateInsideSalesCallInput,
  type UpdateInsideSalesCallInput,
  type InsideSalesExtensionInput,
} from "@/lib/validators/deals/inside-sales";

type ActionResult<T> = { data: T | null; error: string | null };

// ============================================================
// 認証・権限ユーティリティ
// ============================================================
async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase: null, user: null, role: null };
  const { data: crmUser } = await supabase
    .from("crm_users")
    .select("role")
    .eq("id", user.id)
    .single();
  return { supabase, user, role: crmUser?.role ?? null };
}

// ============================================================
// 見込みステータスID解決（code='prospect'）
// ============================================================
async function resolveProspectStatusId(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string | null> {
  const { data } = await supabase
    .from("account_statuses")
    .select("id")
    .eq("code", "prospect")
    .is("deleted_at", null)
    .single();
  return data?.id ?? null;
}

// ============================================================
// Company名から既存レコードを検索、なければ最小構成で新規作成
// 返り値は company.id
// ============================================================
async function findOrCreateProspectCompany(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyName: string,
  ownerUserId: string
): Promise<{ id: string | null; error: string | null }> {
  const trimmed = companyName.trim();
  if (!trimmed) return { id: null, error: "企業名が空です" };

  // 既存検索（完全一致）
  const { data: existing } = await supabase
    .from("companies")
    .select("id")
    .eq("name", trimmed)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing) return { id: existing.id, error: null };

  // 新規作成（ステータスは「見込み」。M11 のシードを参照）
  const { data: prospectStatus } = await supabase
    .from("company_statuses")
    .select("id")
    .eq("name", "見込み")
    .is("deleted_at", null)
    .single();

  const { data: created, error } = await supabase
    .from("companies")
    .insert({
      name: trimmed,
      company_status_id: prospectStatus?.id ?? null,
      owner_user_id: ownerUserId,
      created_by: ownerUserId,
    })
    .select("id")
    .single();

  if (error) return { id: null, error: error.message };
  return { id: created.id, error: null };
}

// ============================================================
// リード作成（Account + Deal + 拡張を単一フローで作成）
// prospect_company_name の NULL / NOT NULL で個人/法人Accountを分岐
// ============================================================
export async function createInsideSalesLead(
  input: CreateInsideSalesLeadInput
): Promise<ActionResult<{ deal_id: string; account_id: string }>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = createInsideSalesLeadSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { data: null, error: `[${issue.path.join(".")}] ${issue.message}` };
  }

  const ownerUserId = parsed.data.owner_user_id ?? user.id;
  const ext = parsed.data.extension;

  // -----------------------------
  // 1. Account 解決（指定 or 新規）
  // -----------------------------
  let accountId = parsed.data.account_id ?? null;

  if (!accountId) {
    const prospectStatusId = await resolveProspectStatusId(supabase);
    if (!prospectStatusId) {
      return { data: null, error: "account_statuses に code='prospect' が存在しません" };
    }

    let companyId: string | null = null;
    let accountName: string;

    if (ext.prospect_company_name) {
      // 法人Account: Company自動作成
      const companyResult = await findOrCreateProspectCompany(
        supabase,
        ext.prospect_company_name,
        ownerUserId
      );
      if (companyResult.error) return { data: null, error: companyResult.error };
      companyId = companyResult.id;
      accountName = ext.prospect_company_name;
    } else {
      // 個人Account（company_id NULL）。Account名は Deal名を流用
      accountName = parsed.data.name;
    }

    const { data: account, error: accErr } = await supabase
      .from("accounts")
      .insert({
        name: accountName,
        company_id: companyId,
        account_status_id: prospectStatusId,
        owner_user_id: ownerUserId,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (accErr) return { data: null, error: `Account作成失敗: ${accErr.message}` };
    accountId = account.id;
  }

  // -----------------------------
  // 2. Deal 作成
  // -----------------------------
  const { data: deal, error: dealErr } = await supabase
    .from("deals")
    .insert({
      name: parsed.data.name,
      pipeline_type_id: parsed.data.pipeline_type_id,
      deal_stage_id: parsed.data.deal_stage_id,
      deal_status_id: parsed.data.deal_status_id,
      amount: parsed.data.amount ?? null,
      account_id: accountId,
      owner_user_id: ownerUserId,
      stage_updated_at: new Date().toISOString(),
      created_by: user.id,
      last_updated_by: user.id,
    })
    .select("id")
    .single();

  if (dealErr) return { data: null, error: `Deal作成失敗: ${dealErr.message}` };

  // -----------------------------
  // 3. 拡張レコード作成
  // -----------------------------
  const { error: extErr } = await supabase.from("deal_ext_inside_sales").insert({
    deal_id: deal.id,
    large_segment_id: ext.large_segment_id ?? null,
    small_segment_id: ext.small_segment_id ?? null,
    prospect_company_name: ext.prospect_company_name ?? null,
    url: ext.url ?? null,
    phone: ext.phone ?? null,
    primary_caller_id: ext.primary_caller_id ?? null,
    created_by: user.id,
  });

  if (extErr) return { data: null, error: `拡張レコード作成失敗: ${extErr.message}` };

  // -----------------------------
  // 4. 履歴
  // -----------------------------
  await supabase.from("deal_stage_histories").insert({
    deal_id: deal.id,
    from_stage_id: null,
    to_stage_id: parsed.data.deal_stage_id,
    changed_by: user.id,
  });
  await supabase.from("deal_status_histories").insert({
    deal_id: deal.id,
    from_status_id: null,
    to_status_id: parsed.data.deal_status_id,
    changed_by: user.id,
  });

  return { data: { deal_id: deal.id, account_id: accountId! }, error: null };
}

// ============================================================
// 拡張レコード更新（deal_ext_inside_sales）
// ============================================================
export async function updateInsideSalesExtension(
  dealId: string,
  input: InsideSalesExtensionInput
): Promise<ActionResult<null>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = insideSalesExtensionSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { data: null, error: `[${issue.path.join(".")}] ${issue.message}` };
  }

  const { error } = await supabase
    .from("deal_ext_inside_sales")
    .update({ ...parsed.data, last_updated_by: user.id })
    .eq("deal_id", dealId);

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

// ============================================================
// 架電記録 追加（call_number は自動採番）
// ============================================================
export async function addInsideSalesCall(
  input: CreateInsideSalesCallInput
): Promise<ActionResult<{ id: string; call_number: number }>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = createInsideSalesCallSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { data: null, error: `[${issue.path.join(".")}] ${issue.message}` };
  }

  // 既存max+1 を採番（gap許容。同時実行時の衝突は UK で検出しリトライ可能）
  const { data: maxRow } = await supabase
    .from("deal_ext_inside_sales_calls")
    .select("call_number")
    .eq("deal_id", parsed.data.deal_id)
    .order("call_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextNumber = (maxRow?.call_number ?? 0) + 1;

  const { data, error } = await supabase
    .from("deal_ext_inside_sales_calls")
    .insert({
      deal_id: parsed.data.deal_id,
      call_number: nextNumber,
      called_on: parsed.data.called_on,
      called_at_time: parsed.data.called_at_time ?? null,
      call_status_id: parsed.data.call_status_id,
      caller_id: parsed.data.caller_id,
      note: parsed.data.note ?? null,
      created_by: user.id,
    })
    .select("id, call_number")
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// ============================================================
// 架電記録 更新
// ============================================================
export async function updateInsideSalesCall(
  callId: string,
  input: UpdateInsideSalesCallInput
): Promise<ActionResult<null>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = updateInsideSalesCallSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { data: null, error: `[${issue.path.join(".")}] ${issue.message}` };
  }

  const { error } = await supabase
    .from("deal_ext_inside_sales_calls")
    .update({ ...parsed.data, last_updated_by: user.id })
    .eq("id", callId);

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

// ============================================================
// 架電記録 削除（call_number の gap は許容）
// ============================================================
export async function deleteInsideSalesCall(
  callId: string
): Promise<ActionResult<null>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { error } = await supabase
    .from("deal_ext_inside_sales_calls")
    .delete()
    .eq("id", callId);

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

// ============================================================
// 架電記録 一覧取得（詳細画面用）
// ============================================================
export async function getInsideSalesCalls(dealId: string): Promise<
  ActionResult<
    Array<{
      id: string;
      call_number: number;
      called_on: string;
      called_at_time: string | null;
      note: string | null;
      call_status: { id: string; code: string; name: string; color: string | null } | null;
      caller: { id: string; code: string; name: string; caller_type: string } | null;
    }>
  >
> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("deal_ext_inside_sales_calls")
    .select(
      `
      id, call_number, called_on, called_at_time, note,
      call_status:inside_sales_call_statuses(id, code, name, color),
      caller:inside_sales_callers(id, code, name, caller_type)
    `
    )
    .eq("deal_id", dealId)
    .order("call_number", { ascending: true });

  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as any, error: null };
}

// ============================================================
// 拡張本体＋関連マスタ取得（詳細画面用）
// ============================================================
export async function getInsideSalesExtension(dealId: string): Promise<ActionResult<any>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("deal_ext_inside_sales")
    .select(
      `
      deal_id, prospect_company_name, url, phone, created_at, updated_at,
      large_segment:inside_sales_large_segments(id, code, name),
      small_segment:inside_sales_small_segments(id, code, name, large_segment_id),
      primary_caller:inside_sales_callers(id, code, name, caller_type, organization)
    `
    )
    .eq("deal_id", dealId)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}
