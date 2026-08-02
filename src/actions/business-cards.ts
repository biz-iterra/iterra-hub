"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * 名刺。
 *
 * 所属（会社・部署・役職）は名刺の属性として持つ。取込では連絡先の現在の所属を
 * 書き換えず、**どの名刺を現在の所属とするかは人が決める**。
 * 取込元の登録日は在籍期間を表さないため、機械的に最新を採れないのが理由
 * （docs/contact-identity.md § 5）。
 */

type ActionResult<T> = { data: T | null; error: string | null };

/**
 * 名刺を触ってよい人かを確かめる。admin / manager 以外は自分が担当する連絡先のみ。
 *
 * 成否は `ok` で判別する。`"error" in auth` では、成功側に error を持たない
 * union を TypeScript が絞り切れずに undefined が混ざる。
 */
async function authorizeCard(cardId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "認証が必要です" };

  const { data: crmUser } = await supabase
    .from("crm_users")
    .select("role")
    .eq("id", user.id)
    .single();

  const { data: card, error } = await supabase
    .from("business_cards")
    .select(
      "id, contact_id, contact:contacts!business_cards_contact_id_fkey(owner_user_id)"
    )
    .eq("id", cardId)
    .maybeSingle();

  if (error) return { ok: false as const, error: error.message };
  if (!card) return { ok: false as const, error: "名刺が見つかりません" };

  const owner = (card.contact as { owner_user_id: string | null } | null)
    ?.owner_user_id;
  const isManager = crmUser?.role === "manager" || crmUser?.role === "admin";
  if (!isManager && owner !== user.id) {
    return {
      ok: false as const,
      error: "この連絡先を変更する権限がありません",
    };
  }

  return { ok: true as const, supabase, user, contactId: card.contact_id };
}

/**
 * 名刺に紹介者を記録する。
 *
 * 連絡先から選ぶ経路と自由記入の両方を持つ。連絡先として登録されていない
 * 紹介者（社外の人づて・イベント経由）もいるため、片方だけでも記録できる。
 * どちらも空にすれば紹介者の記録を消せる。
 */
export async function updateBusinessCardReferral(
  cardId: string,
  input: { referrerContactId: string | null; memo: string | null }
): Promise<ActionResult<null>> {
  const auth = await authorizeCard(cardId);
  if (!auth.ok) return { data: null, error: auth.error };

  const memo = input.memo?.trim() || null;

  const { error } = await auth.supabase
    .from("business_cards")
    .update({
      referrer_contact_id: input.referrerContactId || null,
      referral_memo: memo,
      last_updated_by: auth.user.id,
    })
    .eq("id", cardId);

  if (error) {
    // 自分自身を紹介者にはできない（chk_business_cards_referrer_not_self）
    if (error.message.includes("referrer_not_self")) {
      return { data: null, error: "本人を紹介者にはできません" };
    }
    return { data: null, error: error.message };
  }

  revalidatePath(`/contacts/${auth.contactId}`);
  return { data: null, error: null };
}

/**
 * 紹介者を選ぶための連絡先の候補。
 *
 * 連絡先は 3,000 件近くあり一覧から選べないので、打ち込んだ文字で絞る。
 * 名前・会社名のどちらでも引けるようにする。
 */
export async function searchContactsForReferrer(
  keyword: string,
  excludeContactId?: string
): Promise<ActionResult<
  { id: string; name: string; company: string | null }[]
>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "認証が必要です" };

  const q = keyword.trim();
  if (q.length < 2) return { data: [], error: null };

  // 参照できる範囲は RLS が決める
  let query = supabase
    .from("contacts")
    .select(
      "id, last_name, first_name, company:companies!contacts_company_id_fkey(name)"
    )
    .is("deleted_at", null)
    .or(`last_name.ilike.%${q}%,first_name.ilike.%${q}%`)
    .limit(10);

  if (excludeContactId) query = query.neq("id", excludeContactId);

  const { data, error } = await query;
  if (error) return { data: null, error: error.message };

  return {
    data: (data ?? []).map((c) => ({
      id: c.id,
      name: [c.last_name, c.first_name].filter(Boolean).join(" "),
      company: (c.company as { name: string } | null)?.name ?? null,
    })),
    error: null,
  };
}

/** 名刺の所属を、その連絡先の現在の所属として反映する */
export async function applyBusinessCardAsCurrent(
  cardId: string
): Promise<ActionResult<null>> {
  const auth = await authorizeCard(cardId);
  if (!auth.ok) return { data: null, error: auth.error };

  const { error } = await auth.supabase.rpc("apply_business_card_as_current", {
    p_card_id: cardId,
    p_actor: auth.user.id,
  });

  if (error) return { data: null, error: error.message };

  revalidatePath(`/contacts/${auth.contactId}`);
  revalidatePath("/contacts");
  return { data: null, error: null };
}
