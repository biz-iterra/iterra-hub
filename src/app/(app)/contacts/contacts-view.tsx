"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getContacts } from "@/actions/contacts";
import { Users, Search, Plus, Mail, Phone, Pencil } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ContactEmail {
  id: string;
  email: string;
  label: string | null;
  is_primary: boolean;
}

interface ContactPhone {
  id: string;
  phone: string;
  label: string | null;
  is_primary: boolean;
}

interface ContactRow {
  id: string;
  contact_code: string;
  last_name: string;
  first_name: string;
  contact_type: string;
  company: { id: string; name: string } | null;
  contact_status: { id: string; name: string } | null;
  owner: { id: string; full_name: string } | null;
  contact_emails: ContactEmail[];
  contact_phones: ContactPhone[];
}

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialData: any;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const CONTACT_TYPE_LABELS: Record<string, string> = {
  individual: "個人",
  corporate_rep: "法人代表",
  employee: "従業員",
  other: "その他",
};

function contactTypeBadgeStyle(type: string): React.CSSProperties {
  switch (type) {
    case "individual":
      return { backgroundColor: "var(--color-sage)", color: "#fff" };
    case "corporate_rep":
      return { backgroundColor: "var(--color-terra)", color: "#fff" };
    case "employee":
      return { backgroundColor: "var(--color-amber)", color: "var(--color-text-title)" };
    default:
      return { backgroundColor: "var(--color-sumi100)", color: "var(--color-sumi700)" };
  }
}

function getPrimaryEmail(emails: ContactEmail[]): string {
  if (!emails || emails.length === 0) return "\u2014";
  const primary = emails.find((e) => e.is_primary);
  return (primary ?? emails[0]).email;
}

function getPrimaryPhone(phones: ContactPhone[]): string {
  if (!phones || phones.length === 0) return "\u2014";
  const primary = phones.find((p) => p.is_primary);
  return (primary ?? phones[0]).phone;
}

const PER_PAGE = 20;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ContactsView({ initialData }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [rows, setRows] = useState<ContactRow[]>(initialData?.rows ?? []);
  const [totalCount, setTotalCount] = useState(initialData?.count ?? 0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(totalCount / PER_PAGE));

  const fetchData = useCallback(
    (s: string, p: number) => {
      startTransition(async () => {
        const { data } = await getContacts({ search: s || undefined, page: p, perPage: PER_PAGE });
        if (data) {
          setRows(data.rows as ContactRow[]);
          setTotalCount(data.count);
        }
      });
    },
    [],
  );

  // 検索変更時にページを1にリセット
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchData(search, 1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, fetchData]);

  // ページ変更
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
            コンタクト
          </h1>
          <p
            style={{
              fontSize: "0.875rem",
              color: "var(--color-sumi600)",
              margin: "0.25rem 0 0",
            }}
          >
            {totalCount} 件のコンタクト
          </p>
        </div>
        <Link
          href="/contacts/new"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            backgroundColor: "var(--color-terra)",
            color: "#fff",
            borderRadius: "var(--radius-button)",
            padding: "0.5rem 1.25rem",
            border: "none",
            cursor: "pointer",
            fontSize: "0.875rem",
            fontWeight: 600,
            textDecoration: "none",
            transition: "background-color 0.15s",
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
              placeholder="氏名・コードで検索..."
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
            <Users size={48} style={{ color: "var(--color-sumi300)" }} />
            <p
              style={{
                fontSize: "0.875rem",
                color: "var(--color-sumi600)",
                margin: 0,
              }}
            >
              コンタクトがまだありません
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
                    <th style={{ padding: "0.75rem 1rem" }}>コード</th>
                    <th style={{ padding: "0.75rem 1rem" }}>氏名</th>
                    <th style={{ padding: "0.75rem 1rem" }}>種別</th>
                    <th style={{ padding: "0.75rem 1rem" }}>所属</th>
                    <th style={{ padding: "0.75rem 1rem" }}>メール</th>
                    <th style={{ padding: "0.75rem 1rem" }}>電話</th>
                    <th style={{ padding: "0.75rem 1rem" }}>ステータス</th>
                    <th style={{ padding: "0.75rem 1rem" }}>担当者</th>
                    <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => router.push(`/contacts/${row.id}`)}
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
                        {row.contact_code}
                      </td>
                      <td
                        style={{
                          padding: "0.75rem 1rem",
                          fontWeight: 600,
                          color: "var(--color-text-title)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.last_name} {row.first_name}
                      </td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <span
                          style={{
                            display: "inline-block",
                            borderRadius: "var(--radius-badge)",
                            padding: "0.125rem 0.5rem",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            ...contactTypeBadgeStyle(row.contact_type),
                          }}
                        >
                          {CONTACT_TYPE_LABELS[row.contact_type] ?? row.contact_type}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "0.75rem 1rem",
                          color: "var(--color-sumi600)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.company?.name ?? "\u2014"}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", whiteSpace: "nowrap" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.25rem",
                            color: "var(--color-sumi600)",
                            fontSize: "0.8125rem",
                          }}
                        >
                          <Mail size={14} style={{ flexShrink: 0 }} />
                          {getPrimaryEmail(row.contact_emails)}
                        </span>
                      </td>
                      <td style={{ padding: "0.75rem 1rem", whiteSpace: "nowrap" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.25rem",
                            color: "var(--color-sumi600)",
                            fontSize: "0.8125rem",
                          }}
                        >
                          <Phone size={14} style={{ flexShrink: 0 }} />
                          {getPrimaryPhone(row.contact_phones)}
                        </span>
                      </td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        {row.contact_status ? (
                          <span
                            style={{
                              display: "inline-block",
                              backgroundColor: "var(--color-sumi100)",
                              borderRadius: "var(--radius-badge)",
                              padding: "0.125rem 0.5rem",
                              fontSize: "0.75rem",
                            }}
                          >
                            {row.contact_status.name}
                          </span>
                        ) : (
                          <span style={{ color: "var(--color-sumi400)" }}>{"\u2014"}</span>
                        )}
                      </td>
                      <td
                        style={{
                          padding: "0.75rem 1rem",
                          color: "var(--color-sumi600)",
                          whiteSpace: "nowrap",
                          fontSize: "0.8125rem",
                        }}
                      >
                        {row.owner?.full_name ?? "\u2014"}
                      </td>
                      <td
                        style={{
                          padding: "0.75rem 1rem",
                          textAlign: "right",
                          whiteSpace: "nowrap",
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link
                          href={`/contacts/${row.id}/edit`}
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
                  {(page - 1) * PER_PAGE + 1}\u2013{Math.min(page * PER_PAGE, totalCount)} /{" "}
                  {totalCount} 件
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
