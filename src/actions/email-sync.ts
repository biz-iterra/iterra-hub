"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type {
  EmailCandidateWithCompany,
  EmailMessageWithContacts,
  GmailConnectionSummary,
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

// ---------------------------------------------------------------------------
// 連携アカウント
// ---------------------------------------------------------------------------

/**
 * 自分が繋いだ Gmail アカウント一覧。
 * リフレッシュトークンは返さない（画面で使う必要が無く、漏らす経路を作らないため）。
 */
export async function getMyGmailConnections(): Promise<
  ActionResult<GmailConnectionSummary[]>
> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("gmail_connections")
    .select(
      "id, email_address, granted_scope, last_synced_at, last_error, is_active, created_at"
    )
    .eq("crm_user_id", user.id)
    .order("created_at");

  if (error) return { data: null, error: error.message };
  return { data: data ?? [], error: null };
}

/** 連携解除。取り込み済みのメールは履歴として残す（消すと経緯が失われる） */
export async function disconnectGmail(id: string): Promise<ActionResult<null>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { error } = await supabase
    .from("gmail_connections")
    .update({ is_active: false })
    .eq("id", id);

  if (error) return { data: null, error: error.message };
  revalidatePath("/profile");
  return { data: null, error: null };
}

// ---------------------------------------------------------------------------
// 連絡先候補
// ---------------------------------------------------------------------------

export async function getEmailContactCandidates(params?: {
  status?: "pending" | "registered" | "ignored";
}): Promise<ActionResult<EmailCandidateWithCompany[]>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (role !== "manager" && role !== "admin") {
    return { data: null, error: "manager 以上の権限が必要です" };
  }

  const { data, error } = await supabase
    .from("email_contact_candidates")
    .select("*, company:companies(id, name)")
    .eq("status", params?.status ?? "pending")
    // やり取りが多い相手ほど登録する価値が高いので件数順
    .order("message_count", { ascending: false })
    .order("last_seen_at", { ascending: false })
    .limit(200);

  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as EmailCandidateWithCompany[], error: null };
}

/**
 * 候補を承認して連絡先を作る。
 * 連絡先の作成と既存メールの遡り紐付けは DB 関数が 1 トランザクションで行う。
 */
export async function approveEmailContactCandidate(input: {
  candidateId: string;
  lastName: string;
  firstName?: string | null;
  companyId?: string | null;
  ownerUserId?: string | null;
}): Promise<ActionResult<{ contactId: string }>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (role !== "manager" && role !== "admin") {
    return { data: null, error: "manager 以上の権限が必要です" };
  }

  if (!input.lastName?.trim()) {
    return { data: null, error: "[lastName] 姓を入力してください" };
  }

  // 法人未設定（個人としての登録）は引数を渡さず、DB 関数の既定値 NULL に任せる
  const { data, error } = await supabase.rpc("approve_email_contact_candidate", {
    p_candidate_id: input.candidateId,
    p_last_name: input.lastName,
    p_first_name: input.firstName ?? "",
    p_company_id: input.companyId ?? undefined,
    p_owner_user_id: input.ownerUserId ?? user.id,
  });

  if (error) return { data: null, error: error.message };

  revalidatePath("/contacts");
  return { data: { contactId: data as string }, error: null };
}

/** 対象外にする。配信メールなど、連絡先にしない相手を候補一覧から外す */
export async function ignoreEmailContactCandidate(
  id: string
): Promise<ActionResult<null>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (role !== "manager" && role !== "admin") {
    return { data: null, error: "manager 以上の権限が必要です" };
  }

  const { error } = await supabase
    .from("email_contact_candidates")
    .update({
      status: "ignored",
      resolved_at: new Date().toISOString(),
      resolved_by: user.id,
    })
    .eq("id", id);

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

// ---------------------------------------------------------------------------
// やり取り履歴
// ---------------------------------------------------------------------------

/**
 * 連絡先ごとのメール履歴。
 * 本文は保存していないため、中身を見るには Gmail へのリンクを使う。
 */
export async function getContactEmailMessages(
  contactId: string,
  limit = 50
): Promise<ActionResult<EmailMessageWithContacts[]>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("email_message_contacts")
    .select(
      "role, message:email_messages(id, gmail_message_id, gmail_thread_id, direction, subject, sent_at, from_email, from_name)"
    )
    .eq("contact_id", contactId)
    .limit(limit);

  if (error) return { data: null, error: error.message };

  // 新しい順に並べる。並び替えは JOIN 先の列なのでクエリでは指定できない
  const rows = (data ?? [])
    .filter((r) => r.message)
    .map((r) => ({ ...r.message, role: r.role }) as EmailMessageWithContacts)
    .sort((a, b) => b.sent_at.localeCompare(a.sent_at));

  return { data: rows, error: null };
}

/** 未処理の候補件数。一覧画面のバッジに使う */
export async function getPendingCandidateCount(): Promise<ActionResult<number>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (role !== "manager" && role !== "admin") return { data: 0, error: null };

  const { count, error } = await supabase
    .from("email_contact_candidates")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  if (error) return { data: null, error: error.message };
  return { data: count ?? 0, error: null };
}
