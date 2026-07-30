"use server";

/**
 * lead_activities Server Actions
 *
 * Phase 11（2026-04-26）で INSERT ONLY 運用を変更。
 * caller_user_id（登録した対応者本人）または manager/admin による UPDATE を許可。
 * 編集時は last_edited_at = now() / last_edited_by_user_id = 編集者 を必ずセットして監査証跡を保全する。
 * RLS: lead_activities_update ポリシー（20260426000001）で DB レベルでも制御。
 * Server Action 側でも権限を明示チェックする（多層防御 CLAUDE.md §アクセス制御ルール）。
 *
 * admin のみ DELETE が許可されている（誤記録修正対応）。
 * 削除機能は admin 専用アコーディオン内に表示される。
 */

import { createClient } from "@/lib/supabase/server";
import {
  leadActivityCreateSchema,
  leadActivityUpdateSchema,
} from "@/lib/validators/lead-activities";
import type { z } from "zod";
import type { LeadActivityWithRelations } from "@/types/relations";

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
): Promise<ActionResult<LeadActivityWithRelations[]>> {
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
): Promise<ActionResult<LeadActivityWithRelations>> {
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

// ---------- 編集（caller_user_id 本人 または manager/admin）----------
// RLS: lead_activities_update ポリシー（20260426000001）でDBレベル制御。
// Server Action 側でも明示チェックする（多層防御）。
// last_edited_at / last_edited_by_user_id を必ずセットして監査証跡を保全する。
export async function updateLeadActivity(
  input: z.infer<typeof leadActivityUpdateSchema>
): Promise<ActionResult<LeadActivityWithRelations>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = leadActivityUpdateSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  const { id, ...fields } = parsed.data;

  if (!UUID_REGEX.test(id)) {
    return { data: null, error: `[id] 不正なパラメータです。受信値: ${id}` };
  }

  // 既存レコード取得（権限チェック用）
  const { data: existing, error: fetchErr } = await supabase
    .from("lead_activities")
    .select("id, caller_user_id")
    .eq("id", id)
    .single();

  if (fetchErr || !existing) {
    return { data: null, error: `[id] 架電記録が見つかりません。受信値: ${id}` };
  }

  // 権限チェック: caller_user_id 本人 または manager/admin（多層防御）
  const isCaller = existing.caller_user_id === user.id;
  const isManagerOrAbove = role === "manager" || role === "admin";
  if (!isCaller && !isManagerOrAbove) {
    return { data: null, error: "このアクティビティを編集する権限がありません" };
  }

  const { data, error } = await supabase
    .from("lead_activities")
    .update({
      ...fields,
      last_edited_at: new Date().toISOString(),
      last_edited_by_user_id: user.id,
    })
    .eq("id", id)
    .select(ACTIVITY_SELECT)
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// ---------- 削除（admin のみ。誤記録修正用）----------
// RLS: lead_activities_delete_admin ポリシーで admin のみ DELETE 可能。
// admin 専用のアコーディオン内に表示される。
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
