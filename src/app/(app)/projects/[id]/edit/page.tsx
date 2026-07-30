import { getProject, getProjectStatuses } from "@/actions/projects";
import { getCrmUsers, getCurrentUser } from "@/actions/users";
import Link from "next/link";
import { ProjectEditForm } from "./project-edit-form";
import { ProjectMembersSection } from "../project-members-section";
import { ProjectDealsSection } from "../project-deals-section";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!UUID_REGEX.test(id)) {
    return (
      <div style={{ padding: "2rem" }}>
        <p style={{ color: "var(--color-text-body)", marginBottom: "1rem" }}>不正なパラメータです</p>
        <Link href="/projects" style={{ color: "var(--color-terra)" }}>
          プロジェクト一覧へ戻る
        </Link>
      </div>
    );
  }

  const [projectRes, statusesRes, usersRes, currentUserRes] = await Promise.all([
    getProject(id),
    getProjectStatuses(),
    getCrmUsers(),
    getCurrentUser(),
  ]);

  if (projectRes.error || !projectRes.data) {
    return (
      <div style={{ padding: "2rem" }}>
        <p style={{ color: "var(--color-text-body)", marginBottom: "1rem" }}>
          プロジェクトが見つかりません
        </p>
        <Link href="/projects" style={{ color: "var(--color-terra)" }}>
          プロジェクト一覧へ戻る
        </Link>
      </div>
    );
  }

  const project = projectRes.data;
  const members = project.project_members ?? [];
  const dealProjects = (project.deal_projects ?? []).filter(
    (dp) => dp.deal && dp.deal.deleted_at === null
  );

  return (
    <>
      <ProjectEditForm
        project={project}
        statuses={(statusesRes.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
        owners={(usersRes.data ?? []).map((u) => ({ value: u.id, label: u.full_name }))}
        isAdmin={currentUserRes.data?.role === "admin"}
      />
      <div
        style={{
          padding: "0 1.5rem 1.5rem",
          maxWidth: 960,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "1.5rem",
        }}
      >
        <ProjectMembersSection projectId={project.id} initialMembers={members} />
        <ProjectDealsSection projectId={project.id} initialDealProjects={dealProjects} />
      </div>
    </>
  );
}
