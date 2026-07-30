"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Briefcase } from "lucide-react";
import { getAccounts } from "@/actions/accounts";
import { StatusBadge } from "@/components/ui/badges";
import { SearchInput } from "@/components/ui/SearchInput";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { FilterGroup, FilterClearButton } from "@/components/ui/FilterGroup";
import { Pagination } from "@/components/ui/Pagination";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import type { AccountWithRelations, Paged } from "@/types/relations";

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

type AccountStatus = { id: string; name: string };
type AccountType = { id: string; name: string };
type CrmUser = { id: string; full_name: string; role: string };
// 一覧データは Server Action の戻り値型をそのまま使う
type AccountsData = Paged<AccountWithRelations> | null;

interface AccountsViewProps {
  initialData: AccountsData;
  statuses: AccountStatus[];
  accountTypes: AccountType[];
  users: CrmUser[];
}

export function AccountsView({
  initialData,
  statuses,
  accountTypes,
  users,
}: AccountsViewProps) {
  const router = useRouter();
  const [data, setData] = useState<AccountsData>(initialData);
  const [statusFilter, setStatusFilter] = useState("");
  const [accountTypeFilter, setAccountTypeFilter] = useState("");
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
      const { data: result } = await getAccounts({
        statusId: key === "statusId" ? value || undefined : statusFilter || undefined,
        accountTypeId: key === "accountTypeId" ? value || undefined : accountTypeFilter || undefined,
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
    setAccountTypeFilter("");
    setOwnerFilter("");
    setKeyword("");
    setPage(1);
    startTransition(async () => {
      const { data: result } = await getAccounts({ perPage: DEFAULT_PAGE_SIZE, page: 1 });
      setData(result);
    });
  }

  function handlePageChange(next: number) {
    setPage(next);
    startTransition(async () => {
      const { data: result } = await getAccounts({
        statusId: statusFilter || undefined,
        accountTypeId: accountTypeFilter || undefined,
        ownerUserId: ownerFilter || undefined,
        search: keyword || undefined,
        perPage: DEFAULT_PAGE_SIZE,
        page: next,
      });
      setData(result);
    });
  }

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  return (
    <div>
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--color-text-title)" }}
        >
          取引先
        </h1>
        <Link
          href="/accounts/new"
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
          label="種別"
          value={accountTypeFilter}
          options={accountTypes.map((t) => ({ value: t.id, label: t.name }))}
          onChange={(v) => handleFilter("accountTypeId", v, setAccountTypeFilter)}
        />
        <FilterSelect
          label="担当者"
          value={ownerFilter}
          options={users.map((u) => ({ value: u.id, label: u.full_name }))}
          onChange={(v) => handleFilter("ownerUserId", v, setOwnerFilter)}
        />
        <SearchInput
          value={keyword}
          placeholder="取引先名で検索..."
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
      {rows.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-3 py-16"
          style={{
            backgroundColor: "#fff",
            borderRadius: "var(--radius-card)",
            boxShadow: "var(--elevation-low)",
          }}
        >
          <Briefcase size={40} style={{ color: "var(--color-sumi600)" }} />
          <p className="text-sm" style={{ color: "var(--color-sumi600)" }}>
            取引先が見つかりません
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
                {["取引先名", "ステータス", "種別", "会社名", "担当者", "最終更新日"].map(
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
              {rows.map((account) => (
                <tr
                  key={account.id}
                  className="transition-colors cursor-pointer"
                  style={{ borderBottom: "1px solid var(--color-border-default)" }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = "var(--color-bg-hover)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = "transparent")
                  }
                  onClick={() => router.push(`/accounts/${account.id}`)}
                >
                  {/* 取引先名 */}
                  <td className="px-4 py-3">
                    <Link
                      href={`/accounts/${account.id}`}
                      className="font-medium"
                      style={{ color: "var(--color-text-list)" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {account.name}
                    </Link>
                  </td>
                  {/* ステータス */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusBadge
                      name={account.account_status?.name}
                      seed={account.account_status?.id}
                    />
                  </td>
                  {/* 種別 */}
                  <td
                    className="px-4 py-3 whitespace-nowrap"
                    style={{ color: "var(--color-text-list)" }}
                  >
                    {account.account_type?.name ?? "—"}
                  </td>
                  {/* 会社名 */}
                  <td
                    className="px-4 py-3"
                    style={{ color: "var(--color-text-list)" }}
                  >
                    {account.company?.name ?? "—"}
                  </td>
                  {/* 担当者 */}
                  <td
                    className="px-4 py-3 whitespace-nowrap"
                    style={{ color: "var(--color-text-list)" }}
                  >
                    {account.owner?.full_name ?? "—"}
                  </td>
                  {/* 最終更新日 */}
                  <td
                    className="px-4 py-3 text-xs whitespace-nowrap"
                    style={{ color: "var(--color-text-list)" }}
                  >
                    {formatDateTime(account.updated_at)}
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
