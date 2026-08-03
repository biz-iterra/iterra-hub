"use client";

import Link from "next/link";
import { Plus, Building2 } from "lucide-react";
import { getCompanies } from "@/actions/companies";
import { useListView } from "@/hooks/useListView";
import { LIST_FILTER_KEYS } from "@/lib/list-sort";
import { StatusBadge } from "@/components/ui/badges";
import { DataTable } from "@/components/ui/DataTable";
import { SearchInput } from "@/components/ui/SearchInput";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { FilterGroup, FilterClearButton } from "@/components/ui/FilterGroup";
import { Pagination } from "@/components/ui/Pagination";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import type { CompanyWithRelations, Paged } from "@/types/relations";

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

type CompanyStatus = { id: string; name: string };
type CorporateType = { id: string; name: string };
type CrmUser = { id: string; full_name: string; role: string };
type CompaniesData = Paged<CompanyWithRelations> | null;

interface CompaniesViewProps {
  initialData: CompaniesData;
  statuses: CompanyStatus[];
  corporateTypes: CorporateType[];
  users: CrmUser[];
}

export function CompaniesView({
  initialData,
  statuses,
  corporateTypes,
  users,
}: CompaniesViewProps) {
  const { filters, page, sort, setFilter, setPage, setSort, clear, isPending, data } =
    useListView({
      filterKeys: LIST_FILTER_KEYS.companies,
      initialData,
      load: (state) =>
        getCompanies({
          statusId: state.filters.statusId || undefined,
          corporateTypeId: state.filters.corporateTypeId || undefined,
          ownerUserId: state.filters.ownerUserId || undefined,
          search: state.filters.search || undefined,
          perPage: DEFAULT_PAGE_SIZE,
          page: state.page,
          sortField: state.sort?.field,
          sortDirection: state.sort?.direction,
        }),
    });

  const statusFilter = filters.statusId ?? "";
  const corporateTypeFilter = filters.corporateTypeId ?? "";
  const ownerFilter = filters.ownerUserId ?? "";
  const keyword = filters.search ?? "";

  const items = data?.rows ?? [];
  const total = data?.total ?? 0;

  return (
    <div>
      {/* ヘッダー */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4 sm:mb-6">
        <h1
          className="text-xl sm:text-2xl font-bold"
          style={{ color: "var(--color-text-title)" }}
        >
          事業者情報
        </h1>
        <Link
          href="/companies/new"
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white transition-colors whitespace-nowrap"
          style={{
            backgroundColor: "var(--color-terra)",
            borderRadius: "var(--radius-button)",
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
          value={statusFilter}
          options={statuses.map((s) => ({ value: s.id, label: s.name }))}
          onChange={(v) => setFilter("statusId", v)}
        />
        <FilterSelect
          label="法人格"
          value={corporateTypeFilter}
          options={corporateTypes.map((c) => ({ value: c.id, label: c.name }))}
          onChange={(v) => setFilter("corporateTypeId", v)}
        />
        <FilterSelect
          label="担当者"
          value={ownerFilter}
          options={users.map((u) => ({ value: u.id, label: u.full_name }))}
          onChange={(v) => setFilter("ownerUserId", v)}
        />
        <SearchInput
          value={keyword}
          placeholder="会社名で検索..."
          onChange={(v) => setFilter("search", v)}
        />
        <FilterClearButton onClear={clear} />
        {isPending && (
          <span
            className="text-xs"
            style={{ color: "var(--color-sumi500)", alignSelf: "flex-end", paddingBottom: "0.45rem" }}
          >
            読み込み中...
          </span>
        )}
      </FilterGroup>

      {/* 一覧（md 未満はカード） */}
      <DataTable
        items={items}
        getKey={(company) => company.id}
        getHref={(company) => `/companies/${company.id}`}
        emptyIcon={Building2}
        emptyMessage="事業者情報が見つかりません"
        sort={sort}
        onSortChange={setSort}
        columns={[
          {
            label: "会社名",
            sortKey: "name",
            card: "title",
            render: (company) => (
              <Link
                href={`/companies/${company.id}`}
                className="font-medium"
                style={{ color: "var(--color-text-list)" }}
                onClick={(e) => e.stopPropagation()}
              >
                {company.name}
              </Link>
            ),
          },
          {
            label: "ステータス",
            card: "meta",
            className: "whitespace-nowrap",
            render: (company) => (
              <StatusBadge
                name={company.company_status?.name}
                color={company.company_status?.color}
                seed={company.company_status?.id}
              />
            ),
          },
          {
            label: "法人格",
            className: "whitespace-nowrap",
            render: (company) => company.corporate_types?.name ?? "—",
          },
          {
            label: "代表電話",
            render: (company) => company.phone ?? "—",
          },
          {
            label: "担当者",
            className: "whitespace-nowrap",
            render: (company) => company.crm_users?.full_name ?? "—",
          },
          {
            label: "最終更新日",
            sortKey: "updated_at",
            className: "text-xs whitespace-nowrap",
            render: (company) => formatDateTime(company.updated_at),
          },
        ]}
      />

      {/* ページネーション */}
      <Pagination
        page={page}
        totalCount={total}
        pageSize={DEFAULT_PAGE_SIZE}
        onPageChange={setPage}
      />
    </div>
  );
}
