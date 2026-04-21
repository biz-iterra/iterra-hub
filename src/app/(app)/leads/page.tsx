import { getLeads } from "@/actions/leads";
import {
  getLeadStages,
  getLeadStatuses,
  getLeadTemperatures,
  getLeadCategories,
} from "@/actions/masters";
import { getCrmUsers, getCurrentUser } from "@/actions/users";
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
    getLeads({ perPage: 50, page: 1 }),
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
