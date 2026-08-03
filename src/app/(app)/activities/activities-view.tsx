"use client";

import { useState, useTransition } from "react";
import { getActivityFeed } from "@/actions/activity-feed";
import { ActivitySourceIcon } from "@/components/ui/ActivitySourceIcon";
import { ActivityTypeBadge, StatusBadge } from "@/components/ui/badges";
import { EntityLink } from "@/components/ui/EntityLink";
import { SearchInput } from "@/components/ui/SearchInput";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { FilterGroup, FilterClearButton } from "@/components/ui/FilterGroup";
import { DataTable } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import {
  ACTIVITY_ICON,
  ACTIVITY_SOURCE_LABELS,
  activityEntityHref,
  formatOccurredAt,
} from "@/lib/activity";
import type {
  ActivityFeedRow,
  ActivityFeedSourceKind,
  UserRef,
} from "@/types/relations";

const SOURCE_OPTIONS = (
  Object.keys(ACTIVITY_SOURCE_LABELS) as ActivityFeedSourceKind[]
).map((k) => ({ value: k, label: ACTIVITY_SOURCE_LABELS[k] }));

type Filters = {
  sourceKind: string;
  ownerUserId: string;
  from: string;
  to: string;
  q: string;
};

const EMPTY_FILTERS: Filters = {
  sourceKind: "",
  ownerUserId: "",
  from: "",
  to: "",
  q: "",
};

export function ActivitiesView({
  initialRows,
  initialTotal,
  users,
}: {
  initialRows: ActivityFeedRow[];
  initialTotal: number;
  users: UserRef[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();

  function fetchWith(next: Filters, nextPage: number) {
    startTransition(async () => {
      const { data } = await getActivityFeed({
        page: nextPage,
        perPage: DEFAULT_PAGE_SIZE,
        sourceKinds: next.sourceKind
          ? [next.sourceKind as ActivityFeedSourceKind]
          : undefined,
        ownerUserId: next.ownerUserId || undefined,
        from: next.from || undefined,
        to: next.to || undefined,
        q: next.q || undefined,
      });
      setRows(data?.rows ?? []);
      setTotal(data?.total ?? 0);
    });
  }

  /** フィルタを変えたら 1 ページ目に戻す */
  function updateFilter(key: keyof Filters, value: string) {
    const next = { ...filters, [key]: value };
    setFilters(next);
    setPage(1);
    fetchWith(next, 1);
  }

  function handleClear() {
    setFilters(EMPTY_FILTERS);
    setPage(1);
    fetchWith(EMPTY_FILTERS, 1);
  }

  function handlePageChange(next: number) {
    setPage(next);
    fetchWith(filters, next);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-xl sm:text-2xl font-bold" style={{ color: "var(--color-text-title)" }}>
          アクティビティ
        </h1>
        <span className="text-sm" style={{ color: "var(--color-sumi500)" }}>
          {total.toLocaleString()} 件
        </span>
      </div>
      <p className="text-sm mb-6" style={{ color: "var(--color-sumi500)" }}>
        社内対応・顧客行動・メールのやり取りを時系列でまとめています。
        記録の追加はリードや連絡先の画面から行います。
      </p>

      <FilterGroup className="mb-4">
        <FilterSelect
          label="記録元"
          value={filters.sourceKind}
          options={SOURCE_OPTIONS}
          onChange={(v) => updateFilter("sourceKind", v)}
        />
        <FilterSelect
          label="担当者"
          value={filters.ownerUserId}
          options={users.map((u) => ({ value: u.id, label: u.full_name }))}
          onChange={(v) => updateFilter("ownerUserId", v)}
        />
        <DateFilter
          label="開始日"
          value={filters.from}
          onChange={(v) => updateFilter("from", v)}
        />
        <DateFilter
          label="終了日"
          value={filters.to}
          onChange={(v) => updateFilter("to", v)}
        />
        <SearchInput
          value={filters.q}
          placeholder="相手先・内容で検索..."
          onChange={(v) => updateFilter("q", v)}
        />
        <FilterClearButton onClear={handleClear} />
        {isPending && (
          <span
            className="text-xs"
            style={{
              color: "var(--color-sumi500)",
              alignSelf: "flex-end",
              paddingBottom: "0.45rem",
            }}
          >
            読み込み中...
          </span>
        )}
      </FilterGroup>

      {/* 一覧（md 未満はカード） */}
      <DataTable
        items={rows}
        getKey={(row) => `${row.source_kind}:${row.id}`}
        emptyIcon={ACTIVITY_ICON}
        emptyMessage="アクティビティが見つかりません"
        columns={[
          {
            label: "日時",
            className: "text-xs whitespace-nowrap",
            render: (row) => (
              <span className="inline-flex items-center gap-1.5">
                <ActivitySourceIcon sourceKind={row.source_kind} />
                {formatOccurredAt(row.occurred_at, row.has_time)}
              </span>
            ),
          },
          {
            label: "種別",
            card: "meta",
            className: "whitespace-nowrap",
            render: (row) => (
              <ActivityTypeBadge name={row.activity_name} color={row.activity_color} />
            ),
          },
          {
            label: "結果",
            className: "whitespace-nowrap",
            render: (row) => (
              /* 社内対応の架電結果。他の記録元では空 */
              <StatusBadge
                name={row.outcome_name}
                color={row.outcome_color}
                seed={row.outcome_name}
              />
            ),
          },
          {
            /* 表では 1 行に収めて省略する。カードでは折り返して全文を出す */
            label: "内容",
            card: "title",
            className: "max-w-[22rem] overflow-hidden text-ellipsis whitespace-nowrap",
            render: (row) => row.detail || "—",
          },
          {
            label: "相手先",
            className: "whitespace-nowrap",
            render: (row) => (
              <EntityLink
                href={activityEntityHref(row.entity_type, row.entity_id)}
                compact
              >
                {row.entity_label}
              </EntityLink>
            ),
          },
          {
            label: "担当者",
            className: "whitespace-nowrap",
            render: (row) => row.actor_name || "—",
          },
        ]}
      />

      <Pagination
        page={page}
        totalCount={total}
        pageSize={DEFAULT_PAGE_SIZE}
        onPageChange={handlePageChange}
      />
    </div>
  );
}

/**
 * 期間フィルタ。FilterSelect と同じ体裁の日付入力。
 * 選択肢ではないため FilterSelect は使えず、ラベルの見た目だけ合わせている。
 */
function DateFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: "0.625rem",
          fontWeight: 600,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--color-sumi700)",
          marginBottom: "0.2rem",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          display: "block",
          border: "1px solid var(--color-border-default)",
          borderRadius: "var(--radius-button)",
          padding: "0.4rem 0.6rem",
          fontSize: "0.8125rem",
          color: "var(--color-text-body)",
          backgroundColor: "#fff",
        }}
      />
    </div>
  );
}
