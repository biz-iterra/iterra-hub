"use server";

/**
 * freee 会計連携の Server Action。
 *
 * **freee 側へは書き込まない**（読み取り専用の同期）。
 * すべて admin 限定。会計データに繋がる操作のため範囲を絞る。
 */

import { revalidatePath } from "next/cache";
import { toUserMessage } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/server";
import { buildIlikePattern } from "@/lib/search-query";
import { isFreeeConfigured } from "@/lib/freee/config";
import { syncFreeeConnection } from "@/lib/freee/sync";
import type {
  FreeeConnectionStatus,
  FreeePartnerCandidate,
  FreeePartnerListItem,
  FreeeSyncSummary,
} from "@/types/relations";

type ActionResult<T> = { data: T | null; error: string | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
