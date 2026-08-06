"use server";

import { revalidatePath } from "next/cache";
import { toUserMessage } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/server";
import { UUID_REGEX } from "@/lib/validators/common";
import { companyIntegrationProfileSchema } from "@/lib/validators/companies";

/**
 * 連携プロファイル（事業者情報 × 連携先）。
 *
 * **値ではなくレコードを選ぶ。** CRM が正本のままで、CRM 側を直せば連携値も
 * 追随する（`docs/database-design.md` §26.10.2）。値を持たせると二重管理になり、
 * どちらが正かを毎回判断することになる。
 *
 * 未選択（null）は「既定に従う」。既定は主担当・主メール・主住所・主口座・代表電話。
 * 選べる範囲は DB のトリガーでも縛ってある（画面から任意の ID を送られても通らない）。
 */

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

export type IntegrationProfileOption = { value: string; label: string };

export type CompanyIntegrationProfileView = {
  /** 保存されている選択。未保存なら全 null */
  profile: {
    contact_id: string | null;
    contact_email_id: string | null;
    entity_address_id: string | null;
    phone_entity_address_id: string | null;
    financial_info_id: string | null;
  };
  /** いま実際に連携先へ渡る値（既定へのフォールバック込み） */
  resolved: {
    contact_name: string | null;
    contact_email: string | null;
    phone: string | null;
    prefecture: string | null;
    street: string | null;
    bank_name: string | null;
    account_number: string | null;
  };
  options: {
    contacts: IntegrationProfileOption[];
    emails: IntegrationProfileOption[];
    addresses: IntegrationProfileOption[];
    financialInfos: IntegrationProfileOption[];
  };
};

const INTEGRATIONS = ["freee"] as const;

function isIntegration(value: string): boolean {
  return (INTEGRATIONS as readonly string[]).includes(value);
}

const EMPTY_PROFILE = {
  contact_id: null,
  contact_email_id: null,
  entity_address_id: null,
  phone_entity_address_id: null,
  financial_info_id: null,
};

export async function getCompanyIntegrationProfile(
  companyId: string,
  integration: string
): Promise<ActionResult<CompanyIntegrationProfileView>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (!UUID_REGEX.test(companyId)) return { data: null, error: "不正なパラメータです" };
  if (!isIntegration(integration)) return { data: null, error: "対応していない連携先です" };

  const [profileRes, resolvedRes, affiliations, addresses, financials, company] =
    await Promise.all([
      supabase
        .from("company_integration_profiles")
        .select(
          "contact_id, contact_email_id, entity_address_id, phone_entity_address_id, financial_info_id"
        )
        .eq("company_id", companyId)
        .eq("integration", integration)
        .maybeSingle(),
      supabase.rpc("resolve_company_integration_values", {
        p_company_id: companyId,
        p_integration: integration,
      }),
      supabase
        .from("company_contact_affiliations")
        .select("contact_id")
        .eq("company_id", companyId),
      supabase
        .from("entity_addresses")
        .select("id, phone, address:addresses(prefecture, city, address_line1)")
        .eq("company_id", companyId)
        .order("is_primary", { ascending: false }),
      supabase
        .from("financial_info")
        .select("id, bank_name, branch_name, account_number")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("is_primary", { ascending: false }),
      supabase.from("companies").select("primary_contact_id").eq("id", companyId).maybeSingle(),
    ]);

  if (profileRes.error) {
    return {
      data: null,
      error: toUserMessage(profileRes.error, { entityLabel: "連携プロファイル" }),
    };
  }

  const profile = profileRes.data ?? EMPTY_PROFILE;

  // 担当者の候補は「その事業者に関わる連絡先」（主たる所属 + 兼務）。
  // ビューは ID しか返さないので、氏名はここで引く
  const contactIds = (affiliations.data ?? []).map((a) => a.contact_id).filter(Boolean);
  const contactRows = contactIds.length
    ? (
        await supabase
          .from("contacts")
          .select("id, last_name, first_name")
          .in("id", contactIds as string[])
          .is("deleted_at", null)
      ).data ?? []
    : [];

  // メールの候補は「いま担当者になっている人」のもの。
  // **担当者を選び直したら候補も変わる**ので、保存のたびに読み直す
  const effectiveContactId = profile.contact_id ?? company.data?.primary_contact_id ?? null;
  const emailRows = effectiveContactId
    ? (
        await supabase
          .from("contact_emails")
          .select("id, email, is_primary")
          .eq("contact_id", effectiveContactId)
          .order("is_primary", { ascending: false })
      ).data ?? []
    : [];

  const resolvedRow = (
    resolvedRes.data as CompanyIntegrationProfileView["resolved"][] | null
  )?.[0];

  return {
    data: {
      profile,
      resolved: {
        contact_name: resolvedRow?.contact_name ?? null,
        contact_email: resolvedRow?.contact_email ?? null,
        phone: resolvedRow?.phone ?? null,
        prefecture: resolvedRow?.prefecture ?? null,
        street: resolvedRow?.street ?? null,
        bank_name: resolvedRow?.bank_name ?? null,
        account_number: resolvedRow?.account_number ?? null,
      },
      options: {
        contacts: contactRows.map((c) => ({
          value: c.id,
          label: [c.last_name, c.first_name].filter(Boolean).join(" "),
        })),
        emails: emailRows.map((e) => ({
          value: e.id,
          label: e.is_primary ? e.email + "（主）" : e.email,
        })),
        addresses: (addresses.data ?? []).map((a) => {
          const addr = a.address as {
            prefecture: string | null;
            city: string | null;
            address_line1: string | null;
          } | null;
          const text = [addr?.prefecture, addr?.city, addr?.address_line1]
            .filter(Boolean)
            .join("");
          return {
            value: a.id,
            label: [text || "（住所未入力）", a.phone ? "TEL " + a.phone : null]
              .filter(Boolean)
              .join(" / "),
          };
        }),
        financialInfos: (financials.data ?? []).map((f) => ({
          value: f.id,
          label: [f.bank_name, f.branch_name, f.account_number].filter(Boolean).join(" "),
        })),
      },
    },
    error: null,
  };
}

export async function saveCompanyIntegrationProfile(params: {
  companyId: string;
  integration: string;
  contactId: string | null;
  contactEmailId: string | null;
  entityAddressId: string | null;
  phoneEntityAddressId: string | null;
  financialInfoId: string | null;
}): Promise<ActionResult<null>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  // freee 連携そのものが admin 限定なので、その設定も admin に揃える
  if (role !== "admin") return { data: null, error: "管理者権限が必要です" };

  const parsed = companyIntegrationProfileSchema.safeParse({
    company_id: params.companyId,
    integration: params.integration,
    contact_id: params.contactId,
    contact_email_id: params.contactEmailId,
    entity_address_id: params.entityAddressId,
    phone_entity_address_id: params.phoneEntityAddressId,
    financial_info_id: params.financialInfoId,
  });
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0]?.message ?? "入力が正しくありません" };
  }

  const { error } = await supabase.from("company_integration_profiles").upsert(
    {
      company_id: parsed.data.company_id,
      integration: parsed.data.integration,
      contact_id: parsed.data.contact_id ?? null,
      contact_email_id: parsed.data.contact_email_id ?? null,
      entity_address_id: parsed.data.entity_address_id ?? null,
      phone_entity_address_id: parsed.data.phone_entity_address_id ?? null,
      financial_info_id: parsed.data.financial_info_id ?? null,
      last_updated_by: user.id,
    },
    { onConflict: "company_id,integration" }
  );

  if (error) {
    return {
      data: null,
      error: toUserMessage(error, { entityLabel: "連携プロファイル", operation: "update" }),
    };
  }

  revalidatePath(`/companies/${parsed.data.company_id}`);
  revalidatePath("/admin/freee/sync");
  return { data: null, error: null };
}
