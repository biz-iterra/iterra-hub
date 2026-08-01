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

/** 名刺の所属を、その連絡先の現在の所属として反映する */
export async function applyBusinessCardAsCurrent(
  cardId: string
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "認証が必要です" };

  const { data: crmUser } = await supabase
    .from("crm_users")
    .select("role")
    .eq("id", user.id)
    .single();

  // 誰の名刺かを確かめる。admin / manager 以外は自分が担当する連絡先のみ
  const { data: card, error: cardError } = await supabase
    .from("business_cards")
    .select("id, contact_id, contact:contacts!business_cards_contact_id_fkey(owner_user_id)")
    .eq("id", cardId)
    .maybeSingle();

  if (cardError) return { data: null, error: cardError.message };
  if (!card) return { data: null, error: "名刺が見つかりません" };

  const owner = (card.contact as { owner_user_id: string | null } | null)?.owner_user_id;
  const isManager = crmUser?.role === "manager" || crmUser?.role === "admin";
  if (!isManager && owner !== user.id) {
    return { data: null, error: "この連絡先を変更する権限がありません" };
  }

  const { error } = await supabase.rpc("apply_business_card_as_current", {
    p_card_id: cardId,
    p_actor: user.id,
  });

  if (error) return { data: null, error: error.message };

  revalidatePath(`/contacts/${card.contact_id}`);
  revalidatePath("/contacts");
  return { data: null, error: null };
}
