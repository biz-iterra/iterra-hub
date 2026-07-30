"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { FolderKanban, Plus, X, ArrowUpRight } from "lucide-react";
import { getProjects, addDealProject, removeDealProject } from "@/actions/projects";
import { ProjectStatusBadge } from "@/components/ui/badges";

type LinkedProject = {
  id: string;
  project: {
    id: string;
    project_code: string;
    name: string;
    project_status: { id: string; name: string } | null;
    deleted_at: string | null;
  } | null;
};

export function DealProjectsSection({
  dealId,
  initialProjects,
}: {
  dealId: string;
  initialProjects: LinkedProject[];
}) {
  const [projects, setProjects] = useState<LinkedProject[]>(
    initialProjects.filter((p) => p.project && p.project.deleted_at === null)
  );
  const [allProjects, setAllProjects] = useState<
    { id: string; project_code: string; name: string }[]
  >([]);
  const [selectedId, setSelectedId] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await getProjects({ perPage: 200 });
      if (res.data?.rows) {
        setAllProjects(
          res.data.rows.map((p) => ({
            id: p.id,
            project_code: p.project_code,
            name: p.name,
          }))
        );
      }
    })();
  }, []);

  const linkedIds = new Set(projects.map((p) => p.project?.id).filter(Boolean));
  const availableProjects = allProjects.filter((p) => !linkedIds.has(p.id));

  const handleAdd = () => {
    if (!selectedId) return;
    setError(null);
    startTransition(async () => {
      const result = await addDealProject({ deal_id: dealId, project_id: selectedId });
      if (result.error) {
        setError(result.error);
        return;
      }
      const proj = allProjects.find((p) => p.id === selectedId);
      if (proj && result.data) {
        setProjects((prev) => [
          ...prev,
          {
            id: (result.data as { id: string }).id,
            project: {
              id: proj.id,
              project_code: proj.project_code,
              name: proj.name,
              project_status: null,
              deleted_at: null,
            },
          },
        ]);
      }
      setSelectedId("");
    });
  };

  const handleRemove = (projectId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await removeDealProject(dealId, projectId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setProjects((prev) => prev.filter((p) => p.project?.id !== projectId));
    });
  };

  return (
    <div
      style={{
        backgroundColor: "#fff",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--elevation-low)",
        padding: "1.5rem",
        marginBottom: "1.5rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
        <FolderKanban size={18} style={{ color: "var(--color-text-title)" }} />
        <h2
          style={{
            color: "var(--color-text-title)",
            fontSize: "1rem",
            fontWeight: 600,
            margin: 0,
          }}
        >
          紐づくプロジェクト（{projects.length}件）
        </h2>
      </div>

      {/* 追加フォーム */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          style={{
            flex: 1,
            border: "1px solid var(--color-border-default)",
            borderRadius: "var(--radius-input)",
            padding: "0.375rem 0.5rem",
            fontSize: "0.875rem",
            backgroundColor: "#fff",
            outline: "none",
          }}
        >
          <option value="">-- 紐づけるプロジェクトを選択 --</option>
          {availableProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.project_code} {p.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleAdd}
          disabled={!selectedId || isPending}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
            backgroundColor: "var(--color-terra)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-button)",
            padding: "0.375rem 0.75rem",
            cursor: "pointer",
            fontSize: "0.75rem",
            fontWeight: 500,
            opacity: !selectedId || isPending ? 0.5 : 1,
          }}
        >
          <Plus size={12} />
          紐づける
        </button>
      </div>

      {error && (
        <p style={{ color: "var(--color-error)", fontSize: "0.75rem", margin: "0 0 0.5rem 0" }}>
          {error}
        </p>
      )}

      {/* プロジェクト一覧 */}
      {projects.length > 0 ? (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {projects.map((p) =>
            p.project ? (
              <li
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.5rem 0",
                  borderBottom: "1px solid var(--color-border-default)",
                }}
              >
                <Link
                  href={`/projects/${p.project.id}`}
                  className="hover:bg-[var(--color-bg-hover)]"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.375rem",
                    color: "var(--color-terra)",
                    textDecoration: "none",
                    padding: "0.125rem 0.375rem",
                    margin: "-0.125rem -0.375rem",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "0.875rem",
                  }}
                >
                  <span style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "var(--color-sumi600)" }}>
                    {p.project.project_code}
                  </span>
                  {p.project.name}
                  {p.project.project_status && (
                    <ProjectStatusBadge name={p.project.project_status.name} seed={p.project.project_status.id} />
                  )}
                  <ArrowUpRight size={14} />
                </Link>
                <button
                  type="button"
                  onClick={() => handleRemove(p.project!.id)}
                  disabled={isPending}
                  style={{
                    backgroundColor: "transparent",
                    color: "var(--color-error)",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "0.75rem",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.25rem",
                  }}
                >
                  <X size={12} />
                  解除
                </button>
              </li>
            ) : null
          )}
        </ul>
      ) : (
        <p style={{ color: "var(--color-sumi400)", fontSize: "0.875rem", margin: 0 }}>
          プロジェクトが紐づいていません
        </p>
      )}
    </div>
  );
}
