import { getContactStatuses, getLeadSources } from "@/actions/masters";
import { getCompanies } from "@/actions/companies";
import { getCrmUsers } from "@/actions/users";
import { ContactNewForm } from "./contact-new-form";

export default async function ContactNewPage() {
  const [
    contactStatusesResult,
    leadSourcesResult,
    companiesResult,
    usersResult,
  ] = await Promise.all([
    getContactStatuses(),
    getLeadSources(),
    getCompanies({ perPage: 1000 }),
    getCrmUsers(),
  ]);

  type MasterItem = { id: string; name: string };
  type CompanyItem = { id: string; name: string };

  const masters = {
    contactStatuses: ((contactStatusesResult.data ?? []) as MasterItem[]).map(
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

  return <ContactNewForm masters={masters} />;
}
