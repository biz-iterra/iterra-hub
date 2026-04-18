"use client";

import { getProjects } from "@/actions/projects";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Plus, FolderKanban, Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const PER_PAGE = 20;

type ProjectsData = { items: any[]; total: number } | null;
type StatusOption = { id: string; name: string; sort_order: number };

export function ProjectsView({
  initialData,
  statuses,
}: {
  initialData: ProjectsData;
  statuses: StatusOption[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusId, setStatusId] = useState<string>("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ProjectsData>(initialData);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      const result = await getProjects({
        search,
        statusId: statusId || undefined,
        page,
        perPage: PER_PAGE,
      });
      setData(result.data);
      setLoading(false);
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [search, statusId, page]);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="space-y-6" style={{ padding: "1.5rem" }}>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ color: "var(--color-text-title)" }}>
          プロジェクト
        </h1>
        <Link
          href="/projects/new"
          className="inline-flex items-center gap-2 text-sm font-medium transition-colors"
          style={{
            backgroundColor: "var(--color-terra)",
            color: "#fff",
            borderRadius: "var(--radius-button)",
            padding: "0.5rem 1.25rem",
            textDecoration: "none",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-terra-dark)")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--color-terra)")}
        >
          <Plus size={16} />
          新規作成
        </Link>
      </div>

      {/* 検索 + ステータス */}
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: "var(--radius-card)",
          boxShadow: "var(--elevation-low)",
          padding: "0.75rem",
          display: "flex",
          gap: "0.75rem",
          alignItems: "center",
        }}
      >
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-4 top-1/2 -translate-y-1/2"
            style={{ color: "var(--color-sumi600)" }}
          />
          <input
            type="text"
            placeholder="プロジェクト名・コードで検索..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full px-4 py-2 pl-10 text-sm outline-none"
            style={{
              border: "1px solid var(--color-border-default)",
              borderRadius: "var(--radius-input)",
            }}
          />
        </div>
        <select
          value={statusId}
          onChange={(e) => {
            setStatusId(e.target.value);
            setPage(1);
          }}
          className="text-sm outline-none"
          style={{
            border: "1px solid var(--color-border-default)",
            borderRadius: "var(--radius-input)",
            padding: "0.5rem 0.75rem",
            backgroundColor: "#fff",
            minWidth: 140,
          }}
        >
          <option value="">全ステータス</option>
          {statuses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* テーブル */}
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: "var(--radius-card)",
          boxShadow: "var(--elevation-low)",
        }}
      >
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm" style={{ color: "var(--color-sumi600)" }}>
            読み込み中...
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <FolderKanban size={40} style={{ color: "var(--color-sumi600)" }} />
            <p className="text-sm" style={{ color: "var(--color-sumi600)" }}>
              プロジェクトがまだありません
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr
                    style={{
                      backgroundColor: "var(--color-sumi50)",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: "var(--color-sumi700)",
                    }}
                  >
                    <th className="px-4 py-3 text-left">プロジェクトコード</th>
                    <th className="px-4 py-3 text-left">プロジェクト名</th>
                    <th className="px-4 py-3 text-left">ステータス</th>
                    <th className="px-4 py-3 text-left">期間</th>
                    <th className="px-4 py-3 text-left">責任者</th>
                    <th className="px-4 py-3 text-left">作成日</th>
                    <th className="px-4 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p: any) => (
                    <tr
                      key={p.id}
                      onClick={() => router.push(`/projects/${p.id}`)}
                      className="cursor-pointer transition-colors"
                      style={{ borderBottom: "1px solid var(--color-border-default)" }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.backgroundColor = "var(--color-bg-hover)")
                      }
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
                    >
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--color-sumi600)" }}>
                        {p.project_code}
                      </td>
                      <td className="px-4 py-3 font-medium">{p.name}</td>
                      <td className="px-4 py-3">
                        {p.project_status ? (
                          <span
                            style={{
                              display: "inline-block",
                              backgroundColor: "var(--color-sumi100)",
                              borderRadius: "var(--radius-badge)",
                              padding: "0.125rem 0.5rem",
                              fontSize: "0.75rem",
                            }}
                          >
                            {p.project_status.name}
                          </span>
                        ) : (
                          <span style={{ color: "var(--color-sumi400)" }}>-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--color-sumi600)" }}>
                        {p.start_date ? p.start_date : "-"}
                        {" 〜 "}
                        {p.end_date ? p.end_date : "-"}
                      </td>
                      <td className="px-4 py-3">{p.owner?.full_name ?? "-"}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--color-sumi600)" }}>
                        {p.created_at ? new Date(p.created_at).toLocaleDateString("ja-JP") : "-"}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <Link
                          href={`/projects/${p.id}/edit`}
                          className="hover:bg-[var(--color-bg-hover)]"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.25rem",
                            color: "var(--color-terra)",
                            textDecoration: "none",
                            padding: "0.25rem 0.5rem",
                            borderRadius: "var(--radius-sm)",
                            fontSize: "0.75rem",
                            fontWeight: 500,
                            border: "1px solid var(--color-border-default)",
                            transition: "background-color 0.15s",
                          }}
                        >
                          <Pencil size={12} />
                          編集
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ページネーション */}
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderTop: "1px solid var(--color-border-default)" }}
            >
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="text-sm font-medium disabled:opacity-40"
                style={{ color: "var(--color-terra)" }}
              >
                前へ
              </button>
              <span className="text-xs" style={{ color: "var(--color-sumi600)" }}>
                {page} / {totalPages} ページ
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="text-sm font-medium disabled:opacity-40"
                style={{ color: "var(--color-terra)" }}
              >
                次へ
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
