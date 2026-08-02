"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { EntityAddress } from "@/types/relations";

/**
 * 住所。
 *
 * `addresses`（住所そのもの）を `entity_addresses` が連絡先・事業者情報・取引先へ
 * 結ぶ。1 つの相手が本社・支店・請求先を持てる（主住所は 1 件）。
 * 設計: docs/database-design.md § 22
 */

type ActionResult<T> = { data: T | null; error: string | null };

export type AddressOwnerType = "contact" | "company" | "account";

export type AddressInput = {
  postal_code?: string | null;
  prefecture?: string | null;
  city?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  label?: string;
  phone?: string | null;
  fax?: string | null;
  memo?: string | null;
};

const OWNER_PATH: Record<AddressOwnerType, string> = {
  contact: "contacts",
  company: "companies",
  account: "accounts",
};

async function authorize(
  ownerType: AddressOwnerType,
  ownerId: string
): Promise<
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

  // 紐づく相手のオーナーか、manager 以上のみ。
  // テーブル名を変数で渡すと生成型で解決できないため分岐して書く
  const { data: owner, error } =
    ownerType === "contact"
      ? await supabase
          .from("contacts")
          .select("id, owner_user_id")
          .eq("id", ownerId)
          .is("deleted_at", null)
          .maybeSingle()
      : ownerType === "company"
        ? await supabase
            .from("companies")
            .select("id, owner_user_id")
            .eq("id", ownerId)
            .is("deleted_at", null)
            .maybeSingle()
        : await supabase
            .from("accounts")
            .select("id, owner_user_id")
            .eq("id", ownerId)
            .is("deleted_at", null)
            .maybeSingle();

  if (error) return { error: error.message };
  if (!owner) return { error: "紐づけ先が見つかりません" };

  const isManager = crmUser?.role === "manager" || crmUser?.role === "admin";
  if (!isManager && owner.owner_user_id !== user.id) {
    return { error: "この情報を変更する権限がありません" };
  }

  return { supabase, userId: user.id };
}

function refresh(ownerType: AddressOwnerType, ownerId: string) {
  const path = OWNER_PATH[ownerType];
  revalidatePath(`/${path}/${ownerId}`);
  revalidatePath(`/${path}/${ownerId}/edit`);
}

/** 住所一覧。主住所が先頭 */
export async function getEntityAddresses(
  ownerType: AddressOwnerType,
  ownerId: string
): Promise<ActionResult<EntityAddress[]>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("entity_addresses")
    .select(
      "id, label, is_primary, phone, fax, memo, address:addresses(id, postal_code, prefecture, city, address_line1, address_line2, raw_text)"
    )
    .eq(`${ownerType}_id`, ownerId)
    .order("is_primary", { ascending: false })
    .order("created_at");

  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as unknown as EntityAddress[], error: null };
}

/** 住所を追加する。住所本体と紐付けを 1 トランザクションで作る */
export async function addEntityAddress(
  ownerType: AddressOwnerType,
  ownerId: string,
  input: AddressInput
): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize(ownerType, ownerId);
  if ("error" in auth) return { data: null, error: auth.error };

  const hasValue = [
    input.postal_code,
    input.prefecture,
    input.city,
    input.address_line1,
    input.address_line2,
  ].some((v) => v?.trim());
  if (!hasValue) {
    return { data: null, error: "住所を入力してください" };
  }

  const { data, error } = await auth.supabase.rpc("add_entity_address", {
    p_owner_type: ownerType,
    p_owner_id: ownerId,
    p_postal_code: input.postal_code ?? "",
    p_prefecture: input.prefecture ?? "",
    p_city: input.city ?? "",
    p_address_line1: input.address_line1 ?? "",
    p_address_line2: input.address_line2 ?? "",
    p_label: input.label ?? "main",
    p_phone: input.phone ?? "",
    p_fax: input.fax ?? "",
    p_memo: input.memo ?? "",
    p_actor: auth.userId,
  });

  if (error) return { data: null, error: error.message };
  refresh(ownerType, ownerId);
  return { data: { id: data as unknown as string }, error: null };
}

/** 住所の内容を更新する */
export async function updateEntityAddress(
  ownerType: AddressOwnerType,
  ownerId: string,
  linkId: string,
  input: AddressInput
): Promise<ActionResult<null>> {
  const auth = await authorize(ownerType, ownerId);
  if ("error" in auth) return { data: null, error: auth.error };

  const { data: link, error: linkError } = await auth.supabase
    .from("entity_addresses")
    .select("id, address_id")
    .eq("id", linkId)
    .eq(`${ownerType}_id`, ownerId)
    .maybeSingle();

  if (linkError) return { data: null, error: linkError.message };
  if (!link) return { data: null, error: "住所が見つかりません" };

  const { error: addrError } = await auth.supabase
    .from("addresses")
    .update({
      postal_code: input.postal_code || null,
      prefecture: input.prefecture || null,
      city: input.city || null,
      address_line1: input.address_line1 || null,
      address_line2: input.address_line2 || null,
      last_updated_by: auth.userId,
    })
    .eq("id", link.address_id);

  if (addrError) return { data: null, error: addrError.message };

  const { error } = await auth.supabase
    .from("entity_addresses")
    .update({
      label: input.label ?? "main",
      phone: input.phone || null,
      fax: input.fax || null,
      memo: input.memo || null,
      last_updated_by: auth.userId,
    })
    .eq("id", linkId);

  if (error) return { data: null, error: error.message };
  refresh(ownerType, ownerId);
  return { data: null, error: null };
}

/** 主住所を切り替える */
export async function setPrimaryEntityAddress(
  ownerType: AddressOwnerType,
  ownerId: string,
  linkId: string
): Promise<ActionResult<null>> {
  const auth = await authorize(ownerType, ownerId);
  if ("error" in auth) return { data: null, error: auth.error };

  const { error } = await auth.supabase.rpc("set_primary_entity_address", {
    p_id: linkId,
    p_actor: auth.userId,
  });

  if (error) return { data: null, error: error.message };
  refresh(ownerType, ownerId);
  return { data: null, error: null };
}

/**
 * 住所を削除する。
 * どこからも参照されなくなった住所本体は DB のトリガーが片付ける。
 */
export async function deleteEntityAddress(
  ownerType: AddressOwnerType,
  ownerId: string,
  linkId: string
): Promise<ActionResult<null>> {
  const auth = await authorize(ownerType, ownerId);
  if ("error" in auth) return { data: null, error: auth.error };

  const { error } = await auth.supabase
    .from("entity_addresses")
    .delete()
    .eq("id", linkId)
    .eq(`${ownerType}_id`, ownerId);

  if (error) return { data: null, error: error.message };
  refresh(ownerType, ownerId);
  return { data: null, error: null };
}
