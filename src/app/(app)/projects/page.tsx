import { getProjects, getProjectStatuses } from "@/actions/projects";
import { getCrmUsers } from "@/actions/users";
import { ProjectsView } from "./projects-view";

export default async function ProjectsPage() {
  const [projectsResult, statusesResult, usersResult] = await Promise.all([
    getProjects(),
    getProjectStatuses(),
    getCrmUsers(),
  ]);
  return (
    <ProjectsView
      initialData={projectsResult.data}
      statuses={statusesResult.data ?? []}
      users={usersResult.data ?? []}
    />
  );
}
