import { getProjects, getProjectStatuses } from "@/actions/projects";
import { ProjectsView } from "./projects-view";

export default async function ProjectsPage() {
  const [projectsResult, statusesResult] = await Promise.all([
    getProjects(),
    getProjectStatuses(),
  ]);
  return (
    <ProjectsView
      initialData={projectsResult.data}
      statuses={statusesResult.data ?? []}
    />
  );
}
