import { getCompanies } from "@/actions/companies";
import { getCompanyStatuses, getCorporateTypes } from "@/actions/masters";
import { getCrmUsers } from "@/actions/users";
import { CompaniesView } from "./companies-view";

export default async function CompaniesPage() {
  const [companiesResult, statusesResult, corporateTypesResult, usersResult] =
    await Promise.all([
      getCompanies({ perPage: 50, page: 1 }),
      getCompanyStatuses(),
      getCorporateTypes(),
      getCrmUsers(),
    ]);

  return (
    <CompaniesView
      initialData={companiesResult.data}
      statuses={statusesResult.data ?? []}
      corporateTypes={corporateTypesResult.data ?? []}
      users={usersResult.data ?? []}
    />
  );
}
