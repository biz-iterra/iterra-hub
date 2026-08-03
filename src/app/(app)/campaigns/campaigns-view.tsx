"use client";

import Link from "next/link";
import { Plus, Megaphone } from "lucide-react";
import { getCampaigns } from "@/actions/campaigns";
import { useListView } from "@/hooks/useListView";
import { LIST_FILTER_KEYS } from "@/lib/list-sort";
import { CampaignTypeBadge, CampaignStatusBadge } from "@/components/ui/badges";
import { FilterGroup, FilterClearButton } from "@/components/ui/FilterGroup";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { SearchInput } from "@/components/ui/SearchInput";
import { DataTable } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import type { Paged, Row } from "@/types/relations";

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

export function CampaignsView({
  initialData,
  currentUserRole,
}: {
  initialData: Paged<Row<"campaigns">> | null;
  currentUserRole: string;
}) {
  const { filters, page, sort, setFilter, setPage, setSort, clear, isPending, data } =
    useListView({
      filterKeys: LIST_FILTER_KEYS.campaigns,
      initialData,
      load: (state) =>
        getCampaigns({
          // 種別・ステータスは URL 由来の文字列。想定外の値は Zod が弾く
          type: (state.filters.type || undefined) as
            | "generation"
            | "nurturing"
            | "qualification"
            | undefined,
          status: (state.filters.status || undefined) as
            | "draft"
            | "active"
            | "paused"
            | "completed"
            | "cancelled"
            | undefined,
          keyword: state.filters.search || undefined,
          perPage: DEFAULT_PAGE_SIZE,
          page: state.page,
          sortField: state.sort?.field,
          sortDirection: state.sort?.direction,
        }),
    });

  const isManagerOrAbove =
    currentUserRole === "manager" || currentUserRole === "admin";

  const typeFilter = filters.type ?? "";
  const statusFilter = filters.status ?? "";
  const keyword = filters.search ?? "";

  const items = data?.rows ?? [];

  return (
    <div>
      {/* ヘッダー */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold" style={{ color: "var(--color-text-title)" }}>
          キャンペーン
        </h1>
        {isManagerOrAbove && (
          <Link
            href="/campaigns/new"
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
        )}
      </div>

      {/* フィルター */}
      <FilterGroup className="mb-4">
        <FilterSelect
          label="種別"
          value={typeFilter}
          options={[
            { value: "generation", label: "獲得" },
            { value: "nurturing", label: "育成" },
            { value: "qualification", label: "選定" },
          ]}
onChange={(v) => setFilter("type", v)}
        />
        <FilterSelect
          label="ステータス"
          value={statusFilter}
          options={[
            { value: "draft", label: "下書き" },
            { value: "active", label: "実施中" },
            { value: "paused", label: "一時停止" },
            { value: "completed", label: "完了" },
            { value: "cancelled", label: "中止" },
          ]}
onChange={(v) => setFilter("status", v)}
        />
        <SearchInput
          value={keyword}
          placeholder="キャンペーン名で検索..."
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
        getKey={(campaign) => campaign.id}
        getHref={(campaign) => `/campaigns/${campaign.id}`}
        emptyIcon={Megaphone}
        emptyMessage="キャンペーンが見つかりません"
        sort={sort}
        onSortChange={setSort}
        columns={[
          {
            label: "キャンペーン名",
            sortKey: "name",
            card: "title",
            render: (campaign) => (
              <Link
                href={`/campaigns/${campaign.id}`}
                style={{ color: "var(--color-text-list)", fontWeight: 500, textDecoration: "none" }}
                onClick={(e) => e.stopPropagation()}
              >
                {campaign.name}
              </Link>
            ),
          },
          {
            label: "ステータス",
            card: "meta",
            className: "whitespace-nowrap",
            render: (campaign) => <CampaignStatusBadge status={campaign.status} />,
          },
          {
            label: "種別",
            className: "whitespace-nowrap",
            render: (campaign) => <CampaignTypeBadge type={campaign.type} />,
          },
          {
            label: "期間",
            className: "text-xs whitespace-nowrap",
            render: (campaign) => (
              <>
                {campaign.start_date
                  ? new Date(campaign.start_date).toLocaleDateString("ja-JP")
                  : "—"}
                {" 〜 "}
                {campaign.end_date
                  ? new Date(campaign.end_date).toLocaleDateString("ja-JP")
                  : "—"}
              </>
            ),
          },
          {
            label: "最終更新日",
            sortKey: "updated_at",
            className: "text-xs whitespace-nowrap",
            render: (campaign) => formatDateTime(campaign.updated_at),
          },
        ]}
      />
      {/* ページネーション */}
      <Pagination
        page={page}
        totalCount={data?.total ?? 0}
        pageSize={DEFAULT_PAGE_SIZE}
        onPageChange={setPage}
      />
    </div>
  );
}
