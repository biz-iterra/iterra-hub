"use server";

import { createClient } from "@/lib/supabase/server";
import { leadCreateSchema, leadUpdateSchema, leadFiltersSchema } from "@/lib/validators/leads";
import { resolveTemperatureByScore } from "@/lib/leads/score-temperature";
import type { z } from "zod";

type ActionResult<T> = { data: T | null; error: string | null };

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
  stage:lead_stages(id, slug, name, sort_order, is_terminal, auto_promote_to_deal),
  status:lead_statuses(id, code, name, sort_order),
  category:lead_categories(id, code, name, color),
  temperature:lead_temperatures(id, code, name, color),
  account_type:account_types(id, name, slug),
  large_segment:lead_large_segments(id, code, name),
  small_segment:lead_small_segments(id, code, name),
  primary_caller:lead_callers(id, code, name, caller_type),
  owner:crm_users!leads_owner_user_id_fkey(id, full_name),
  lead_campaigns(campaign_id)
` as const;

// ---------- 一覧取得（v_leads_with_category View を使用）----------
export async function getLeads(
  params?: z.infer<typeof leadFiltersSchema>
): Promise<ActionResult<{ items: any[]; count: number }>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = leadFiltersSchema.safeParse(params ?? {});
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  const { stage_id, status_id, category_id, temperature_id, owner_user_id, keyword, page, perPage } =
    parsed.data;

  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  // v_leads_with_category: deleted_at IS NULL は View 内でフィルタ済み
  let query = supabase
    .from("v_leads_with_category")
    .select(
      `
      *,
      stage:lead_stages(id, slug, name, sort_order, is_terminal, auto_promote_to_deal),
      status:lead_statuses(id, code, name, sort_order),
      category:lead_categories(id, code, name, color),
      temperature:lead_temperatures(id, code, name, color),
      account_type:account_types(id, name, slug),
      large_segment:lead_large_segments(id, code, name),
      small_segment:lead_small_segments(id, code, name),
      primary_caller:lead_callers(id, code, name, caller_type),
      owner:crm_users!leads_owner_user_id_fkey(id, full_name)
    `,
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (stage_id) query = query.eq("stage_id", stage_id);
  if (status_id) query = query.eq("status_id", status_id);
  if (category_id) query = query.eq("category_id", category_id);
  if (temperature_id) query = query.eq("temperature_id", temperature_id);
  if (owner_user_id) query = query.eq("owner_user_id", owner_user_id);
  if (keyword) {
    query = query.or(
      `lead_name.ilike.%${keyword}%,company_name.ilike.%${keyword}%,phone.ilike.%${keyword}%`
    );
  }

  const { data, error, count } = await query;
  if (error) return { data: null, error: error.message };
  return { data: { items: data ?? [], count: count ?? 0 }, error: null };
}

// ---------- 詳細取得 ----------
export async function getLeadById(id: string): Promise<ActionResult<any>> {
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

  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: "リードが見つかりません" };

  // lead_campaigns join 結果から campaign_ids を抽出し、フラットな配列として付与
  const rawCampaigns = (data as any).lead_campaigns as { campaign_id: string }[] | null;
  const campaign_ids: string[] = (rawCampaigns ?? []).map((r) => r.campaign_id);
  const { lead_campaigns: _lc, ...rest } = data as any;
  return { data: { ...rest, campaign_ids }, error: null };
}

// ---------- 作成 ----------
export async function createLead(
  input: z.infer<typeof leadCreateSchema>
): Promise<ActionResult<any>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = leadCreateSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  const d = parsed.data;

  // オーナーチェック: member は自分自身のみ担当可能。manager+ は任意指定可
  if (role === "member" && d.owner_user_id !== user.id) {
    return {
      data: null,
      error: `[owner_user_id] member は自分以外を担当者に設定できません。受信値: ${d.owner_user_id}`,
    };
  }

  // stage_id ↔ status_id 親子整合性チェック
  // Opportunity 等 auto_promote_to_deal=true のステージはステータス定義なし → status_id=null を許容
  const stageInfo = await supabase
    .from("lead_stages")
    .select("auto_promote_to_deal")
    .eq("id", d.stage_id)
    .single();
  const isPromoteStage = stageInfo.data?.auto_promote_to_deal === true;

  if (!isPromoteStage) {
    // 通常ステージ: status_id 必須かつ stage 所属チェック
    if (!d.status_id) {
      return { data: null, error: `[status_id] ステータスは必須です。受信値: ${d.status_id ?? null}` };
    }
    const { data: statusRow, error: statusErr } = await supabase
      .from("lead_statuses")
      .select("stage_id")
      .eq("id", d.status_id)
      .single();
    if (statusErr || !statusRow) {
      return { data: null, error: `[status_id] ステータスが見つかりません。受信値: ${d.status_id}` };
    }
    if (statusRow.stage_id !== d.stage_id) {
      return {
        data: null,
        error: `[status_id] 指定したステータスは選択されたステージに属しません。受信値: stage_id=${d.stage_id}, status_id=${d.status_id}`,
      };
    }
  }
  // Opportunity ステージ: status_id を null に強制
  const resolvedStatusId = isPromoteStage ? null : (d.status_id ?? null);

  // score → temperature_id 自動判定
  let temperature_id = d.temperature_id ?? null;
  if (d.score !== null && d.score !== undefined) {
    const resolved = await resolveTemperatureByScore(supabase, d.score);
    if (resolved) temperature_id = resolved;
  }

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      ...d,
      status_id: resolvedStatusId,
      temperature_id,
      created_by: user.id,
      last_updated_by: user.id,
    })
    .select(LEAD_SELECT)
    .single();

  if (error) return { data: null, error: error.message };

  return { data: lead, error: null };
}

// ---------- 更新 ----------
export async function updateLead(
  input: z.infer<typeof leadUpdateSchema>
): Promise<ActionResult<any>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = leadUpdateSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  const { id, ...updates } = parsed.data;

  // 既存レコード取得（オーナーチェック用）
  const { data: existing, error: fetchErr } = await supabase
    .from("leads")
    .select("id, owner_user_id, stage_id, status_id, score, temperature_id")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (fetchErr || !existing) {
    return { data: null, error: "リードが見つかりません" };
  }

  // オーナーチェック（member のみ自分担当のみ。manager/admin はスキップ）
  if (role === "member" && existing.owner_user_id !== user.id) {
    return { data: null, error: "このリードを編集する権限がありません" };
  }

  // stage_id ↔ status_id 親子整合性チェック（両方指定された場合、またはどちらかが変わる場合）
  const newStageId = updates.stage_id ?? existing.stage_id;

  // 新ステージが auto_promote_to_deal かどうか確認（ステージ変更有無に関わらず常に確認）
  const { data: newStageRow } = await supabase
    .from("lead_stages")
    .select("auto_promote_to_deal")
    .eq("id", newStageId)
    .single();
  const isPromoteStage = newStageRow?.auto_promote_to_deal === true;

  if (isPromoteStage) {
    // Opportunity ステージ: status_id を null に強制
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
        data: null,
        error: `[status_id] ステータスは必須です。受信値: ${checkStatusId ?? null}`,
      };
    }
    const { data: statusRow, error: statusErr } = await supabase
      .from("lead_statuses")
      .select("stage_id")
      .eq("id", checkStatusId)
      .single();
    if (statusErr || !statusRow) {
      return {
        data: null,
        error: `[status_id] ステータスが見つかりません。受信値: ${checkStatusId}`,
      };
    }
    if (statusRow.stage_id !== newStageId) {
      return {
        data: null,
        error: `[status_id] 指定したステータスは選択されたステージに属しません。受信値: stage_id=${newStageId}, status_id=${checkStatusId}`,
      };
    }
  }

  // score が変わったら temperature_id を再判定
  let temperature_id = updates.temperature_id !== undefined
    ? updates.temperature_id
    : existing.temperature_id;
  if (updates.score !== undefined && updates.score !== null) {
    const resolved = await resolveTemperatureByScore(supabase, updates.score);
    if (resolved) temperature_id = resolved;
  }

  const updatePayload = {
    ...updates,
    temperature_id,
    last_updated_by: user.id,
  };

  const { data: updated, error: updateErr } = await supabase
    .from("leads")
    .update(updatePayload)
    .eq("id", id)
    .select(LEAD_SELECT)
    .single();

  if (updateErr) return { data: null, error: updateErr.message };

  // stage が opportunity に遷移したら promoteLeadToDeal を呼び出す
  // 既に promoted_deal_id がある場合は再昇格しない（二重生成防止）
  if (updates.stage_id && updates.stage_id !== existing.stage_id) {
    const { data: newStage } = await supabase
      .from("lead_stages")
      .select("auto_promote_to_deal")
      .eq("id", updates.stage_id)
      .single();

    if (newStage?.auto_promote_to_deal) {
      // promoted_deal_id チェック（updateLead の existing には含まれていないため再取得）
      const { data: currentLead } = await supabase
        .from("leads")
        .select("promoted_deal_id")
        .eq("id", id)
        .single();

      if (!currentLead?.promoted_deal_id) {
        console.log("[updateLead] calling promoteLeadToDeal for lead:", id);
        const promoteResult = await promoteLeadToDeal(id);
        if (promoteResult.error) {
          console.error("[updateLead] promoteLeadToDeal failed:", promoteResult.error);
          // Deal 昇格失敗はエラーとして返す（ユーザーに確実に通知）
          return {
            data: updated,
            error: `Deal昇格に失敗しました: ${promoteResult.error}`,
          };
        }
        console.log("[updateLead] promoteLeadToDeal succeeded");
      }
    }
  }

  return { data: updated, error: null };
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

  if (error) return { data: null, error: error.message };
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

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

// ---------- Deal 昇格（Opportunity ステージ遷移時に自動呼び出し）----------
// 法人（slug: corporate / government）: Company + Contact(corporate_rep) + Account + account_contacts + Deal
// 個人（slug: sole_proprietor）: Contact(individual) + Account + account_contacts + Deal
// 二重発火防止: promoted_deal_id が既存の場合はスキップ
export async function promoteLeadToDeal(leadId: string): Promise<ActionResult<any>> {
  if (!UUID_REGEX.test(leadId)) {
    return { data: null, error: "不正なパラメータです。受信値: " + leadId };
  }

  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  // --- Lead 取得（account_type の slug も含む）---
  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select(`
      id, lead_name, owner_user_id, stage_id, account_type_id, company_name,
      lead_source_id, promoted_deal_id, phone, url,
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

  // auto_promote_to_deal フラグ確認
  const stageInfo = Array.isArray(lead.stage) ? lead.stage[0] : lead.stage;
  if (!stageInfo?.auto_promote_to_deal) {
    return {
      data: null,
      error: "現在のステージは Deal 昇格対象ではありません",
    };
  }

  // 二重発火防止: already promoted
  const { data: alreadyPromoted } = await supabase
    .from("leads")
    .select("promoted_deal_id")
    .eq("id", leadId)
    .single();
  if (alreadyPromoted?.promoted_deal_id) {
    return { data: null, error: "このリードはすでに Deal に昇格済みです" };
  }

  // 必須情報チェック
  if (!lead.lead_name || !lead.account_type_id) {
    return {
      data: null,
      error: "[ステージ遷移] Opportunity 昇格には lead_name と account_type_id が必要です",
    };
  }

  const accountTypeInfo = Array.isArray(lead.account_type) ? lead.account_type[0] : lead.account_type;
  const accountTypeSlug = (accountTypeInfo as any)?.slug as string | null;

  // 法人判定: slug が corporate / government の場合は法人系とみなす
  // slug が null（未設定）の場合は company_name の有無で判定（フォールバック）
  const isCorporate = accountTypeSlug === "corporate" || accountTypeSlug === "government"
    || (!accountTypeSlug && !!lead.company_name);

  // --- マスタ ID の解決（固定 UUID を使用）---
  // company_statuses: アクティブ = c1000000-0000-0000-0000-000000000001
  // contact_statuses: アクティブ = d0000000-0000-0000-0000-000000000001
  // account_statuses: 見込み    = c0000000-0000-0000-0000-000000000004
  const COMPANY_STATUS_ACTIVE = "c1000000-0000-0000-0000-000000000001";
  const CONTACT_STATUS_ACTIVE = "d0000000-0000-0000-0000-000000000001";
  const ACCOUNT_STATUS_PROSPECT = "c0000000-0000-0000-0000-000000000004";

  // lead_name を姓/名に分割（スペース区切り。単語が1つの場合は firstName を空文字にする）
  // NOTE: contacts.first_name は NOT NULL → 1単語の場合は "" をセット（null は不可）
  const nameParts = lead.lead_name.trim().split(/\s+/);
  const lastName = nameParts[0] ?? lead.lead_name;
  const firstName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

  // --- pipeline_type の解決（slug: sales）---
  const { data: pipeline, error: pipelineErr } = await supabase
    .from("pipeline_types")
    .select("id")
    .eq("slug", "sales")
    .is("deleted_at", null)
    .single();

  if (pipelineErr || !pipeline) {
    return {
      data: null,
      error: 'pipeline_type（slug: "sales"）が見つかりません。管理者にお問い合わせください',
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
    return { data: null, error: "Deal ステージが見つかりません" };
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
    return { data: null, error: "Deal ステータスが見つかりません" };
  }

  // --- エンティティ作成（手動ロールバック方式）---
  let newCompanyId: string | null = null;
  let newContactId: string | null = null;
  let newAccountId: string | null = null;
  let newDealId: string | null = null;

  // ロールバックヘルパー
  const rollback = async () => {
    if (newDealId) await supabase.from("deals").delete().eq("id", newDealId);
    if (newAccountId) await supabase.from("accounts").delete().eq("id", newAccountId);
    if (newContactId) await supabase.from("contacts").delete().eq("id", newContactId);
    if (newCompanyId) await supabase.from("companies").delete().eq("id", newCompanyId);
  };

  // 1. Company 作成（法人のみ）
  if (isCorporate) {
    const companyName = lead.company_name ?? lead.lead_name;
    console.log("[promoteLeadToDeal] step1: creating Company", companyName);
    const { data: newCompany, error: companyErr } = await supabase
      .from("companies")
      .insert({
        name: companyName,
        company_status_id: COMPANY_STATUS_ACTIVE,
        lead_source_id: lead.lead_source_id ?? null,
        owner_user_id: lead.owner_user_id,
        created_by: user.id,
        last_updated_by: user.id,
      })
      .select("id")
      .single();

    if (companyErr || !newCompany) {
      console.error("[promoteLeadToDeal] step1 FAILED:", companyErr?.message, companyErr?.code);
      return {
        data: null,
        error: `Company の作成に失敗しました: ${companyErr?.message ?? "unknown"}`,
      };
    }
    newCompanyId = newCompany.id;
    console.log("[promoteLeadToDeal] step1 OK: company_id=", newCompanyId);
  }

  // 2. Contact 作成
  {
    const contactType = isCorporate ? "corporate_rep" : "individual";
    console.log("[promoteLeadToDeal:individual] step:2 creating Contact", lastName, firstName, contactType);
    const { data: newContact, error: contactErr } = await supabase
      .from("contacts")
      .insert({
        last_name: lastName,
        first_name: firstName,
        contact_type: contactType,
        contact_status_id: CONTACT_STATUS_ACTIVE,
        // 個人（sole_proprietor）の場合は company_id を必ず null にする（バグ #4 対応）
        company_id: isCorporate ? newCompanyId : null,
        lead_source_id: lead.lead_source_id ?? null,
        owner_user_id: lead.owner_user_id,
        created_by: user.id,
        last_updated_by: user.id,
      })
      .select("id")
      .single();

    console.log("[promoteLeadToDeal:individual] step:2 contact payload logged:", {
      last_name: lastName,
      first_name: firstName,
      contact_type: contactType,
      company_id: isCorporate ? newCompanyId : null,
      lead_source_id: lead.lead_source_id ?? null,
    });

    if (contactErr || !newContact) {
      console.error("[promoteLeadToDeal:individual] step:2 FAILED:", contactErr?.message, contactErr?.code, contactErr?.details);
      await rollback();
      return {
        data: null,
        error: `Contact の作成に失敗しました: ${contactErr?.message ?? "unknown"}`,
      };
    }
    newContactId = newContact.id;
    console.log("[promoteLeadToDeal:individual] step:2 OK: contact_id=", newContactId);

    // 法人かつ Contact 作成成功 → Company の primary_contact_id を更新
    if (isCorporate && newCompanyId) {
      await supabase
        .from("companies")
        .update({ primary_contact_id: newContactId })
        .eq("id", newCompanyId);
    }

    // phone がある場合は contact_phones に追加（バグ #3: phone 引き継ぎ）
    if (lead.phone && newContactId) {
      console.log("[promoteLeadToDeal:individual] step:2b inserting contact_phones phone=", lead.phone);
      const { error: phoneErr } = await supabase
        .from("contact_phones")
        .insert({
          contact_id: newContactId,
          phone: lead.phone,
          label: "work",
          is_primary: true,
          created_by: user.id,
          last_updated_by: user.id,
        });
      if (phoneErr) {
        // phone 挿入失敗はロールバック不要（致命的ではない）だが警告ログを残す
        console.warn("[promoteLeadToDeal:individual] step:2b phone insert WARN:", phoneErr.message);
      } else {
        console.log("[promoteLeadToDeal:individual] step:2b phone inserted OK");
      }
    }
  }

  // 3. Account 作成
  {
    const accountName = isCorporate
      ? (lead.company_name ?? lead.lead_name)
      : lead.lead_name;

    console.log("[promoteLeadToDeal] step3: creating Account", accountName);
    const { data: newAccount, error: accountErr } = await supabase
      .from("accounts")
      .insert({
        name: accountName,
        account_type_id: lead.account_type_id,
        account_status_id: ACCOUNT_STATUS_PROSPECT,
        company_id: newCompanyId,
        lead_source_id: lead.lead_source_id ?? null,
        owner_user_id: lead.owner_user_id,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (accountErr || !newAccount) {
      console.error("[promoteLeadToDeal] step3 FAILED:", accountErr?.message, accountErr?.code, accountErr?.details);
      await rollback();
      return {
        data: null,
        error: `Account の作成に失敗しました: ${accountErr?.message ?? "unknown"}`,
      };
    }
    newAccountId = newAccount.id;
    console.log("[promoteLeadToDeal] step3 OK: account_id=", newAccountId);
  }

  // 4. account_contacts 紐付け
  {
    console.log("[promoteLeadToDeal] step4: creating account_contacts");
    const { error: acErr } = await supabase
      .from("account_contacts")
      .insert({
        account_id: newAccountId,
        contact_id: newContactId,
        role: "primary",
      });

    if (acErr) {
      console.error("[promoteLeadToDeal] step4 FAILED:", acErr.message, acErr.code);
      await rollback();
      return {
        data: null,
        error: `account_contacts の作成に失敗しました: ${acErr.message}`,
      };
    }
    console.log("[promoteLeadToDeal] step4 OK");
  }

  // 5. Deal 作成
  {
    console.log("[promoteLeadToDeal] step5: creating Deal");
    const { data: newDeal, error: dealErr } = await supabase
      .from("deals")
      .insert({
        name: `${lead.lead_name} 案件`,
        pipeline_type_id: pipeline.id,
        deal_stage_id: firstStage.id,
        deal_status_id: firstStatus.id,
        account_id: newAccountId,
        owner_user_id: lead.owner_user_id,
        created_by: user.id,
        last_updated_by: user.id,
      })
      .select("id")
      .single();

    if (dealErr || !newDeal) {
      console.error("[promoteLeadToDeal] step5 FAILED:", dealErr?.message, dealErr?.code, dealErr?.details);
      await rollback();
      return {
        data: null,
        error: `Deal の作成に失敗しました: ${dealErr?.message ?? "unknown"}`,
      };
    }
    newDealId = newDeal.id;
    console.log("[promoteLeadToDeal] step5 OK: deal_id=", newDealId);
  }

  // 6. leads の promoted_* を一括更新
  console.log("[promoteLeadToDeal] step6: updating leads promoted_*");
  const { error: updateErr } = await supabase
    .from("leads")
    .update({
      promoted_deal_id: newDealId,
      promoted_company_id: newCompanyId,
      promoted_contact_id: newContactId,
      promoted_account_id: newAccountId,
      last_updated_by: user.id,
    })
    .eq("id", leadId);

  if (updateErr) {
    console.error("[promoteLeadToDeal] step6 FAILED:", updateErr.message, updateErr.code);
    await rollback();
    return {
      data: null,
      error: `Lead の promoted_* 更新に失敗したため関連エンティティを削除しました: ${updateErr.message}`,
    };
  }
  console.log("[promoteLeadToDeal] step6 OK - all entities created");

  // 7. deal_stage_histories / deal_status_histories に初回エントリ
  await supabase.from("deal_stage_histories").insert({
    deal_id: newDealId,
    from_stage_id: null,
    to_stage_id: firstStage.id,
    changed_by: user.id,
  });
  await supabase.from("deal_status_histories").insert({
    deal_id: newDealId,
    from_status_id: null,
    to_status_id: firstStatus.id,
    changed_by: user.id,
  });

  return {
    data: {
      deal_id: newDealId,
      company_id: newCompanyId,
      contact_id: newContactId,
      account_id: newAccountId,
    },
    error: null,
  };
}
