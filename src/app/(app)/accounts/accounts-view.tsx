"use client";

import Link from "next/link";
import { Plus, Briefcase } from "lucide-react";
import { getAccounts } from "@/actions/accounts";
import { useListView } from "@/hooks/useListView";
import { LIST_FILTER_KEYS } from "@/lib/list-sort";
import { AccountTypeBadge, LabelBadge, StatusBadge } from "@/components/ui/badges";
import { SearchInput } from "@/components/ui/SearchInput";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { FilterGroup, FilterClearButton } from "@/components/ui/FilterGroup";
import { DataTable } from "@/components/ui/DataTable";
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
  const { filters, page, sort, setFilter, setPage, setSort, clear, isPending, data } =
    useListView({
      filterKeys: LIST_FILTER_KEYS.accounts,
      initialData,
      load: (state) =>
        getAccounts({
          statusId: state.filters.statusId || undefined,
          accountTypeId: state.filters.typeId || undefined,
          ownerUserId: state.filters.ownerUserId || undefined,
          search: state.filters.search || undefined,
          perPage: DEFAULT_PAGE_SIZE,
          page: state.page,
          sortField: state.sort?.field,
          sortDirection: state.sort?.direction,
        }),
    });

  const statusFilter = filters.statusId ?? "";
  const accountTypeFilter = filters.typeId ?? "";
  const ownerFilter = filters.ownerUserId ?? "";
  const keyword = filters.search ?? "";

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  return (
    <div>
      {/* ヘッダー */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4 sm:mb-6">
        <h1
          className="text-xl sm:text-2xl font-bold"
          style={{ color: "var(--color-text-title)" }}
        >
          取引先
        </h1>
        <Link
          href="/accounts/new"
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
          label="種別"
          value={accountTypeFilter}
          options={accountTypes.map((t) => ({ value: t.id, label: t.name }))}
          onChange={(v) => setFilter("typeId", v)}
        />
        <FilterSelect
          label="担当者"
          value={ownerFilter}
          options={users.map((u) => ({ value: u.id, label: u.full_name }))}
          onChange={(v) => setFilter("ownerUserId", v)}
        />
        <SearchInput
          value={keyword}
          placeholder="取引先名で検索..."
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
        getKey={(account) => account.id}
        getHref={(account) => `/accounts/${account.id}`}
        emptyIcon={Briefcase}
        emptyMessage="取引先が見つかりません"
        sort={sort}
        onSortChange={setSort}
        columns={[
          {
            /*
              種別（法人／個人事業主）は取引先名セル内のバッジで示す。
              区分（顧客／仕入れ先など）は複数付くため独立した列にする。
            */
            label: "取引先名",
            sortKey: "name",
            card: "title",
            render: (account) => (
              <span className="inline-flex items-center gap-2 flex-wrap">
                <Link
                  href={`/accounts/${account.id}`}
                  className="font-medium"
                  style={{ color: "var(--color-text-list)" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {account.name}
                </Link>
                {/* 種別未設定の行にダッシュを出さないよう、値がある時だけ描画する */}
                {account.account_type && (
                  <AccountTypeBadge
                    name={account.account_type.name}
                    slug={account.account_type.slug}
                  />
                )}
              </span>
            ),
          },
          {
            label: "ステータス",
            card: "meta",
            className: "whitespace-nowrap",
            render: (account) => (
              <StatusBadge
                name={account.account_status?.name}
                color={account.account_status?.color}
                seed={account.account_status?.id}
              />
            ),
          },
          {
            label: "区分",
            render: (account) =>
              account.account_roles && account.account_roles.length > 0 ? (
                <span className="inline-flex flex-wrap items-center gap-1">
                  {[...account.account_roles]
                    .sort(
                      (a, b) =>
                        (a.role_type?.sort_order ?? 0) - (b.role_type?.sort_order ?? 0)
                    )
                    .map((r) =>
                      r.role_type ? (
                        <LabelBadge
                          key={r.id}
                          name={r.role_type.name}
                          color={r.role_type.color}
                        />
                      ) : null
                    )}
                </span>
              ) : (
                <span style={{ color: "var(--color-sumi400)" }}>—</span>
              ),
          },
          {
            label: "会社名",
            render: (account) => account.company?.name ?? "—",
          },
          {
            label: "担当者",
            className: "whitespace-nowrap",
            render: (account) => account.owner?.full_name ?? "—",
          },
          {
            label: "最終更新日",
            sortKey: "updated_at",
            className: "text-xs whitespace-nowrap",
            render: (account) => formatDateTime(account.updated_at),
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
