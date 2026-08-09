import { getCorporateTypes, getLeadSources, getCompanyStatuses } from "@/actions/masters";
import { getCrmUsers, getCurrentUser } from "@/actions/users";
import { CompanyNewForm } from "./company-new-form";

export default async function CompanyNewPage() {
  const [corporateTypesResult, leadSourcesResult, companyStatusesResult, usersResult] = await Promise.all([
    getCorporateTypes(),
    getLeadSources(),
    getCompanyStatuses(),
    getCrmUsers(),
  ]);

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
    owners: (usersResult.data ?? []).map((u) => ({
      value: u.id,
      label: u.full_name,
    })),
  };

  const me = await getCurrentUser();

  return (
    <CompanyNewForm masters={masters} defaultOwnerUserId={me.data?.id} />
  );
}
