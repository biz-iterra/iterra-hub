"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import type {
  BusinessCardListRow,
  Paged,
  ReferredCardRow,
} from "@/types/relations";

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
 * 名刺の一覧。
 *
 * 名刺は連絡先詳細でしか見えず、紹介者の確認・修正に連絡先を 1 件ずつ
 * 開く必要があった。横断で見るための入口。
 *
 * 検索は連絡先の氏名で引く。名刺は「誰の名刺か」で探すのが自然で、
 * 会社から辿るなら事業者情報の一覧がある。
 */
export async function getBusinessCards(params?: {
  search?: string;
  /** 紹介者の有無で絞る。未設定の名刺を洗い出すのに使う */
  referrer?: "with" | "without";
  page?: number;
  perPage?: number;
}): Promise<ActionResult<Paged<BusinessCardListRow>>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "認証が必要です" };

  const page = params?.page ?? 1;
  const perPage = params?.perPage ?? DEFAULT_PAGE_SIZE;
  const from = (page - 1) * perPage;

  const search = params?.search?.trim();

  // 参照できる範囲は RLS が決める。氏名で絞るときだけ内部結合にする
  const contactJoin = search
    ? "contact:contacts!business_cards_contact_id_fkey!inner(id, last_name, first_name)"
    : "contact:contacts!business_cards_contact_id_fkey(id, last_name, first_name)";

  let query = supabase
    .from("business_cards")
    .select(
      `id, company_name_raw, department, job_title, source, source_registered_on, is_primary, referral_memo, ${contactJoin}, company:companies!business_cards_company_id_fkey(id, name), referrer:contacts!business_cards_referrer_contact_id_fkey(id, last_name, first_name)`,
      { count: "exact" }
    );

  if (search) {
    query = query.or(
      `last_name.ilike.%${search}%,first_name.ilike.%${search}%`,
      { referencedTable: "contact" }
    );
  }
  if (params?.referrer === "with") {
    query = query.not("referrer_contact_id", "is", null);
  }
  if (params?.referrer === "without") {
    query = query.is("referrer_contact_id", null);
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, from + perPage - 1);

  if (error) return { data: null, error: error.message };

  return {
    data: {
      rows: (data ?? []) as unknown as BusinessCardListRow[],
      total: count ?? 0,
    },
    error: null,
  };
}

/**
 * ある連絡先が紹介した相手。
 *
 * 紹介は名刺に紐づくので、同じ人を別の場面で紹介していれば複数行になる。
 * 「紹介数が多い人」「紹介からの案件発生率」といった分析の入口にもなるが、
 * **集計は CRM では持たない**（別のアプリで扱う方針）。
 */
export async function getReferredContacts(
  contactId: string
): Promise<ActionResult<ReferredCardRow[]>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("business_cards")
    .select(
      `id, company_name_raw, referral_memo, source_registered_on, contact:contacts!business_cards_contact_id_fkey(id, last_name, first_name), company:companies!business_cards_company_id_fkey(id, name)`
    )
    .eq("referrer_contact_id", contactId)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as unknown as ReferredCardRow[], error: null };
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
