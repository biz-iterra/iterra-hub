import {
  getAccountTypes,
  getAccountStatuses,
  getLeadSources,
} from "@/actions/masters";
import { getCompanies } from "@/actions/companies";
import { getCrmUsers, getCurrentUser } from "@/actions/users";
import { AccountNewForm } from "./account-new-form";

export default async function AccountNewPage() {
  const [
    accountTypesResult,
    accountStatusesResult,
    leadSourcesResult,
    companiesResult,
    usersResult,
  ] = await Promise.all([
    getAccountTypes(),
    getAccountStatuses(),
    getLeadSources(),
    getCompanies({ perPage: 1000 }),
    getCrmUsers(),
  ]);

  type MasterItem = { id: string; name: string };
  type CompanyItem = { id: string; name: string };

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
    companies: ((companiesResult.data?.rows ?? []) as CompanyItem[]).map(
      (c) => ({ value: c.id, label: c.name })
    ),
    owners: (usersResult.data ?? []).map((u) => ({
      value: u.id,
      label: u.full_name,
    })),
  };

  const me = await getCurrentUser();

  return (
    <AccountNewForm masters={masters} defaultOwnerUserId={me.data?.id} />
  );
}
