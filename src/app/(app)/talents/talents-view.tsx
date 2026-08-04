"use client";

import Link from "next/link";
import { Plus, UserCircle } from "lucide-react";
import { getTalents } from "@/actions/talents";
import { useListView } from "@/hooks/useListView";
import { LIST_FILTER_KEYS } from "@/lib/list-sort";
import { SearchInput } from "@/components/ui/SearchInput";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { FilterGroup, FilterClearButton } from "@/components/ui/FilterGroup";
import { DataTable } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import type { TalentSkillWithSkill, TalentWithRelations } from "@/types/relations";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
// スキル行も Action の戻り値型を使う
type Skill = TalentSkillWithSkill;

// 画面で使う行型は Server Action の戻り値型をそのまま使う。
// 手書きで狭い型を再定義すると SELECT の変更に追従できない。
type TalentRow = TalentWithRelations;

interface Props {
  initialData: { rows: TalentRow[]; total: number } | null;
  /** ポテンシャルタイプの選択肢（IL+ / PR- など 12 種） */
  potentialTypes: { type: string; dominantBrain: string | null }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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

function getTopSkills(skills: Skill[], limit = 3): Skill[] {
  return [...skills]
    .sort((a, b) => b.proficiency_level - a.proficiency_level)
    .slice(0, limit);
}

function truncate(text: string | null, max: number): string {
  if (!text) return "—";
  return text.length > max ? text.slice(0, max) + "..." : text;
}

const PER_PAGE = DEFAULT_PAGE_SIZE;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function TalentsView({ initialData, potentialTypes }: Props) {
  const { filters, page, sort, setFilter, setPage, setSort, clear, isPending, data } =
    useListView({
      filterKeys: LIST_FILTER_KEYS.talents,
      initialData,
      load: (state) =>
        getTalents({
          search: state.filters.search || undefined,
          potentialType: state.filters.potentialType || undefined,
          perPage: PER_PAGE,
          page: state.page,
          sortField: state.sort?.field,
          sortDirection: state.sort?.direction,
        }),
    });

  const keyword = filters.search ?? "";
  const potentialType = filters.potentialType ?? "";

  const items = (data?.rows ?? []) as TalentRow[];
  const totalCount = data?.total ?? 0;

  return (
    <div>
      {/* ヘッダー */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4 sm:mb-6">
        <h1
          className="text-xl sm:text-2xl font-bold"
          style={{ color: "var(--color-text-title)" }}
        >
          タレント
        </h1>
        <Link
          href="/talents/new"
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
          label="ポテンシャルタイプ"
          value={potentialType}
          options={potentialTypes.map((t) => ({
            value: t.type,
            // 記号だけでは選びにくいので優位脳を添える
            label: t.dominantBrain ? `${t.type}（${t.dominantBrain}）` : t.type,
          }))}
          onChange={(v) => setFilter("potentialType", v)}
        />
        <SearchInput
          value={keyword}
          placeholder="氏名で検索..."
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
        getKey={(row) => row.id}
        getHref={(row) => `/talents/${row.id}`}
        emptyIcon={UserCircle}
        emptyMessage="タレントが見つかりません"
        sort={sort}
        onSortChange={setSort}
        columns={[
          {
            label: "連絡先名",
            card: "title",
            className: "whitespace-nowrap",
            render: (row) => (
              <Link
                href={`/talents/${row.id}`}
                className="font-medium"
                style={{ color: "var(--color-text-list)" }}
                onClick={(e) => e.stopPropagation()}
              >
                {row.contact
                  ? `${row.contact.last_name} ${row.contact.first_name}`
                  : "—"}
              </Link>
            ),
          },
          {
            label: "ポテンシャル",
            card: "meta",
            className: "whitespace-nowrap",
            render: (row) => (
              <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                {row.contact?.number_diagnosis?.type ?? "—"}
              </span>
            ),
          },
          {
            label: "総合評価",
            render: (row) => (
              <span style={{ fontSize: "0.8125rem" }}>
                {truncate(row.overall_assessment, 35)}
              </span>
            ),
          },
          {
            label: "スキル",
            render: (row) => {
              const topSkills = getTopSkills(row.talent_skills ?? []);
              return (
                <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
                  {topSkills.length === 0 ? (
                    <span style={{ color: "var(--color-text-list)" }}>—</span>
                  ) : (
                    topSkills.map((s) => (
                      <span
                        key={s.id}
                        style={{
                          display: "inline-block",
                          borderRadius: "var(--radius-badge)",
                          padding: "0.125rem 0.5rem",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                          ...(s.proficiency_level >= 4
                            ? { backgroundColor: "var(--color-sage)", color: "#fff" }
                            : {
                                backgroundColor: "var(--color-sumi100)",
                                color: "var(--color-sumi700)",
                              }),
                        }}
                      >
                        {s.skill?.name ?? "（不明なスキル）"} Lv.
                        {s.proficiency_level}
                      </span>
                    ))
                  )}
                </div>
              );
            },
          },
          {
            label: "部署・役職",
            className: "whitespace-nowrap",
            render: (row) => (
              <span style={{ fontSize: "0.8125rem" }}>
                {row.contact?.department || row.contact?.job_title
                  ? [row.contact.department, row.contact.job_title]
                      .filter(Boolean)
                      .join(" / ")
                  : "—"}
              </span>
            ),
          },
          {
            label: "最終更新日",
            sortKey: "updated_at",
            className: "text-xs whitespace-nowrap",
            render: (row) => formatDateTime(row.updated_at),
          },
        ]}
      />

      {/* ページネーション */}
      <Pagination
        page={page}
        totalCount={totalCount}
        pageSize={PER_PAGE}
        onPageChange={setPage}
      />
    </div>
  );
}
