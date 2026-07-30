import Link from "next/link";
import { getCompany } from "@/actions/companies";
import { getCorporateTypes, getLeadSources, getCompanyStatuses } from "@/actions/masters";
import { getCrmUsers, getCurrentUser } from "@/actions/users";
import { CompanyEditForm } from "./company-edit-form";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CompanyEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!UUID_REGEX.test(id)) {
    return (
      <div style={{ padding: "2rem" }}>
        <p style={{ color: "var(--color-text-body)", marginBottom: "1rem" }}>
          不正なパラメータです
        </p>
        <Link
          href="/companies"
          className="hover:bg-[var(--color-bg-hover)]"
          style={{
            color: "var(--color-terra)",
            textDecoration: "none",
            padding: "0.125rem 0.375rem",
            margin: "-0.125rem -0.375rem",
            borderRadius: "var(--radius-sm)",
          }}
        >
          会社情報一覧へ戻る
        </Link>
      </div>
    );
  }

  const [companyResult, corporateTypesResult, leadSourcesResult, companyStatusesResult, usersResult, meResult] =
    await Promise.all([
      getCompany(id),
      getCorporateTypes(),
      getLeadSources(),
      getCompanyStatuses(),
      getCrmUsers(),
      getCurrentUser(),
    ]);

  const company = companyResult.data;
  if (!company) {
    return (
      <div style={{ padding: "2rem" }}>
        <p style={{ color: "var(--color-text-body)", marginBottom: "1rem" }}>
          会社情報が見つかりません
        </p>
        <Link
          href="/companies"
          className="hover:bg-[var(--color-bg-hover)]"
          style={{
            color: "var(--color-terra)",
            textDecoration: "none",
            padding: "0.125rem 0.375rem",
            margin: "-0.125rem -0.375rem",
            borderRadius: "var(--radius-sm)",
          }}
        >
          会社情報一覧へ戻る
        </Link>
      </div>
    );
  }

  type MasterItem = { id: string; name: string };
  type CompanyContact = {
    id: string;
    contact_code: string | null;
    last_name: string | null;
    first_name: string | null;
    deleted_at: string | null;
  };
  const linkedContacts = (((company as { contacts?: CompanyContact[] }).contacts ?? [])
    .filter((c) => c.deleted_at == null))
    .map((c) => ({
      value: c.id,
      label: `${c.last_name ?? ""} ${c.first_name ?? ""}`.trim()
        + (c.contact_code ? ` (${c.contact_code})` : ""),
    }));

  const masters = {
    corporateTypes: ((corporateTypesResult.data ?? []) as MasterItem[]).map((t) => ({
      value: t.id,
      label: t.name,
    })),
    leadSources: ((leadSourcesResult.data ?? []) as MasterItem[]).map((l) => ({
      value: l.id,
      label: l.name,
    })),
    companyStatuses: ((companyStatusesResult.data ?? []) as MasterItem[]).map((s) => ({
      value: s.id,
      label: s.name,
    })),
    owners: (usersResult.data ?? []).map((u) => ({ value: u.id, label: u.full_name })),
    linkedContacts,
  };

  const isAdmin = meResult.data?.role === "admin";

  return (
    <CompanyEditForm
      company={company}
      masters={masters}
      isAdmin={isAdmin}
    />
  );
}
