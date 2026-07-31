"use client";

import { useState, useTransition } from "react";
import { Activity } from "lucide-react";
import { getActivityFeed } from "@/actions/activity-feed";
import { ActivityTypeBadge, StatusBadge } from "@/components/ui/badges";
import { EntityLink } from "@/components/ui/EntityLink";
import { SearchInput } from "@/components/ui/SearchInput";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { FilterGroup, FilterClearButton } from "@/components/ui/FilterGroup";
import { Pagination } from "@/components/ui/Pagination";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import type {
  ActivityFeedRow,
  ActivityFeedSourceKind,
  UserRef,
} from "@/types/relations";

/** 記録元の表示名。ビューの source_kind と 1:1 */
const SOURCE_LABELS: Record<ActivityFeedSourceKind, string> = {
  lead_activity: "社内対応",
  lead_customer_activity: "顧客行動",
  email: "メール",
};

const SOURCE_OPTIONS = (
  Object.keys(SOURCE_LABELS) as ActivityFeedSourceKind[]
).map((k) => ({ value: k, label: SOURCE_LABELS[k] }));

/** 時刻を持たない記録（架電日だけの入力など）は 0:00 を出さず日付で止める */
function formatOccurredAt(value: string, hasTime: boolean | null): string {
  const d = new Date(value);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const date = `${yyyy}/${mm}/${dd}`;
  if (hasTime === false) return date;
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${date} ${hh}:${mi}`;
}

function entityHref(row: ActivityFeedRow): string {
  return row.entity_type === "lead"
    ? `/leads/${row.entity_id}`
    : `/contacts/${row.entity_id}`;
}

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
        <h1 className="text-2xl font-bold" style={{ color: "var(--color-text-title)" }}>
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

      {rows.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-3 py-16"
          style={{
            backgroundColor: "#fff",
            borderRadius: "var(--radius-card)",
            boxShadow: "var(--elevation-low)",
          }}
        >
          <Activity size={40} style={{ color: "var(--color-sumi600)" }} />
          <p className="text-sm" style={{ color: "var(--color-sumi600)" }}>
            アクティビティが見つかりません
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
                {["日時", "種別", "結果", "内容", "相手先", "担当者"].map((label) => (
                  <th
                    key={label}
                    className="px-4 py-3 text-left font-semibold text-xs whitespace-nowrap"
                    style={{ color: "var(--color-sumi600)" }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={`${row.source_kind}:${row.id}`}
                  style={{ borderBottom: "1px solid var(--color-border-default)" }}
                >
                  <td
                    className="px-4 py-3 text-xs whitespace-nowrap"
                    style={{ color: "var(--color-text-list)" }}
                  >
                    {formatOccurredAt(row.occurred_at, row.has_time)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <ActivityTypeBadge
                      name={row.activity_name}
                      color={row.activity_color}
                    />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {/* 社内対応の架電結果。他の記録元では空 */}
                    <StatusBadge
                      name={row.outcome_name}
                      color={row.outcome_color}
                      seed={row.outcome_name}
                    />
                  </td>
                  <td
                    className="px-4 py-3"
                    style={{
                      color: "var(--color-text-list)",
                      maxWidth: "22rem",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={row.detail ?? undefined}
                  >
                    {row.detail || "—"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <EntityLink href={entityHref(row)} compact>
                      {row.entity_label}
                    </EntityLink>
                  </td>
                  <td
                    className="px-4 py-3 whitespace-nowrap"
                    style={{ color: "var(--color-text-list)" }}
                  >
                    {row.actor_name || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
