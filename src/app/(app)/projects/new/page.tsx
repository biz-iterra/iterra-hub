import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getProjectStatuses } from "@/actions/projects";
import { getCrmUsers, getCurrentUser } from "@/actions/users";
import { ProjectNewForm } from "./project-new-form";

export default async function NewProjectPage() {
  const meResult = await getCurrentUser();
  const role = meResult.data?.role ?? null;
  const isManagerOrAbove = role === "manager" || role === "admin";

  if (!isManagerOrAbove) {
    return (
      <div style={{ padding: "2rem" }}>
        <p style={{ color: "var(--color-text-body)", marginBottom: "1rem" }}>
          作成権限がありません
        </p>
        <Link
          href="/projects"
          className="hover:bg-[var(--color-bg-hover)]"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
            color: "var(--color-terra)",
            textDecoration: "none",
            padding: "0.125rem 0.375rem",
            margin: "-0.125rem -0.375rem",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <ArrowLeft size={14} />
          プロジェクト一覧へ戻る
        </Link>
      </div>
    );
  }

  const [statusesRes, usersRes] = await Promise.all([
    getProjectStatuses(),
    getCrmUsers(),
  ]);
  return (
    <ProjectNewForm
      statuses={(statusesRes.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
      owners={(usersRes.data ?? []).map((u) => ({ value: u.id, label: u.full_name }))}
    />
  );
}
