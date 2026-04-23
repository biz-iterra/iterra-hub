"use server";

/**
 * lead_activities Server Actions
 *
 * lead_activities は架電記録（履歴テーブル）のため INSERT ONLY 運用。
 * CLAUDE.md §アクセス制御ルール: 「履歴テーブル: INSERT ONLY（UPDATE/DELETE 不可）」
 * RLS でも UPDATE ポリシーは定義されておらず（20260419000007 参照）、
 * admin のみ DELETE が許可されている（誤記録修正対応）。
 * よって本 Server Action では createLeadActivity と getLeadActivities のみ公開する。
 * 誤記録の DELETE は admin 専用の deleteLeadActivity を提供するが、UI では非表示とする想定。
 */

import { createClient } from "@/lib/supabase/server";
import { leadActivityCreateSchema } from "@/lib/validators/lead-activities";
import type { z } from "zod";

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

const ACTIVITY_SELECT = `
  *,
  call_status:lead_call_statuses(id, code, name, color),
  caller:crm_users!lead_activities_caller_user_id_fkey(id, full_name),
  activity_type:lead_activity_types(id, code, name, color)
` as const;

// ---------- 一覧取得（called_on 降順 → created_at 降順）----------
export async function getLeadActivities(
  leadId: string
): Promise<ActionResult<any[]>> {
  if (!UUID_REGEX.test(leadId)) {
    return { data: null, error: "不正なパラメータです。受信値: " + leadId };
  }

  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("lead_activities")
    .select(ACTIVITY_SELECT)
    .eq("lead_id", leadId)
    .order("called_on", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data: data ?? [], error: null };
}

// ---------- 作成（call_number は max+1 で自動採番）----------
export async function createLeadActivity(
  input: z.infer<typeof leadActivityCreateSchema>
): Promise<ActionResult<any>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = leadActivityCreateSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  const d = parsed.data;

  // lead の存在・アクセス権チェック（RLS 任せだが member は own lead のみ）
  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select("id, owner_user_id")
    .eq("id", d.lead_id)
    .is("deleted_at", null)
    .single();

  if (leadErr || !lead) {
    return { data: null, error: `[lead_id] リードが見つかりません。受信値: ${d.lead_id}` };
  }
  if (role === "member" && lead.owner_user_id !== user.id) {
    return { data: null, error: "このリードへの架電記録を追加する権限がありません" };
  }

  // call_number を max+1 で採番
  const { data: maxRow } = await supabase
    .from("lead_activities")
    .select("call_number")
    .eq("lead_id", d.lead_id)
    .order("call_number", { ascending: false })
    .limit(1)
    .single();

  const call_number = maxRow ? (maxRow.call_number as number) + 1 : 1;

  const { data, error } = await supabase
    .from("lead_activities")
    .insert({
      ...d,
      call_number,
    })
    .select(ACTIVITY_SELECT)
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// ---------- 削除（admin のみ。誤記録修正用）----------
// lead_activities は INSERT ONLY 運用。UI では通常非表示とすること。
// RLS: lead_activities_delete_admin ポリシーで admin のみ DELETE 可能。
export async function deleteLeadActivity(id: string): Promise<ActionResult<null>> {
  if (!UUID_REGEX.test(id)) {
    return { data: null, error: "不正なパラメータです。受信値: " + id };
  }

  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (role !== "admin") {
    return { data: null, error: "架電記録の削除は管理者権限が必要です" };
  }

  const { error } = await supabase
    .from("lead_activities")
    .delete()
    .eq("id", id);

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}
