"use client";

import { getProjects } from "@/actions/projects";
import { useListView } from "@/hooks/useListView";
import { LIST_FILTER_KEYS } from "@/lib/list-sort";
import Link from "next/link";
import { Plus, FolderKanban } from "lucide-react";
import { ProjectStatusBadge } from "@/components/ui/badges";
import { SearchInput } from "@/components/ui/SearchInput";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { FilterGroup, FilterClearButton } from "@/components/ui/FilterGroup";
import { DataTable } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import type { Paged, ProjectWithRelations } from "@/types/relations";

const PER_PAGE = DEFAULT_PAGE_SIZE;

type ProjectsData = Paged<ProjectWithRelations> | null;
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
  isManagerOrAbove,
}: {
  initialData: ProjectsData;
  statuses: StatusOption[];
  users: CrmUser[];
  isManagerOrAbove: boolean;
}) {
  const { filters, page, sort, setFilter, setPage, setSort, clear, isPending, data } =
    useListView({
      filterKeys: LIST_FILTER_KEYS.projects,
      initialData,
      load: (state) =>
        getProjects({
          statusId: state.filters.statusId || undefined,
          ownerUserId: state.filters.ownerUserId || undefined,
          search: state.filters.search || undefined,
          perPage: DEFAULT_PAGE_SIZE,
          page: state.page,
          sortField: state.sort?.field,
          sortDirection: state.sort?.direction,
        }),
    });

  const statusId = filters.statusId ?? "";
  const ownerUserId = filters.ownerUserId ?? "";
  const keyword = filters.search ?? "";

  const items = data?.rows ?? [];
  const total = data?.total ?? 0;

  return (
    // 余白は (app)/layout.tsx の main が持つ。ここで足すと一覧ごとにずれる
    <div className="space-y-4 sm:space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl sm:text-2xl font-bold" style={{ color: "var(--color-text-title)" }}>
          プロジェクト
        </h1>
        {isManagerOrAbove ? (
          <Link
            href="/projects/new"
            className="inline-flex items-center gap-2 text-sm font-medium transition-colors whitespace-nowrap"
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
        ) : (
          <button
            type="button"
            disabled
            title="作成権限がありません"
            className="inline-flex items-center gap-2 text-sm font-medium whitespace-nowrap"
            style={{
              backgroundColor: "var(--color-sumi300)",
              color: "#fff",
              borderRadius: "var(--radius-button)",
              padding: "0.5rem 1.25rem",
              border: "none",
              cursor: "not-allowed",
              opacity: 0.6,
            }}
          >
            <Plus size={16} />
            新規作成
          </button>
        )}
      </div>

      {/* フィルター行 */}
      <FilterGroup className="mb-4">
        <FilterSelect
          label="ステータス"
          value={statusId}
          options={statuses.map((s) => ({ value: s.id, label: s.name }))}
          onChange={(v) => setFilter("statusId", v)}
          placeholder="全ステータス"
        />
        <FilterSelect
          label="責任者"
          value={ownerUserId}
          options={users.map((u) => ({ value: u.id, label: u.full_name }))}
          onChange={(v) => setFilter("ownerUserId", v)}
          placeholder="全責任者"
        />
        <SearchInput
          value={keyword}
          placeholder="プロジェクト名で検索..."
          onChange={(v) => setFilter("search", v)}
        />
        <FilterClearButton onClear={clear} />
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

      {/* 一覧（md 未満はカード） */}
      <DataTable
        items={items}
        getKey={(p) => p.id}
        getHref={(p) => `/projects/${p.id}`}
        emptyIcon={FolderKanban}
        emptyMessage="プロジェクトがまだありません"
        sort={sort}
        onSortChange={setSort}
        columns={[
          {
            label: "プロジェクト名",
            sortKey: "name",
            card: "title",
            render: (p) => (
              <Link
                href={`/projects/${p.id}`}
                className="font-medium"
                style={{ color: "var(--color-text-list)" }}
                onClick={(e) => e.stopPropagation()}
              >
                {p.name}
              </Link>
            ),
          },
          {
            label: "ステータス",
            card: "meta",
            className: "whitespace-nowrap",
            render: (p) => (
              <ProjectStatusBadge
                name={p.project_status?.name}
                color={p.project_status?.color}
                sortOrder={p.project_status?.sort_order}
                seed={p.project_status?.id}
              />
            ),
          },
          {
            label: "期間",
            className: "text-xs whitespace-nowrap",
            render: (p) => (
              <>
                {p.start_date ?? "—"}
                {" 〜 "}
                {p.end_date ?? "—"}
              </>
            ),
          },
          {
            label: "責任者",
            className: "whitespace-nowrap",
            render: (p) => p.owner?.full_name ?? "—",
          },
          {
            label: "最終更新日",
            sortKey: "updated_at",
            className: "text-xs whitespace-nowrap",
            render: (p) => formatDateTime(p.updated_at),
          },
        ]}
      />

      {/* ページネーション */}
      <Pagination
        page={page}
        totalCount={total}
        pageSize={PER_PAGE}
        onPageChange={setPage}
      />
    </div>
  );
}
