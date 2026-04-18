import { getProjectStatuses } from "@/actions/projects";
import { getCrmUsers } from "@/actions/users";
import { ProjectNewForm } from "./project-new-form";

export default async function NewProjectPage() {
  const [statusesRes, usersRes] = await Promise.all([
    getProjectStatuses(),
    getCrmUsers(),
  ]);
  return (
    <ProjectNewForm
      statuses={(statusesRes.data ?? []).map((s: any) => ({ value: s.id, label: s.name }))}
      owners={(usersRes.data ?? []).map((u) => ({ value: u.id, label: u.full_name }))}
    />
  );
}
