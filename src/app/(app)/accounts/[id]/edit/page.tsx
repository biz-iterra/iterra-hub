import Link from "next/link";
import { getAccount } from "@/actions/accounts";
import {
  getAccountTypes,
  getAccountStatuses,
  getLeadSources,
} from "@/actions/masters";
import { getCompanies } from "@/actions/companies";
import { getCrmUsers, getCurrentUser } from "@/actions/users";
import { AccountEditForm } from "./account-edit-form";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AccountEditPage({
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
          href="/accounts"
          className="hover:bg-[var(--color-bg-hover)]"
          style={{
            color: "var(--color-terra)",
            textDecoration: "none",
            padding: "0.125rem 0.375rem",
            margin: "-0.125rem -0.375rem",
            borderRadius: "var(--radius-sm)",
          }}
        >
          アカウント一覧へ戻る
        </Link>
      </div>
    );
  }

  const [
    accountResult,
    accountTypesResult,
    accountStatusesResult,
    leadSourcesResult,
    companiesResult,
    usersResult,
    meResult,
  ] = await Promise.all([
    getAccount(id),
    getAccountTypes(),
    getAccountStatuses(),
    getLeadSources(),
    getCompanies({ perPage: 1000 }),
    getCrmUsers(),
    getCurrentUser(),
  ]);

  const account = accountResult.data as {
    id: string;
    name: string;
    company_id: string | null;
    account_type_id: string | null;
    account_status_id: string | null;
    lead_source_id: string | null;
    owner_user_id: string | null;
    description: string | null;
  } | null;

  if (!account) {
    return (
      <div style={{ padding: "2rem" }}>
        <p style={{ color: "var(--color-text-body)", marginBottom: "1rem" }}>
          アカウントが見つかりません
        </p>
        <Link
          href="/accounts"
          className="hover:bg-[var(--color-bg-hover)]"
          style={{
            color: "var(--color-terra)",
            textDecoration: "none",
            padding: "0.125rem 0.375rem",
            margin: "-0.125rem -0.375rem",
            borderRadius: "var(--radius-sm)",
          }}
        >
          アカウント一覧へ戻る
        </Link>
      </div>
    );
  }

  type MasterItem = { id: string; name: string };
  const masters = {
    accountTypes: ((accountTypesResult.data ?? []) as MasterItem[]).map((t) => ({
      value: t.id,
      label: t.name,
    })),
    accountStatuses: ((accountStatusesResult.data ?? []) as MasterItem[]).map(
      (s) => ({ value: s.id, label: s.name })
    ),
    leadSources: ((leadSourcesResult.data ?? []) as MasterItem[]).map((l) => ({
      value: l.id,
      label: l.name,
    })),
    companies: ((companiesResult.data?.items ?? []) as { id: string; name: string }[]).map(
      (c) => ({ value: c.id, label: c.name })
    ),
    owners: (usersResult.data ?? []).map((u) => ({
      value: u.id,
      label: u.full_name,
    })),
  };

  const isAdmin = meResult.data?.role === "admin";

  return (
    <AccountEditForm account={account} masters={masters} isAdmin={isAdmin} />
  );
}
