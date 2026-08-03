"use client";

import Link from "next/link";
import { Plus, UserSearch } from "lucide-react";
import { getLeads } from "@/actions/leads";
import { useListView } from "@/hooks/useListView";
import { LIST_FILTER_KEYS } from "@/lib/list-sort";
import { SearchInput } from "@/components/ui/SearchInput";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { FilterGroup, FilterClearButton } from "@/components/ui/FilterGroup";
import { DataTable } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import {
  TemperatureBadge,
  StageBadge,
  StatusBadge,
  CategoryBadge,
} from "@/components/ui/badges";
import type { LeadListRow, Paged } from "@/types/relations";

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

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

type LeadStage = { id: string; name: string; sort_order: number };
type LeadStatus = { id: string; name: string; sort_order: number; stage_id: string };
type LeadTemperature = { id: string; code: string; name: string; color: string | null };
type LeadCategory = { id: string; code: string; name: string; color: string | null };
type CrmUser = { id: string; full_name: string; role: string };

interface LeadsViewProps {
  initialData: Paged<LeadListRow> | null;
  stages: LeadStage[];
  statuses: LeadStatus[];
  temperatures: LeadTemperature[];
  categories: LeadCategory[];
  users: CrmUser[];
  currentUserRole: string;
}

export function LeadsView({
  initialData,
  stages,
  statuses,
  temperatures,
  categories,
  users,
  // currentUserRole は props 型に残しているが、現状 UI 分岐に使っていないため受け取らない
}: LeadsViewProps) {
  const { filters, page, sort, setFilter, setFilters, setPage, setSort, clear, isPending, data } =
    useListView({
      filterKeys: LIST_FILTER_KEYS.leads,
      initialData,
      load: (state) =>
        getLeads({
          stage_id: state.filters.stageId || undefined,
          status_id: state.filters.statusId || undefined,
          category_id: state.filters.categoryId || undefined,
          temperature_id: state.filters.temperatureId || undefined,
          owner_user_id: state.filters.ownerUserId || undefined,
          keyword: state.filters.search || undefined,
          perPage: DEFAULT_PAGE_SIZE,
          page: state.page,
          sortField: state.sort?.field,
          sortDirection: state.sort?.direction,
        }),
    });

  const stageFilter = filters.stageId ?? "";
  const statusFilter = filters.statusId ?? "";
  const categoryFilter = filters.categoryId ?? "";
  const temperatureFilter = filters.temperatureId ?? "";
  const ownerFilter = filters.ownerUserId ?? "";
  const keyword = filters.search ?? "";

  // sort_order でステータス選択肢をステージ別にフィルタ
  const filteredStatusOptions = stageFilter
    ? statuses.filter((s) => s.stage_id === stageFilter)
    : statuses;

  const items = data?.rows ?? [];

  return (
    <div>
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <h1
          className="text-xl sm:text-2xl font-bold"
          style={{ color: "var(--color-text-title)" }}
        >
          リード
        </h1>

        <Link
          href="/leads/new"
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
          label="ステージ"
          value={stageFilter}
          options={stages.map((s) => ({ value: s.id, label: s.name }))}
          // ステージを変えるとステータスの選択肢が変わるので、
          // 前のステージのステータスが残らないよう同時に外す
          onChange={(v) => setFilters({ stageId: v, statusId: "" })}
        />
        <FilterSelect
          label="ステータス"
          value={statusFilter}
          options={filteredStatusOptions.map((s) => ({ value: s.id, label: s.name }))}
          onChange={(v) => setFilter("statusId", v)}
        />
        <FilterSelect
          label="カテゴリ"
          value={categoryFilter}
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
          onChange={(v) => setFilter("categoryId", v)}
        />
        <FilterSelect
          label="温度感"
          value={temperatureFilter}
          options={temperatures.map((t) => ({ value: t.id, label: t.name }))}
          onChange={(v) => setFilter("temperatureId", v)}
        />
        <FilterSelect
          label="担当者"
          value={ownerFilter}
          options={users.map((u) => ({ value: u.id, label: u.full_name }))}
          onChange={(v) => setFilter("ownerUserId", v)}
        />
        <SearchInput
          value={keyword}
          placeholder="リード名・電話番号で検索..."
          onChange={(v) => setFilter("search", v)}
        />
        {/* フィルタ一括クリア */}
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
        getKey={(lead) => lead.id}
        getHref={(lead) => `/leads/${lead.id}`}
        emptyIcon={UserSearch}
        emptyMessage="リードが見つかりません"
        sort={sort}
        onSortChange={setSort}
        columns={[
          {
            label: "リード名",
            sortKey: "lead_name",
            card: "title",
            render: (lead) => (
              <Link
                href={`/leads/${lead.id}`}
                className="font-medium"
                style={{ color: "var(--color-text-list)" }}
                onClick={(e) => e.stopPropagation()}
              >
                {lead.lead_name}
              </Link>
            ),
          },
          {
            label: "ステージ",
            card: "meta",
            className: "whitespace-nowrap",
            render: (lead) => (
              <StageBadge
                name={lead.stage?.name}
                color={lead.stage?.color}
                sortOrder={lead.stage?.sort_order}
                total={stages.length}
              />
            ),
          },
          {
            label: "ステータス",
            className: "whitespace-nowrap",
            render: (lead) => (
              <StatusBadge
                name={lead.status?.name}
                color={lead.status?.color}
                sortOrder={lead.status?.sort_order}
                total={statuses.length}
              />
            ),
          },
          {
            label: "温度感",
            className: "whitespace-nowrap",
            render: (lead) => {
              const temp = lead.temperature as { code: string; name: string } | null;
              return temp ? (
                <TemperatureBadge code={temp.code} name={temp.name} />
              ) : (
                <span style={{ color: "var(--color-text-list)" }}>—</span>
              );
            },
          },
          {
            /* 以前は「スコア順」トグルで並べ替えていた。列にしてサーバー側で
               並べ替えるようにしたので、表示中のページ内だけでなく全件で効く */
            label: "スコア",
            sortKey: "score",
            className: "whitespace-nowrap text-xs",
            render: (lead) => (lead.score == null ? "—" : String(lead.score)),
          },
          {
            label: "カテゴリ",
            className: "whitespace-nowrap",
            render: (lead) => {
              const category = lead.category as
                | { id: string; code: string; name: string; color: string | null }
                | null;
              return <CategoryBadge name={category?.name} color={category?.color} />;
            },
          },
          {
            label: "企業名",
            sortKey: "company_name",
            className: "max-w-[140px] truncate",
            render: (lead) =>
              lead.company_name || (
                <span style={{ color: "var(--color-text-list)" }}>—</span>
              ),
          },
          {
            label: "最終アクティビティ",
            className: "text-xs whitespace-nowrap",
            render: (lead) => formatDate(lead.last_activity_at),
          },
          {
            label: "担当者",
            className: "whitespace-nowrap",
            render: (lead) => lead.owner?.full_name ?? "—",
          },
          {
            label: "最終更新日",
            sortKey: "updated_at",
            className: "text-xs whitespace-nowrap",
            render: (lead) => formatDateTime(lead.updated_at),
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
