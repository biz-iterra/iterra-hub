import { getProject, getProjectStatuses } from "@/actions/projects";
import { getCurrentUser } from "@/actions/users";
import Link from "next/link";
import { ProjectEditForm } from "./project-edit-form";

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

  const [projectRes, statusesRes, currentUserRes] = await Promise.all([
    getProject(id),
    getProjectStatuses(),
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

  return (
    <ProjectEditForm
      project={project}
      statuses={(statusesRes.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
      isAdmin={currentUserRes.data?.role === "admin"}
    />
  );
}
