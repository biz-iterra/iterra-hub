"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ContactMergeCandidate, ContactMergePreview } from "@/types/relations";

/**
 * 連絡先の統合。
 *
 * 姓名しか一致しない連絡先は自動で統合しない（同姓同名の誤統合は元に戻せない）。
 * ここでは候補の一覧・下見・実行・却下だけを扱い、判断は人に委ねる。
 * 設計: docs/contact-identity.md § 9
 */

type ActionResult<T> = { data: T | null; error: string | null };

async function requireManager(): Promise<
  { supabase: Awaited<ReturnType<typeof createClient>>; userId: string } | { error: string }
> {
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

  // DB 関数側でも同じ判定をしている。ここで弾くのは画面に理由を返すため
  if (crmUser?.role !== "manager" && crmUser?.role !== "admin") {
    return { error: "連絡先の統合には manager 以上の権限が必要です" };
  }
  return { supabase, userId: user.id };
}

const CONTACT_FIELDS =
  "id, contact_code, last_name, first_name, last_name_kana, first_name_kana, department, job_title, created_at, company:companies!contacts_company_id_fkey(id, name)";

/**
 * 統合候補の一覧。既定は未判断のものだけ。
 * 判断材料が要るので両側の連絡先を会社名付きで返す。
 */
export async function getMergeCandidates(
  status: "pending" | "merged" | "rejected" = "pending"
): Promise<ActionResult<ContactMergeCandidate[]>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("contact_merge_candidates")
    .select(
      `id, reason, detail, status, created_at,
       contact:contacts!contact_merge_candidates_contact_id_fkey(${CONTACT_FIELDS}),
       candidate:contacts!contact_merge_candidates_candidate_contact_id_fkey(${CONTACT_FIELDS})`
    )
    .eq("status", status)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as unknown as ContactMergeCandidate[], error: null };
}

/** 未判断の候補の件数。一覧画面への導線を出すかの判断に使う */
export async function countPendingMergeCandidates(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count } = await supabase
    .from("contact_merge_candidates")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  return count ?? 0;
}

/**
 * 全連絡先を突き合わせて候補を洗い直す。
 *
 * 検出は名刺取込の中でしか走らないため、取込を通っていない連絡先どうしの
 * 重複は誰も見つけないまま残る。棚卸しのための入口。
 * 記録するだけで統合はしない。戻り値は新たに挙がった件数。
 */
export async function detectAllMergeCandidates(): Promise<ActionResult<number>> {
  const auth = await requireManager();
  if ("error" in auth) return { data: null, error: auth.error };

  const { data, error } = await auth.supabase.rpc("detect_all_contact_merge_candidates");
  if (error) return { data: null, error: error.message };

  revalidatePath("/contacts/merge-candidates");
  return { data: data ?? 0, error: null };
}

/**
 * 統合の下見。何がどれだけ動くかを数えるだけで、変更はしない。
 * **統合は取り消せない**ので、実行前に必ずこれを見せる。
 */
export async function previewContactMerge(
  keepId: string,
  mergeId: string
): Promise<ActionResult<ContactMergePreview>> {
  const auth = await requireManager();
  if ("error" in auth) return { data: null, error: auth.error };

  const { data, error } = await auth.supabase.rpc("merge_contacts_preview", {
    p_keep: keepId,
    p_merge: mergeId,
  });

  if (error) return { data: null, error: error.message };
  return { data: data as unknown as ContactMergePreview, error: null };
}

/**
 * 統合の実行。付け替えは DB 関数で単一トランザクションにまとめている
 * （途中で失敗して片方だけ移った状態を作らないため）。
 */
export async function mergeContactsAction(
  keepId: string,
  mergeId: string
): Promise<ActionResult<ContactMergePreview>> {
  const auth = await requireManager();
  if ("error" in auth) return { data: null, error: auth.error };

  if (!keepId || !mergeId || keepId === mergeId) {
    return { data: null, error: "統合する 2 件の連絡先を指定してください" };
  }

  const { data, error } = await auth.supabase.rpc("merge_contacts", {
    p_keep: keepId,
    p_merge: mergeId,
  });

  if (error) return { data: null, error: error.message };

  revalidatePath("/contacts");
  revalidatePath("/contacts/merge-candidates");
  revalidatePath(`/contacts/${keepId}`);

  return { data: data as unknown as ContactMergePreview, error: null };
}

/** 別人だと判断した候補を閉じる。次回以降の取込でも再び挙がらない */
export async function rejectMergeCandidate(
  candidateId: string
): Promise<ActionResult<null>> {
  const auth = await requireManager();
  if ("error" in auth) return { data: null, error: auth.error };

  const { error } = await auth.supabase
    .from("contact_merge_candidates")
    .update({
      status: "rejected",
      decided_by_user_id: auth.userId,
      decided_at: new Date().toISOString(),
    })
    .eq("id", candidateId)
    .eq("status", "pending");

  if (error) return { data: null, error: error.message };

  revalidatePath("/contacts/merge-candidates");
  return { data: null, error: null };
}
