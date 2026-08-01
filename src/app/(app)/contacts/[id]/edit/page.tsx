import Link from "next/link";
import { getContact } from "@/actions/contacts";
import { getContactStatuses, getLeadSources } from "@/actions/masters";
import { getCompanies } from "@/actions/companies";
import { buildCompanyOptions } from "@/lib/company-options";
import { getCrmUsers, getCurrentUser } from "@/actions/users";
import { ContactEditForm } from "./contact-edit-form";
import { getEntityAddresses } from "@/actions/entity-addresses";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ContactRecord = {
  id: string;
  last_name: string | null;
  middle_name: string | null;
  first_name: string | null;
  last_name_kana: string | null;
  middle_name_kana: string | null;
  first_name_kana: string | null;
  contact_status_id: string | null;
  contact_type: string | null;
  company_id: string | null;
  department: string | null;
  job_title: string | null;
  birth_date: string | null;
  blood_type: "A" | "B" | "AB" | "O" | null;
  lead_source_id: string | null;
  line_user_id: string | null;
  owner_user_id: string | null;
  internal_memo: string | null;
};

export default async function ContactEditPage({
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
          href="/contacts"
          className="hover:bg-[var(--color-bg-hover)]"
          style={{
            color: "var(--color-terra)",
            textDecoration: "none",
            padding: "0.125rem 0.375rem",
            margin: "-0.125rem -0.375rem",
            borderRadius: "var(--radius-sm)",
          }}
        >
          連絡先一覧へ戻る
        </Link>
      </div>
    );
  }

  const [
    contactResult,
    contactStatusesResult,
    leadSourcesResult,
    companiesResult,
    usersResult,
    meResult,
    addressesResult,
  ] = await Promise.all([
    getContact(id),
    getContactStatuses(),
    getLeadSources(),
    getCompanies({ perPage: 1000 }),
    getCrmUsers(),
    getCurrentUser(),
    getEntityAddresses("contact", id),
  ]);

  const contact = contactResult.data as ContactRecord | null;
  if (!contact) {
    return (
      <div style={{ padding: "2rem" }}>
        <p style={{ color: "var(--color-text-body)", marginBottom: "1rem" }}>
          連絡先が見つかりません
        </p>
        <Link
          href="/contacts"
          className="hover:bg-[var(--color-bg-hover)]"
          style={{
            color: "var(--color-terra)",
            textDecoration: "none",
            padding: "0.125rem 0.375rem",
            margin: "-0.125rem -0.375rem",
            borderRadius: "var(--radius-sm)",
          }}
        >
          連絡先一覧へ戻る
        </Link>
      </div>
    );
  }

  type MasterItem = { id: string; name: string };
  type CompanyItem = { id: string; name: string };

  const masters = {
    contactStatuses: ((contactStatusesResult.data ?? []) as MasterItem[]).map((s) => ({
      value: s.id,
      label: s.name,
    })),
    leadSources: ((leadSourcesResult.data ?? []) as MasterItem[]).map((l) => ({
      value: l.id,
      label: l.name,
    })),
    companies: buildCompanyOptions(
      (companiesResult.data?.rows ?? []) as CompanyItem[],
      contactResult.data?.company ?? null
    ),
    owners: (usersResult.data ?? []).map((u) => ({ value: u.id, label: u.full_name })),
  };

  const isAdmin = meResult.data?.role === "admin";

  // 連絡手段は本体とは別に増減させるため、そのまま渡す
  const detail = contactResult.data;
  const emails = (detail?.contact_emails ?? []).map((e) => ({
    id: e.id,
    value: e.email,
    label: e.label,
    is_primary: e.is_primary,
  }));
  const phones = (detail?.contact_phones ?? []).map((p) => ({
    id: p.id,
    value: p.phone,
    label: p.label,
    is_primary: p.is_primary,
  }));

  return (
    <ContactEditForm
      contact={contact}
      masters={masters}
      isAdmin={isAdmin}
      emails={emails}
      phones={phones}
      addresses={addressesResult.data ?? []}
    />
  );
}
