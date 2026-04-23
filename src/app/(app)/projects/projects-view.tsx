"use client";

import { getProjects } from "@/actions/projects";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, FolderKanban } from "lucide-react";
import { ProjectStatusBadge } from "@/components/ui/badges";
import { SearchInput } from "@/components/ui/SearchInput";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { FilterGroup, FilterClearButton } from "@/components/ui/FilterGroup";
import { Pagination } from "@/components/ui/Pagination";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import { useState, useTransition } from "react";

const PER_PAGE = DEFAULT_PAGE_SIZE;

type ProjectsData = { rows: any[]; total: number } | null;
type StatusOption = { id: string; name: string; sort_order: number };
type CrmUser = { id: string; full_name: string; role: string };

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;
}

export function ProjectsView({
  initialData,
  statuses,
  users,
}: {
  initialData: ProjectsData;
  statuses: StatusOption[];
  users: CrmUser[];
}) {
  const router = useRouter();
  const [data, setData] = useState<ProjectsData>(initialData);
  const [statusId, setStatusId] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();

  function handleFilter(
    key: string,
    value: string,
    setter: (v: string) => void
  ) {
    setter(value);
    startTransition(async () => {
      const result = await getProjects({
        search: key === "search" ? value || undefined : keyword || undefined,
        statusId: key === "statusId" ? value || undefined : statusId || undefined,
        ownerUserId:
          key === "ownerUserId" ? value || undefined : ownerUserId || undefined,
        page: 1,
        perPage: PER_PAGE,
      });
      setData(result.data);
      setPage(1);
    });
  }

  function handleClear() {
    setStatusId("");
    setOwnerUserId("");
    setKeyword("");
    startTransition(async () => {
      const result = await getProjects({ page: 1, perPage: PER_PAGE });
      setData(result.data);
      setPage(1);
    });
  }

  function handlePageChange(next: number) {
    startTransition(async () => {
      const result = await getProjects({
        search: keyword || undefined,
        statusId: statusId || undefined,
        ownerUserId: ownerUserId || undefined,
        page: next,
        perPage: PER_PAGE,
      });
      setData(result.data);
      setPage(next);
    });
  }

  const items = data?.rows ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-6" style={{ padding: "1.5rem" }}>
      {/* ヘッダー */}
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
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor = "var(--color-terra-dark)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = "var(--color-terra)")
          }
        >
          <Plus size={16} />
          新規作成
        </Link>
      </div>

      {/* フィルター行 */}
      <FilterGroup className="mb-4">
        <FilterSelect
          label="ステータス"
          value={statusId}
          options={statuses.map((s) => ({ value: s.id, label: s.name }))}
          onChange={(v) => handleFilter("statusId", v, setStatusId)}
          placeholder="全ステータス"
        />
        <FilterSelect
          label="責任者"
          value={ownerUserId}
          options={users.map((u) => ({ value: u.id, label: u.full_name }))}
          onChange={(v) => handleFilter("ownerUserId", v, setOwnerUserId)}
          placeholder="全責任者"
        />
        <SearchInput
          value={keyword}
          placeholder="プロジェクト名で検索..."
          onChange={(v) => handleFilter("search", v, setKeyword)}
        />
        <FilterClearButton onClear={handleClear} />
        {isPending && (
          <span
            className="text-xs"
            style={{
              color: "var(--color-sumi500)",
              alignSelf: "flex-end",
              paddingBottom: "0.45rem",
            }}
          >
            読み込み中...
          </span>
        )}
      </FilterGroup>

      {/* テーブル */}
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: "var(--radius-card)",
          boxShadow: "var(--elevation-low)",
        }}
      >
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <FolderKanban size={40} style={{ color: "var(--color-sumi600)" }} />
            <p className="text-sm" style={{ color: "var(--color-sumi600)" }}>
              プロジェクトがまだありません
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-sm" style={{ tableLayout: "auto" }}>
                <thead>
                  <tr style={{ backgroundColor: "var(--color-sumi50)" }}>
                    {["プロジェクト名", "ステータス", "期間", "責任者", "最終更新日"].map(
                      (label) => (
                        <th
                          key={label}
                          className="px-4 py-3 text-left font-semibold text-xs whitespace-nowrap"
                          style={{ color: "var(--color-sumi600)" }}
                        >
                          {label}
                        </th>
                      )
                    )}
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
                        (e.currentTarget.style.backgroundColor =
                          "var(--color-bg-hover)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.backgroundColor = "transparent")
                      }
                    >
                      {/* プロジェクト名 */}
                      <td className="px-4 py-3">
                        <Link
                          href={`/projects/${p.id}`}
                          className="font-medium"
                          style={{ color: "var(--color-text-list)" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {p.name}
                        </Link>
                      </td>
                      {/* ステータス */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <ProjectStatusBadge
                          name={p.project_status?.name}
                          sortOrder={p.project_status?.sort_order}
                          seed={p.project_status?.id}
                        />
                      </td>
                      {/* 期間 */}
                      <td
                        className="px-4 py-3 text-xs whitespace-nowrap"
                        style={{ color: "var(--color-text-list)" }}
                      >
                        {p.start_date ?? "—"}
                        {" 〜 "}
                        {p.end_date ?? "—"}
                      </td>
                      {/* 責任者 */}
                      <td
                        className="px-4 py-3 whitespace-nowrap"
                        style={{ color: "var(--color-text-list)" }}
                      >
                        {p.owner?.full_name ?? "—"}
                      </td>
                      {/* 最終更新日 */}
                      <td
                        className="px-4 py-3 text-xs whitespace-nowrap"
                        style={{ color: "var(--color-text-list)" }}
                      >
                        {formatDateTime(p.updated_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ページネーション */}
            <div style={{ padding: "0.75rem 1rem", borderTop: "1px solid var(--color-border-default)" }}>
              <Pagination
                page={page}
                totalCount={total}
                pageSize={PER_PAGE}
                onPageChange={handlePageChange}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
