"use client";

import { getContracts } from "@/actions/contracts";
import { useListView } from "@/hooks/useListView";
import { LIST_FILTER_KEYS } from "@/lib/list-sort";
import { FileText, Plus } from "lucide-react";
import Link from "next/link";
import { ContractMethodBadge } from "@/components/ui/badges";
import { FilterGroup, FilterClearButton } from "@/components/ui/FilterGroup";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { SearchInput } from "@/components/ui/SearchInput";
import { DataTable } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import type { ContractWithRelations } from "@/types/relations";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
// 画面で使う行型は Server Action の戻り値型をそのまま使う。
// 手書きで狭い型を再定義すると SELECT の変更に追従できない。
type ContractRow = ContractWithRelations;

interface ContractType {
  id: string;
  name: string;
}

interface Props {
  initialData: { rows: ContractRow[]; total: number } | null;
  isManagerOrAbove: boolean;
  contractTypes: ContractType[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

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

const PER_PAGE = DEFAULT_PAGE_SIZE;

const CONTRACT_METHOD_OPTIONS = [
  { value: "paper", label: "紙面" },
  { value: "electronic", label: "電子" },
  { value: "verbal", label: "口頭" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ContractsView({ initialData, isManagerOrAbove, contractTypes }: Props) {
  const { filters, page, sort, setFilter, setPage, setSort, clear, isPending, data } =
    useListView({
      filterKeys: LIST_FILTER_KEYS.contracts,
      initialData,
      load: (state) =>
        getContracts({
          search: state.filters.search || undefined,
          contractTypeId: state.filters.typeId || undefined,
          contractMethod: state.filters.methodId || undefined,
          page: state.page,
          perPage: PER_PAGE,
          sortField: state.sort?.field,
          sortDirection: state.sort?.direction,
        }),
    });

  const search = filters.search ?? "";
  const contractTypeFilter = filters.typeId ?? "";
  const contractMethodFilter = filters.methodId ?? "";

  const rows = data?.rows ?? [];
  const totalCount = data?.total ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "var(--color-text-title)",
              margin: 0,
            }}
          >
            契約
          </h1>
          <p
            style={{
              fontSize: "0.875rem",
              color: "var(--color-sumi600)",
              margin: "0.25rem 0 0",
            }}
          >
            {totalCount} 件の契約
          </p>
        </div>
        {isManagerOrAbove ? (
          <Link
            href="/contracts/new"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              backgroundColor: "var(--color-terra)",
              color: "#fff",
              borderRadius: "var(--radius-button)",
              padding: "0.5rem 1.25rem",
              border: "none",
              fontSize: "0.875rem",
              fontWeight: 600,
              textDecoration: "none",
              transition: "background-color 0.15s",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor =
                "var(--color-terra-dark)")
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
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              backgroundColor: "var(--color-sumi300)",
              color: "#fff",
              borderRadius: "var(--radius-button)",
              padding: "0.5rem 1.25rem",
              border: "none",
              cursor: "not-allowed",
              fontSize: "0.875rem",
              fontWeight: 600,
              opacity: 0.6,
            }}
          >
            <Plus size={16} />
            新規作成
          </button>
        )}
      </div>

      {/* フィルタ行 */}
      <FilterGroup>
        <FilterSelect
          label="契約種別"
          value={contractTypeFilter}
          options={contractTypes.map((t) => ({ value: t.id, label: t.name }))}
          onChange={(v) => setFilter("typeId", v)}
        />
        <FilterSelect
          label="契約方法"
          value={contractMethodFilter}
          options={CONTRACT_METHOD_OPTIONS}
          onChange={(v) => setFilter("methodId", v)}
        />
        <SearchInput
          value={search}
          placeholder="契約書名で検索..."
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
        items={rows}
        getKey={(row) => row.id}
        getHref={(row) => `/contracts/${row.id}`}
        emptyIcon={FileText}
        emptyMessage="契約がまだありません"
        sort={sort}
        onSortChange={setSort}
        columns={[
          {
            label: "契約書名",
            sortKey: "contract_name",
            card: "title",
            className: "min-w-[200px]",
            render: (row) => (
              <Link
                href={`/contracts/${row.id}`}
                style={{
                  fontWeight: 600,
                  color: "var(--color-text-list)",
                  textDecoration: "none",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {row.contract_name}
              </Link>
            ),
          },
          {
            label: "契約方法",
            card: "meta",
            className: "whitespace-nowrap",
            render: (row) => <ContractMethodBadge method={row.contract_method} />,
          },
          {
            label: "契約種別",
            className: "whitespace-nowrap",
            render: (row) => row.contract_type?.name ?? "—",
          },
          {
            label: "商談",
            className: "whitespace-nowrap",
            render: (row) =>
              row.deal ? (
                <Link
                  href={`/deals/${row.deal.id}`}
                  style={{ color: "var(--color-text-list)", textDecoration: "none" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {row.deal.name}
                </Link>
              ) : (
                "—"
              ),
          },
          {
            label: "契約開始日",
            sortKey: "contract_date",
            className: "text-xs whitespace-nowrap",
            render: (row) => formatDate(row.start_date),
          },
          {
            label: "契約終了日",
            className: "text-xs whitespace-nowrap",
            render: (row) => formatDate(row.end_date),
          },
          {
            label: "登録者",
            className: "text-xs whitespace-nowrap",
            render: (row) => row.registered_user?.full_name ?? "—",
          },
          {
            label: "最終更新日",
            sortKey: "updated_at",
            className: "text-xs whitespace-nowrap",
            render: (row) => formatDateTime(row.updated_at),
          },
        ]}
      />

      <Pagination
        page={page}
        totalCount={totalCount}
        pageSize={PER_PAGE}
        onPageChange={setPage}
      />
    </div>
  );
}
