"use server";

import { toUserMessage } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/server";

type ActionResult<T> = { data: T | null; error: string | null };

export type DeletedEntity =
  | "companies"
  | "accounts"
  | "contacts"
  | "deals"
  | "contracts"
  | "talents"
  | "leads";

const ENTITY_SELECT: Record<DeletedEntity, string> = {
  companies:
    "id, company_code, name, deleted_at, deleted_by, deletion_reason",
  accounts:
    "id, account_code, name, deleted_at, deleted_by, deletion_reason",
  contacts:
    "id, contact_code, last_name, first_name, deleted_at, deleted_by, deletion_reason",
  deals: "id, deal_code, name, deleted_at, deleted_by, deletion_reason",
  contracts:
    "id, contract_code, contract_name, deleted_at, deleted_by, deletion_reason",
  talents:
    "id, contact_id, deleted_at, deleted_by, deletion_reason, contact:contacts(last_name, first_name)",
  leads:
    "id, lead_name, deleted_at, deleted_by, deletion_reason, stage:lead_stages(name), status:lead_statuses(name), owner:crm_users!leads_owner_user_id_fkey(full_name)",
};

async function getAuthenticatedAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase: null, user: null, error: "認証が必要です" };
  const { data: crmUser } = await supabase
    .from("crm_users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (crmUser?.role !== "admin") {
    return { supabase: null, user: null, error: "管理者権限が必要です" };
  }
  return { supabase, user, error: null };
}

export async function getDeletedRecords(
  entity: DeletedEntity,
  params?: { page?: number; perPage?: number }
): Promise<ActionResult<{ items: Record<string, unknown>[]; count: number }>> {
  const { supabase, error: authError } = await getAuthenticatedAdmin();
  if (!supabase || authError) return { data: null, error: authError };

  const page = params?.page ?? 1;
  const perPage = params?.perPage ?? 20;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const { data, error, count } = await supabase
    .from(entity)
    .select(ENTITY_SELECT[entity], { count: "exact" })
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .range(from, to);

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "削除済みデータ" }) };
  return {
    data: {
      items: (data ?? []) as unknown as Record<string, unknown>[],
      count: count ?? 0,
    },
    error: null,
  };
}

export async function restoreRecord(
  entity: DeletedEntity,
  id: string
): Promise<ActionResult<null>> {
  const { supabase, error: authError } = await getAuthenticatedAdmin();
  if (!supabase || authError) return { data: null, error: authError };

  const { error } = await supabase
    .from(entity)
    .update({
      deleted_at: null,
      deleted_by: null,
      deletion_reason: null,
    })
    .eq("id", id);

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "削除済みデータ" }) };
  return { data: null, error: null };
}

export async function getDeletedCounts(): Promise<
  ActionResult<Record<DeletedEntity, number>>
> {
  const { supabase, error: authError } = await getAuthenticatedAdmin();
  if (!supabase || authError) return { data: null, error: authError };

  const entities: DeletedEntity[] = [
    "companies",
    "accounts",
    "contacts",
    "deals",
    "contracts",
    "talents",
    "leads",
  ];

  const counts: Record<string, number> = {};
  await Promise.all(
    entities.map(async (e) => {
      const { count } = await supabase
        .from(e)
        .select("id", { count: "exact", head: true })
        .not("deleted_at", "is", null);
      counts[e] = count ?? 0;
    })
  );

  return { data: counts as Record<DeletedEntity, number>, error: null };
}
