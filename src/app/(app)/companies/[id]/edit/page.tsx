import Link from "next/link";
import { getCompany } from "@/actions/companies";
import { getCorporateTypes, getLeadSources, getCompanyStatuses } from "@/actions/masters";
import { getCurrentUser } from "@/actions/users";
import { CompanyEditForm } from "./company-edit-form";
import { getEntityAddresses } from "@/actions/entity-addresses";

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
          事業者情報一覧へ戻る
        </Link>
      </div>
    );
  }

  const [companyResult, corporateTypesResult, leadSourcesResult, companyStatusesResult, meResult, addressesResult] =
    await Promise.all([
      getCompany(id),
      getCorporateTypes(),
      getLeadSources(),
      getCompanyStatuses(),
      getCurrentUser(),
      getEntityAddresses("company", id),
    ]);

  const company = companyResult.data;
  if (!company) {
    return (
      <div style={{ padding: "2rem" }}>
        <p style={{ color: "var(--color-text-body)", marginBottom: "1rem" }}>
          事業者情報が見つかりません
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
          事業者情報一覧へ戻る
        </Link>
      </div>
    );
  }

  type MasterItem = { id: string; name: string };
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
  };

  const isAdmin = meResult.data?.role === "admin";

  return (
    <CompanyEditForm
      company={company}
      masters={masters}
      isAdmin={isAdmin}
      domains={company.company_domains ?? []}
      addresses={addressesResult.data ?? []}
    />
  );
}
