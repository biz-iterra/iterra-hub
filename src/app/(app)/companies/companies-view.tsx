"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Plus, Building2 } from "lucide-react";
import { getCompanies } from "@/actions/companies";
import { StatusBadge } from "@/components/ui/badges";
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
  const [data, setData] = useState<CompaniesData>(initialData);
  const [statusFilter, setStatusFilter] = useState("");
  const [corporateTypeFilter, setCorporateTypeFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();

  function handleFilter(
    key: string,
    value: string,
    setter: (v: string) => void
  ) {
    setter(value);
    setPage(1);
    startTransition(async () => {
      const { data: result } = await getCompanies({
        statusId: key === "statusId" ? value || undefined : statusFilter || undefined,
        corporateTypeId: key === "corporateTypeId" ? value || undefined : corporateTypeFilter || undefined,
        ownerUserId: key === "ownerUserId" ? value || undefined : ownerFilter || undefined,
        search: key === "search" ? value || undefined : keyword || undefined,
        perPage: DEFAULT_PAGE_SIZE,
        page: 1,
      });
      setData(result);
    });
  }

  function handleClear() {
    setStatusFilter("");
    setCorporateTypeFilter("");
    setOwnerFilter("");
    setKeyword("");
    setPage(1);
    startTransition(async () => {
      const { data: result } = await getCompanies({ perPage: DEFAULT_PAGE_SIZE, page: 1 });
      setData(result);
    });
  }

  function handlePageChange(next: number) {
    setPage(next);
    startTransition(async () => {
      const { data: result } = await getCompanies({
        statusId: statusFilter || undefined,
        corporateTypeId: corporateTypeFilter || undefined,
        ownerUserId: ownerFilter || undefined,
        search: keyword || undefined,
        perPage: DEFAULT_PAGE_SIZE,
        page: next,
      });
      setData(result);
    });
  }

  const items = data?.rows ?? [];
  const total = data?.total ?? 0;

  return (
    <div>
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--color-text-title)" }}
        >
          会社情報
        </h1>
        <Link
          href="/companies/new"
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white transition-colors"
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
          onChange={(v) => handleFilter("statusId", v, setStatusFilter)}
        />
        <FilterSelect
          label="法人格"
          value={corporateTypeFilter}
          options={corporateTypes.map((c) => ({ value: c.id, label: c.name }))}
          onChange={(v) => handleFilter("corporateTypeId", v, setCorporateTypeFilter)}
        />
        <FilterSelect
          label="担当者"
          value={ownerFilter}
          options={users.map((u) => ({ value: u.id, label: u.full_name }))}
          onChange={(v) => handleFilter("ownerUserId", v, setOwnerFilter)}
        />
        <SearchInput
          value={keyword}
          placeholder="会社名で検索..."
          onChange={(v) => handleFilter("search", v, setKeyword)}
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

      {/* テーブル */}
      {items.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-3 py-16"
          style={{
            backgroundColor: "#fff",
            borderRadius: "var(--radius-card)",
            boxShadow: "var(--elevation-low)",
          }}
        >
          <Building2 size={40} style={{ color: "var(--color-sumi600)" }} />
          <p className="text-sm" style={{ color: "var(--color-sumi600)" }}>
            会社情報が見つかりません
          </p>
        </div>
      ) : (
        <div
          className="overflow-x-auto no-scrollbar"
          style={{
            backgroundColor: "#fff",
            borderRadius: "var(--radius-card)",
            boxShadow: "var(--elevation-low)",
          }}
        >
          <table className="w-full text-sm" style={{ tableLayout: "auto" }}>
            <thead>
              <tr style={{ backgroundColor: "var(--color-sumi50)" }}>
                {["会社名", "ステータス", "法人格", "代表電話", "担当者", "最終更新日"].map(
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
              {items.map((company) => (
                <tr
                  key={company.id}
                  className="transition-colors cursor-pointer"
                  style={{ borderBottom: "1px solid var(--color-border-default)" }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = "var(--color-bg-hover)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = "transparent")
                  }
                  onClick={() => (window.location.href = `/companies/${company.id}`)}
                >
                  {/* 会社名 */}
                  <td className="px-4 py-3">
                    <Link
                      href={`/companies/${company.id}`}
                      className="font-medium"
                      style={{ color: "var(--color-text-list)" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {company.name}
                    </Link>
                  </td>
                  {/* ステータス */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusBadge
                      name={company.company_status?.name}
                      seed={company.company_status?.id}
                    />
                  </td>
                  {/* 法人格 */}
                  <td
                    className="px-4 py-3 whitespace-nowrap"
                    style={{ color: "var(--color-text-list)" }}
                  >
                    {company.corporate_types?.name ?? "—"}
                  </td>
                  {/* 代表電話 */}
                  <td
                    className="px-4 py-3"
                    style={{ color: "var(--color-text-list)" }}
                  >
                    {company.phone ?? "—"}
                  </td>
                  {/* 担当者 */}
                  <td
                    className="px-4 py-3 whitespace-nowrap"
                    style={{ color: "var(--color-text-list)" }}
                  >
                    {company.crm_users?.full_name ?? "—"}
                  </td>
                  {/* 最終更新日 */}
                  <td
                    className="px-4 py-3 text-xs whitespace-nowrap"
                    style={{ color: "var(--color-text-list)" }}
                  >
                    {formatDateTime(company.updated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ページネーション */}
      <Pagination
        page={page}
        totalCount={total}
        pageSize={DEFAULT_PAGE_SIZE}
        onPageChange={handlePageChange}
      />
    </div>
  );
}
