import { getProjects, getProjectStatuses } from "@/actions/projects";
import { getCrmUsers, getCurrentUser } from "@/actions/users";
import { ProjectsView } from "./projects-view";

export default async function ProjectsPage() {
  const [projectsResult, statusesResult, usersResult, meResult] = await Promise.all([
    getProjects(),
    getProjectStatuses(),
    getCrmUsers(),
    getCurrentUser(),
  ]);
  const role = meResult.data?.role ?? null;
  const isManagerOrAbove = role === "manager" || role === "admin";
  return (
    <ProjectsView
      initialData={projectsResult.data}
      statuses={statusesResult.data ?? []}
      users={usersResult.data ?? []}
      isManagerOrAbove={isManagerOrAbove}
    />
  );
}
