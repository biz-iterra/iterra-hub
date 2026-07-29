"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Plus, ArrowUpDown } from "lucide-react";
import { getLeads } from "@/actions/leads";
import { SearchInput } from "@/components/ui/SearchInput";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { FilterGroup, FilterClearButton } from "@/components/ui/FilterGroup";
import { Pagination } from "@/components/ui/Pagination";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import {
  TemperatureBadge,
  StageBadge,
  StatusBadge,
  CategoryBadge,
} from "@/components/ui/badges";

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
  initialData: { rows: any[]; total: number } | null;
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
  const [data, setData] = useState(initialData);
  const [stageFilter, setStageFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [temperatureFilter, setTemperatureFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [keyword, setKeyword] = useState("");
  const [sortByScore, setSortByScore] = useState(false);
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
      const { data: result } = await getLeads({
        stage_id: key === "stage_id" ? value || undefined : stageFilter || undefined,
        status_id: key === "status_id" ? value || undefined : statusFilter || undefined,
        category_id:
          key === "category_id" ? value || undefined : categoryFilter || undefined,
        temperature_id:
          key === "temperature_id" ? value || undefined : temperatureFilter || undefined,
        owner_user_id:
          key === "owner_user_id" ? value || undefined : ownerFilter || undefined,
        keyword: key === "keyword" ? value || undefined : keyword || undefined,
        perPage: DEFAULT_PAGE_SIZE,
        page: 1,
      });
      setData(result);
    });
  }

  function handleClear() {
    setStageFilter("");
    setStatusFilter("");
    setCategoryFilter("");
    setTemperatureFilter("");
    setOwnerFilter("");
    setKeyword("");
    setPage(1);
    startTransition(async () => {
      const { data: result } = await getLeads({ perPage: DEFAULT_PAGE_SIZE, page: 1 });
      setData(result);
    });
  }

  function handlePageChange(next: number) {
    setPage(next);
    startTransition(async () => {
      const { data: result } = await getLeads({
        stage_id: stageFilter || undefined,
        status_id: statusFilter || undefined,
        category_id: categoryFilter || undefined,
        temperature_id: temperatureFilter || undefined,
        owner_user_id: ownerFilter || undefined,
        keyword: keyword || undefined,
        perPage: DEFAULT_PAGE_SIZE,
        page: next,
      });
      setData(result);
    });
  }

  // sort_order でステータス選択肢をステージ別にフィルタ
  const filteredStatusOptions = stageFilter
    ? statuses.filter((s) => s.stage_id === stageFilter)
    : statuses;

  const items = data?.rows ?? [];
  const sortedItems = sortByScore
    ? [...items].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
    : items;

  return (
    <div>
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <h1
          className="text-2xl font-bold"
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
          onChange={(v) => {
            setStageFilter(v);
            setStatusFilter("");
            handleFilter("stage_id", v, setStageFilter);
          }}
        />
        <FilterSelect
          label="ステータス"
          value={statusFilter}
          options={filteredStatusOptions.map((s) => ({ value: s.id, label: s.name }))}
          onChange={(v) => handleFilter("status_id", v, setStatusFilter)}
        />
        <FilterSelect
          label="カテゴリ"
          value={categoryFilter}
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
          onChange={(v) => handleFilter("category_id", v, setCategoryFilter)}
        />
        <FilterSelect
          label="温度感"
          value={temperatureFilter}
          options={temperatures.map((t) => ({ value: t.id, label: t.name }))}
          onChange={(v) => handleFilter("temperature_id", v, setTemperatureFilter)}
        />
        <FilterSelect
          label="担当者"
          value={ownerFilter}
          options={users.map((u) => ({ value: u.id, label: u.full_name }))}
          onChange={(v) => handleFilter("owner_user_id", v, setOwnerFilter)}
        />
        <SearchInput
          value={keyword}
          placeholder="リード名・電話番号で検索..."
          onChange={(v) => handleFilter("keyword", v, setKeyword)}
        />
        {/* スコアソート */}
        <button
          onClick={() => setSortByScore(!sortByScore)}
          className="flex items-center gap-1.5 px-3 py-[0.4rem] text-xs font-medium transition-colors"
          style={{
            border: "1px solid var(--color-border-default)",
            borderRadius: "var(--radius-button)",
            backgroundColor: sortByScore ? "var(--color-terra)" : "#fff",
            color: sortByScore ? "#fff" : "var(--color-sumi600)",
            cursor: "pointer",
            alignSelf: "flex-end",
          }}
        >
          <ArrowUpDown size={13} />
          スコア順
        </button>
        {/* フィルタ一括クリア */}
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
      {sortedItems.length === 0 ? (
        <div
          className="p-10 text-center text-sm"
          style={{
            backgroundColor: "#fff",
            borderRadius: "var(--radius-card)",
            boxShadow: "var(--elevation-low)",
            color: "var(--color-sumi500)",
          }}
        >
          リードが見つかりません
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
                {[
                  "リード名",
                  "ステージ",
                  "ステータス",
                  "温度感",
                  "カテゴリ",
                  "企業名",
                  "最終アクティビティ",
                  "担当者",
                  "最終更新日",
                ].map((label) => (
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
              {sortedItems.map((lead: any) => {
                const category = lead.category as { id: string; code: string; name: string; color: string | null } | null;
                const temp = lead.temperature as {
                  code: string;
                  name: string;
                } | null;
                return (
                  <tr
                    key={lead.id}
                    className="transition-colors cursor-pointer"
                    style={{
                      borderBottom: "1px solid var(--color-border-default)",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor =
                        "var(--color-bg-hover)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.backgroundColor = "transparent")
                    }
                    onClick={() =>
                      (window.location.href = `/leads/${lead.id}`)
                    }
                  >
                    {/* リード名 */}
                    <td className="px-4 py-3">
                      <Link
                        href={`/leads/${lead.id}`}
                        className="font-medium"
                        style={{ color: "var(--color-text-list)" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {lead.lead_name}
                      </Link>
                    </td>
                    {/* ステージ */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StageBadge
                        name={lead.stage?.name}
                        sortOrder={lead.stage?.sort_order}
                        total={stages.length}
                      />
                    </td>
                    {/* ステータス */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge
                        name={lead.status?.name}
                        sortOrder={lead.status?.sort_order}
                        total={statuses.length}
                      />
                    </td>
                    {/* 温度感 */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {temp ? (
                        <TemperatureBadge code={temp.code} name={temp.name} />
                      ) : (
                        <span style={{ color: "var(--color-text-list)" }}>—</span>
                      )}
                    </td>
                    {/* カテゴリ */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <CategoryBadge name={category?.name} color={category?.color} />
                    </td>
                    {/* 企業名 */}
                    <td
                      className="px-4 py-3 max-w-[140px] truncate"
                      style={{ color: "var(--color-text-list)" }}
                      title={lead.company_name ?? lead.company?.name ?? ""}
                    >
                      {lead.company_name || lead.company?.name || (
                        <span style={{ color: "var(--color-text-list)" }}>—</span>
                      )}
                    </td>
                    {/* 最終アクティビティ */}
                    <td
                      className="px-4 py-3 text-xs whitespace-nowrap"
                      style={{ color: "var(--color-text-list)" }}
                    >
                      {formatDate(lead.last_activity_at)}
                    </td>
                    {/* 担当者 */}
                    <td
                      className="px-4 py-3 whitespace-nowrap"
                      style={{ color: "var(--color-text-list)" }}
                    >
                      {lead.owner?.full_name ?? "—"}
                    </td>
                    {/* 最終更新日 */}
                    <td
                      className="px-4 py-3 text-xs whitespace-nowrap"
                      style={{ color: "var(--color-text-list)" }}
                    >
                      {formatDateTime(lead.updated_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ページネーション */}
      <Pagination
        page={page}
        totalCount={data?.total ?? 0}
        pageSize={DEFAULT_PAGE_SIZE}
        onPageChange={handlePageChange}
      />
    </div>
  );
}
