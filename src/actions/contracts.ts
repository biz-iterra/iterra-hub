"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { conflictErrorMessage } from "@/lib/validators/common";
import {
  createContractSchema,
  updateContractSchema,
} from "@/lib/validators";
import type {
  ContractDetail,
  ContractWithRelations,
  Paged,
  Row,
} from "@/types/relations";
import type { z } from "zod";
import { resolveListSort, SORT_FIELDS, toOrderArgs, type SortParams } from "@/lib/list-sort";

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

const CONTRACT_LIST_SELECT = `
  *,
  deal:deals(id, deal_code, name),
  contract_type:contract_types(id, name),
  counterparty_company:companies(id, name),
  counterparty_contact:contacts!contracts_counterparty_contact_id_fkey(id, last_name, first_name),
  registered_user:crm_users!contracts_registered_by_fkey(id, full_name)
` as const;

// ---------- 一覧取得 ----------
export async function getContracts(params?: {
  search?: string;
  dealId?: string;
  contractTypeId?: string;
  contractMethod?: string;
  page?: number;
  perPage?: number;
} & SortParams): Promise<ActionResult<Paged<ContractWithRelations>>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const page = params?.page ?? 1;
  const perPage = params?.perPage ?? 20;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  const sort = resolveListSort(params, SORT_FIELDS.contracts, {
    field: "created_at",
    direction: "desc",
  });

  let query = supabase
    .from("contracts")
    .select(CONTRACT_LIST_SELECT, { count: "exact" })
    .is("deleted_at", null)
    .order(...toOrderArgs(sort))
    .range(from, to);

  if (params?.search) {
    query = query.or(
      `contract_code.ilike.%${params.search}%,contract_name.ilike.%${params.search}%`
    );
  }
  if (params?.dealId) {
    query = query.eq("deal_id", params.dealId);
  }
  if (params?.contractTypeId) {
    query = query.eq("contract_type_id", params.contractTypeId);
  }
  if (params?.contractMethod) {
    query = query.eq("contract_method", params.contractMethod);
  }

  const { data, error, count } = await query;
  if (error) return { data: null, error: error.message };
  return { data: { rows: data ?? [], total: count ?? 0 }, error: null };
}

// ---------- 詳細取得 ----------
export async function getContract(id: string): Promise<ActionResult<ContractDetail>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("contracts")
    .select(
      `
      ${CONTRACT_LIST_SELECT},
      counterparty_manager:contacts!contracts_counterparty_manager_id_fkey(id, last_name, first_name, department, job_title)
    `
    )
    .eq("id", id)
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// ---------- 作成 ----------
export async function createContract(
  input: z.infer<typeof createContractSchema>
): Promise<ActionResult<Row<"contracts">>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (role !== "manager" && role !== "admin") {
    return { data: null, error: "manager 以上の権限が必要です" };
  }

  const parsed = createContractSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  const contractData = {
    ...parsed.data,
    registered_by: user.id,
    created_by: user.id,
  };

  const { data, error } = await supabase
    .from("contracts")
    .insert(contractData)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  // 契約成立の AFTER INSERT トリガーが取引先を作り商談に紐付けるので、そちらも再検証する
  revalidatePath("/contracts");
  revalidatePath("/accounts");
  revalidatePath("/deals");
  if (data?.deal_id) revalidatePath(`/deals/${data.deal_id}`);
  return { data, error: null };
}

// ---------- 更新 ----------
export async function updateContract(
  id: string,
  input: z.infer<typeof updateContractSchema>
): Promise<ActionResult<Row<"contracts">>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (role !== "manager" && role !== "admin") {
    return { data: null, error: "manager 以上の権限が必要です" };
  }

  const parsed = updateContractSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  // expected_updated_at は DB カラムではないため更新値から除外する
  const { expected_updated_at, ...fields } = parsed.data;

  // 楽観ロック: 編集開始時点から updated_at が変わっていれば 0 行更新になる
  let updateQuery = supabase
    .from("contracts")
    .update({ ...fields, last_updated_by: user.id })
    .eq("id", id);
  if (expected_updated_at) {
    updateQuery = updateQuery.eq("updated_at", expected_updated_at);
  }

  const { data, error } = await updateQuery.select().maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: conflictErrorMessage("この契約") };
  revalidatePath("/contracts");
  revalidatePath(`/contracts/${id}`);
  return { data, error: null };
}

// ---------- 論理削除 ----------
export async function deleteContract(id: string): Promise<ActionResult<null>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (role !== "admin") {
    return { data: null, error: "管理者権限が必要です" };
  }

  const { error } = await supabase
    .from("contracts")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: user.id,
      last_updated_by: user.id,
    })
    .eq("id", id);

  if (error) return { data: null, error: error.message };
  revalidatePath("/contracts");
  revalidatePath(`/contracts/${id}`);
  return { data: null, error: null };
}
