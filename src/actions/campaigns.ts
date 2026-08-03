"use server";

import { createClient } from "@/lib/supabase/server";
import { conflictErrorMessage } from "@/lib/validators/common";
import {
  campaignCreateSchema,
  campaignUpdateSchema,
  campaignFiltersSchema,
  attachLeadsToCampaignSchema,
} from "@/lib/validators/campaigns";
import { buildIlikePattern } from "@/lib/search-query";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import { z } from "zod";
import type {
  CampaignLeadRow,
  Paged,
  Row,
  UnassignedLeadRow,
} from "@/types/relations";

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

  // expected_updated_at は DB カラムではないため更新値から除外する
  const { id, deletion_reason: _dr, expected_updated_at: expectedUpdatedAt, ...updates } =
    parsed.data;

  // 楽観ロック: 編集開始時点から updated_at が変わっていれば 0 行更新になる
  let updateQuery = supabase
    .from("campaigns")
    .update({
      ...updates,
      last_updated_by: user.id,
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (expectedUpdatedAt) {
    updateQuery = updateQuery.eq("updated_at", expectedUpdatedAt);
  }

  const { data, error } = await updateQuery.select(CAMPAIGN_SELECT).maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!data) {
    return { data: null, error: conflictErrorMessage("このキャンペーン") };
  }
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

  if (error) {
    // UNIQUE (lead_id, campaign_id)
    if (error.code === "23505") {
      return { data: null, error: "このリードは既にキャンペーンに登録されています" };
    }
    return { data: null, error: error.message };
  }
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

  if (error) {
    // UNIQUE (lead_id, campaign_id)
    if (error.code === "23505") {
      return { data: null, error: "選択したリードの中に、既にこのキャンペーンに登録されているものがあります" };
    }
    return { data: null, error: error.message };
  }
  return { data: null, error: null };
}

// キャンペーンへの未紐付けリード取得用のフィルタ。
// 一覧画面の filtersSchema と共有する意味がない専用パラメータなので、
// lib/validators には追加せずこの Action 内に閉じて定義する。
const unassignedLeadFiltersSchema = z.object({
  keyword: z.string().max(100).optional(),
  page: z.number().int().min(1).default(1),
  perPage: z.number().int().min(1).max(100).default(DEFAULT_PAGE_SIZE),
});

const UNASSIGNED_LEAD_BATCH_SIZE = 200;

// ---------- キャンペーンに未紐付けのリード一覧（検索・ページネーション対応）----------
//
// 除外条件の表現について:
// PostgREST は「子テーブルに紐づく行が存在しない（NOT EXISTS 相当）」を
// 一度の SELECT で表現する手段を持たない（`!inner` は逆に「存在する」行だけに絞る用途）。
// そのため以下の 2 段構成にしている。
// 1. 紐付き lead_id を lead_campaigns から取得し、URL には載せずアプリ側の Set として保持する
//    （.not("id","in",...) のような ID リストの URL 展開はしない）
// 2. leads を検索条件込みでバッチ取得しながら、上記 Set に含まれる行だけをアプリ側で除外する。
//    ページに必要な件数が集まるかバッチが尽きるまで繰り返す
// 総件数は「検索条件に一致する全件数」から「検索条件に一致し、かつ当該キャンペーンに
// 紐付き済みの件数」を差し引いて算出する。後者は `lead_campaigns!inner` による
// 内部結合フィルタ（存在する行だけに絞る、通常サポートされている方向）で求められるため
// ID リストは不要
export async function getUnassignedLeadsForCampaign(
  campaignId: string,
  params?: { keyword?: string; page?: number; perPage?: number }
): Promise<ActionResult<Paged<UnassignedLeadRow>>> {
  if (!UUID_REGEX.test(campaignId)) {
    return { data: null, error: "不正なパラメータです。受信値: " + campaignId };
  }

  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = unassignedLeadFiltersSchema.safeParse(params ?? {});
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };
  const { keyword, page, perPage } = parsed.data;
  const keywordPattern = buildIlikePattern(keyword);

  const applyKeyword = <T extends { or: (filter: string) => T }>(q: T): T =>
    keywordPattern
      ? q.or(`lead_name.ilike.${keywordPattern},company_name.ilike.${keywordPattern}`)
      : q;

  // 1) 当該キャンペーンに紐付き済みの lead_id を集める（1,000 件上限を跨ぐ場合に備えてページングする）
  const attachedIds = new Set<string>();
  {
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase
        .from("lead_campaigns")
        .select("lead_id")
        .eq("campaign_id", campaignId)
        .range(offset, offset + UNASSIGNED_LEAD_BATCH_SIZE - 1);
      if (error) return { data: null, error: error.message };
      for (const row of data ?? []) attachedIds.add(row.lead_id);
      if (!data || data.length < UNASSIGNED_LEAD_BATCH_SIZE) break;
      offset += UNASSIGNED_LEAD_BATCH_SIZE;
    }
  }

  // 2) 総件数 = 検索条件一致の全件数 − 検索条件一致かつ紐付き済みの件数
  const { count: totalMatching, error: totalError } = await applyKeyword(
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
  );
  if (totalError) return { data: null, error: totalError.message };

  const { count: totalAttachedMatching, error: attachedCountError } = await applyKeyword(
    supabase
      .from("leads")
      .select("id, lead_campaigns!inner(campaign_id)", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("lead_campaigns.campaign_id", campaignId)
  );
  if (attachedCountError) return { data: null, error: attachedCountError.message };

  const total = Math.max((totalMatching ?? 0) - (totalAttachedMatching ?? 0), 0);

  // 3) ページに必要な件数を、紐付き済みを除外しながらバッチ取得で集める
  const rows: UnassignedLeadRow[] = [];
  let skip = (page - 1) * perPage;
  let offset = 0;
  for (;;) {
    const { data, error } = await applyKeyword(
      supabase
        .from("leads")
        .select(
          `
          id, lead_name, company_name, stage_id, status_id, score, temperature_id, owner_user_id,
          category:lead_categories(id, code, name, color),
          temperature:lead_temperatures(id, code, name, color)
        `
        )
        .is("deleted_at", null)
        .order("lead_name", { ascending: true })
        .range(offset, offset + UNASSIGNED_LEAD_BATCH_SIZE - 1)
    );
    if (error) return { data: null, error: error.message };
    const batch = (data ?? []) as UnassignedLeadRow[];

    for (const lead of batch) {
      if (attachedIds.has(lead.id)) continue;
      if (skip > 0) {
        skip--;
        continue;
      }
      rows.push(lead);
      if (rows.length >= perPage) break;
    }
    if (rows.length >= perPage) break;
    if (batch.length < UNASSIGNED_LEAD_BATCH_SIZE) break; // これ以上バッチがない
    offset += UNASSIGNED_LEAD_BATCH_SIZE;
  }

  return { data: { rows, total }, error: null };
}

// ---------- キャンペーンに紐づく Lead 一覧 ----------
export async function getCampaignLeads(
  campaignId: string
): Promise<ActionResult<CampaignLeadRow[]>> {
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
        stage:lead_stages(id, slug, name, sort_order, color),
        status:lead_statuses(id, code, name, sort_order, color),
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
