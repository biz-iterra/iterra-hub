"use server";

/**
 * freee 会計連携の Server Action。
 *
 * 取り込み（freee → CRM）は自動で回るが、**freee への書き込みは自動では行わない**。
 * 差分を画面に出し、項目ごとに人が確定したものだけを書く（2026-08-04 に方針変更。
 * それまでは読み取り専用だった。docs/database-design.md §26）。
 * すべて admin 限定。会計データに繋がる操作のため範囲を絞る。
 */

import { revalidatePath } from "next/cache";
import { toUserMessage } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/server";
import { buildIlikePattern } from "@/lib/search-query";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import { isFreeeConfigured } from "@/lib/freee/config";
import {
  createFreeePartnerForCompany,
  pushPartnerToFreee,
  syncFreeeConnection,
} from "@/lib/freee/sync";
import {
  buildFreeeCreatePayload,
  buildFreeeUpdatePayload,
  type FreeeCompanySource,
} from "@/lib/freee/payload";
import type {
  FreeeCandidateForCompany,
  FreeeConnectionStatus,
  FreeeContactCandidate,
  FreeePartnerDiff,
  FreeePartnerCandidate,
  FreeePartnerListItem,
  FreeeSyncSummary,
  FreeeUnlinkedCompany,
} from "@/types/relations";

type ActionResult<T> = { data: T | null; error: string | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 取引先コードは freee の更新 API が受け付けない（作成時にしか指定できない）。
 * 画面・Server Action・DB 関数の 3 箇所で同じ判断をするため文言を 1 つにする
 * （docs/error-messages.md）
 */
const FREEE_CODE_NOT_UPDATABLE =
  "取引先コードは freee の API では変更できません。freee の画面で入力してください";

/** 逆向きも通らない。事業者コードは CRM が採番する（UNIQUE 制約つき） */
const FREEE_CODE_NOT_IMPORTABLE =
  "事業者コードは CRM が自動で採番します。freee の値では上書きできません";


type AdminContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
};

/** admin 以外は触れない。SECURITY DEFINER の DB 関数側でも二重に確認している */
async function requireAdmin(): Promise<AdminContext | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証が必要です" };

  const { data: me } = await supabase
    .from("crm_users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (me?.role !== "admin") {
    return { error: "この操作を行う権限がありません" };
  }
  return { supabase, userId: user.id };
}

// ---------------------------------------------------------------------------
// 接続
// ---------------------------------------------------------------------------

/** 接続状態。**トークンは返さない** */
export async function getFreeeConnection(): Promise<ActionResult<FreeeConnectionStatus>> {
  const auth = await requireAdmin();
  if ("error" in auth) return { data: null, error: auth.error };

  const { data, error } = await auth.supabase
    .from("freee_connections")
    .select(
      "id, freee_company_id, freee_company_name, last_synced_at, last_full_synced_at, last_error, is_active, created_at"
    )
    .eq("is_active", true)
    .order("created_at")
    .maybeSingle();

  if (error) {
    return { data: null, error: toUserMessage(error, { entityLabel: "freee 連携" }) };
  }

  return {
    data: {
      configured: isFreeeConfigured(),
      connection: data
        ? {
            id: data.id,
            freeeCompanyId: data.freee_company_id,
            freeeCompanyName: data.freee_company_name,
            lastSyncedAt: data.last_synced_at,
            lastFullSyncedAt: data.last_full_synced_at,
            lastError: data.last_error,
            connectedAt: data.created_at,
          }
        : null,
    },
    error: null,
  };
}

/** 接続を切る。**行は消さない**（紐付けの履歴と再接続のため） */
export async function disconnectFreee(): Promise<ActionResult<true>> {
  const auth = await requireAdmin();
  if ("error" in auth) return { data: null, error: auth.error };

  const { error } = await auth.supabase
    .from("freee_connections")
    .update({ is_active: false })
    .eq("is_active", true);

  if (error) {
    return { data: null, error: toUserMessage(error, { entityLabel: "freee 連携" }) };
  }

  revalidatePath("/admin/freee");
  return { data: true, error: null };
}

/**
 * 手動同期。
 *
 * @param full true で全件同期（freee 側の削除を検出する）。既定は差分
 */
export async function runFreeeSyncNow(full = false): Promise<ActionResult<FreeeSyncSummary>> {
  const auth = await requireAdmin();
  if ("error" in auth) return { data: null, error: auth.error };

  const { data: conn, error: connError } = await auth.supabase
    .from("freee_connections")
    .select("id")
    .eq("is_active", true)
    .order("created_at")
    .maybeSingle();

  if (connError) {
    return { data: null, error: toUserMessage(connError, { entityLabel: "freee 連携" }) };
  }
  if (!conn) return { data: null, error: "freee と接続されていません" };

  const { data, error } = await syncFreeeConnection(conn.id, { full });
  if (error || !data) return { data: null, error: error ?? "同期に失敗しました" };

  revalidatePath("/admin/freee");
  revalidatePath("/admin/freee/partners");

  return {
    data: {
      fetched: data.fetched,
      upserted: data.upserted,
      autoLinked: data.autoLinked,
      markedDeleted: data.markedDeleted,
      full: data.full,
    },
    error: null,
  };
}

// ---------------------------------------------------------------------------
// 突合
// ---------------------------------------------------------------------------

type PartnerRow = {
  id: string;
  freee_partner_id: number;
  name: string;
  long_name: string | null;
  name_kana: string | null;
  org_code: number | null;
  phone: string | null;
  email: string | null;
  contact_name: string | null;
  invoice_registration_number: string | null;
  corporate_number: string | null;
  available: boolean;
  freee_deleted_at: string | null;
  freee_update_date: string | null;
  link_status: FreeePartnerListItem["linkStatus"];
  company_id: string | null;
  account_id: string | null;
  company: { id: string; name: string; invoice_registration_number: string | null } | null;
  account: { id: string; name: string; account_code: string } | null;
};

const PARTNER_COLUMNS =
  "id, freee_partner_id, name, long_name, name_kana, org_code, phone, email, contact_name, " +
  "invoice_registration_number, corporate_number, available, freee_deleted_at, freee_update_date, " +
  "link_status, company_id, account_id, " +
  "company:companies!freee_partners_company_id_fkey(id, name, invoice_registration_number), " +
  "account:accounts!freee_partners_account_id_fkey(id, name, account_code)";

function toListItem(row: PartnerRow): FreeePartnerListItem {
  // インボイス番号の食い違い。**CRM が正本**なので警告表示に留める
  const crmInvoice = row.company?.invoice_registration_number ?? null;
  const invoiceMismatch =
    row.invoice_registration_number !== null &&
    crmInvoice !== null &&
    row.invoice_registration_number !== crmInvoice;

  return {
    id: row.id,
    freeePartnerId: row.freee_partner_id,
    name: row.name,
    longName: row.long_name,
    nameKana: row.name_kana,
    orgCode: row.org_code,
    phone: row.phone,
    email: row.email,
    contactName: row.contact_name,
    invoiceRegistrationNumber: row.invoice_registration_number,
    corporateNumber: row.corporate_number,
    available: row.available,
    freeeDeletedAt: row.freee_deleted_at,
    freeeUpdateDate: row.freee_update_date,
    linkStatus: row.link_status,
    companyId: row.company_id,
    companyName: row.company?.name ?? null,
    accountId: row.account_id,
    accountName: row.account?.name ?? null,
    accountCode: row.account?.account_code ?? null,
    invoiceMismatch,
    crmInvoiceRegistrationNumber: crmInvoice,
  };
}

/** 突合一覧。件数も返す（ページネーションの規約 { rows, total }） */
export async function listFreeePartners(params: {
  linkStatus?: string;
  search?: string;
  /** freee 側で使用停止・削除された行も出すか */
  includeInactive?: boolean;
  page?: number;
  perPage?: number;
}): Promise<ActionResult<{ rows: FreeePartnerListItem[]; total: number }>> {
  const auth = await requireAdmin();
  if ("error" in auth) return { data: null, error: auth.error };

  const perPage = params.perPage ?? 30;
  const page = Math.max(1, params.page ?? 1);
  const from = (page - 1) * perPage;

  let query = auth.supabase
    .from("freee_partners")
    .select(PARTNER_COLUMNS, { count: "exact" });

  if (params.linkStatus) query = query.eq("link_status", params.linkStatus);
  // `.or()` は `,` `(` `)` `.` を文法に使う。生の入力を埋めると式が壊れるため
  // 他の一覧と同じく buildIlikePattern を通す
  const searchPattern = buildIlikePattern(params.search);
  if (searchPattern) {
    query = query.or(
      `name.ilike.${searchPattern},long_name.ilike.${searchPattern},` +
        `name_kana.ilike.${searchPattern},invoice_registration_number.ilike.${searchPattern}`
    );
  }
  if (!params.includeInactive) {
    // 使用停止・freee 側削除は既定で隠す（突合するのは生きている取引先）
    query = query.eq("available", true).is("freee_deleted_at", null);
  }

  const { data, error, count } = await query
    .order("freee_update_date", { ascending: false, nullsFirst: false })
    .order("name")
    .range(from, from + perPage - 1)
    .returns<PartnerRow[]>();

  if (error) {
    return { data: null, error: toUserMessage(error, { entityLabel: "freee 取引先" }) };
  }

  return {
    data: { rows: (data ?? []).map(toListItem), total: count ?? 0 },
    error: null,
  };
}

/** 紐付けの候補（名称・ドメイン・電話の一致）。**提案であって自動確定はしない** */
export async function getFreeePartnerCandidates(
  partnerId: string
): Promise<ActionResult<FreeePartnerCandidate[]>> {
  const auth = await requireAdmin();
  if ("error" in auth) return { data: null, error: auth.error };
  if (!UUID_RE.test(partnerId)) return { data: null, error: "不正なパラメータです" };

  const { data, error } = await auth.supabase.rpc("detect_freee_partner_candidates", {
    p_partner_id: partnerId,
  });

  if (error) {
    return { data: null, error: toUserMessage(error, { entityLabel: "freee 取引先" }) };
  }

  const rows = (data ?? []) as {
    company_id: string;
    company_name: string;
    reason: string;
    detail: {
      invoice_registration_number: string | null;
      corporate_number: string | null;
      account_count: number;
    };
  }[];

  return {
    data: rows.map((r) => ({
      companyId: r.company_id,
      companyName: r.company_name,
      reason: r.reason as FreeePartnerCandidate["reason"],
      invoiceRegistrationNumber: r.detail?.invoice_registration_number ?? null,
      corporateNumber: r.detail?.corporate_number ?? null,
      accountCount: r.detail?.account_count ?? 0,
    })),
    error: null,
  };
}

/** 既存の事業者情報（と任意で取引先）へ紐付けを確定する */
export async function confirmFreeePartnerLink(params: {
  partnerId: string;
  companyId: string;
  accountId?: string | null;
}): Promise<ActionResult<true>> {
  const auth = await requireAdmin();
  if ("error" in auth) return { data: null, error: auth.error };
  if (!UUID_RE.test(params.partnerId) || !UUID_RE.test(params.companyId)) {
    return { data: null, error: "不正なパラメータです" };
  }
  if (params.accountId && !UUID_RE.test(params.accountId)) {
    return { data: null, error: "不正なパラメータです" };
  }

  const { error } = await auth.supabase.rpc("confirm_freee_partner_link", {
    p_partner_id: params.partnerId,
    p_company_id: params.companyId,
    // DB 側の既定が NULL なので、未指定は渡さない（生成型は undefined を取る）
    p_account_id: params.accountId ?? undefined,
    p_actor: auth.userId,
  });

  if (error) {
    return { data: null, error: toUserMessage(error, { entityLabel: "freee 取引先" }) };
  }

  revalidatePath("/admin/freee/partners");
  return { data: true, error: null };
}

/**
 * 事業者情報を新規作成して紐付ける。
 *
 * **取引先（Account）は作らない。** Account は契約成立時にだけ作られる
 * （docs/database-design.md §16.6）。
 */
export async function registerFreeePartnerCompany(
  partnerId: string
): Promise<ActionResult<{ companyId: string }>> {
  const auth = await requireAdmin();
  if ("error" in auth) return { data: null, error: auth.error };
  if (!UUID_RE.test(partnerId)) return { data: null, error: "不正なパラメータです" };

  const { data, error } = await auth.supabase.rpc("register_freee_partner_company", {
    p_partner_id: partnerId,
    p_actor: auth.userId,
  });

  if (error) {
    return { data: null, error: toUserMessage(error, { entityLabel: "事業者情報", operation: "create" }) };
  }

  revalidatePath("/admin/freee/partners");
  revalidatePath("/companies");
  return { data: { companyId: data as string }, error: null };
}

/** 突合の対象外にする（CRM に持つ必要が無い取引先） */
export async function excludeFreeePartner(partnerId: string): Promise<ActionResult<true>> {
  const auth = await requireAdmin();
  if ("error" in auth) return { data: null, error: auth.error };
  if (!UUID_RE.test(partnerId)) return { data: null, error: "不正なパラメータです" };

  const { error } = await auth.supabase
    .from("freee_partners")
    .update({
      link_status: "excluded",
      company_id: null,
      account_id: null,
      linked_at: new Date().toISOString(),
      linked_by: auth.userId,
    })
    .eq("id", partnerId);

  if (error) {
    return { data: null, error: toUserMessage(error, { entityLabel: "freee 取引先" }) };
  }

  revalidatePath("/admin/freee/partners");
  return { data: true, error: null };
}

/** 紐付けを解除して未紐付けに戻す（対象外の取り消しにも使う） */
export async function unlinkFreeePartner(partnerId: string): Promise<ActionResult<true>> {
  const auth = await requireAdmin();
  if ("error" in auth) return { data: null, error: auth.error };
  if (!UUID_RE.test(partnerId)) return { data: null, error: "不正なパラメータです" };

  const { error } = await auth.supabase
    .from("freee_partners")
    .update({
      link_status: "unlinked",
      company_id: null,
      account_id: null,
      linked_at: null,
      linked_by: null,
    })
    .eq("id", partnerId);

  if (error) {
    return { data: null, error: toUserMessage(error, { entityLabel: "freee 取引先" }) };
  }

  revalidatePath("/admin/freee/partners");
  return { data: true, error: null };
}

// ---------------------------------------------------------------------------
// 相互同期（2026-08-04 追加）
//
// **CRM を正とする。ただし自動では書かない。**
// 差分を出して人が項目ごとに選び、確定したものだけを書く。
// ---------------------------------------------------------------------------

/** 紐付け済みの相手について、CRM と freee の差分を項目ごとに返す */
export async function getFreeePartnerDiffs(): Promise<
  ActionResult<FreeePartnerDiff[]>
> {
  const auth = await requireAdmin();
  if ("error" in auth) return { data: null, error: auth.error };

  const { data: conn, error: connError } = await auth.supabase
    .from("freee_connections")
    .select("freee_company_id")
    .eq("is_active", true)
    .order("created_at")
    .maybeSingle();

  if (connError) {
    return { data: null, error: toUserMessage(connError, { entityLabel: "freee 連携" }) };
  }
  if (!conn) return { data: null, error: "freee と接続されていません" };

  const { data, error } = await auth.supabase.rpc("detect_freee_partner_diffs", {
    p_freee_company_id: conn.freee_company_id,
  });

  if (error) {
    return { data: null, error: toUserMessage(error, { entityLabel: "freee 取引先" }) };
  }

  const rows = (data ?? []) as {
    partner_id: string;
    company_id: string;
    partner_name: string;
    company_name: string;
    diffs: { field: string; label: string; crm: string | null; freee: string | null }[];
  }[];

  return {
    data: rows.map((r) => ({
      partnerId: r.partner_id,
      companyId: r.company_id,
      partnerName: r.partner_name,
      companyName: r.company_name,
      fields: r.diffs ?? [],
    })),
    error: null,
  };
}

/** 人が選んだ項目を freee へ書く（CRM の値で上書き） */
export async function pushFieldsToFreee(params: {
  partnerId: string;
  fields: string[];
}): Promise<ActionResult<true>> {
  const auth = await requireAdmin();
  if ("error" in auth) return { data: null, error: auth.error };
  if (!UUID_RE.test(params.partnerId)) {
    return { data: null, error: "不正なパラメータです" };
  }
  if (params.fields.length === 0) {
    return { data: null, error: "反映する項目を選んでください" };
  }
  // 取引先コードは freee の更新 API が受け付けない（§26.8）。
  // 混ぜると他の項目まで巻き込んで 400 になるため、送る前に弾く
  if (params.fields.includes("code")) {
    return { data: null, error: FREEE_CODE_NOT_UPDATABLE };
  }

  // 送る値は**その場で引き直す**。画面が古い値を握っていても、
  // 実際に書くのは現在の CRM の値にする
  const { data: diffs, error: diffError } = await getFreeePartnerDiffs();
  if (diffError) return { data: null, error: diffError };

  const target = diffs?.find((d) => d.partnerId === params.partnerId);
  if (!target) {
    return { data: null, error: "差分が見つかりません。画面を再読み込みしてください" };
  }

  const selected = target.fields.filter((f) => params.fields.includes(f.field));
  const changes = Object.fromEntries(
    selected.map((f) => [f.field, { from: f.freee, to: f.crm }])
  );
  // 組み立ては純粋関数に切り出してある（テストできる形にするため。src/lib/freee/payload.ts）
  const payload = buildFreeeUpdatePayload(selected);

  if (Object.keys(payload).length === 0) {
    return { data: null, error: "反映できる項目がありませんでした" };
  }

  const { error } = await pushPartnerToFreee({
    partnerId: params.partnerId,
    payload,
    changes,
    actorId: auth.userId,
  });
  if (error) return { data: null, error };

  revalidatePath("/admin/freee/sync");
  return { data: true, error: null };
}

/** 人が選んだ項目を freee の値で CRM へ取り込む */
export async function pullFieldsFromFreee(params: {
  partnerId: string;
  fields: string[];
}): Promise<ActionResult<true>> {
  const auth = await requireAdmin();
  if ("error" in auth) return { data: null, error: auth.error };
  if (!UUID_RE.test(params.partnerId)) {
    return { data: null, error: "不正なパラメータです" };
  }
  if (params.fields.length === 0) {
    return { data: null, error: "取り込む項目を選んでください" };
  }
  // DB 関数側でも弾いているが、無言で成功したように見せないため手前でも止める。
  // 以前は分岐が無く、選んでも何も起きないまま成功トーストが出ていた（2026-08-05）
  if (params.fields.includes("code")) {
    return { data: null, error: FREEE_CODE_NOT_IMPORTABLE };
  }
  if (params.fields.includes("default_title")) {
    return {
      data: null,
      error: "敬称は freee 側だけの項目です。CRM へは取り込めません",
    };
  }

  const { error } = await auth.supabase.rpc("apply_freee_values_to_crm", {
    p_partner_id: params.partnerId,
    p_fields: params.fields,
    p_actor: auth.userId,
  });

  if (error) {
    return { data: null, error: toUserMessage(error, { entityLabel: "事業者情報" }) };
  }

  revalidatePath("/admin/freee/sync");
  revalidatePath("/companies");
  return { data: true, error: null };
}

/**
 * freee の担当者名に近い連絡先の候補。
 *
 * **自動では結ばない。** freee は氏名を文字列 1 つで持ち、姓と名の切れ目が
 * 分からないうえ同名の別人もいるため、人が選ぶ（§26.12）。
 */
export async function getFreeeContactCandidates(
  partnerId: string
): Promise<ActionResult<FreeeContactCandidate[]>> {
  const auth = await requireAdmin();
  if ("error" in auth) return { data: null, error: auth.error };
  if (!UUID_RE.test(partnerId)) return { data: null, error: "不正なパラメータです" };

  const { data, error } = await auth.supabase.rpc("detect_freee_contact_candidates", {
    p_partner_id: partnerId,
  });

  if (error) {
    return { data: null, error: toUserMessage(error, { entityLabel: "連絡先" }) };
  }

  const rows = (data ?? []) as {
    contact_id: string;
    contact_name: string;
    reason: string;
    is_primary: boolean | null;
  }[];

  return {
    data: rows.map((r) => ({
      contactId: r.contact_id,
      contactName: r.contact_name,
      reason: r.reason as FreeeContactCandidate["reason"],
      isPrimary: r.is_primary === true,
    })),
    error: null,
  };
}

/** 候補から選んだ連絡先を、その事業者の主担当にする */
export async function setPrimaryContactFromFreee(params: {
  partnerId: string;
  contactId: string;
}): Promise<ActionResult<true>> {
  const auth = await requireAdmin();
  if ("error" in auth) return { data: null, error: auth.error };
  if (!UUID_RE.test(params.partnerId) || !UUID_RE.test(params.contactId)) {
    return { data: null, error: "不正なパラメータです" };
  }

  const { error } = await auth.supabase.rpc("set_company_primary_contact_from_freee", {
    p_partner_id: params.partnerId,
    p_contact_id: params.contactId,
    p_actor: auth.userId,
  });

  if (error) {
    return { data: null, error: toUserMessage(error, { entityLabel: "連絡先" }) };
  }

  revalidatePath("/admin/freee/sync");
  revalidatePath("/companies");
  return { data: true, error: null };
}

// ---------------------------------------------------------------------------
// CRM → freee の新規登録（2026-08-05 追加）
//
// **取引先コードを載せられるのはこの経路だけ**（更新 API は code を受け付けない。
// §26.8）。ここで作った相手は、以後コードで確実に突合できる。
// ---------------------------------------------------------------------------

/** freee と紐付いていない事業者情報。登録の対象を選ぶ一覧 */
export async function listCompaniesWithoutFreeePartner(params: {
  search?: string;
  page?: number;
  perPage?: number;
}): Promise<ActionResult<{ rows: FreeeUnlinkedCompany[]; total: number }>> {
  const auth = await requireAdmin();
  if ("error" in auth) return { data: null, error: auth.error };

  const perPage = params.perPage ?? DEFAULT_PAGE_SIZE;
  const page = Math.max(params.page ?? 1, 1);

  const { data, error } = await auth.supabase.rpc(
    "list_companies_without_freee_partner",
    {
      p_search: params.search?.trim() || undefined,
      p_limit: perPage,
      p_offset: (page - 1) * perPage,
    }
  );

  if (error) {
    return { data: null, error: toUserMessage(error, { entityLabel: "事業者情報" }) };
  }

  const rows = (data ?? []) as {
    company_id: string;
    company_code: string;
    name: string;
    name_kana: string | null;
    phone: string | null;
    invoice_registration_number: string | null;
    corporate_type: string | null;
    total_count: number;
  }[];

  return {
    data: {
      rows: rows.map((r) => ({
        companyId: r.company_id,
        companyCode: r.company_code,
        name: r.name,
        nameKana: r.name_kana,
        phone: r.phone,
        invoiceRegistrationNumber: r.invoice_registration_number,
        corporateType: r.corporate_type,
      })),
      // 件数は window 関数で全行に同じ値が入る。0 件なら行自体が無い
      total: Number(rows[0]?.total_count ?? 0),
    },
    error: null,
  };
}

/**
 * 登録前に見せる「freee 側の似た取引先」。
 *
 * **自動では紐付けない。** 候補があるのに新規登録すると二重になるため、
 * 画面で人が「新規登録」か「これと紐づける」を選ぶ。
 */
export async function getFreeeCandidatesForCompany(
  companyId: string
): Promise<ActionResult<FreeeCandidateForCompany[]>> {
  const auth = await requireAdmin();
  if ("error" in auth) return { data: null, error: auth.error };
  if (!UUID_RE.test(companyId)) return { data: null, error: "不正なパラメータです" };

  const { data, error } = await auth.supabase.rpc(
    "detect_freee_candidates_for_company",
    { p_company_id: companyId }
  );

  if (error) {
    return { data: null, error: toUserMessage(error, { entityLabel: "freee 取引先" }) };
  }

  const rows = (data ?? []) as {
    partner_id: string;
    freee_partner_id: number;
    partner_name: string;
    partner_code: string | null;
    reason: string;
    detail: {
      invoice_registration_number: string | null;
      phone: string | null;
      link_status: string;
    };
  }[];

  return {
    data: rows.map((r) => ({
      partnerId: r.partner_id,
      freeePartnerId: Number(r.freee_partner_id),
      partnerName: r.partner_name,
      partnerCode: r.partner_code,
      reason: r.reason as FreeeCandidateForCompany["reason"],
      invoiceRegistrationNumber: r.detail?.invoice_registration_number ?? null,
      phone: r.detail?.phone ?? null,
      linkStatus: (r.detail?.link_status ??
        "unlinked") as FreeeCandidateForCompany["linkStatus"],
    })),
    error: null,
  };
}

/**
 * 事業者情報を freee の取引先として新規登録し、紐付けまで済ませる。
 *
 * 送る値は**その場で引き直す**（画面が古い値を握っていても、実際に送るのは
 * 現在の CRM の値）。取引先コードは事業所設定が「使用する」のため必須で、
 * 空のまま送ると freee が 400「Codeを入力してください。」を返す。
 */
export async function registerCompanyToFreee(
  companyId: string
): Promise<ActionResult<{ partnerId: string }>> {
  const auth = await requireAdmin();
  if ("error" in auth) return { data: null, error: auth.error };
  if (!UUID_RE.test(companyId)) return { data: null, error: "不正なパラメータです" };

  const { data: source, error: sourceError } = await auth.supabase.rpc(
    "get_company_freee_source",
    { p_company_id: companyId }
  );
  if (sourceError) {
    return { data: null, error: toUserMessage(sourceError, { entityLabel: "事業者情報" }) };
  }
  if (!source) return { data: null, error: "事業者情報が見つかりません" };

  const payload = buildFreeeCreatePayload(source as unknown as FreeeCompanySource);
  if (!payload.name?.trim()) {
    return { data: null, error: "事業者名が空のため freee へ登録できません" };
  }
  if (!payload.code) {
    return {
      data: null,
      error: "事業者コードが取得できませんでした。時間をおいて再度お試しください",
    };
  }

  const { data, error } = await createFreeePartnerForCompany({
    companyId,
    payload,
    actorId: auth.userId,
  });
  if (error) return { data: null, error };

  revalidatePath("/admin/freee/register");
  revalidatePath("/admin/freee/partners");
  revalidatePath("/companies");
  return { data: data!, error: null };
}
