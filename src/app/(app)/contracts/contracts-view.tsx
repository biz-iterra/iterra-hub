"use client";

import { getContracts } from "@/actions/contracts";
import { FileText, Search, Plus, Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useTransition } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ContractRow {
  id: string;
  contract_code: string;
  contract_name: string;
  contract_method: string | null;
  start_date: string | null;
  end_date: string | null;
  deal: { id: string; deal_code: string; name: string } | null;
  contract_type: { id: string; name: string } | null;
  registered_user: { id: string; full_name: string } | null;
}

interface Props {
  initialData: { items: ContractRow[]; count: number } | null;
  isManagerOrAbove: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const CONTRACT_METHOD_LABELS: Record<string, string> = {
  paper: "紙面",
  electronic: "電子",
  verbal: "口頭",
};

function contractMethodBadgeStyle(method: string): React.CSSProperties {
  switch (method) {
    case "electronic":
      return { backgroundColor: "var(--color-sage)", color: "#fff" };
    case "verbal":
      return { backgroundColor: "var(--color-amber)", color: "var(--color-text-title)" };
    default:
      return { backgroundColor: "var(--color-sumi100)", color: "var(--color-sumi700)" };
  }
}

function formatDate(date: string | null | undefined): string {
  if (!date) return "\u2014";
  return new Date(date).toLocaleDateString("ja-JP");
}

const PER_PAGE = 20;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ContractsView({ initialData, isManagerOrAbove }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [rows, setRows] = useState<ContractRow[]>(initialData?.items ?? []);
  const [totalCount, setTotalCount] = useState(initialData?.count ?? 0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(totalCount / PER_PAGE));

  const fetchData = useCallback((s: string, p: number) => {
    startTransition(async () => {
      const { data } = await getContracts({
        search: s || undefined,
        page: p,
        perPage: PER_PAGE,
      });
      if (data) {
        setRows(data.items as ContractRow[]);
        setTotalCount(data.count);
      }
    });
  }, []);

  // debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchData(search, 1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, fetchData]);

  // page change
  useEffect(() => {
    if (page > 1) fetchData(search, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

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

      {/* Card */}
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: "var(--radius-card)",
          boxShadow: "var(--elevation-low)",
          overflow: "hidden",
        }}
      >
        {/* Search */}
        <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid var(--color-border-default)" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              backgroundColor: "var(--color-sumi50)",
              borderRadius: "var(--radius-button)",
              padding: "0.5rem 0.75rem",
              maxWidth: "24rem",
            }}
          >
            <Search size={16} style={{ color: "var(--color-sumi600)", flexShrink: 0 }} />
            <input
              type="text"
              placeholder="契約コード・契約書名で検索..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                border: "none",
                outline: "none",
                backgroundColor: "transparent",
                fontSize: "0.875rem",
                width: "100%",
                color: "var(--color-text-title)",
              }}
            />
          </div>
        </div>

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
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
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
                    <th style={{ padding: "0.75rem 1rem" }}>契約コード</th>
                    <th style={{ padding: "0.75rem 1rem" }}>契約書名</th>
                    <th style={{ padding: "0.75rem 1rem" }}>ディール</th>
                    <th style={{ padding: "0.75rem 1rem" }}>契約種別</th>
                    <th style={{ padding: "0.75rem 1rem" }}>契約方法</th>
                    <th style={{ padding: "0.75rem 1rem" }}>契約開始日</th>
                    <th style={{ padding: "0.75rem 1rem" }}>契約終了日</th>
                    <th style={{ padding: "0.75rem 1rem" }}>登録者</th>
                    {isManagerOrAbove && (
                      <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>
                        操作
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => router.push(`/contracts/${row.id}`)}
                      style={{
                        borderBottom: "1px solid var(--color-border-default)",
                        cursor: "pointer",
                        fontSize: "0.875rem",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.backgroundColor = "var(--color-bg-hover)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.backgroundColor = "transparent")
                      }
                    >
                      <td
                        style={{
                          padding: "0.75rem 1rem",
                          fontFamily: "monospace",
                          fontSize: "0.75rem",
                          color: "var(--color-sumi600)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.contract_code}
                      </td>
                      <td
                        style={{
                          padding: "0.75rem 1rem",
                          fontWeight: 600,
                          color: "var(--color-text-title)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.contract_name}
                      </td>
                      <td
                        style={{
                          padding: "0.75rem 1rem",
                          color: "var(--color-sumi600)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.deal ? (
                          <span>
                            <span
                              style={{
                                fontFamily: "monospace",
                                fontSize: "0.75rem",
                                marginRight: "0.375rem",
                              }}
                            >
                              {row.deal.deal_code}
                            </span>
                            {row.deal.name}
                          </span>
                        ) : (
                          "\u2014"
                        )}
                      </td>
                      <td
                        style={{
                          padding: "0.75rem 1rem",
                          color: "var(--color-sumi600)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.contract_type?.name ?? "\u2014"}
                      </td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        {row.contract_method ? (
                          <span
                            style={{
                              display: "inline-block",
                              borderRadius: "var(--radius-badge)",
                              padding: "0.125rem 0.5rem",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              ...contractMethodBadgeStyle(row.contract_method),
                            }}
                          >
                            {CONTRACT_METHOD_LABELS[row.contract_method] ?? row.contract_method}
                          </span>
                        ) : (
                          <span style={{ color: "var(--color-sumi400)" }}>{"\u2014"}</span>
                        )}
                      </td>
                      <td
                        style={{
                          padding: "0.75rem 1rem",
                          fontSize: "0.8125rem",
                          color: "var(--color-sumi600)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatDate(row.start_date)}
                      </td>
                      <td
                        style={{
                          padding: "0.75rem 1rem",
                          fontSize: "0.8125rem",
                          color: "var(--color-sumi600)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatDate(row.end_date)}
                      </td>
                      <td
                        style={{
                          padding: "0.75rem 1rem",
                          color: "var(--color-sumi600)",
                          whiteSpace: "nowrap",
                          fontSize: "0.8125rem",
                        }}
                      >
                        {row.registered_user?.full_name ?? "\u2014"}
                      </td>
                      {isManagerOrAbove && (
                        <td
                          style={{
                            padding: "0.75rem 1rem",
                            textAlign: "right",
                            whiteSpace: "nowrap",
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Link
                            href={`/contracts/${row.id}/edit`}
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
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.75rem 1.5rem",
                  borderTop: "1px solid var(--color-border-default)",
                  fontSize: "0.8125rem",
                  color: "var(--color-sumi600)",
                }}
              >
                <span>
                  {(page - 1) * PER_PAGE + 1}
                  {"\u2013"}
                  {Math.min(page * PER_PAGE, totalCount)} / {totalCount} 件
                </span>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    disabled={page <= 1 || isPending}
                    onClick={() => setPage((p) => p - 1)}
                    style={{
                      padding: "0.375rem 0.75rem",
                      borderRadius: "var(--radius-button)",
                      border: "1px solid var(--color-border-default)",
                      backgroundColor: "#fff",
                      cursor: page <= 1 ? "not-allowed" : "pointer",
                      opacity: page <= 1 ? 0.5 : 1,
                      fontSize: "0.8125rem",
                    }}
                  >
                    前へ
                  </button>
                  <button
                    disabled={page >= totalPages || isPending}
                    onClick={() => setPage((p) => p + 1)}
                    style={{
                      padding: "0.375rem 0.75rem",
                      borderRadius: "var(--radius-button)",
                      border: "1px solid var(--color-border-default)",
                      backgroundColor: "#fff",
                      cursor: page >= totalPages ? "not-allowed" : "pointer",
                      opacity: page >= totalPages ? 0.5 : 1,
                      fontSize: "0.8125rem",
                    }}
                  >
                    次へ
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
