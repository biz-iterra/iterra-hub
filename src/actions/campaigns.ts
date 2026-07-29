"use server";

import { createClient } from "@/lib/supabase/server";
import {
  campaignCreateSchema,
  campaignUpdateSchema,
  campaignFiltersSchema,
  attachLeadsToCampaignSchema,
} from "@/lib/validators/campaigns";
import type { z } from "zod";
import type { Paged, Row } from "@/types/relations";

type ActionResult<T> = { data: T | null; error: string | null };

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------- 認証ヘルパー ----------
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

const CAMPAIGN_SELECT = `*` as const;

// ---------- 一覧取得 ----------
export async function getCampaigns(
  params?: z.infer<typeof campaignFiltersSchema>
): Promise<ActionResult<Paged<Row<"campaigns">>>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = campaignFiltersSchema.safeParse(params ?? {});
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  const { type, status, keyword, page, perPage } = parsed.data;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  let query = supabase
    .from("campaigns")
    .select(CAMPAIGN_SELECT, { count: "exact" })
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (type) query = query.eq("type", type);
  if (status) query = query.eq("status", status);
  if (keyword) query = query.ilike("name", `%${keyword}%`);

  const { data, error, count } = await query;
  if (error) return { data: null, error: error.message };
  return { data: { rows: data ?? [], total: count ?? 0 }, error: null };
}

// ---------- 詳細取得 ----------
export async function getCampaignById(id: string): Promise<ActionResult<Row<"campaigns">>> {
  // UUID 形式検証
  if (!UUID_REGEX.test(id)) {
    return { data: null, error: "不正なパラメータです。受信値: " + id };
  }

  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("campaigns")
    .select(CAMPAIGN_SELECT)
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: "キャンペーンが見つかりません" };
  return { data, error: null };
}

// ---------- 作成（manager 以上）----------
export async function createCampaign(
  input: z.infer<typeof campaignCreateSchema>
): Promise<ActionResult<Row<"campaigns">>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (role !== "manager" && role !== "admin") {
    return { data: null, error: "manager 以上の権限が必要です" };
  }

  const parsed = campaignCreateSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  const { data, error } = await supabase
    .from("campaigns")
    .insert({
      ...parsed.data,
      created_by: user.id,
      last_updated_by: user.id,
    })
    .select(CAMPAIGN_SELECT)
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// ---------- 更新（manager 以上）----------
export async function updateCampaign(
  input: z.infer<typeof campaignUpdateSchema>
): Promise<ActionResult<Row<"campaigns">>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (role !== "manager" && role !== "admin") {
    return { data: null, error: "manager 以上の権限が必要です" };
  }

  const parsed = campaignUpdateSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  const { id, deletion_reason: _dr, ...updates } = parsed.data;

  const { data, error } = await supabase
    .from("campaigns")
    .update({
      ...updates,
      last_updated_by: user.id,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select(CAMPAIGN_SELECT)
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// ---------- 論理削除（admin のみ）----------
export async function deleteCampaign(
  id: string,
  reason?: string
): Promise<ActionResult<null>> {
  if (!UUID_REGEX.test(id)) {
    return { data: null, error: "不正なパラメータです。受信値: " + id };
  }

  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (role !== "admin") return { data: null, error: "管理者権限が必要です" };

  const { error } = await supabase
    .from("campaigns")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: user.id,
      deletion_reason: reason ?? null,
      last_updated_by: user.id,
    })
    .eq("id", id);

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

// ---------- 論理削除復元（admin のみ）----------
export async function restoreCampaign(id: string): Promise<ActionResult<null>> {
  if (!UUID_REGEX.test(id)) {
    return { data: null, error: "不正なパラメータです。受信値: " + id };
  }

  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (role !== "admin") return { data: null, error: "管理者権限が必要です" };

  const { error } = await supabase
    .from("campaigns")
    .update({
      deleted_at: null,
      deleted_by: null,
      deletion_reason: null,
      last_updated_by: user.id,
    })
    .eq("id", id);

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

// ---------- Lead をキャンペーンに紐付け（manager 以上 or lead owner）----------
export async function attachLeadToCampaign(
  leadId: string,
  campaignId: string
): Promise<ActionResult<Row<"lead_campaigns">>> {
  if (!UUID_REGEX.test(leadId)) {
    return { data: null, error: "不正なパラメータです。受信値: leadId=" + leadId };
  }
  if (!UUID_REGEX.test(campaignId)) {
    return { data: null, error: "不正なパラメータです。受信値: campaignId=" + campaignId };
  }

  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  // lead のオーナーチェック（is_lead_accessible は RLS で担保。追加チェック）
  if (role === "member") {
    const { data: lead } = await supabase
      .from("leads")
      .select("owner_user_id")
      .eq("id", leadId)
      .is("deleted_at", null)
      .single();
    if (!lead || lead.owner_user_id !== user.id) {
      return { data: null, error: "このリードへのアクセス権限がありません" };
    }
  }

  const { data, error } = await supabase
    .from("lead_campaigns")
    .insert({ lead_id: leadId, campaign_id: campaignId })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// ---------- キャンペーンから Lead を解除（manager 以上 or lead owner）----------
export async function detachLeadFromCampaign(
  leadId: string,
  campaignId: string
): Promise<ActionResult<null>> {
  if (!UUID_REGEX.test(leadId)) {
    return { data: null, error: "不正なパラメータです。受信値: leadId=" + leadId };
  }
  if (!UUID_REGEX.test(campaignId)) {
    return { data: null, error: "不正なパラメータです。受信値: campaignId=" + campaignId };
  }

  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  // member の場合は owner チェック
  if (role === "member") {
    const { data: lead } = await supabase
      .from("leads")
      .select("owner_user_id")
      .eq("id", leadId)
      .is("deleted_at", null)
      .single();
    if (!lead || lead.owner_user_id !== user.id) {
      return { data: null, error: "このリードへのアクセス権限がありません" };
    }
  }

  const { error } = await supabase
    .from("lead_campaigns")
    .delete()
    .eq("lead_id", leadId)
    .eq("campaign_id", campaignId);

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

// ---------- Lead を複数まとめてキャンペーンに紐付け（manager 以上）----------
export async function attachLeadsToCampaign(
  input: { leadIds: string[]; campaignId: string }
): Promise<ActionResult<null>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = attachLeadsToCampaignSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  const { leadIds, campaignId } = parsed.data;

  if (role === "member") {
    return { data: null, error: "manager 以上の権限が必要です" };
  }

  const rows = leadIds.map((leadId) => ({ lead_id: leadId, campaign_id: campaignId }));
  const { error } = await supabase.from("lead_campaigns").insert(rows);

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

// ---------- キャンペーンに未紐付けのリード一覧 ----------
export async function getUnassignedLeadsForCampaign(
  campaignId: string
): Promise<ActionResult<any[]>> {
  if (!UUID_REGEX.test(campaignId)) {
    return { data: null, error: "不正なパラメータです。受信値: " + campaignId };
  }

  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  // 既に紐付いている lead_id を取得
  const { data: attached, error: attachedError } = await supabase
    .from("lead_campaigns")
    .select("lead_id")
    .eq("campaign_id", campaignId);

  if (attachedError) return { data: null, error: attachedError.message };

  const attachedIds = (attached ?? []).map((r: any) => r.lead_id as string);

  // 未紐付けのリードを取得（RLS が自動適用される）
  let query = supabase
    .from("leads")
    .select(
      `
      id, lead_name, company_name,
      category:lead_categories(id, code, name, color),
      temperature:lead_temperatures(id, code, name)
    `
    )
    .is("deleted_at", null)
    .order("lead_name", { ascending: true });

  if (attachedIds.length > 0) {
    query = query.not("id", "in", `(${attachedIds.join(",")})`);
  }

  const { data, error } = await query;
  if (error) return { data: null, error: error.message };
  return { data: data ?? [], error: null };
}

// ---------- キャンペーンに紐づく Lead 一覧 ----------
export async function getCampaignLeads(
  campaignId: string
): Promise<ActionResult<any[]>> {
  if (!UUID_REGEX.test(campaignId)) {
    return { data: null, error: "不正なパラメータです。受信値: " + campaignId };
  }

  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("lead_campaigns")
    .select(
      `
      assigned_at,
      lead:leads(
        id, lead_name, company_name, stage_id, status_id, score, temperature_id, owner_user_id,
        stage:lead_stages(id, slug, name, sort_order),
        status:lead_statuses(id, code, name, sort_order),
        temperature:lead_temperatures(id, code, name, color),
        owner:crm_users!leads_owner_user_id_fkey(id, full_name)
      )
    `
    )
    .eq("campaign_id", campaignId)
    .order("assigned_at", { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data: data ?? [], error: null };
}
