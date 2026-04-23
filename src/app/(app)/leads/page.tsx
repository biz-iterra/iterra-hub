import { getLeads } from "@/actions/leads";
import {
  getLeadStages,
  getLeadStatuses,
  getLeadTemperatures,
  getLeadCategories,
} from "@/actions/masters";
import { getCrmUsers, getCurrentUser } from "@/actions/users";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import { LeadsView } from "./leads-view";

export default async function LeadsPage() {
  const [
    leadsResult,
    stagesResult,
    statusesResult,
    temperaturesResult,
    categoriesResult,
    usersResult,
    currentUserResult,
  ] = await Promise.all([
    getLeads({ perPage: DEFAULT_PAGE_SIZE, page: 1 }),
    getLeadStages(),
    getLeadStatuses(),
    getLeadTemperatures(),
    getLeadCategories(),
    getCrmUsers(),
    getCurrentUser(),
  ]);

  return (
    <LeadsView
      initialData={leadsResult.data}
      stages={stagesResult.data ?? []}
      statuses={statusesResult.data ?? []}
      temperatures={temperaturesResult.data ?? []}
      categories={categoriesResult.data ?? []}
      users={usersResult.data ?? []}
      currentUserRole={currentUserResult.data?.role ?? "member"}
    />
  );
}
