"use server";

import { toUserMessage } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/server";
import {
  createDealActivitySchema,
  updateDealActivitySchema,
  createDealActivityEmailSchema,
  createActivityLogSchema,
} from "@/lib/validators";
import type { z } from "zod";
import type {
  ActivityLogWithRelations,
  DealActivityWithRelations,
  Row,
} from "@/types/relations";

type ActionResult<T> = { data: T | null; error: string | null };

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

// ---------- ディール活動一覧 ----------
export async function getDealActivities(
  dealId: string
): Promise<ActionResult<DealActivityWithRelations[]>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("deal_activities")
    .select(
      `
      *,
      contact:contacts(id, last_name, first_name),
      performer:crm_users!deal_activities_performed_by_fkey(id, full_name),
      deal_activity_emails(*)
    `
    )
    .eq("deal_id", dealId)
    .order("activity_at", { ascending: false });

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "アクティビティ" }) };
  return { data: data ?? [], error: null };
}

// ---------- ディール活動作成 ----------
export async function createDealActivity(
  input: z.infer<typeof createDealActivitySchema>
): Promise<ActionResult<Row<"deal_activities">>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = createDealActivitySchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  const activityData = {
    ...parsed.data,
    performed_by: user.id,
  };

  const { data, error } = await supabase
    .from("deal_activities")
    .insert(activityData)
    .select()
    .single();

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "アクティビティ" }) };
  return { data, error: null };
}

// ---------- ディール活動更新 ----------
export async function updateDealActivity(
  id: string,
  input: z.infer<typeof updateDealActivitySchema>
): Promise<ActionResult<Row<"deal_activities">>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = updateDealActivitySchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  const { data, error } = await supabase
    .from("deal_activities")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "アクティビティ" }) };
  return { data, error: null };
}

// ---------- ディール活動削除 ----------
export async function deleteDealActivity(id: string): Promise<ActionResult<null>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (role !== "admin") {
    return { data: null, error: "管理者権限が必要です" };
  }

  const { error } = await supabase
    .from("deal_activities")
    .delete()
    .eq("id", id);

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "アクティビティ", operation: "delete"}) };
  return { data: null, error: null };
}

// ---------- ディール活動メール作成 ----------
export async function createDealActivityEmail(
  input: z.infer<typeof createDealActivityEmailSchema>
): Promise<ActionResult<Row<"deal_activity_emails">>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = createDealActivityEmailSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  const { data, error } = await supabase
    .from("deal_activity_emails")
    .insert(parsed.data)
    .select()
    .single();

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "アクティビティ" }) };
  return { data, error: null };
}

// ---------- 活動ログ作成 ----------
export async function createActivityLog(
  input: z.infer<typeof createActivityLogSchema>
): Promise<ActionResult<Row<"activity_logs">>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = createActivityLogSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  const logData = {
    ...parsed.data,
    created_by: user.id,
  };

  const { data, error } = await supabase
    .from("activity_logs")
    .insert(logData)
    .select()
    .single();

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "アクティビティ" }) };
  return { data, error: null };
}

// ---------- 活動ログ一覧 ----------
export async function getActivityLogs(params?: {
  entityId?: string;
  entityType?: "deal" | "contact" | "account" | "company";
  page?: number;
  perPage?: number;
}): Promise<ActionResult<{ items: ActivityLogWithRelations[]; count: number }>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const page = params?.page ?? 1;
  const perPage = params?.perPage ?? 20;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  let query = supabase
    .from("activity_logs")
    .select(
      `
      *,
      creator:crm_users!activity_logs_created_by_fkey(id, full_name)
    `,
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (params?.entityId && params?.entityType) {
    const column = `${params.entityType}_id`;
    query = query.eq(column, params.entityId);
  }

  const { data, error, count } = await query;
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "アクティビティ" }) };
  return { data: { items: data ?? [], count: count ?? 0 }, error: null };
}
