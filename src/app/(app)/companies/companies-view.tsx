"use client";

import { getCompanies } from "@/actions/companies";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Plus, Building2, Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const PER_PAGE = 20;

type CompaniesData = { items: any[]; total: number } | null;

export function CompaniesView({ initialData }: { initialData: CompaniesData }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CompaniesData>(initialData);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      const result = await getCompanies({ search, page, perPage: PER_PAGE });
      setData(result.data);
      setLoading(false);
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [search, page]);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="space-y-6">
      {/* ヘッダー行 */}
      <div className="flex items-center justify-between">
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--color-text-title)" }}
        >
          カンパニー
        </h1>
        <Link
          href="/companies/new"
          className="inline-flex items-center gap-2 text-sm font-medium transition-colors"
          style={{
            backgroundColor: "var(--color-terra)",
            color: "#fff",
            borderRadius: "var(--radius-button)",
            padding: "0.5rem 1.25rem",
            textDecoration: "none",
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
      </div>

      {/* 検索バー */}
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: "var(--radius-card)",
          boxShadow: "var(--elevation-low)",
        }}
      >
        <div className="relative">
          <Search
            size={16}
            className="absolute left-4 top-1/2 -translate-y-1/2"
            style={{ color: "var(--color-sumi600)" }}
          />
          <input
            type="text"
            placeholder="会社名・コードで検索..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full px-4 py-2 pl-10 text-sm outline-none"
            style={{
              borderBottom: "1px solid var(--color-border-default)",
              borderRadius: "var(--radius-input)",
            }}
          />
        </div>
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
          <div
            className="flex items-center justify-center py-16 text-sm"
            style={{ color: "var(--color-sumi600)" }}
          >
            読み込み中...
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <Building2
              size={40}
              style={{ color: "var(--color-sumi600)" }}
            />
            <p
              className="text-sm"
              style={{ color: "var(--color-sumi600)" }}
            >
              カンパニーがまだありません
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
                    <th className="px-4 py-3 text-left">会社コード</th>
                    <th className="px-4 py-3 text-left">会社名</th>
                    <th className="px-4 py-3 text-left">事業者種別</th>
                    <th className="px-4 py-3 text-left">代表電話</th>
                    <th className="px-4 py-3 text-left">担当者</th>
                    <th className="px-4 py-3 text-left">作成日</th>
                    <th className="px-4 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((company: any) => (
                    <tr
                      key={company.id}
                      onClick={() => router.push(`/companies/${company.id}`)}
                      className="cursor-pointer transition-colors"
                      style={{
                        borderBottom:
                          "1px solid var(--color-border-default)",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.backgroundColor =
                          "var(--color-bg-hover)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.backgroundColor = "")
                      }
                    >
                      <td
                        className="px-4 py-3 font-mono text-xs"
                        style={{ color: "var(--color-sumi600)" }}
                      >
                        {company.company_code}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {company.name}
                      </td>
                      <td className="px-4 py-3">
                        {company.corporate_types?.name ?? "-"}
                      </td>
                      <td className="px-4 py-3">
                        {company.phone_main ?? "-"}
                      </td>
                      <td className="px-4 py-3">
                        {company.crm_users?.full_name ?? "-"}
                      </td>
                      <td
                        className="px-4 py-3 text-xs"
                        style={{ color: "var(--color-sumi600)" }}
                      >
                        {company.created_at
                          ? new Date(company.created_at).toLocaleDateString(
                              "ja-JP"
                            )
                          : "-"}
                      </td>
                      <td
                        className="px-4 py-3 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link
                          href={`/companies/${company.id}/edit`}
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
              style={{
                borderTop: "1px solid var(--color-border-default)",
              }}
            >
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="text-sm font-medium disabled:opacity-40"
                style={{ color: "var(--color-terra)" }}
              >
                前へ
              </button>
              <span
                className="text-xs"
                style={{ color: "var(--color-sumi600)" }}
              >
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
