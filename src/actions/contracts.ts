"use server";

import { toUserMessage } from "@/lib/db-error";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { conflictErrorMessage } from "@/lib/validators/common";
import {
  createContractSchema,
  linkContractToDealSchema,
  unlinkContractFromDealSchema,
  updateContractSchema,
} from "@/lib/validators";
import type {
  ContractDetail,
  ContractWithRelations,
  LinkableContract,
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
    // 自動生成の契約名にも当てる（一覧の 1 列目がこれのため）
    query = query.or(
      `contract_code.ilike.%${params.search}%,contract_name.ilike.%${params.search}%,contract_display_name.ilike.%${params.search}%`
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
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "契約" }) };
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

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "契約" }) };
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

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "契約" }) };
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

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "契約" }) };
  if (!data) return { data: null, error: conflictErrorMessage("この契約") };
  revalidatePath("/contracts");
  revalidatePath(`/contracts/${id}`);
  return { data, error: null };
}

// ---------- 商談への付け替え ----------

/**
 * 商談へ紐づけられる契約の候補を返す。
 *
 * **どの商談にも紐づいていない契約だけ**を返す（T-0065）。他の商談の契約を
 * 出すと、選んだ瞬間にその商談から契約が消える付け替えになってしまう。
 *
 * `.neq("deal_id", …)` は使えない。SQL の NULL 比較（`NULL <> 'x'` が UNKNOWN）で
 * **未紐づけの行が丸ごと落ちる**ため、まさに欲しいものが出てこない。
 */
export async function listLinkableContracts(params: {
  search?: string;
  limit?: number;
}): Promise<ActionResult<LinkableContract[]>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (role !== "manager" && role !== "admin") {
    return { data: null, error: "manager 以上の権限が必要です" };
  }

  let query = supabase
    .from("contracts")
    .select(
      "id, contract_code, contract_name, contract_display_name, contract_method, execution_date, amount, updated_at"
    )
    .is("deleted_at", null)
    .is("deal_id", null)
    .order("created_at", { ascending: false })
    .limit(params.limit ?? 20);

  if (params.search) {
    query = query.or(
      `contract_code.ilike.%${params.search}%,contract_name.ilike.%${params.search}%,contract_display_name.ilike.%${params.search}%`
    );
  }

  const { data, error } = await query;
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "契約" }) };
  return { data: data ?? [], error: null };
}

/**
 * どの商談にも紐づいていない契約を、商談へ紐づける。
 *
 * **他の商談に紐づいている契約は受け付けない**（T-0065）。候補一覧を開いたまま
 * 放置している間に他の人が紐づけた、という取り違えを弾く。
 *
 * 紐づけた時点で `ensure_account_on_contract` が走り、取引先が無ければ作られる
 * （`20260808000001` で `AFTER UPDATE OF deal_id` を足した）。
 */
export async function linkContractToDeal(
  input: z.infer<typeof linkContractToDealSchema>
): Promise<ActionResult<Row<"contracts">>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (role !== "manager" && role !== "admin") {
    return { data: null, error: "manager 以上の権限が必要です" };
  }

  const parsed = linkContractToDealSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  const { data: before, error: beforeError } = await supabase
    .from("contracts")
    .select("deal_id")
    .eq("id", parsed.data.contract_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (beforeError) {
    return { data: null, error: toUserMessage(beforeError, { entityLabel: "契約" }) };
  }
  if (!before) return { data: null, error: "契約が見つかりません" };
  if (before.deal_id === parsed.data.deal_id) {
    return { data: null, error: "この契約はすでにこの商談に紐づいています" };
  }
  if (before.deal_id) {
    return {
      data: null,
      error:
        "この契約はすでに別の商談に紐づいています。もとの商談で紐づけを解除してから操作してください",
    };
  }

  const { data, error } = await supabase
    .from("contracts")
    .update({ deal_id: parsed.data.deal_id, last_updated_by: user.id })
    .eq("id", parsed.data.contract_id)
    .eq("updated_at", parsed.data.expected_updated_at)
    .select()
    .maybeSingle();

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "契約" }) };
  if (!data) return { data: null, error: conflictErrorMessage("この契約") };

  revalidatePath("/contracts");
  revalidatePath(`/contracts/${parsed.data.contract_id}`);
  revalidatePath("/deals");
  revalidatePath(`/deals/${parsed.data.deal_id}`);
  revalidatePath("/accounts");
  return { data, error: null };
}

/**
 * 契約を商談から外す（`deal_id` を NULL に戻す）。
 *
 * **契約そのものは残る。** どの商談にも紐づかない状態になり、
 * あとから同じ商談にも別の商談にも紐づけ直せる（T-0067）。
 *
 * 外すと「ステージは取引先なのに契約が無い」リードを作れてしまうため、
 * DB のトリガー（`check_contract_detach_against_leads`）が日本語の理由付きで拒む。
 * 取引先は消さない（他の商談や連絡先がぶら下がっている）。
 */
export async function unlinkContractFromDeal(
  input: z.infer<typeof unlinkContractFromDealSchema>
): Promise<ActionResult<Row<"contracts">>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (role !== "manager" && role !== "admin") {
    return { data: null, error: "manager 以上の権限が必要です" };
  }

  const parsed = unlinkContractFromDealSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  // いま本当にこの商談に付いているか。古い画面から押されたときに
  // 別の商談の紐づけを外さないため
  const { data: before, error: beforeError } = await supabase
    .from("contracts")
    .select("deal_id")
    .eq("id", parsed.data.contract_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (beforeError) {
    return { data: null, error: toUserMessage(beforeError, { entityLabel: "契約" }) };
  }
  if (!before) return { data: null, error: "契約が見つかりません" };
  if (before.deal_id !== parsed.data.deal_id) {
    return {
      data: null,
      error: "この契約はすでにこの商談から外れています。画面を再読み込みしてください",
    };
  }

  const { data, error } = await supabase
    .from("contracts")
    .update({ deal_id: null, last_updated_by: user.id })
    .eq("id", parsed.data.contract_id)
    .eq("updated_at", parsed.data.expected_updated_at)
    .select()
    .maybeSingle();

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "契約" }) };
  if (!data) return { data: null, error: conflictErrorMessage("この契約") };

  revalidatePath("/contracts");
  revalidatePath(`/contracts/${parsed.data.contract_id}`);
  revalidatePath("/deals");
  revalidatePath(`/deals/${parsed.data.deal_id}`);
  revalidatePath("/accounts");
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

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "契約", operation: "delete"}) };
  revalidatePath("/contracts");
  revalidatePath(`/contracts/${id}`);
  return { data: null, error: null };
}
