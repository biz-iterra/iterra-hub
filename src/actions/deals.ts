"use server";

import { toUserMessage } from "@/lib/db-error";
import { buildIlikePattern } from "@/lib/search-query";
import { revalidatePath } from "next/cache";
import { revalidateDealLists } from "@/lib/deals/revalidate";
import { createClient } from "@/lib/supabase/server";
import {
  createDealSchema,
  createDealWithLeadSchema,
  updateDealSchema,
  createDealServiceSchema,
  moveDealCardSchema,
} from "@/lib/validators";
import { conflictErrorMessage } from "@/lib/validators/common";
import { createAdminClient } from "@/lib/supabase/admin";
import { recalculateLeadScore } from "@/lib/leads/recalculate-score";
import type {
  DealDetail,
  DealWithRelations,
  Paged,
  Row,
  SortedColoredRef,
} from "@/types/relations";
import type { z } from "zod";
import { resolveListSort, SORT_FIELDS, toOrderArgs, type SortParams } from "@/lib/list-sort";
import type { LeadForDeal } from "@/lib/deals/lead-requirement";

type ActionResult<T> = { data: T | null; error: string | null };

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

const DEAL_SELECT = `
  *,
  pipeline_type:pipeline_types(id, name, screen_key),
  deal_stage:deal_stages(id, name, sort_order, color),
  deal_status:deal_statuses(id, name, sort_order, color),
  account:accounts(id, account_code, name, company:companies(id, name)),
  company:companies!deals_company_id_fkey(id, name),
  contact:contacts!deals_contact_id_fkey(id, last_name, first_name),
  owner:crm_users!deals_owner_user_id_fkey(id, full_name),
  deal_services(service:services(id, name)),
  lead:leads!deals_lead_id_fkey(id, lead_name, stage:lead_stages(id, name, color))
` as const;

// ---------- 一覧取得 ----------
export async function getDeals(params?: {
  search?: string;
  pipelineTypeId?: string;
  stageId?: string;
  statusId?: string;
  ownerUserId?: string;
  /** 相手先での絞り込み。各詳細ページの「商談」セクションが使う */
  accountId?: string;
  companyId?: string;
  contactId?: string;
  /** 元になったリードでの絞り込み。リード詳細の「商談」セクションが使う（T-0069） */
  leadId?: string;
  page?: number;
  perPage?: number;
} & SortParams): Promise<ActionResult<Paged<DealWithRelations>>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const page = params?.page ?? 1;
  const perPage = params?.perPage ?? 20;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  const sort = resolveListSort(params, SORT_FIELDS.deals, {
    field: "created_at",
    direction: "desc",
  });

  let query = supabase
    .from("deals")
    .select(DEAL_SELECT, { count: "exact" })
    .is("deleted_at", null)
    .order(...toOrderArgs(sort))
    .range(from, to);

  // `.or()` は `,` `(` `)` `.` を文法に使う。生の入力を埋めると式が壊れるため
  // 他の一覧と同じく buildIlikePattern を通す（2026-08-04 修正）
  const searchPattern = buildIlikePattern(params?.search);
  if (searchPattern) {
    query = query.or(
      `name.ilike.${searchPattern},deal_code.ilike.${searchPattern}`
    );
  }
  if (params?.pipelineTypeId) {
    query = query.eq("pipeline_type_id", params.pipelineTypeId);
  }
  if (params?.leadId) {
    query = query.eq("lead_id", params.leadId);
  }
  if (params?.stageId) {
    query = query.eq("deal_stage_id", params.stageId);
  }
  if (params?.statusId) {
    query = query.eq("deal_status_id", params.statusId);
  }
  if (params?.ownerUserId) {
    query = query.eq("owner_user_id", params.ownerUserId);
  }
  if (params?.accountId) {
    query = query.eq("account_id", params.accountId);
  }
  if (params?.companyId) {
    query = query.eq("company_id", params.companyId);
  }
  if (params?.contactId) {
    query = query.eq("contact_id", params.contactId);
  }

  const { data, error, count } = await query;
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "商談" }) };
  return { data: { rows: data ?? [], total: count ?? 0 }, error: null };
}

// ---------- カンバン用取得 ----------
type KanbanStageColumn = {
  stage: SortedColoredRef;
  deals: DealWithRelations[];
};
type KanbanStatusColumn = {
  status: SortedColoredRef;
  deals: DealWithRelations[];
};

export async function getDealsForKanban(
  pipelineTypeId: string
): Promise<
  ActionResult<{
    stages: KanbanStageColumn[];
    statuses: KanbanStatusColumn[];
  }>
> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const [stagesResult, statusesResult, dealsResult] = await Promise.all([
    supabase
      .from("deal_stages")
      // 列の色はマスタから。並び順で割り当てるとステージを足したときにずれる
      .select("id, name, sort_order, color")
      .eq("pipeline_type_id", pipelineTypeId)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true }),
    supabase
      .from("deal_statuses")
      .select("id, name, sort_order, color")
      .eq("pipeline_type_id", pipelineTypeId)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true }),
    supabase
      .from("deals")
      .select(DEAL_SELECT)
      .eq("pipeline_type_id", pipelineTypeId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  if (stagesResult.error) return { data: null, error: stagesResult.error.message };
  if (statusesResult.error) return { data: null, error: statusesResult.error.message };
  if (dealsResult.error) return { data: null, error: dealsResult.error.message };

  const stages = stagesResult.data ?? [];
  const statuses = statusesResult.data ?? [];
  const deals = dealsResult.data ?? [];

  const stageMap = new Map<string, DealWithRelations[]>();
  for (const s of stages) stageMap.set(s.id, []);
  const statusMap = new Map<string, DealWithRelations[]>();
  for (const s of statuses) statusMap.set(s.id, []);

  for (const deal of deals) {
    stageMap.get(deal.deal_stage_id)?.push(deal);
    statusMap.get(deal.deal_status_id)?.push(deal);
  }

  return {
    data: {
      stages: stages.map((stage) => ({ stage, deals: stageMap.get(stage.id) ?? [] })),
      statuses: statuses.map((status) => ({ status, deals: statusMap.get(status.id) ?? [] })),
    },
    error: null,
  };
}

/**
 * 商談の新規作成でリードを選んだときに引く要約（T-0070）。
 *
 * 相手先（事業者情報・連絡先）の自動補完と、商談を作れる段階かの判定に使う。
 * **`leads` の RLS がそのまま効く**（他人のリードは引けない）。
 */
export async function getLeadForDealCreation(
  leadId: string
): Promise<ActionResult<LeadForDeal>> {
  if (!UUID_REGEX.test(leadId)) {
    return { data: null, error: "不正なパラメータです" };
  }

  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("leads")
    .select(`
      id, lead_name,
      stage:lead_stages(id, name, is_deal_ready),
      company:companies!leads_company_id_fkey(id, name),
      contact:contacts!leads_contact_id_fkey(id, last_name, first_name)
    `)
    .eq("id", leadId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "リード" }) };
  if (!data) return { data: null, error: "リードが見つかりません" };

  const contactLabel = data.contact
    ? [data.contact.last_name, data.contact.first_name].filter(Boolean).join(" ")
    : "";

  return {
    data: {
      id: data.id,
      lead_name: data.lead_name ?? "",
      stage: data.stage
        ? { id: data.stage.id, name: data.stage.name, is_deal_ready: data.stage.is_deal_ready }
        : null,
      company: data.company ? { id: data.company.id, name: data.company.name } : null,
      contact: data.contact
        ? { id: data.contact.id, label: contactLabel || "（名称未設定）" }
        : null,
    },
    error: null,
  };
}

// ---------- 詳細取得 ----------
export async function getDeal(id: string): Promise<ActionResult<DealDetail>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("deals")
    .select(
      `
      ${DEAL_SELECT},
      contracts(id, contract_code, contract_name, contract_display_name, contract_method, start_date, end_date, amount, updated_at, deleted_at),
      deal_activities(id, activity_type, activity_at, subject, performed_by, crm_users!deal_activities_performed_by_fkey(full_name)),
      deal_projects(id, project:projects(id, project_code, name, project_status:project_statuses(id, name, color), deleted_at))
    `
    )
    .eq("id", id)
    .order("activity_at", { referencedTable: "deal_activities", ascending: false })
    .single();

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "商談" }) };
  return { data, error: null };
}

// ---------- 作成 ----------

/** 作成後の再検証。リード起点でもそうでなくても同じ */
function revalidateAfterDealCreate(params: {
  leadId?: string | null;
  projectId?: string | null;
}) {
  revalidateDealLists();
  revalidatePath("/dashboard");
  if (params.leadId) revalidatePath(`/leads/${params.leadId}`);
  if (params.projectId) revalidatePath(`/projects/${params.projectId}`);
}

/**
 * 商談を作る（リードを介さない経路）。
 *
 * **書き込みは DB 関数 `create_deal_with_lead` にまとめている。**
 * 以前は deals / 履歴 2 本 / deal_projects を別々に投げており、
 * 途中で落ちると履歴が欠けた（supabase-js は複数文を 1 トランザクションに
 * できない。CLAUDE.md「複数テーブルへの書き込みは DB 関数にまとめる」）。
 *
 * **セールスのパイプラインではリードが必須**なので、この経路は
 * `lead_id` を渡すか、リードを要求しないパイプラインでのみ通る
 * （`check_deal_lead_requirement` が拒む）。
 */
export async function createDeal(
  input: z.infer<typeof createDealSchema>
): Promise<ActionResult<Row<"deals">>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = createDealSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  const { project_id: projectId, lead_id: leadId, ...dealFields } = parsed.data;

  const { data: result, error } = await supabase.rpc("create_deal_with_lead", {
    p_deal: {
      ...dealFields,
      owner_user_id: dealFields.owner_user_id ?? user.id,
    },
    p_lead_id: leadId ?? undefined,
    p_project_id: projectId ?? undefined,
  });

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "商談" }) };

  const dealId = (result as { deal_id?: string } | null)?.deal_id;
  if (!dealId) return { data: null, error: "商談の作成に失敗しました" };

  const { data: deal, error: fetchError } = await supabase
    .from("deals")
    .select("*")
    .eq("id", dealId)
    .single();

  if (fetchError) {
    return { data: null, error: toUserMessage(fetchError, { entityLabel: "商談" }) };
  }

  revalidateAfterDealCreate({ leadId, projectId });
  return { data: deal, error: null };
}

/**
 * リード起点で商談を作る（T-0070）。
 *
 * 既存のリードを選ぶか、その場でリードを作る。TQL 未満のリードは
 * `raise_stage_id` を渡して選定へ上げてから商談を作る。
 * **リードの作成・ステージの引き上げ・商談・履歴が単一トランザクション**で、
 * 途中で落ちればリードも残らない。
 */
export async function createDealWithLead(
  input: z.infer<typeof createDealWithLeadSchema>
): Promise<ActionResult<{ deal_id: string; lead_id: string }>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = createDealWithLeadSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path.join(".") || "input";
    return { data: null, error: `[${field}] ${issue.message}` };
  }

  const {
    lead_mode: _leadMode,
    lead_id: leadId,
    new_lead: newLead,
    raise_stage_id: raiseStageId,
    raise_status_id: raiseStatusId,
    project_id: projectId,
    ...dealFields
  } = parsed.data;

  const { data: result, error } = await supabase.rpc("create_deal_with_lead", {
    p_deal: {
      ...dealFields,
      owner_user_id: dealFields.owner_user_id ?? user.id,
    },
    p_lead_id: leadId ?? undefined,
    p_new_lead: newLead
      ? { ...newLead, owner_user_id: newLead.owner_user_id ?? user.id }
      : undefined,
    p_raise_stage_id: raiseStageId ?? undefined,
    p_raise_status_id: raiseStatusId ?? undefined,
    p_project_id: projectId ?? undefined,
  });

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "商談" }) };

  const payload = result as { deal_id?: string; lead_id?: string } | null;
  if (!payload?.deal_id || !payload.lead_id) {
    return { data: null, error: "商談の作成に失敗しました" };
  }

  revalidatePath("/leads");
  revalidateAfterDealCreate({ leadId: payload.lead_id, projectId });

  // スコアは DB 関数の中で計算しない（createLead と同じ扱い）。
  // 失敗しても商談は成立しているので握りつぶす
  try {
    await recalculateLeadScore(createAdminClient(), payload.lead_id);
  } catch (e) {
    console.warn("[createDealWithLead] recalculateLeadScore WARN:", e);
  }

  return { data: { deal_id: payload.deal_id, lead_id: payload.lead_id }, error: null };
}

// ---------- 更新 ----------
export async function updateDeal(
  id: string,
  input: z.infer<typeof updateDealSchema>
): Promise<ActionResult<Row<"deals">>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  // owner チェック（admin 以外は自分の担当のみ）
  if (role !== "admin") {
    const { data: existing } = await supabase.from("deals").select("owner_user_id").eq("id", id).single();
    if (!existing) return { data: null, error: "商談が見つかりません" };
    if (existing.owner_user_id !== user.id) return { data: null, error: "この商談を編集する権限がありません" };
  }

  const parsed = updateDealSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  // 変更前データ取得
  const { data: current, error: fetchError } = await supabase
    .from("deals")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError) return { data: null, error: toUserMessage(fetchError, { entityLabel: "商談" }) };

  // expected_updated_at は DB カラムではないため更新値から除外する
  const { expected_updated_at, ...fields } = parsed.data;

  const updateData = {
    ...fields,
    last_updated_by: user.id,
    ...(fields.deal_stage_id &&
      fields.deal_stage_id !== current.deal_stage_id && {
        stage_updated_at: new Date().toISOString(),
      }),
  };

  // 楽観ロック: 編集開始時点から updated_at が変わっていれば 0 行更新になる
  let updateQuery = supabase.from("deals").update(updateData).eq("id", id);
  if (expected_updated_at) {
    updateQuery = updateQuery.eq("updated_at", expected_updated_at);
  }

  const { data: deal, error } = await updateQuery.select().maybeSingle();

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "商談" }) };
  if (!deal) {
    return { data: null, error: conflictErrorMessage("この商談") };
  }

  // ステージ変更履歴
  if (fields.deal_stage_id && fields.deal_stage_id !== current.deal_stage_id) {
    await supabase.from("deal_stage_histories").insert({
      deal_id: id,
      from_stage_id: current.deal_stage_id,
      to_stage_id: fields.deal_stage_id,
      changed_by: user.id,
    });
  }

  // ステータス変更履歴（stage_id は NOT NULL のため必ず渡す）
  if (fields.deal_status_id && fields.deal_status_id !== current.deal_status_id) {
    await supabase.from("deal_status_histories").insert({
      deal_id: id,
      stage_id: fields.deal_stage_id ?? current.deal_stage_id,
      from_status_id: current.deal_status_id,
      to_status_id: fields.deal_status_id,
      changed_by: user.id,
    });
  }

  // 全フィールド変更履歴
  // 変更履歴は entity_change_logs のトリガーが自動記録する（20260728000002）

  revalidateDealLists();
  revalidatePath(`/deals/${id}`);
  revalidatePath("/dashboard");
  return { data: deal, error: null };
}

// ---------- カンバン D&D: ステージ/ステータス移動 ----------
export async function moveDealCard(
  input: z.infer<typeof moveDealCardSchema>
): Promise<ActionResult<DealWithRelations>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = moveDealCardSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      data: null,
      error: `${issue.message} / 受信値: ${JSON.stringify(input)}`,
    };
  }
  const { dealId, groupBy, targetId, expectedUpdatedAt } = parsed.data;

  // 現在値取得
  const { data: current, error: fetchError } = await supabase
    .from("deals")
    .select("id, owner_user_id, pipeline_type_id, deal_stage_id, deal_status_id")
    .eq("id", dealId)
    .single();
  if (fetchError || !current) return { data: null, error: "商談が見つかりません" };

  // owner チェック（admin 以外は自分の担当のみ）
  if (role !== "admin" && current.owner_user_id !== user.id) {
    return { data: null, error: "この商談を編集する権限がありません" };
  }

  let newStageId = current.deal_stage_id;
  let newStatusId = current.deal_status_id;

  if (groupBy === "stage") {
    // ドロップ先ステージ（同一パイプライン）に属する有効なステータスのうち sort_order 最小を採用
    const { data: statusRow, error: statusError } = await supabase
      .from("deal_statuses")
      .select("id")
      .eq("deal_stage_id", targetId)
      .eq("pipeline_type_id", current.pipeline_type_id)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (statusError) return { data: null, error: toUserMessage(statusError, { entityLabel: "商談" }) };
    if (!statusRow) {
      return { data: null, error: "移動先ステージにステータスが未定義です" };
    }
    newStageId = targetId;
    newStatusId = statusRow.id;
  } else {
    // ドロップ先ステータス。deal_stage_id を持つ場合はステージも追随
    const { data: statusRow, error: statusError } = await supabase
      .from("deal_statuses")
      .select("id, deal_stage_id")
      .eq("id", targetId)
      .is("deleted_at", null)
      .maybeSingle();
    if (statusError) return { data: null, error: toUserMessage(statusError, { entityLabel: "商談" }) };
    if (!statusRow) return { data: null, error: "移動先ステータスが見つかりません" };
    newStatusId = statusRow.id;
    if (statusRow.deal_stage_id) newStageId = statusRow.deal_stage_id;
  }

  const stageChanged = newStageId !== current.deal_stage_id;
  const statusChanged = newStatusId !== current.deal_status_id;

  if (!stageChanged && !statusChanged) {
    // 変更なし（同じ列内へのドロップ等）: 現在の状態をそのまま返す
    const { data: deal, error } = await supabase
      .from("deals")
      .select(DEAL_SELECT)
      .eq("id", dealId)
      .single();
    if (error) return { data: null, error: toUserMessage(error, { entityLabel: "商談" }) };
    return { data: deal, error: null };
  }

  const updateData = {
    deal_stage_id: newStageId,
    deal_status_id: newStatusId,
    last_updated_by: user.id,
    ...(stageChanged && { stage_updated_at: new Date().toISOString() }),
  };

  // 楽観ロック: 編集開始時点から updated_at が変わっていれば 0 行更新になる
  const { data: deal, error } = await supabase
    .from("deals")
    .update(updateData)
    .eq("id", dealId)
    .eq("updated_at", expectedUpdatedAt)
    .select(DEAL_SELECT)
    .maybeSingle();

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "商談" }) };
  if (!deal) return { data: null, error: conflictErrorMessage("この商談") };

  if (stageChanged) {
    await supabase.from("deal_stage_histories").insert({
      deal_id: dealId,
      from_stage_id: current.deal_stage_id,
      to_stage_id: newStageId,
      changed_by: user.id,
    });
  }

  if (statusChanged) {
    await supabase.from("deal_status_histories").insert({
      deal_id: dealId,
      stage_id: newStageId,
      from_status_id: current.deal_status_id,
      to_status_id: newStatusId,
      changed_by: user.id,
    });
  }

  revalidateDealLists();
  revalidatePath("/dashboard");
  return { data: deal, error: null };
}

// ---------- 論理削除（admin のみ） ----------
export async function deleteDeal(id: string): Promise<ActionResult<null>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (role !== "admin") return { data: null, error: "管理者権限が必要です" };

  // 紐づく未削除契約が存在するか確認
  const { count } = await supabase
    .from("contracts")
    .select("id", { count: "exact", head: true })
    .eq("deal_id", id)
    .is("deleted_at", null);

  if (count && count > 0) {
    return { data: null, error: "紐づく契約が存在するため削除できません" };
  }

  const { error } = await supabase
    .from("deals")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: user.id,
      last_updated_by: user.id,
    })
    .eq("id", id);

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "商談", operation: "delete"}) };
  revalidateDealLists();
  revalidatePath(`/deals/${id}`);
  revalidatePath("/dashboard");
  return { data: null, error: null };
}

// ---------- ディールサービス追加 ----------
export async function addDealService(
  input: z.infer<typeof createDealServiceSchema>
): Promise<ActionResult<Row<"deal_services">>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = createDealServiceSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  const { data, error } = await supabase
    .from("deal_services")
    .insert({ ...parsed.data, created_by: user.id })
    .select()
    .single();

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "商談" }) };
  return { data, error: null };
}

// ---------- ディールサービス削除 ----------
export async function removeDealService(
  dealId: string,
  serviceId: string
): Promise<ActionResult<null>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { error } = await supabase
    .from("deal_services")
    .delete()
    .eq("deal_id", dealId)
    .eq("service_id", serviceId);

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "商談", operation: "delete"}) };
  return { data: null, error: null };
}
