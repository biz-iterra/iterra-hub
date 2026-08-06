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
    /**
     * 連絡先ごとのメール候補。
     *
     * **担当者を選び直したその場で候補が変わる**必要がある。1 人分だけ渡すと、
     * 担当者を変えたのに前の人のメールが並び、選ぶと DB のトリガーに弾かれる。
     */
    emailsByContact: Record<string, IntegrationProfileOption[]>;
    addresses: IntegrationProfileOption[];
    financialInfos: IntegrationProfileOption[];
  };
  /** 主担当。プロファイルで別の人を指定していると食い違うので、画面で知らせる */
  primaryContactId: string | null;
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

  // **関わる連絡先全員分のメールを渡す。** 担当者を選び直したその場で候補を
  // 切り替えられないと、前の人のメールを選んでしまい DB のトリガーに弾かれる
  const emailRows = contactIds.length
    ? (
        await supabase
          .from("contact_emails")
          .select("id, contact_id, email, is_primary")
          .in("contact_id", contactIds as string[])
          .order("is_primary", { ascending: false })
      ).data ?? []
    : [];
  const emailsByContact: Record<string, IntegrationProfileOption[]> = {};
  for (const e of emailRows) {
    (emailsByContact[e.contact_id] ??= []).push({
      value: e.id,
      label: e.is_primary ? e.email + "（主）" : e.email,
    });
  }

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
        emailsByContact,
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
      primaryContactId: company.data?.primary_contact_id ?? null,
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

/**
 * 突き合わせ対象外にする／戻す。
 *
 * **freee にしか居ない担当者のように、どちらの向きにも直せない項目がある**
 * （候補 0 件・取り込みは拒否・送ると freee 側が消える。T-0058）。
 * 出し続けても人が消せず、本当に直すべき差分が埋もれるので外せるようにする。
 *
 * **消すのは差分の表示だけ。** 値は何も変えないし、連携先へ何も送らない。
 */
export async function toggleIgnoredIntegrationField(params: {
  companyId: string;
  integration: string;
  field: string;
  ignored: boolean;
}): Promise<ActionResult<null>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (role !== "admin") return { data: null, error: "管理者権限が必要です" };
  if (!UUID_REGEX.test(params.companyId)) return { data: null, error: "不正なパラメータです" };
  if (!isIntegration(params.integration)) {
    return { data: null, error: "対応していない連携先です" };
  }
  if (!/^[a-z_]{1,40}$/.test(params.field)) {
    return { data: null, error: "不正な項目名です" };
  }

  const { data: current } = await supabase
    .from("company_integration_profiles")
    .select("ignored_fields")
    .eq("company_id", params.companyId)
    .eq("integration", params.integration)
    .maybeSingle();

  const before: string[] = current?.ignored_fields ?? [];
  const after = params.ignored
    ? Array.from(new Set([...before, params.field]))
    : before.filter((f) => f !== params.field);

  const { error } = await supabase.from("company_integration_profiles").upsert(
    {
      company_id: params.companyId,
      integration: params.integration,
      ignored_fields: after,
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

  revalidatePath("/admin/freee/sync");
  revalidatePath(`/companies/${params.companyId}`);
  return { data: null, error: null };
}

/**
 * 差分画面から担当者メールだけを差し替える。
 *
 * 事業者情報の詳細まで移動しなくても、突合の流れの中で直せるようにする（T-0061）。
 * **他の列は触らない**（upsert で全列を送ると、既定に戻したつもりの無い列まで消える）。
 */
export async function setIntegrationProfileEmail(params: {
  companyId: string;
  integration: string;
  contactEmailId: string | null;
}): Promise<ActionResult<null>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (role !== "admin") return { data: null, error: "管理者権限が必要です" };
  if (!UUID_REGEX.test(params.companyId)) return { data: null, error: "不正なパラメータです" };
  if (!isIntegration(params.integration)) {
    return { data: null, error: "対応していない連携先です" };
  }
  if (params.contactEmailId !== null && !UUID_REGEX.test(params.contactEmailId)) {
    return { data: null, error: "不正なパラメータです" };
  }

  const { data: exists } = await supabase
    .from("company_integration_profiles")
    .select("id")
    .eq("company_id", params.companyId)
    .eq("integration", params.integration)
    .maybeSingle();

  const { error } = exists
    ? await supabase
        .from("company_integration_profiles")
        .update({ contact_email_id: params.contactEmailId, last_updated_by: user.id })
        .eq("id", exists.id)
    : await supabase.from("company_integration_profiles").insert({
        company_id: params.companyId,
        integration: params.integration,
        contact_email_id: params.contactEmailId,
        created_by: user.id,
        last_updated_by: user.id,
      });

  if (error) {
    return {
      data: null,
      error: toUserMessage(error, { entityLabel: "連携プロファイル", operation: "update" }),
    };
  }

  revalidatePath("/admin/freee/sync");
  revalidatePath(`/companies/${params.companyId}`);
  return { data: null, error: null };
}

/**
 * 差分画面で使う補助情報。
 * 事業者ごとの「対象外にした項目」と「担当者が持つメールの候補」。
 */
export async function getIntegrationProfileHints(
  companyIds: string[],
  integration: string
): Promise<
  ActionResult<
    Record<
      string,
      { ignoredFields: string[]; emails: IntegrationProfileOption[]; selectedEmailId: string | null }
    >
  >
> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (role !== "admin") return { data: null, error: "管理者権限が必要です" };
  if (!isIntegration(integration)) return { data: null, error: "対応していない連携先です" };

  const ids = companyIds.filter((id) => UUID_REGEX.test(id));
  if (ids.length === 0) return { data: {}, error: null };

  const [profiles, companies] = await Promise.all([
    supabase
      .from("company_integration_profiles")
      .select("company_id, ignored_fields, contact_id, contact_email_id")
      .in("company_id", ids)
      .eq("integration", integration),
    supabase.from("companies").select("id, primary_contact_id").in("id", ids),
  ]);

  const profileByCompany = new Map(
    (profiles.data ?? []).map((p) => [p.company_id, p])
  );
  // 担当者は「プロファイルの指定 → 主担当」の順（resolve_company_integration_values と同じ）
  const contactByCompany = new Map<string, string>();
  for (const c of companies.data ?? []) {
    const contactId = profileByCompany.get(c.id)?.contact_id ?? c.primary_contact_id;
    if (contactId) contactByCompany.set(c.id, contactId);
  }

  const contactIds = Array.from(new Set(contactByCompany.values()));
  const emailRows = contactIds.length
    ? (
        await supabase
          .from("contact_emails")
          .select("id, contact_id, email, is_primary")
          .in("contact_id", contactIds)
          .order("is_primary", { ascending: false })
      ).data ?? []
    : [];

  const result: Record<
    string,
    { ignoredFields: string[]; emails: IntegrationProfileOption[]; selectedEmailId: string | null }
  > = {};
  for (const id of ids) {
    const contactId = contactByCompany.get(id);
    result[id] = {
      ignoredFields: profileByCompany.get(id)?.ignored_fields ?? [],
      emails: emailRows
        .filter((e) => e.contact_id === contactId)
        .map((e) => ({ value: e.id, label: e.is_primary ? e.email + "（主）" : e.email })),
      selectedEmailId: profileByCompany.get(id)?.contact_email_id ?? null,
    };
  }
  return { data: result, error: null };
}

/**
 * 対象外にした項目の一覧。
 *
 * **差分から消えた項目は差分一覧からは戻せない**（その行が出てこないため）。
 * 戻す入口を別に用意しておかないと、一度外したら二度と戻せなくなる。
 */
export async function listIgnoredIntegrationFields(
  integration: string
): Promise<ActionResult<{ companyId: string; companyName: string; fields: string[] }[]>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (role !== "admin") return { data: null, error: "管理者権限が必要です" };
  if (!isIntegration(integration)) return { data: null, error: "対応していない連携先です" };

  const { data, error } = await supabase
    .from("company_integration_profiles")
    .select("company_id, ignored_fields, company:companies(name)")
    .eq("integration", integration);

  if (error) {
    return { data: null, error: toUserMessage(error, { entityLabel: "連携プロファイル" }) };
  }

  return {
    data: (data ?? [])
      .filter((r) => (r.ignored_fields ?? []).length > 0)
      .map((r) => ({
        companyId: r.company_id,
        companyName: (r.company as { name: string } | null)?.name ?? "（不明な事業者情報）",
        fields: r.ignored_fields ?? [],
      })),
    error: null,
  };
}
