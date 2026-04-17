"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getTalents } from "@/actions/talents";
import { UserCircle, Search, Star, Pencil } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Skill {
  id: string;
  proficiency_level: number;
  skill: { id: string; name: string; skill_categories: { name: string } | null };
}

interface TalentRow {
  id: string;
  overall_assessment: string | null;
  contact: {
    id: string;
    contact_code: string;
    last_name: string;
    first_name: string;
    department: string | null;
    job_title: string | null;
  } | null;
  talent_skills: Skill[];
}

interface Props {
  initialData: { items: TalentRow[]; count: number } | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getTopSkills(skills: Skill[], limit = 3): Skill[] {
  return [...skills]
    .sort((a, b) => b.proficiency_level - a.proficiency_level)
    .slice(0, limit);
}

function truncate(text: string | null, max: number): string {
  if (!text) return "\u2014";
  return text.length > max ? text.slice(0, max) + "..." : text;
}

const PER_PAGE = 20;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function TalentsView({ initialData }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [rows, setRows] = useState<TalentRow[]>(initialData?.items ?? []);
  const [totalCount, setTotalCount] = useState(initialData?.count ?? 0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(totalCount / PER_PAGE));

  const fetchData = useCallback(
    (s: string, p: number) => {
      startTransition(async () => {
        const { data } = await getTalents({ search: s || undefined, page: p, perPage: PER_PAGE });
        if (data) {
          setRows(data.items as TalentRow[]);
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
            タレント
          </h1>
          <p
            style={{
              fontSize: "0.875rem",
              color: "var(--color-sumi600)",
              margin: "0.25rem 0 0",
            }}
          >
            {totalCount} 件のタレント
          </p>
        </div>
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
              placeholder="コンタクト名で検索..."
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
            <UserCircle size={48} style={{ color: "var(--color-sumi300)" }} />
            <p
              style={{
                fontSize: "0.875rem",
                color: "var(--color-sumi600)",
                margin: 0,
              }}
            >
              タレントがまだありません
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
                    <th style={{ padding: "0.75rem 1rem" }}>コンタクト名</th>
                    <th style={{ padding: "0.75rem 1rem" }}>部署・役職</th>
                    <th style={{ padding: "0.75rem 1rem" }}>スキル</th>
                    <th style={{ padding: "0.75rem 1rem" }}>総合評価</th>
                    <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const topSkills = getTopSkills(row.talent_skills ?? []);

                    return (
                      <tr
                        key={row.id}
                        onClick={() => router.push(`/talents/${row.id}`)}
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
                            fontWeight: 600,
                            color: "var(--color-text-title)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {row.contact
                            ? `${row.contact.last_name} ${row.contact.first_name}`
                            : "\u2014"}
                        </td>
                        <td
                          style={{
                            padding: "0.75rem 1rem",
                            color: "var(--color-sumi600)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {row.contact?.department || row.contact?.job_title
                            ? [row.contact.department, row.contact.job_title]
                                .filter(Boolean)
                                .join(" / ")
                            : "\u2014"}
                        </td>
                        <td style={{ padding: "0.75rem 1rem" }}>
                          <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
                            {topSkills.length === 0 && (
                              <span style={{ color: "var(--color-sumi400)" }}>{"\u2014"}</span>
                            )}
                            {topSkills.map((s) => (
                              <span
                                key={s.id}
                                style={{
                                  display: "inline-block",
                                  borderRadius: "var(--radius-badge)",
                                  padding: "0.125rem 0.5rem",
                                  fontSize: "0.75rem",
                                  fontWeight: 600,
                                  whiteSpace: "nowrap",
                                  ...(s.proficiency_level >= 4
                                    ? { backgroundColor: "var(--color-sage)", color: "#fff" }
                                    : {
                                        backgroundColor: "var(--color-sumi100)",
                                        color: "var(--color-sumi700)",
                                      }),
                                }}
                              >
                                {s.skill.name} Lv.{s.proficiency_level}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td
                          style={{
                            padding: "0.75rem 1rem",
                            color: "var(--color-sumi600)",
                            maxWidth: "20rem",
                            fontSize: "0.8125rem",
                          }}
                        >
                          {truncate(row.overall_assessment, 50)}
                        </td>
                        <td
                          style={{
                            padding: "0.75rem 1rem",
                            textAlign: "right",
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Link
                            href={`/talents/${row.id}/edit`}
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
                    );
                  })}
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
