"use client";

import { getContracts } from "@/actions/contracts";
import { FileText, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useTransition } from "react";
import { ContractMethodBadge } from "@/components/ui/badges";
import { FilterGroup, FilterClearButton } from "@/components/ui/FilterGroup";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { SearchInput } from "@/components/ui/SearchInput";
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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [rows, setRows] = useState<ContractRow[]>(initialData?.rows ?? []);
  const [totalCount, setTotalCount] = useState(initialData?.total ?? 0);
  const [search, setSearch] = useState("");
  const [contractTypeFilter, setContractTypeFilter] = useState("");
  const [contractMethodFilter, setContractMethodFilter] = useState("");
  const [page, setPage] = useState(1);

  const fetchData = useCallback(
    (params: {
      search: string;
      contractTypeId: string;
      contractMethod: string;
      page: number;
    }) => {
      startTransition(async () => {
        const { data } = await getContracts({
          search: params.search || undefined,
          contractTypeId: params.contractTypeId || undefined,
          contractMethod: params.contractMethod || undefined,
          page: params.page,
          perPage: PER_PAGE,
        });
        if (data) {
          setRows(data.rows);
          setTotalCount(data.total);
        }
      });
    },
    []
  );

  // debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchData({ search, contractTypeId: contractTypeFilter, contractMethod: contractMethodFilter, page: 1 });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // page change
  useEffect(() => {
    if (page > 1) fetchData({ search, contractTypeId: contractTypeFilter, contractMethod: contractMethodFilter, page });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function handleFilter(key: "contractTypeId" | "contractMethod", value: string) {
    const next = {
      search,
      contractTypeId: contractTypeFilter,
      contractMethod: contractMethodFilter,
      [key]: value,
    };
    if (key === "contractTypeId") setContractTypeFilter(value);
    if (key === "contractMethod") setContractMethodFilter(value);
    setPage(1);
    fetchData({ ...next, page: 1 });
  }

  function handleClear() {
    setSearch("");
    setContractTypeFilter("");
    setContractMethodFilter("");
    setPage(1);
    fetchData({ search: "", contractTypeId: "", contractMethod: "", page: 1 });
  }

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
          onChange={(v) => handleFilter("contractTypeId", v)}
        />
        <FilterSelect
          label="契約方法"
          value={contractMethodFilter}
          options={CONTRACT_METHOD_OPTIONS}
          onChange={(v) => handleFilter("contractMethod", v)}
        />
        <SearchInput
          value={search}
          placeholder="契約書名で検索..."
          onChange={(v) => setSearch(v)}
        />
        <FilterClearButton onClear={handleClear} />
        {isPending && (
          <span
            className="text-xs"
            style={{ color: "var(--color-sumi500)", alignSelf: "flex-end", paddingBottom: "0.45rem" }}
          >
            読み込み中...
          </span>
        )}
      </FilterGroup>

      {/* Card */}
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: "var(--radius-card)",
          boxShadow: "var(--elevation-low)",
          overflow: "hidden",
        }}
      >
        {/* Table */}
        {rows.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "4rem 1rem",
              gap: "0.75rem",
            }}
          >
            <FileText size={48} style={{ color: "var(--color-sumi300)" }} />
            <p
              style={{
                fontSize: "0.875rem",
                color: "var(--color-sumi600)",
                margin: 0,
              }}
            >
              契約がまだありません
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto no-scrollbar">
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <colgroup>
                  <col style={{ minWidth: "200px" }} />
                  <col style={{ width: "90px" }} />
                  <col style={{ width: "130px" }} />
                  <col style={{ minWidth: "160px" }} />
                  <col style={{ width: "110px" }} />
                  <col style={{ width: "110px" }} />
                  <col style={{ width: "120px" }} />
                  <col style={{ width: "150px" }} />
                </colgroup>
                <thead>
                  <tr
                    style={{
                      backgroundColor: "var(--color-sumi50)",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: "var(--color-sumi700)",
                      textAlign: "left",
                    }}
                  >
                    <th style={{ padding: "0.75rem 1rem" }}>契約書名</th>
                    <th style={{ padding: "0.75rem 1rem" }}>契約方法</th>
                    <th style={{ padding: "0.75rem 1rem" }}>契約種別</th>
                    <th style={{ padding: "0.75rem 1rem" }}>商談</th>
                    <th style={{ padding: "0.75rem 1rem" }}>契約開始日</th>
                    <th style={{ padding: "0.75rem 1rem" }}>契約終了日</th>
                    <th style={{ padding: "0.75rem 1rem" }}>登録者</th>
                    <th style={{ padding: "0.75rem 1rem" }}>最終更新日</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="transition-colors cursor-pointer"
                      style={{
                        borderBottom: "1px solid var(--color-border-default)",
                        fontSize: "0.875rem",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.backgroundColor = "var(--color-bg-hover)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.backgroundColor = "transparent")
                      }
                      onClick={() => router.push(`/contracts/${row.id}`)}
                    >
                      {/* 契約書名 */}
                      <td style={{ padding: "0.75rem 1rem" }}>
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
                      </td>
                      {/* 契約方法 */}
                      <td style={{ padding: "0.75rem 1rem", whiteSpace: "nowrap" }}>
                        <ContractMethodBadge method={row.contract_method} />
                      </td>
                      {/* 契約種別 */}
                      <td
                        style={{
                          padding: "0.75rem 1rem",
                          color: "var(--color-text-list)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.contract_type?.name ?? "—"}
                      </td>
                      {/* 商談 */}
                      <td
                        style={{
                          padding: "0.75rem 1rem",
                          color: "var(--color-text-list)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.deal ? (
                          <Link
                            href={`/deals/${row.deal.id}`}
                            style={{ color: "var(--color-text-list)", textDecoration: "none" }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {row.deal.name}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      {/* 契約開始日 */}
                      <td
                        style={{
                          padding: "0.75rem 1rem",
                          fontSize: "0.8125rem",
                          color: "var(--color-text-list)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatDate(row.start_date)}
                      </td>
                      {/* 契約終了日 */}
                      <td
                        style={{
                          padding: "0.75rem 1rem",
                          fontSize: "0.8125rem",
                          color: "var(--color-text-list)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatDate(row.end_date)}
                      </td>
                      {/* 登録者 */}
                      <td
                        style={{
                          padding: "0.75rem 1rem",
                          color: "var(--color-text-list)",
                          whiteSpace: "nowrap",
                          fontSize: "0.8125rem",
                        }}
                      >
                        {row.registered_user?.full_name ?? "—"}
                      </td>
                      {/* 最終更新日 */}
                      <td
                        style={{
                          padding: "0.75rem 1rem",
                          fontSize: "0.8125rem",
                          color: "var(--color-text-list)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatDateTime(row.updated_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div style={{ padding: "0.75rem 1.5rem", borderTop: "1px solid var(--color-border-default)" }}>
              <Pagination
                page={page}
                totalCount={totalCount}
                pageSize={PER_PAGE}
                onPageChange={(p) => setPage(p)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
