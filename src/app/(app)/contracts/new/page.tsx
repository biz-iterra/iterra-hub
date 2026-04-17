import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getContractTypes } from "@/actions/masters";
import { getDeals } from "@/actions/deals";
import { getCompanies } from "@/actions/companies";
import { getContacts } from "@/actions/contacts";
import { getCrmUsers, getCurrentUser } from "@/actions/users";
import { ContractNewForm } from "./contract-new-form";

export default async function ContractNewPage() {
  const meResult = await getCurrentUser();
  const role = meResult.data?.role ?? null;
  const isManagerOrAbove = role === "manager" || role === "admin";

  if (!isManagerOrAbove) {
    return (
      <div style={{ padding: "2rem" }}>
        <p style={{ color: "var(--color-text-body)", marginBottom: "1rem" }}>
          作成権限がありません
        </p>
        <Link
          href="/contracts"
          className="hover:bg-[var(--color-bg-hover)]"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
            color: "var(--color-terra)",
            textDecoration: "none",
            padding: "0.125rem 0.375rem",
            margin: "-0.125rem -0.375rem",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <ArrowLeft size={14} />
          契約一覧へ戻る
        </Link>
      </div>
    );
  }

  const [
    contractTypesResult,
    dealsResult,
    companiesResult,
    contactsResult,
    usersResult,
  ] = await Promise.all([
    getContractTypes(),
    getDeals({ perPage: 1000 }),
    getCompanies({ perPage: 1000 }),
    getContacts({ perPage: 1000 }),
    getCrmUsers(),
  ]);

  type MasterItem = { id: string; name: string };
  type DealItem = { id: string; deal_code: string; name: string };
  type CompanyItem = { id: string; name: string };
  type ContactItem = {
    id: string;
    last_name: string | null;
    first_name: string | null;
  };

  const contractTypes = ((contractTypesResult.data ?? []) as MasterItem[]).map(
    (t) => ({ value: t.id, label: t.name })
  );
  const deals = ((dealsResult.data?.items ?? []) as DealItem[]).map((d) => ({
    value: d.id,
    label: `${d.deal_code} ${d.name}`,
  }));
  const companies = ((companiesResult.data?.items ?? []) as CompanyItem[]).map(
    (c) => ({ value: c.id, label: c.name })
  );
  const contacts = ((contactsResult.data?.rows ?? []) as ContactItem[]).map(
    (c) => ({
      value: c.id,
      label: `${c.last_name ?? ""} ${c.first_name ?? ""}`.trim() || "(無名)",
    })
  );
  const users = (usersResult.data ?? []).map((u) => ({
    value: u.id,
    label: u.full_name,
  }));

  return (
    <ContractNewForm
      masters={{
        contractTypes,
        deals,
        companies,
        contacts,
        users,
      }}
    />
  );
}
