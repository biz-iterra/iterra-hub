"use server";

import { toUserMessage } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/server";
import { conflictErrorMessage } from "@/lib/validators/common";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import {
  leadCreateSchema,
  leadUpdateSchema,
  leadFiltersSchema,
  leadCustomerActivityCreateSchema,
  leadCustomerActivityUpdateSchema,
} from "@/lib/validators/leads";
// score / temperature_id の算出は DB 関数 recalculate_lead_score に統合（Phase 5）
import { recalculateLeadScore } from "@/lib/leads/recalculate-score";
import { buildIlikePattern } from "@/lib/search-query";
import {
  buildCompanyPayloadFromLead,
  buildContactPayloadFromLead,
  type LeadRow,
} from "@/lib/leads/promote-helpers";
import type { z } from "zod";
import type {
  LeadDetail,
  LeadListRow,
  LeadCustomerActivityWithType,
  LeadPromotionResult,
  LeadWithRelations,
  Paged,
} from "@/types/relations";
import { resolveListSort, SORT_FIELDS, toOrderArgs } from "@/lib/list-sort";

type ActionResult<T> = { data: T | null; error: string | null };

// Lead 作成/更新の戻り値型（warnings 付き）
type LeadMutationResult =
  | { ok: true; lead: LeadWithRelations; warnings?: string[] }
  | { ok: false; errors: Record<string, string[]> };

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------- 認証ヘルパー ----------
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

const LEAD_SELECT = `
  *,
  stage:lead_stages(id, slug, name, sort_order, is_terminal, auto_promote_to_deal, color),
  status:lead_statuses(id, code, name, sort_order, color),
  category:lead_categories(id, code, name, color),
  temperature:lead_temperatures(id, code, name, color),
  account_type:account_types(id, name, slug),
  large_segment:lead_large_segments(id, code, name),
  small_segment:lead_small_segments(id, code, name),
  owner:crm_users!leads_owner_user_id_fkey(id, full_name),
  lead_source:lead_sources(id, name),
  company_size:lead_company_sizes(id, code, name),
  score_breakdowns:lead_score_breakdowns(id, score_delta, applied_at, rule:lead_score_rules(id, category, condition_type, description)),
  customer_activities:lead_customer_activities(id, occurred_at, detail, source, created_at, activity_type:lead_customer_activity_types(id, code, name)),
  lead_campaigns(campaign_id),
  sub_owners:lead_owners(user_id, user:crm_users!lead_owners_user_id_fkey(id, full_name)),
  linked_company:companies!leads_company_id_fkey(id, company_code, name),
  linked_contact:contacts!leads_contact_id_fkey(id, contact_code, last_name, first_name)
` as const;

// ---------- 一覧取得（v_leads_with_category View を使用）----------
export async function getLeads(
  params?: z.infer<typeof leadFiltersSchema>
): Promise<ActionResult<Paged<LeadListRow>>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = leadFiltersSchema.safeParse(params ?? {});
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  const {
    stage_id, status_id, category_id, company_id, temperature_id,
    owner_user_id, keyword, page, perPage,
  } = parsed.data;

  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  const sort = resolveListSort(parsed.data, SORT_FIELDS.leads, {
    field: "created_at",
    direction: "desc",
  });

  // v_leads_with_category: deleted_at IS NULL は View 内でフィルタ済み
  let query = supabase
    .from("v_leads_with_category")
    .select(
      `
      *,
      stage:lead_stages(id, slug, name, sort_order, is_terminal, auto_promote_to_deal, color),
      status:lead_statuses(id, code, name, sort_order, color),
      category:lead_categories(id, code, name, color),
      temperature:lead_temperatures(id, code, name, color),
      account_type:account_types(id, name, slug),
      large_segment:lead_large_segments(id, code, name),
      small_segment:lead_small_segments(id, code, name),
      owner:crm_users!leads_owner_user_id_fkey(id, full_name)
    `,
      { count: "exact" }
    )
    .order(...toOrderArgs(sort))
    .range(from, to);

  if (stage_id) query = query.eq("stage_id", stage_id);
  if (status_id) query = query.eq("status_id", status_id);
  if (category_id) query = query.eq("category_id", category_id);
  // 事業者情報の詳細から「この会社のリード」を引く（T-0072）
  if (company_id) query = query.eq("company_id", company_id);
  if (temperature_id) query = query.eq("temperature_id", temperature_id);
  if (owner_user_id) query = query.eq("owner_user_id", owner_user_id);
  const keywordPattern = buildIlikePattern(keyword);
  if (keywordPattern) {
    query = query.or(
      `lead_name.ilike.${keywordPattern},company_name.ilike.${keywordPattern},company_phone.ilike.${keywordPattern},contact_phone.ilike.${keywordPattern},contact_email.ilike.${keywordPattern}`
    );
  }

  const { data, error, count } = await query;
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "リード" }) };

  // 最終アクティビティ日（called_on）を lead_id 単位で集約して付与
  const items = (data ?? []) as LeadListRow[];
  if (items.length > 0) {
    const ids = items.map((l) => l.id);
    const { data: acts } = await supabase
      .from("lead_activities")
      .select("lead_id, called_on")
      .in("lead_id", ids);
    const latest = new Map<string, string>();
    for (const a of acts ?? []) {
      if (!a.called_on) continue;
      const prev = latest.get(a.lead_id);
      if (!prev || a.called_on > prev) latest.set(a.lead_id, a.called_on);
    }
    for (const lead of items) {
      lead.last_activity_at = latest.get(lead.id) ?? null;
    }
  }

  return { data: { rows: items, total: count ?? 0 }, error: null };
}

// ---------- 詳細取得 ----------
export async function getLeadById(id: string): Promise<ActionResult<LeadDetail>> {
  // UUID 形式検証（CLAUDE.md 必須）
  if (!UUID_REGEX.test(id)) {
    return { data: null, error: "不正なパラメータです。受信値: " + id };
  }

  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("leads")
    .select(LEAD_SELECT)
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "リード" }) };
  if (!data) return { data: null, error: "リードが見つかりません" };

  // lead_campaigns join 結果から campaign_ids を抽出し、フラットな配列として付与
  // LEAD_SELECT はテンプレート文字列のため型推論されない。
  // ここで一度だけ LEAD_SELECT に対応する型として扱う。
  const row = data as LeadWithRelations & {
    lead_campaigns: { campaign_id: string }[] | null;
  };
  const { lead_campaigns: rawCampaigns, ...rest } = row;
  const campaign_ids = (rawCampaigns ?? []).map((r) => r.campaign_id);
  return { data: { ...rest, campaign_ids }, error: null };
}

// ---------- corporate_number 重複チェックヘルパー ----------
async function checkCorporateNumberDuplicate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  corporateNumber: string | null | undefined
): Promise<string | null> {
  if (!corporateNumber) return null;
  const { data: existingCompany } = await supabase
    .from("companies")
    .select("id, name")
    .eq("corporate_number", corporateNumber)
    .is("deleted_at", null)
    .maybeSingle();
  if (existingCompany) {
    return `この法人番号 (${corporateNumber}) の企業は既に登録されています (${existingCompany.name})。昇格時は既存企業との重複エラーになります。`;
  }
  return null;
}

// ---------- 作成 ----------
export async function createLead(
  input: z.infer<typeof leadCreateSchema>
): Promise<LeadMutationResult> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { ok: false, errors: { _: ["認証が必要です"] } };

  const parsed = leadCreateSchema.safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_";
      errors[key] = [...(errors[key] ?? []), issue.message];
    }
    return { ok: false, errors };
  }

  const d = parsed.data;

  // オーナーチェック: member は自分自身のみ担当可能。manager+ は任意指定可
  if (role === "member" && d.owner_user_id !== user.id) {
    return {
      ok: false,
      errors: {
        owner_user_id: [`[owner_user_id] member は自分以外を担当者に設定できません。受信値: ${d.owner_user_id}`],
      },
    };
  }

  // stage_id ↔ status_id 親子整合性チェック
  const stageInfo = await supabase
    .from("lead_stages")
    .select("name, requires_deal")
    .eq("id", d.stage_id)
    .single();

  // 商談が要るステージは新規作成では選べない。新規リードに商談は無く、
  // DB トリガー（trg_lead_stage_requirements）に弾かれるため、
  // ここで何をすればよいかまで書いた文言にして返す
  if (stageInfo.data?.requires_deal) {
    return {
      ok: false,
      errors: {
        stage_id: [
          `[stage_id] 「${stageInfo.data.name}」は商談が必要なステージのため、新規作成では選べません。` +
            `獲得〜選定のいずれかで作成し、商談化するタイミングでステージを進めてください。受信値: ${d.stage_id}`,
        ],
      },
    };
  }

  // **ステータスを NULL にするかは「そのステージにステータスが定義されているか」で決める。**
  // auto_promote_to_deal で判定すると、商談を自動生成しつつステータスも持つステージで
  // ステータスが消えてしまう（updateLead 側と同じ理由）
  const { count: statusCount } = await supabase
    .from("lead_statuses")
    .select("id", { count: "exact", head: true })
    .eq("stage_id", d.stage_id)
    .is("deleted_at", null);
  const stageHasStatuses = (statusCount ?? 0) > 0;

  if (stageHasStatuses) {
    // 通常ステージ: status_id 必須かつ stage 所属チェック
    if (!d.status_id) {
      return { ok: false, errors: { status_id: [`[status_id] ステータスは必須です。受信値: ${d.status_id ?? null}`] } };
    }
    const { data: statusRow, error: statusErr } = await supabase
      .from("lead_statuses")
      .select("stage_id")
      .eq("id", d.status_id)
      .single();
    if (statusErr || !statusRow) {
      return { ok: false, errors: { status_id: [`[status_id] ステータスが見つかりません。受信値: ${d.status_id}`] } };
    }
    if (statusRow.stage_id !== d.stage_id) {
      return {
        ok: false,
        errors: {
          status_id: [`[status_id] 指定したステータスは選択されたステージに属しません。受信値: stage_id=${d.stage_id}, status_id=${d.status_id}`],
        },
      };
    }
  }
  // ステータスが定義されていないステージ（Opportunity）: status_id を null に強制
  const resolvedStatusId = stageHasStatuses ? (d.status_id ?? null) : null;

  // corporate_number 重複チェック（警告のみ。保存はブロックしない）
  const warnings: string[] = [];
  const corpWarn = await checkCorporateNumberDuplicate(supabase, d.corporate_number);
  if (corpWarn) warnings.push(corpWarn);

  // score / temperature_id は recalculate_lead_score で算出されるため手動設定不可。
  // Zod スキーマから削除済みのため d にはこれらのフィールドは存在しない。

  // sub_owner_user_ids から主担当と重複するものを除外
  const rawSubOwnerIds = d.sub_owner_user_ids ?? [];
  const subOwnerIds = rawSubOwnerIds.filter((uid) => uid !== d.owner_user_id);

  // sub_owner_user_ids は leads テーブルには存在しないため除外して insert
  const { sub_owner_user_ids: _sub, ...leadInsertData } = d;

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      ...leadInsertData,
      status_id: resolvedStatusId,
      created_by: user.id,
      last_updated_by: user.id,
    })
    .select(LEAD_SELECT)
    .single();

  if (error) return { ok: false, errors: { _: [error.message] } };

  // 副担当を lead_owners に bulk insert（best effort）
  if (subOwnerIds.length > 0) {
    const rows = subOwnerIds.map((uid) => ({ lead_id: lead.id, user_id: uid }));
    const { error: ownerErr } = await supabase.from("lead_owners").insert(rows);
    if (ownerErr) {
      console.warn("[createLead] lead_owners insert WARN:", ownerErr.message);
    }
  }

  // score / temperature_id / breakdowns を DB 関数で算出（失敗はログのみ。Lead 登録自体は成功扱い）
  const adminClient = createAdminClient();
  await recalculateLeadScore(adminClient, lead.id);

  revalidatePath("/leads");
  return { ok: true, lead, ...(warnings.length > 0 ? { warnings } : {}) };
}

// ---------- 更新 ----------
export async function updateLead(
  input: z.infer<typeof leadUpdateSchema>
): Promise<LeadMutationResult> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { ok: false, errors: { _: ["認証が必要です"] } };

  const parsed = leadUpdateSchema.safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_";
      errors[key] = [...(errors[key] ?? []), issue.message];
    }
    return { ok: false, errors };
  }

  const { id, ...updates } = parsed.data;

  // 既存レコード取得（オーナーチェック用・副担当チェック用）
  const { data: existing, error: fetchErr } = await supabase
    .from("leads")
    .select("id, owner_user_id, stage_id, status_id, score, temperature_id, promoted_deal_id")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (fetchErr || !existing) {
    return { ok: false, errors: { _: ["リードが見つかりません"] } };
  }

  // オーナーチェック（member のみ: 主担当 OR 副担当のみ編集可）
  if (role === "member") {
    let canEdit = existing.owner_user_id === user.id;
    if (!canEdit) {
      const { data: subOwner } = await supabase
        .from("lead_owners")
        .select("user_id")
        .eq("lead_id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      canEdit = !!subOwner;
    }
    if (!canEdit) {
      return { ok: false, errors: { _: ["このリードを編集する権限がありません"] } };
    }
  }

  // stage_id ↔ status_id 親子整合性チェック（両方指定された場合、またはどちらかが変わる場合）
  const newStageId = updates.stage_id ?? existing.stage_id;

  // 新ステージの要件を確認（ステージ変更有無に関わらず常に確認）
  const { data: newStageRow } = await supabase
    .from("lead_stages")
    .select("name, auto_promote_to_deal, requires_deal")
    .eq("id", newStageId)
    .single();
  const isPromoteStage = newStageRow?.auto_promote_to_deal === true;

  // **ステータスを NULL にするかは「そのステージにステータスが定義されているか」で決める。**
  // auto_promote_to_deal で判定すると、商談を自動生成しつつステータスも持つステージ
  // （Sales の 商談化 / 引継済）でステータスが消えてしまう
  const { count: statusCount } = await supabase
    .from("lead_statuses")
    .select("id", { count: "exact", head: true })
    .eq("stage_id", newStageId)
    .is("deleted_at", null);
  const stageHasStatuses = (statusCount ?? 0) > 0;

  if (!stageHasStatuses) {
    // ステータスが定義されていないステージ（Opportunity）: status_id を null に強制
    updates.status_id = null;
  } else if (updates.stage_id || updates.status_id !== undefined) {
    // 通常ステージへの遷移 or ステータス更新: 親子整合性チェック
    // ステージが変更された場合、status_id が明示的に null（リセット済み）であれば
    // 既存の旧ステージの status_id をフォールバックに使わない
    const checkStatusId =
      updates.stage_id && updates.status_id === null
        ? null
        : (updates.status_id !== undefined ? updates.status_id : existing.status_id);
    if (!checkStatusId) {
      return {
        ok: false,
        errors: { status_id: [`[status_id] ステータスは必須です。受信値: ${checkStatusId ?? null}`] },
      };
    }
    const { data: statusRow, error: statusErr } = await supabase
      .from("lead_statuses")
      .select("stage_id")
      .eq("id", checkStatusId)
      .single();
    if (statusErr || !statusRow) {
      return {
        ok: false,
        errors: { status_id: [`[status_id] ステータスが見つかりません。受信値: ${checkStatusId}`] },
      };
    }
    if (statusRow.stage_id !== newStageId) {
      return {
        ok: false,
        errors: {
          status_id: [`[status_id] 指定したステータスは選択されたステージに属しません。受信値: stage_id=${newStageId}, status_id=${checkStatusId}`],
        },
      };
    }
  }

  // score / temperature_id は recalculate_lead_score で算出されるため手動設定不可。
  // Zod スキーマから削除済みのため updates にはこれらのフィールドは存在しない。
  const safeUpdates = updates;

  // corporate_number 重複チェック（警告のみ。保存はブロックしない）
  const warnings: string[] = [];
  if (safeUpdates.corporate_number !== undefined) {
    const corpWarn = await checkCorporateNumberDuplicate(supabase, safeUpdates.corporate_number);
    if (corpWarn) warnings.push(corpWarn);
  }

  // sub_owner_user_ids が含まれている場合は lead_owners を更新（leads テーブルには不要）
  const subOwnerIdsRaw = safeUpdates.sub_owner_user_ids;
  // expected_updated_at は DB カラムではないため更新値から除外する
  const {
    sub_owner_user_ids: _subOwner,
    expected_updated_at: expectedUpdatedAt,
    ...safeUpdatesWithoutSub
  } = safeUpdates;

  const updatePayload = {
    ...safeUpdatesWithoutSub,
    last_updated_by: user.id,
  };

  // ---------- 商談の先行生成 ----------
  // **leads を更新する前に商談を作る。** DB トリガー trg_lead_stage_requirements が
  // 「商談なしで Sales 以降へ進める」ことを拒否するため、順序が逆だと保存自体が失敗する。
  // 先に作れば、昇格が失敗したときも leads はステージが元のままなので
  // 巻き戻し（旧実装の補償処理）が要らない。
  //
  // ただし**昇格は DB の値を読む**（事業者種別・社名・担当者名など）。
  // 今回の編集で入力した値が届かないと「lead_name と account_type_id が必要です」で
  // 失敗するため、**ステージ以外の項目は昇格より先に保存する**。
  // ステージを据え置けばトリガーは発火しない（UPDATE OF stage_id のため）。
  // **紐づく商談があるかは `deals.lead_id` で数える**（T-0069）。
  // `promoted_deal_id` は派生値で、`/deals/new` から作った商談でも入るが、
  // ここでそちらを見ると「商談があるのに昇格が走って 2 本目ができる」経路が
  // 残る（判定を正本へ寄せる）
  const { count: linkedDealCount } = await supabase
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", id)
    .is("deleted_at", null);
  const willPromote = isPromoteStage && (linkedDealCount ?? 0) === 0;
  let lockValue = expectedUpdatedAt;

  if (willPromote) {
    // ステージだけ元の値に据え置いて、他の項目を先に保存する
    const { stage_id: _stageForLater, ...beforePromotePayload } = updatePayload;

    let preQuery = supabase.from("leads").update(beforePromotePayload).eq("id", id);
    if (expectedUpdatedAt) {
      preQuery = preQuery.eq("updated_at", expectedUpdatedAt);
    }
    const { data: preSaved, error: preError } = await preQuery
      .select("updated_at")
      .maybeSingle();

    if (preError) {
      return {
        ok: false,
        errors: { _: [toUserMessage(preError, { entityLabel: "リード" })] },
      };
    }
    if (!preSaved) {
      return { ok: false, errors: { _: [conflictErrorMessage("このリード")] } };
    }
    // この後の楽観ロックは、今保存した時点の値で行う
    lockValue = preSaved.updated_at;

    const promoteResult = await promoteLeadToDeal(id, { targetStageId: newStageId });
    if (promoteResult.error) {
      // ステージは据え置いたままなので、昇格しないまま項目だけ保存された状態になる。
      // 中途半端なデータは作られないため復旧処理は不要（利用者は直して再保存できる）
      // `[field] 本文` で返ってきたものは、その入力欄の下に出す（規約どおり）。
      // 特定の欄に紐づかないものだけトーストへ回す
      const fieldMatch = promoteResult.error.match(/^\[([a-z_]+)\]/);
      if (fieldMatch) {
        return { ok: false, errors: { [fieldMatch[1]]: [promoteResult.error] } };
      }
      return {
        ok: false,
        errors: { _: [`商談昇格に失敗しました: ${promoteResult.error}`] },
      };
    }

    // 昇格で updated_at がさらに進む。最後のステージ更新はその値で行う
    const { data: afterPromoteRow } = await supabase
      .from("leads")
      .select("updated_at")
      .eq("id", id)
      .maybeSingle();
    lockValue = afterPromoteRow?.updated_at ?? lockValue;
  }

  // 楽観ロック: 編集開始時点から updated_at が変わっていれば 0 行更新になる
  let updateQuery = supabase
    .from("leads")
    .update(updatePayload)
    .eq("id", id);
  if (lockValue) {
    updateQuery = updateQuery.eq("updated_at", lockValue);
  }

  const { data: updated, error: updateErr } = await updateQuery
    .select(LEAD_SELECT)
    .maybeSingle();

  if (updateErr) {
    // ステージ要件のトリガー（trg_lead_stage_requirements）は日本語で理由を返す。
    // toUserMessage は DB 関数の日本語 RAISE EXCEPTION をそのまま通す
    return {
      ok: false,
      errors: { _: [toUserMessage(updateErr, { entityLabel: "リード" })] },
    };
  }
  if (!updated) {
    return { ok: false, errors: { _: [conflictErrorMessage("このリード")] } };
  }

  // 副担当更新（sub_owner_user_ids が渡された場合のみ: 全削除 → bulk insert）
  if (subOwnerIdsRaw !== undefined) {
    await supabase.from("lead_owners").delete().eq("lead_id", id);
    const newOwnerId = safeUpdatesWithoutSub.owner_user_id ?? existing.owner_user_id;
    const filteredSubIds = subOwnerIdsRaw.filter((uid) => uid !== newOwnerId);
    if (filteredSubIds.length > 0) {
      const ownerRows = filteredSubIds.map((uid: string) => ({ lead_id: id, user_id: uid }));
      const { error: ownerErr } = await supabase.from("lead_owners").insert(ownerRows);
      if (ownerErr) {
        console.warn("[updateLead] lead_owners re-insert WARN:", ownerErr.message);
      }
    }
  }

  // score / temperature_id / breakdowns を DB 関数で算出（失敗はログのみ。Lead 更新自体は成功扱い）
  const adminClient = createAdminClient();
  await recalculateLeadScore(adminClient, id);

  // 昇格した場合、promote_lead_to_deal が leads を更新している（promoted_deal_id）。
  // updated は昇格の後に取った行なので値は入っているが、Company / Contact / Deal も
  // 作られているため、それらの一覧まで再検証する
  if (willPromote) {
    revalidatePath("/leads");
    revalidatePath(`/leads/${id}`);
    revalidatePath("/deals");
    revalidatePath("/companies");
    revalidatePath("/contacts");
    return { ok: true, lead: updated, ...(warnings.length > 0 ? { warnings } : {}) };
  }

  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
  return { ok: true, lead: updated, ...(warnings.length > 0 ? { warnings } : {}) };
}

// ---------- 論理削除（admin or owner）----------
export async function deleteLead(
  id: string,
  reason?: string
): Promise<ActionResult<null>> {
  if (!UUID_REGEX.test(id)) {
    return { data: null, error: "不正なパラメータです。受信値: " + id };
  }

  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  // オーナーチェック（member のみ自分担当のみ。manager/admin はスキップ）
  if (role === "member") {
    const { data: existing } = await supabase
      .from("leads")
      .select("owner_user_id")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (!existing) return { data: null, error: "リードが見つかりません" };
    if (existing.owner_user_id !== user.id) {
      return { data: null, error: "このリードを削除する権限がありません" };
    }
  }

  const { error } = await supabase
    .from("leads")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: user.id,
      deletion_reason: reason ?? null,
      last_updated_by: user.id,
    })
    .eq("id", id);

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "リード", operation: "delete"}) };
  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
  return { data: null, error: null };
}

// ---------- 論理削除復元（admin のみ）----------
export async function restoreLead(id: string): Promise<ActionResult<null>> {
  if (!UUID_REGEX.test(id)) {
    return { data: null, error: "不正なパラメータです。受信値: " + id };
  }

  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (role !== "admin") return { data: null, error: "管理者権限が必要です" };

  const { error } = await supabase
    .from("leads")
    .update({
      deleted_at: null,
      deleted_by: null,
      deletion_reason: null,
      last_updated_by: user.id,
    })
    .eq("id", id);

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "リード" }) };
  return { data: null, error: null };
}

// ---------- Deal 昇格（Opportunity ステージ遷移時に自動呼び出し）----------
// 法人（slug: corporate / government）:
//   corporate_number 重複チェック（ブロック）→ Company + Contact(corporate_rep) + Account + account_contacts + Deal
//   website_url は companies に転記
// 個人（slug: sole_proprietor 等）:
//   Contact(individual) + Account + account_contacts + Deal
//   website_url は contacts に転記
// 担当者情報（contact_last_name 等）→ contacts へ転記（未入力時は lead_name からフォールバック）
// 企業情報（company_name_kana / representative_name / corporate_number 等）→ companies へ転記
// 二重発火防止: promoted_deal_id が既存の場合はスキップ
export async function promoteLeadToDeal(
  leadId: string,
  /**
   * これから遷移するステージ。**昇格は leads の更新より先に行う**ため
   * （docs/database-design.md §24.4）、DB 上のステージはまだ古い。
   * 渡された場合はそちらで昇格対象かを判定する
   */
  options: { targetStageId?: string } = {}
): Promise<ActionResult<LeadPromotionResult>> {
  if (!UUID_REGEX.test(leadId)) {
    return { data: null, error: "不正なパラメータです。受信値: " + leadId };
  }

  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  // --- Lead 取得（担当者情報・企業情報カラムも含む）---
  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select(`
      id, lead_name, owner_user_id, stage_id, account_type_id,
      company_name, company_name_kana, representative_name, corporate_number,
      company_phone, url,
      contact_last_name, contact_middle_name, contact_first_name,
      contact_last_name_kana, contact_middle_name_kana, contact_first_name_kana,
      contact_department, contact_job_title, contact_email, contact_phone,
      lead_source_id, promoted_deal_id, company_id, contact_id,
      stage:lead_stages(id, auto_promote_to_deal),
      account_type:account_types(id, name, slug)
    `)
    .eq("id", leadId)
    .is("deleted_at", null)
    .single();

  if (leadErr || !lead) return { data: null, error: "リードが見つかりません" };

  // オーナーチェック（admin / manager または owner）
  if (role === "member" && lead.owner_user_id !== user.id) {
    return { data: null, error: "このリードを昇格させる権限がありません" };
  }

  // auto_promote_to_deal フラグ確認。
  // 遷移先が指定されていればそちらを見る（順序の理由は options のコメント）
  const stageInfo = Array.isArray(lead.stage) ? lead.stage[0] : lead.stage;
  let promotable = stageInfo?.auto_promote_to_deal === true;
  if (options.targetStageId && options.targetStageId !== lead.stage_id) {
    const { data: targetStage } = await supabase
      .from("lead_stages")
      .select("auto_promote_to_deal")
      .eq("id", options.targetStageId)
      .maybeSingle();
    promotable = targetStage?.auto_promote_to_deal === true;
  }
  if (!promotable) {
    return {
      data: null,
      error: "現在のステージは商談昇格対象ではありません",
    };
  }

  // 二重発火防止: already promoted
  if (lead.promoted_deal_id) {
    return { data: null, error: "このリードはすでに商談に昇格済みです" };
  }

  // 必須情報チェック。
  // **何が足りないかを個別に、入力欄の名前で返す。** 旧実装は
  // 「[ステージ遷移] Opportunity 昇格には lead_name と account_type_id が必要です」で、
  // 列名が英語のうえ [ステージ遷移] は入力欄ではないため、画面が欄に紐づけられなかった
  if (!lead.lead_name) {
    return {
      data: null,
      error: "[lead_name] リード名を入力してください。商談に昇格するには必要です",
    };
  }
  if (!lead.account_type_id) {
    return {
      data: null,
      error: "[account_type_id] 事業者種別を選択してください。商談に昇格するには必要です",
    };
  }

  const accountTypeInfo = Array.isArray(lead.account_type) ? lead.account_type[0] : lead.account_type;
  const accountTypeSlug = accountTypeInfo?.slug ?? null;

  // 法人判定: slug が corporate / government の場合は法人系とみなす
  // slug が null（未設定）の場合は company_name の有無で判定（フォールバック）
  const isCorporate = accountTypeSlug === "corporate" || accountTypeSlug === "government"
    || (!accountTypeSlug && !!lead.company_name);

  // **法人番号の重複で昇格を拒まない**（2026-08-08。T-0071）。
  //
  // 以前はここで「同一企業への昇格はできません」と返していたが、
  // これは**事業者 1 : リード N を否定する判定**だった。同じ会社から
  // 2 件目のリードが来るのは普通のことで、そのとき既存の事業者へ
  // 寄せるのが正しい。しかも `lead.company_id` が既に埋まっていても
  // 見ずに弾いていた（SELECT にすら入っていなかった）。
  //
  // 名寄せは DB 関数に任せる。`promote_lead_to_deal` が
  // `resolve_or_create_company()` を通し、法人番号 → メールドメイン →
  // 住所+名称 → 名称 の順に既存を探す（`20260808000006`）。

  // --- pipeline_type の解決 ---
  // **スラッグで引かない。** スラッグは自動採番の値になったので、
  // 「既定のパイプライン」であることを表す列を見る（20260805000018）
  const { data: pipeline, error: pipelineErr } = await supabase
    .from("pipeline_types")
    .select("id")
    .eq("is_default", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (pipelineErr || !pipeline) {
    return {
      data: null,
      error:
        "既定のパイプラインが設定されていません（マスタ・取込 → パイプライン種別で「商談化の既定」を 1 つ選んでください）",
    };
  }

  // Deal の初期ステージ取得
  const { data: firstStage } = await supabase
    .from("deal_stages")
    .select("id")
    .eq("pipeline_type_id", pipeline.id)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .limit(1)
    .single();

  if (!firstStage) {
    return { data: null, error: "商談ステージが見つかりません" };
  }

  const { data: firstStatus } = await supabase
    .from("deal_statuses")
    .select("id")
    .eq("pipeline_type_id", pipeline.id)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .limit(1)
    .single();

  if (!firstStatus) {
    return { data: null, error: "商談ステータスが見つかりません" };
  }

  // --- 既定ステータスの解決 ---
  // **UUID を直書きしない。** 役割フラグで引く（20260805000021）。
  // 以前は seed の UUID を定数で持っており、マスタを入れ替えたときに
  // 削除済みの行を指し続けていた（2026-08-05 に 27 件の破損が判明）
  const [companyStatus, contactStatus, accountStatus] = await Promise.all([
    supabase
      .from("company_statuses")
      .select("id")
      .eq("is_new_default", true)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("contact_statuses")
      .select("id")
      .eq("is_new_default", true)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("account_statuses")
      .select("id")
      .eq("is_prospect_default", true)
      .is("deleted_at", null)
      .maybeSingle(),
  ]);

  if (!companyStatus.data || !contactStatus.data || !accountStatus.data) {
    return {
      data: null,
      error:
        "既定のステータスが設定されていません（マスタ・取込で事業者情報・連絡先・取引先の「新規作成時の既定」を 1 つずつ選んでください）",
    };
  }

  // --- ペイロード構築（値の整形は TS 側、書き込みは DB 関数の責務）---
  const leadRow = lead as unknown as LeadRow;

  const companyPayload = isCorporate
    ? buildCompanyPayloadFromLead(leadRow, user.id, companyStatus.data.id)
    : null;

  const contactPayload = buildContactPayloadFromLead(
    leadRow,
    {
      contactType: isCorporate ? "corporate_rep" : "individual",
      // Company の id は DB 関数内で採番されるため、ここでは解決しない
      companyId: null,
      contactStatusId: contactStatus.data.id,
    },
    user.id
  );

  // 担当者電話。未入力かつ個人昇格なら代表電話をフォールバックに使う
  // （法人は company_phone を companies.phone に転記済みのため対象外）
  const contactPhone =
    lead.contact_phone ?? (isCorporate ? null : lead.company_phone ?? null);

  const accountPayload = {
    name: isCorporate ? lead.company_name ?? lead.lead_name : lead.lead_name,
    account_type_id: lead.account_type_id,
    account_status_id: accountStatus.data.id,
    lead_source_id: lead.lead_source_id ?? null,
    owner_user_id: lead.owner_user_id,
    created_by: user.id,
  };

  const dealPayload = {
    name: `${lead.lead_name} 案件`,
    pipeline_type_id: pipeline.id,
    deal_stage_id: firstStage.id,
    deal_status_id: firstStatus.id,
    owner_user_id: lead.owner_user_id,
    created_by: user.id,
    last_updated_by: user.id,
  };

  // --- 一括作成（単一トランザクション。失敗時は DB 側で自動ロールバック）---
  // 関数内で lead 行を FOR UPDATE ロックするため、同時実行による二重昇格も防がれる
  const { data: promoted, error: rpcError } = await supabase.rpc(
    "promote_lead_to_deal",
    {
      p_lead_id: leadId,
      p_company: companyPayload,
      p_contact: contactPayload,
      p_contact_email: lead.contact_email ?? "",
      p_contact_phone: contactPhone ?? "",
      p_account: accountPayload,
      p_deal: dealPayload,
    }
  );

  if (rpcError || !promoted) {
    console.error(
      "[promoteLeadToDeal] RPC FAILED:",
      rpcError?.message,
      rpcError?.code
    );
    return {
      data: null,
      error: rpcError?.message ?? "商談昇格に失敗しました",
    };
  }

  const result = promoted as LeadPromotionResult;

  return {
    data: {
      deal_id: result.deal_id,
      company_id: result.company_id,
      contact_id: result.contact_id,
      account_id: result.account_id,
    },
    error: null,
  };
}

// ============================================================
// lead_customer_activities CRUD
// ============================================================

// ---------- 作成 ----------
export async function createLeadCustomerActivity(
  input: unknown
): Promise<ActionResult<LeadCustomerActivityWithType>> {
  const { supabase, user, role: _role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = leadCustomerActivityCreateSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  const d = parsed.data;

  // is_lead_accessible 相当の確認（RLS で担保されるが Server Action 側でも実施）
  if (!UUID_REGEX.test(d.lead_id)) {
    return { data: null, error: `[lead_id] 不正なパラメータです。受信値: ${d.lead_id}` };
  }
  const { data: leadRow, error: leadErr } = await supabase
    .from("leads")
    .select("id")
    .eq("id", d.lead_id)
    .is("deleted_at", null)
    .single();
  if (leadErr || !leadRow) {
    return { data: null, error: `[lead_id] リードが見つかりません。受信値: ${d.lead_id}` };
  }

  const { data, error } = await supabase
    .from("lead_customer_activities")
    .insert({
      ...d,
      created_by: user.id,
      last_updated_by: user.id,
    })
    .select("*, activity_type:lead_customer_activity_types(id, code, name)")
    .single();

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "リード" }) };

  revalidatePath("/leads");
  revalidatePath(`/leads/${d.lead_id}`);

  // score / temperature_id / breakdowns を DB 関数で算出（失敗はログのみ）
  const adminClient = createAdminClient();
  await recalculateLeadScore(adminClient, d.lead_id);

  return { data, error: null };
}

// ---------- 更新 ----------
export async function updateLeadCustomerActivity(
  id: string,
  input: unknown
): Promise<ActionResult<LeadCustomerActivityWithType>> {
  if (!UUID_REGEX.test(id)) {
    return { data: null, error: "不正なパラメータです。受信値: " + id };
  }

  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = leadCustomerActivityUpdateSchema.safeParse({ ...( input as object ), id });
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  // expected_updated_at は DB カラムではないため更新値から除外する
  const { id: _id, expected_updated_at: expectedUpdatedAt, ...updates } = parsed.data;

  // 既存レコード取得（lead_id を revalidate に使用）
  const { data: existing, error: fetchErr } = await supabase
    .from("lead_customer_activities")
    .select("id, lead_id")
    .eq("id", id)
    .single();
  if (fetchErr || !existing) {
    return { data: null, error: "顧客行動が見つかりません" };
  }

  // 楽観ロック: 編集開始時点から updated_at が変わっていれば 0 行更新になる
  let updateQuery = supabase
    .from("lead_customer_activities")
    .update({
      ...updates,
      last_updated_by: user.id,
    })
    .eq("id", id);
  if (expectedUpdatedAt) {
    updateQuery = updateQuery.eq("updated_at", expectedUpdatedAt);
  }

  const { data, error } = await updateQuery
    .select("*, activity_type:lead_customer_activity_types(id, code, name)")
    .maybeSingle();

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "リード" }) };
  if (!data) {
    return { data: null, error: conflictErrorMessage("この顧客行動") };
  }

  revalidatePath("/leads");
  revalidatePath(`/leads/${existing.lead_id}`);

  // score / temperature_id / breakdowns を DB 関数で算出（失敗はログのみ）
  const adminClientU = createAdminClient();
  await recalculateLeadScore(adminClientU, existing.lead_id);

  return { data, error: null };
}

// ---------- 物理削除（admin のみ）----------
export async function deleteLeadCustomerActivity(
  id: string
): Promise<ActionResult<null>> {
  if (!UUID_REGEX.test(id)) {
    return { data: null, error: "不正なパラメータです。受信値: " + id };
  }

  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  // admin のみ許可（RLS と二重チェック）
  if (role !== "admin") {
    return { data: null, error: "管理者権限が必要です" };
  }

  // lead_id を revalidate に使用するため先に取得
  const { data: existing, error: fetchErr } = await supabase
    .from("lead_customer_activities")
    .select("id, lead_id")
    .eq("id", id)
    .single();
  if (fetchErr || !existing) {
    return { data: null, error: "顧客行動が見つかりません" };
  }

  const { error } = await supabase
    .from("lead_customer_activities")
    .delete()
    .eq("id", id);

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "リード", operation: "delete"}) };

  revalidatePath("/leads");
  revalidatePath(`/leads/${existing.lead_id}`);

  // score / temperature_id / breakdowns を DB 関数で算出（失敗はログのみ）
  const adminClientD = createAdminClient();
  await recalculateLeadScore(adminClientD, existing.lead_id);

  return { data: null, error: null };
}

/**
 * リードの進捗をステージ × カテゴリで数える。
 *
 * 一覧だけでは「どの層がどこで滞っているか」が見えないので、面で見るための集計。
 * RLS が効くので、member には自分の担当分しか数えられない（一覧と件数が揃う）。
 */
export type LeadProgressCell = {
  stage_id: string;
  stage_name: string;
  stage_slug: string;
  stage_order: number;
  stage_color: string | null;
  is_terminal: boolean;
  status_id: string | null;
  status_name: string | null;
  status_order: number | null;
  lead_count: number;
};

export async function getLeadProgressSummary(
  categoryId?: string
): Promise<{ data: LeadProgressCell[] | null; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "認証が必要です" };

  // **カテゴリはコードではなく ID で渡す。** コードは自動採番の値になったため
  // （20260805000018）。画面は既に ID を持っている
  const { data, error } = await supabase.rpc("lead_progress_summary", {
    p_category_id: categoryId ?? undefined,
  });
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "リード" }) };

  return { data: (data ?? []) as LeadProgressCell[], error: null };
}

/** カンバンに並べる 1 枚。ステージごとに上位だけを返す */
export type LeadKanbanCard = {
  stage_id: string;
  stage_name: string;
  stage_order: number;
  stage_color: string | null;
  lead_id: string | null;
  lead_name: string | null;
  company_name: string | null;
  score: number | null;
  temperature_name: string | null;
  temperature_color: string | null;
  status_name: string | null;
  owner_name: string | null;
  updated_at: string | null;
};

/**
 * カンバンのカード。
 * 件数が多いので、ステージごとに上位だけを取る。
 * 総数は getLeadProgressSummary で数える。
 */
export async function getLeadKanbanCards(
  limitPerStage = 20,
  categoryId?: string
): Promise<{ data: LeadKanbanCard[] | null; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase.rpc("lead_kanban_cards", {
    p_limit: limitPerStage,
    p_category_id: categoryId ?? undefined,
  });
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "リード" }) };

  return { data: (data ?? []) as LeadKanbanCard[], error: null };
}
