"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Plus, ArrowUpDown, ArrowUpRight } from "lucide-react";
import { getLeads } from "@/actions/leads";
import { SearchInput } from "@/components/ui/SearchInput";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { FilterGroup, FilterClearButton } from "@/components/ui/FilterGroup";

type LeadStage = { id: string; name: string; sort_order: number };
type LeadStatus = { id: string; name: string; sort_order: number; stage_id: string };
type LeadTemperature = { id: string; code: string; name: string; color: string | null };
type LeadCategory = { id: string; code: string; name: string; color: string | null };
type CrmUser = { id: string; full_name: string; role: string };

interface LeadsViewProps {
  initialData: { items: any[]; count: number } | null;
  stages: LeadStage[];
  statuses: LeadStatus[];
  temperatures: LeadTemperature[];
  categories: LeadCategory[];
  users: CrmUser[];
  currentUserRole: string;
}

// 温度感バッジ
function TemperatureBadge({ code, name }: { code: string; name: string }) {
  const styles: Record<string, React.CSSProperties> = {
    hot: { backgroundColor: "rgba(215, 119, 93, 0.15)", color: "#A34E35" },
    warm: { backgroundColor: "rgba(229, 196, 127, 0.25)", color: "#8A6D1E" },
    cold: { backgroundColor: "rgba(59, 130, 246, 0.12)", color: "#1E40AF" },
  };
  const s = styles[code] ?? { backgroundColor: "var(--color-sumi100)", color: "var(--color-sumi700)" };
  return (
    <span
      style={{
        ...s,
        borderRadius: "var(--radius-badge)",
        padding: "0.125rem 0.5rem",
        fontSize: "0.75rem",
        fontWeight: 500,
        whiteSpace: "nowrap",
      }}
    >
      {name}
    </span>
  );
}

export function LeadsView({
  initialData,
  stages,
  statuses,
  temperatures,
  categories,
  users,
  currentUserRole,
}: LeadsViewProps) {
  const [data, setData] = useState(initialData);
  const [stageFilter, setStageFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [temperatureFilter, setTemperatureFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [keyword, setKeyword] = useState("");
  const [sortByScore, setSortByScore] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleFilter(
    key: string,
    value: string,
    setter: (v: string) => void
  ) {
    setter(value);
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
        perPage: 50,
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
    startTransition(async () => {
      const { data: result } = await getLeads({ perPage: 50, page: 1 });
      setData(result);
    });
  }

  // sort_order でステータス選択肢をステージ別にフィルタ
  const filteredStatusOptions = stageFilter
    ? statuses.filter((s) => s.stage_id === stageFilter)
    : statuses;

  const items = data?.items ?? [];
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
                  "事業者種別",
                  "企業名",
                  "リード名",
                  "カテゴリ",
                  "ステージ",
                  "ステータス",
                  "スコア",
                  "温度感",
                  "対応履歴",
                  "担当者",
                  "更新日",
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
                const actCount = lead.lead_activities_count ?? lead.activity_count ?? null;
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
                    {/* 事業者種別 */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {lead.account_type?.name ? (
                        <span
                          style={{
                            backgroundColor: "var(--color-sumi100)",
                            borderRadius: "var(--radius-badge)",
                            padding: "0.125rem 0.5rem",
                            fontSize: "0.75rem",
                            color: "var(--color-text-body)",
                          }}
                        >
                          {lead.account_type.name}
                        </span>
                      ) : (
                        <span style={{ color: "var(--color-sumi400)" }}>—</span>
                      )}
                    </td>
                    {/* 企業名 */}
                    <td
                      className="px-4 py-3 max-w-[140px] truncate"
                      style={{ color: "var(--color-sumi600)" }}
                      title={lead.company_name ?? lead.company?.name ?? ""}
                    >
                      {lead.company_name || lead.company?.name || (
                        <span style={{ color: "var(--color-sumi400)" }}>—</span>
                      )}
                    </td>
                    {/* リード名 */}
                    <td className="px-4 py-3">
                      <Link
                        href={`/leads/${lead.id}`}
                        className="font-medium"
                        style={{ color: "var(--color-text-title)", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {lead.lead_name}
                        <ArrowUpRight size={13} style={{ color: "var(--color-sumi400)" }} />
                      </Link>
                    </td>
                    {/* カテゴリ */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {category?.name ? (
                        <span
                          style={{
                            backgroundColor: category.color
                              ? `${category.color}26`
                              : "var(--color-sumi100)",
                            color: category.color ?? "var(--color-sumi700)",
                            borderRadius: "var(--radius-badge)",
                            padding: "0.125rem 0.5rem",
                            fontSize: "0.75rem",
                            fontWeight: 500,
                          }}
                        >
                          {category.name}
                        </span>
                      ) : (
                        <span style={{ color: "var(--color-sumi400)" }}>—</span>
                      )}
                    </td>
                    {/* ステージ */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {lead.stage?.name ? (
                        <span
                          style={{
                            backgroundColor: "rgba(122, 165, 146, 0.12)",
                            color: "#4D7A65",
                            borderRadius: "var(--radius-badge)",
                            padding: "0.125rem 0.5rem",
                            fontSize: "0.75rem",
                            fontWeight: 500,
                          }}
                        >
                          {lead.stage.name}
                        </span>
                      ) : (
                        <span style={{ color: "var(--color-sumi400)" }}>—</span>
                      )}
                    </td>
                    {/* ステータス */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {lead.status?.name ? (
                        <span
                          style={{
                            backgroundColor: "var(--color-sumi100)",
                            color: "var(--color-text-body)",
                            borderRadius: "var(--radius-badge)",
                            padding: "0.125rem 0.5rem",
                            fontSize: "0.75rem",
                            fontWeight: 500,
                          }}
                        >
                          {lead.status.name}
                        </span>
                      ) : (
                        <span style={{ color: "var(--color-sumi400)" }}>—</span>
                      )}
                    </td>
                    {/* スコア */}
                    <td
                      className="px-4 py-3 text-center font-mono whitespace-nowrap"
                      style={{ color: "var(--color-text-title)", minWidth: 60 }}
                    >
                      {lead.score != null ? (
                        <span
                          style={{
                            fontWeight: 600,
                            color:
                              lead.score >= 70
                                ? "#A34E35"
                                : lead.score >= 40
                                ? "#8A6D1E"
                                : "var(--color-sumi600)",
                          }}
                        >
                          {lead.score}
                        </span>
                      ) : (
                        <span style={{ color: "var(--color-sumi400)" }}>—</span>
                      )}
                    </td>
                    {/* 温度感 */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {temp ? (
                        <TemperatureBadge code={temp.code} name={temp.name} />
                      ) : (
                        <span style={{ color: "var(--color-sumi400)" }}>—</span>
                      )}
                    </td>
                    {/* 対応履歴件数 */}
                    <td
                      className="px-4 py-3 text-center"
                      style={{ color: "var(--color-sumi600)" }}
                    >
                      {actCount != null ? actCount : "—"}
                    </td>
                    {/* 担当者 */}
                    <td
                      className="px-4 py-3 whitespace-nowrap"
                      style={{ color: "var(--color-sumi600)" }}
                    >
                      {lead.owner?.full_name ?? "—"}
                    </td>
                    {/* 更新日 */}
                    <td
                      className="px-4 py-3 text-xs whitespace-nowrap"
                      style={{ color: "var(--color-sumi500)" }}
                    >
                      {lead.updated_at
                        ? new Date(lead.updated_at).toLocaleDateString("ja-JP")
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 件数表示 */}
      {data && (
        <p
          className="mt-3 text-xs"
          style={{ color: "var(--color-sumi500)" }}
        >
          {data.count} 件中 {sortedItems.length} 件を表示
        </p>
      )}
    </div>
  );
}
