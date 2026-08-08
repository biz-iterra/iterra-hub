"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useListParams } from "@/hooks/useListParams";
import { buildListQuery, type SortState } from "@/lib/list-params";
import { LIST_FILTER_KEYS } from "@/lib/list-sort";
import { kanbanColorFrom, type KanbanColor } from "@/lib/kanban-color";
import Link from "next/link";
import {
  LayoutGrid,
  List,
  Plus,
  ChevronDown,
  AlertTriangle,
  CalendarDays,
  Handshake,
} from "lucide-react";
import { getDealsForKanban, getDeals, moveDealCard } from "@/actions/deals";
import { StageBadge, StatusBadge } from "@/components/ui/badges";
import { getDealCounterpartyLabel } from "@/lib/deal-counterparty";
import { FilterGroup, FilterClearButton } from "@/components/ui/FilterGroup";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { SearchInput } from "@/components/ui/SearchInput";
import { DataTable } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/toast";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import type { DealWithRelations, Paged } from "@/types/relations";

type Pipeline = { id: string; name: string };
// color はカンバンの列の色に使う（マスタ由来。src/lib/kanban-color.ts）
type Stage = { id: string; name: string; sort_order: number; color: string | null };
type Status = { id: string; name: string; sort_order: number; color: string | null };
type CrmUser = { id: string; full_name: string; role: string };
type StageColumn = { stage: Stage; deals: DealWithRelations[] };
type StatusColumn = { status: Status; deals: DealWithRelations[] };
type KanbanData = { stages: StageColumn[]; statuses: StatusColumn[] } | null;
type ListData = Paged<DealWithRelations> | null;
type GroupBy = "stage" | "status";

const jpyCurrency = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
});

function formatAmount(amount: number | null | undefined) {
  if (amount == null) return "—";
  return jpyCurrency.format(amount);
}

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

// ---------- カンバンカードの時間軸情報ヘルパー ----------
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function formatShortDate(value: string): string {
  const d = new Date(value);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}`;
}

/**
 * ステージが最後に動いてからの経過日数。
 * updated_at ではなく stage_updated_at を見るのは、
 * 他項目の編集では「進捗が動いた」ことにならないため
 * （カンバンで見たいのは進捗の停滞）。stage_updated_at 未設定なら created_at で代替する。
 *
 * WARNING / ATTENTION の 2 段階で返し、閾値未満は null にしてノイズを増やさない。
 */
const STAGNANT_ATTENTION_DAYS = 14;
const STAGNANT_WARNING_DAYS = 30;

/**
 * バッジは 11px の小文字なので、--color-error（#EF4444）を直接使うと
 * 白背景で約 3.8:1 しかなく WCAG AA（通常文字 4.5:1）に届かない。
 * toast.tsx と同じ濃色（#B91C1C ≒ 6.4:1）を文字色に使う。
 */
const STAGNANT_SEVERE_TEXT = "#B91C1C";

type StagnationInfo = { days: number; color: string; severe: boolean };

function getStagnation(deal: DealWithRelations): StagnationInfo | null {
  const since = deal.stage_updated_at ?? deal.created_at;
  if (!since) return null;
  if (deal.closed_at) return null; // クローズ済みは停滞の概念が当てはまらない
  const days = Math.floor((Date.now() - new Date(since).getTime()) / MS_PER_DAY);
  if (days < STAGNANT_ATTENTION_DAYS) return null;
  const severe = days >= STAGNANT_WARNING_DAYS;
  return {
    days,
    color: severe ? STAGNANT_SEVERE_TEXT : "var(--color-sumi600)",
    severe,
  };
}

// ---------- クローズ予定日（期日）ヘルパー ----------
const DUE_SOON_DAYS = 7;

/**
 * 7日以内の期日は --color-warning（#F59E0B）系で強調する。
 * 白背景に直接使うと AA 未達のため、COLOR_SCALE の warning 分類と同じ濃色
 *（#B45309 ≒ 4.5:1 以上）を文字色に使う。
 */
const DUE_SOON_TEXT = "#B45309";

function todayDateString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** DATE 型（YYYY-MM-DD）の日数差。タイムゾーン変換を避けるため文字列を分解して UTC 起点で計算する */
function daysBetween(fromStr: string, toStr: string): number {
  const [fy, fm, fd] = fromStr.split("-").map(Number);
  const [ty, tm, td] = toStr.split("-").map(Number);
  const fromUTC = Date.UTC(fy, fm - 1, fd);
  const toUTC = Date.UTC(ty, tm - 1, td);
  return Math.round((toUTC - fromUTC) / MS_PER_DAY);
}

type DueInfo = { label: string; color: string; severe: boolean; soon: boolean };

/**
 * クローズ予定日の表示情報。クローズ済み・未設定の商談は対象外。
 * 期日超過 → error 系、7日以内 → warning 系、それ以外 → 通常色。
 */
function getDueInfo(deal: DealWithRelations): DueInfo | null {
  if (!deal.expected_close_date || deal.closed_at) return null;
  const due = deal.expected_close_date;
  const daysUntil = daysBetween(todayDateString(), due);
  if (daysUntil < 0) {
    return {
      label: `期日超過 ${formatShortDate(due)}`,
      color: STAGNANT_SEVERE_TEXT,
      severe: true,
      soon: false,
    };
  }
  if (daysUntil <= DUE_SOON_DAYS) {
    return {
      label: `予定 ${formatShortDate(due)}`,
      color: DUE_SOON_TEXT,
      severe: false,
      soon: true,
    };
  }
  return {
    label: `予定 ${formatShortDate(due)}`,
    color: "var(--color-sumi600)",
    severe: false,
    soon: false,
  };
}


// ---------- カンバン D&D 用ヘルパー ----------
// 楽観的更新: 対象ディールを一旦すべての列から取り除き、指定列に部分更新して差し込む
function relocateDeal<C extends { deals: DealWithRelations[] }>(
  columns: C[],
  dealId: string,
  getColumnId: (column: C) => string,
  targetColumnId: string,
  patch: Partial<DealWithRelations>
): C[] {
  let movedDeal: DealWithRelations | null = null;
  const withoutSource = columns.map((c) => {
    const idx = c.deals.findIndex((d) => d.id === dealId);
    if (idx === -1) return c;
    movedDeal = { ...c.deals[idx], ...patch };
    return { ...c, deals: c.deals.filter((d) => d.id !== dealId) };
  });
  if (!movedDeal) return columns;
  const finalDeal: DealWithRelations = movedDeal;
  return withoutSource.map((c) =>
    getColumnId(c) === targetColumnId
      ? { ...c, deals: [...c.deals, finalDeal] }
      : c
  );
}

// サーバーの確定結果で全列を整合させる（対象ディールを差し替えて所属列に配置し直す）
function replaceDealEverywhere<C extends { deals: DealWithRelations[] }>(
  columns: C[],
  dealId: string,
  getColumnId: (column: C) => string,
  targetColumnId: string,
  updatedDeal: DealWithRelations
): C[] {
  const withoutSource = columns.map((c) => ({
    ...c,
    deals: c.deals.filter((d) => d.id !== dealId),
  }));
  return withoutSource.map((c) =>
    getColumnId(c) === targetColumnId
      ? { ...c, deals: [...c.deals, updatedDeal] }
      : c
  );
}

export function DealsView({
  pipelines,
  defaultPipelineId,
  initialKanbanData,
  initialListData,
  stages,
  statuses,
  users,
  title = "商談",
  description,
  showPipelineSelector = true,
}: {
  pipelines: Pipeline[];
  defaultPipelineId: string | null;
  initialKanbanData: KanbanData;
  initialListData: ListData;
  stages: Stage[];
  statuses: Status[];
  users: CrmUser[];
  /** 画面の見出し。パイプライン別の画面が「セールス」等を渡す（T-0073） */
  title?: string;
  description?: string;
  /**
   * パイプラインの切り替え欄を出すか。
   * **パイプライン別の画面では出さない**（画面がパイプラインを決めるため）
   */
  showPipelineSelector?: boolean;
}) {
  // 表示モード・パイプライン・各フィルタは URL に持つ。
  // カンバンからも表からも詳細へ入るため、戻ったときに同じ見え方へ戻す
  const params = useListParams(LIST_FILTER_KEYS.deals);
  const view: "kanban" | "table" = params.filters.view === "table" ? "table" : "kanban";
  const groupBy: GroupBy = params.filters.groupBy === "status" ? "status" : "stage";
  const stageFilter = groupBy === "stage" ? params.filters.kanbanColumn ?? null : null;
  const statusFilter = groupBy === "status" ? params.filters.kanbanColumn ?? null : null;
  const selectedPipelineId = params.filters.pipelineId || defaultPipelineId;

  const tableStageFilter = params.filters.stageId ?? "";
  const tableStatusFilter = params.filters.statusId ?? "";
  const tableOwnerFilter = params.filters.ownerUserId ?? "";
  const search = params.filters.search ?? "";
  const tablePage = params.page;

  const [kanbanData, setKanbanData] = useState<KanbanData>(initialKanbanData);
  const [listData, setListData] = useState<ListData>(initialListData);

  // URL の条件が変わったら取り直す。サーバーが描いた分は取り直さない
  const query = buildListQuery({
    filters: params.filters,
    page: params.page,
    sort: params.sort,
  });
  const loadedQuery = useRef<string | null>(query);
  useEffect(() => {
    if (loadedQuery.current === query) return;
    loadedQuery.current = query;

    startTransition(async () => {
      if (view === "kanban") {
        if (!selectedPipelineId) return;
        const { data } = await getDealsForKanban(selectedPipelineId);
        setKanbanData(data);
      } else {
        const { data } = await getDeals({
          search: search || undefined,
          stageId: tableStageFilter || undefined,
          statusId: tableStatusFilter || undefined,
          ownerUserId: tableOwnerFilter || undefined,
          perPage: DEFAULT_PAGE_SIZE,
          page: tablePage,
        });
        setListData(data);
      }
    });
    // 条件をまとめた query だけを見る（個々の値は query から導出される）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const setView = (next: "kanban" | "table") => params.setFilter("view", next);
  const setGroupBy = (next: GroupBy) =>
    // 分類軸を変えると列の意味が変わるので、列の絞り込みは外す
    params.setFilters({ groupBy: next, kanbanColumn: "" });
  const setKanbanColumn = (next: string | null) =>
    params.setFilter("kanbanColumn", next ?? "");

  const [isPending, startTransition] = useTransition();
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const { showToast } = useToast();
  // D&D 直後のカードを一時ハイライトするための ID（成功フィードバック）
  const [movedDealId, setMovedDealId] = useState<string | null>(null);
  const movedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleDropDeal(dealId: string, targetColumnId: string) {
    if (!kanbanData) return;

    const sourceDeal =
      kanbanData.stages.flatMap((s) => s.deals).find((d) => d.id === dealId) ??
      kanbanData.statuses.flatMap((s) => s.deals).find((d) => d.id === dealId);
    if (!sourceDeal) return;

    const currentColumnId =
      groupBy === "stage" ? sourceDeal.deal_stage_id : sourceDeal.deal_status_id;
    if (currentColumnId === targetColumnId) return;

    const previousKanbanData = kanbanData;
    const expectedUpdatedAt = sourceDeal.updated_at ?? "";

    setMovedDealId(dealId);
    if (movedTimerRef.current) clearTimeout(movedTimerRef.current);
    movedTimerRef.current = setTimeout(() => setMovedDealId(null), 1600);

    // 楽観的 UI: ドロップ先の列へ即座に移動
    setKanbanData((prev) => {
      if (!prev) return prev;
      if (groupBy === "stage") {
        return {
          ...prev,
          stages: relocateDeal(
            prev.stages,
            dealId,
            (c) => c.stage.id,
            targetColumnId,
            { deal_stage_id: targetColumnId }
          ),
        };
      }
      return {
        ...prev,
        statuses: relocateDeal(
          prev.statuses,
          dealId,
          (c) => c.status.id,
          targetColumnId,
          { deal_status_id: targetColumnId }
        ),
      };
    });

    startTransition(async () => {
      const { data, error } = await moveDealCard({
        dealId,
        groupBy,
        targetId: targetColumnId,
        expectedUpdatedAt,
      });

      if (error || !data) {
        setKanbanData(previousKanbanData);
        setMovedDealId(null);
        showToast({ type: "error", message: error ?? "商談の移動に失敗しました" });
        return;
      }

      // サーバーの確定結果でステージ列・ステータス列の両方を整合させる
      setKanbanData((prev) => {
        if (!prev) return prev;
        return {
          stages: replaceDealEverywhere(
            prev.stages,
            dealId,
            (c) => c.stage.id,
            data.deal_stage_id,
            data
          ),
          statuses: replaceDealEverywhere(
            prev.statuses,
            dealId,
            (c) => c.status.id,
            data.deal_status_id,
            data
          ),
        };
      });
    });
  }

  function handlePipelineChange(pipelineId: string) {
    setPipelineOpen(false);
    // パイプラインが変わるとステージ・ステータスの顔ぶれが変わるので絞り込みを外す
    params.setFilters({ pipelineId, kanbanColumn: "" });
  }


  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId);

  return (
    <div>
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ color: "var(--color-text-title)" }}
          >
            {title}
          </h1>
          {description && (
            <p
              className="text-xs mt-1"
              style={{ color: "var(--color-sumi600)" }}
            >
              {description}
            </p>
          )}
        </div>
        <Link
          href="/deals/new"
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white transition-colors"
          style={{
            backgroundColor: "var(--color-terra)",
            borderRadius: "var(--radius-button)",
            textDecoration: "none",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor =
              "var(--color-terra-dark)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = "var(--color-terra)")
          }
        >
          <Plus size={16} />
          新規作成
        </Link>
      </div>

      {/* ツールバー */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        {/* パイプライン選択。画面がパイプラインを決めるときは出さない */}
        {showPipelineSelector && (
        <div className="relative">
          <button
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium border transition-colors"
            style={{
              borderColor: "var(--color-border-default)",
              borderRadius: "var(--radius-button)",
              color: "var(--color-text-title)",
              backgroundColor: "#fff",
              cursor: "pointer",
            }}
            onClick={() => setPipelineOpen(!pipelineOpen)}
          >
            {selectedPipeline?.name ?? "パイプライン選択"}
            <ChevronDown size={14} />
          </button>
          {pipelineOpen && (
            <div
              className="absolute z-20 mt-1 py-1 min-w-48"
              style={{
                backgroundColor: "#fff",
                borderRadius: "var(--radius-card)",
                boxShadow: "var(--elevation-low)",
                border: "1px solid var(--color-border-default)",
              }}
            >
              {pipelines.map((p) => (
                <button
                  key={p.id}
                  className="block w-full text-left px-3 py-2 text-sm transition-colors hover:opacity-80"
                  style={{
                    color:
                      p.id === selectedPipelineId
                        ? "var(--color-terra)"
                        : "var(--color-text-title)",
                    backgroundColor:
                      p.id === selectedPipelineId
                        ? "var(--color-sumi50)"
                        : "transparent",
                    cursor: "pointer",
                  }}
                  onClick={() => handlePipelineChange(p.id)}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
        )}

        {/* ビュー切り替え */}
        <div
          className="flex"
          style={{
            border: "1px solid var(--color-border-default)",
            borderRadius: "var(--radius-button)",
            overflow: "hidden",
          }}
        >
          <button
            className="flex items-center gap-1 px-3 py-2 text-xs font-medium transition-colors"
            style={{
              backgroundColor:
                view === "kanban" ? "var(--color-terra)" : "#fff",
              color: view === "kanban" ? "#fff" : "var(--color-sumi600)",
              cursor: "pointer",
            }}
            onClick={() => setView("kanban")}
          >
            <LayoutGrid size={14} />
            カンバン
          </button>
          <button
            className="flex items-center gap-1 px-3 py-2 text-xs font-medium transition-colors"
            style={{
              backgroundColor:
                view === "table" ? "var(--color-terra)" : "#fff",
              color: view === "table" ? "#fff" : "var(--color-sumi600)",
              cursor: "pointer",
            }}
            onClick={() => setView("table")}
          >
            <List size={14} />
            テーブル
          </button>
        </div>

        {/* カンバン時のグループ切替・絞り込み */}
        {view === "kanban" && (
          <>
            <div
              className="flex"
              style={{
                border: "1px solid var(--color-border-default)",
                borderRadius: "var(--radius-button)",
                overflow: "hidden",
              }}
            >
              <button
                className="px-3 py-2 text-xs font-medium transition-colors"
                style={{
                  backgroundColor:
                    groupBy === "stage" ? "var(--color-terra)" : "#fff",
                  color: groupBy === "stage" ? "#fff" : "var(--color-sumi600)",
                  cursor: "pointer",
                }}
                onClick={() => setGroupBy("stage")}
              >
                ステージ別
              </button>
              <button
                className="px-3 py-2 text-xs font-medium transition-colors"
                style={{
                  backgroundColor:
                    groupBy === "status" ? "var(--color-terra)" : "#fff",
                  color: groupBy === "status" ? "#fff" : "var(--color-sumi600)",
                  cursor: "pointer",
                }}
                onClick={() => setGroupBy("status")}
              >
                ステータス別
              </button>
            </div>

            {/* ステージ絞り込み（groupBy="stage" の時のみ） */}
            {groupBy === "stage" && kanbanData?.stages && kanbanData.stages.length > 0 && (
              <select
                value={stageFilter ?? ""}
                onChange={(e) => setKanbanColumn(e.target.value || null)}
                className="text-xs font-medium px-3 py-2"
                style={{
                  border: "1px solid var(--color-border-default)",
                  borderRadius: "var(--radius-button)",
                  backgroundColor: "#fff",
                  color: "var(--color-text-title)",
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                <option value="">全ステージ</option>
                {kanbanData.stages.map(({ stage }) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </select>
            )}
            {groupBy === "status" && kanbanData?.statuses && kanbanData.statuses.length > 0 && (
              <select
                value={statusFilter ?? ""}
                onChange={(e) => setKanbanColumn(e.target.value || null)}
                className="text-xs font-medium px-3 py-2"
                style={{
                  border: "1px solid var(--color-border-default)",
                  borderRadius: "var(--radius-button)",
                  backgroundColor: "#fff",
                  color: "var(--color-text-title)",
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                <option value="">全ステータス</option>
                {kanbanData.statuses.map(({ status }) => (
                  <option key={status.id} value={status.id}>
                    {status.name}
                  </option>
                ))}
              </select>
            )}

            {/* カンバン検索 */}
            <SearchInput
              value={search}
              placeholder="商談名で検索..."
onChange={(v) => params.setFilter("search", v)}
            />
          </>
        )}

        {isPending && (
          <span
            className="text-xs"
            style={{ color: "var(--color-sumi500)" }}
          >
            読み込み中...
          </span>
        )}
      </div>

      {/* テーブルビュー用フィルタ行 */}
      {view === "table" && (
        <FilterGroup className="mb-4">
          <FilterSelect
            label="ステージ"
            value={tableStageFilter}
            options={stages.map((s) => ({ value: s.id, label: s.name }))}
            onChange={(v) => params.setFilter("stageId", v)}
          />
          <FilterSelect
            label="ステータス"
            value={tableStatusFilter}
            options={statuses.map((s) => ({ value: s.id, label: s.name }))}
            onChange={(v) => params.setFilter("statusId", v)}
          />
          <FilterSelect
            label="担当者"
            value={tableOwnerFilter}
            options={users.map((u) => ({ value: u.id, label: u.full_name }))}
            onChange={(v) => params.setFilter("ownerUserId", v)}
          />
          <SearchInput
            value={search}
            placeholder="商談名で検索..."
            onChange={(v) => params.setFilter("search", v)}
          />
          <FilterClearButton onClear={params.clear} />
          {isPending && (
            <span
              className="text-xs"
              style={{ color: "var(--color-sumi500)", alignSelf: "flex-end", paddingBottom: "0.45rem" }}
            >
              読み込み中...
            </span>
          )}
        </FilterGroup>
      )}

      {/* コンテンツ */}
      {view === "kanban" ? (
        <KanbanView
          data={kanbanData}
          groupBy={groupBy}
          stageFilter={stageFilter}
          statusFilter={statusFilter}
          searchQuery={search}
          onDropDeal={handleDropDeal}
          movedDealId={movedDealId}
        />
      ) : (
        <>
          <TableView
            data={listData}
            sort={params.sort}
            onSortChange={params.setSortState}
          />
          <Pagination
            page={tablePage}
            totalCount={listData?.total ?? 0}
            pageSize={DEFAULT_PAGE_SIZE}
            onPageChange={params.setPage}
          />
        </>
      )}
    </div>
  );
}

// ---------- カンバンビュー ----------
type Column = {
  id: string;
  name: string;
  sort_order: number;
  color: string | null;
  deals: DealWithRelations[];
};

function KanbanView({
  data,
  groupBy,
  stageFilter,
  statusFilter,
  searchQuery,
  onDropDeal,
  movedDealId,
}: {
  data: KanbanData;
  groupBy: GroupBy;
  stageFilter: string | null;
  statusFilter: string | null;
  searchQuery: string;
  onDropDeal: (dealId: string, targetColumnId: string) => void;
  movedDealId: string | null;
}) {
  const [draggingDealId, setDraggingDealId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);
  const wasDraggedRef = useRef(false);

  if (!data) {
    return (
      <div
        className="p-8 text-center text-sm"
        style={{
          backgroundColor: "#fff",
          borderRadius: "var(--radius-card)",
          boxShadow: "var(--elevation-low)",
          color: "var(--color-sumi500)",
        }}
      >
        データがありません
      </div>
    );
  }

  // カラム一覧とカラー割当を準備
  const stagesList = data.stages ?? [];
  const statusesList = data.statuses ?? [];
  const rawColumns: Column[] =
    groupBy === "stage"
      ? stagesList.map(({ stage, deals }) => ({ ...stage, deals }))
      : statusesList.map(({ status, deals }) => ({ ...status, deals }));

  // 絞り込み: カラムは常に全表示、未選択カラムはディールのみ非表示
  const filter = groupBy === "stage" ? stageFilter : statusFilter;
  const filteredByColumn = filter
    ? rawColumns.map((c) =>
        c.id === filter ? c : { ...c, deals: [] }
      )
    : rawColumns;

  // 検索クエリによるクライアントサイド絞り込み（商談名 / 取引先名 を大文字小文字区別なし部分一致）
  const q = searchQuery.trim().toLowerCase();
  const columns = q
    ? filteredByColumn.map((c) => ({
        ...c,
        deals: c.deals.filter((d) => {
          const name = String(d.name ?? "").toLowerCase();
          const accountName = getDealCounterpartyLabel(d).toLowerCase();
          return name.includes(q) || accountName.includes(q);
        }),
      }))
    : filteredByColumn;

  // sort_order 順（rawColumns の index）で色を固定
  // 色はマスタの color から作る。並び順で割り当てると、ステージを 1 つ
  // 足しただけで既存の列の色がずれ、バッジ側とも食い違う
  const colorByColumnId = new Map<string, KanbanColor>();
  rawColumns.forEach((c) => colorByColumnId.set(c.id, kanbanColorFrom(c.color)));

  if (columns.length === 0) {
    return (
      <div
        className="p-8 text-center text-sm"
        style={{
          backgroundColor: "#fff",
          borderRadius: "var(--radius-card)",
          boxShadow: "var(--elevation-low)",
          color: "var(--color-sumi500)",
        }}
      >
        {groupBy === "stage"
          ? "ステージが登録されていません"
          : "ステータスが登録されていません"}
      </div>
    );
  }

  return (
    <div>
      <div
        className="no-scrollbar"
        style={{
          display: "flex",
          flexDirection: "row",
          gap: "1rem",
          overflowX: "auto",
          paddingBottom: "1rem",
          alignItems: "flex-start",
        }}
      >
        {columns.map((col) => {
          const color = colorByColumnId.get(col.id) ?? kanbanColorFrom(null);
          const isDragOver = dragOverColumnId === col.id;
          return (
        <div
          key={col.id}
          style={{
            width: 280,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* カラムヘッダー */}
          <div
            className="flex items-center justify-between px-3 py-2 mb-3"
            style={{
              backgroundColor: color.bg,
              borderRadius: "var(--radius-button)",
            }}
          >
            <span
              style={{
                color: color.text,
                fontSize: "0.875rem",
                fontWeight: 600,
              }}
            >
              {col.name}
            </span>
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: color.solid,
                color: "#fff",
              }}
            >
              {col.deals.length}
            </span>
          </div>

          {/* カード一覧（ドロップ先） */}
          <div
            className="flex flex-col gap-2 flex-1"
            style={{
              borderRadius: "var(--radius-card)",
              outline: isDragOver ? "2px dashed var(--color-terra)" : "none",
              outlineOffset: "2px",
              backgroundColor: isDragOver ? "var(--color-bg-hover)" : "transparent",
              transition: "background-color 0.15s ease",
              minHeight: 60,
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (dragOverColumnId !== col.id) setDragOverColumnId(col.id);
            }}
            onDragLeave={() => {
              setDragOverColumnId((prev) => (prev === col.id ? null : prev));
            }}
            onDrop={(e) => {
              e.preventDefault();
              const dealId = e.dataTransfer.getData("text/plain");
              setDragOverColumnId(null);
              // 列間移動でカードが再マウントされると元要素の onDragEnd が発火しないため、
              // ドロップ時点で必ずドラッグ状態を解除する（opacity 残り・次クリック無効化の防止）
              setDraggingDealId(null);
              setTimeout(() => {
                wasDraggedRef.current = false;
              }, 0);
              if (dealId) onDropDeal(dealId, col.id);
            }}
          >
            {col.deals.length === 0 ? (
              <div
                className="p-4 text-center text-xs rounded"
                style={{
                  color: "var(--color-text-list)",
                  border: "1px dashed var(--color-border-default)",
                }}
              >
                商談なし
              </div>
            ) : (
              col.deals.map((deal) => (
                <Link
                  key={deal.id}
                  href={`/deals/${deal.id}`}
                  draggable
                  onDragStart={(e) => {
                    wasDraggedRef.current = true;
                    e.dataTransfer.setData("text/plain", deal.id);
                    e.dataTransfer.effectAllowed = "move";
                    setDraggingDealId(deal.id);
                  }}
                  onDragEnd={() => {
                    setDraggingDealId(null);
                    setDragOverColumnId(null);
                    // click イベントより後にリセットしてカード遷移の誤発火を防ぐ
                    setTimeout(() => {
                      wasDraggedRef.current = false;
                    }, 0);
                  }}
                  onClick={(e) => {
                    if (wasDraggedRef.current) {
                      e.preventDefault();
                    }
                  }}
                  className="block hover:shadow-md"
                  style={{
                    backgroundColor: "#fff",
                    borderRadius: "var(--radius-card)",
                    boxShadow:
                      movedDealId === deal.id
                        ? "0 0 0 2px var(--color-terra), var(--elevation-low)"
                        : "var(--elevation-low)",
                    padding: "1rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.75rem",
                    cursor: draggingDealId === deal.id ? "grabbing" : "grab",
                    opacity: draggingDealId === deal.id ? 0.5 : 1,
                    transition: "opacity 0.15s ease, box-shadow 0.4s ease",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: "0.5rem",
                    }}
                  >
                    <p
                      className="line-clamp-2"
                      style={{
                        color: "var(--color-text-list)",
                        fontSize: "0.875rem",
                        fontWeight: 500,
                        lineHeight: 1.4,
                        flex: 1,
                        margin: 0,
                      }}
                    >
                      {deal.name}
                    </p>
                    {deal.deal_status?.name && (
                      <span style={{ flexShrink: 0 }}>
                        <StatusBadge
                          name={deal.deal_status.name}
                          color={deal.deal_status.color}
                          sortOrder={deal.deal_status.sort_order}
                          total={statusesList.length}
                        />
                      </span>
                    )}
                  </div>
                  <p
                    style={{
                      color: "var(--color-text-list)",
                      fontSize: "1rem",
                      fontWeight: 600,
                      margin: 0,
                    }}
                  >
                    {formatAmount(deal.amount)}
                  </p>
                  {(() => {
                    const stagnation = getStagnation(deal);
                    const due = getDueInfo(deal);
                    const applicationDate = deal.application_date;
                    // 期日の方が判断に効くため、期日がある場合は申込日を出さない（情報過多の回避）
                    const showDue = !!due;
                    const showApplication = !showDue && !!applicationDate;
                    if (!stagnation && !showDue && !showApplication) return null;
                    return (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "0.5rem",
                        }}
                      >
                        {showDue && due ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.25rem",
                              fontSize: "0.75rem",
                              color: due.color,
                              fontWeight: due.severe ? 600 : 400,
                            }}
                          >
                            {due.severe ? (
                              <AlertTriangle size={12} aria-hidden="true" />
                            ) : (
                              <CalendarDays size={12} aria-hidden="true" />
                            )}
                            {due.label}
                          </span>
                        ) : showApplication ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.25rem",
                              fontSize: "0.75rem",
                              color: "var(--color-sumi600)",
                            }}
                          >
                            <CalendarDays size={12} aria-hidden="true" />
                            申込 {formatShortDate(applicationDate as string)}
                          </span>
                        ) : (
                          <span />
                        )}
                        {stagnation && (
                          <span
                            title={`ステージが ${stagnation.days} 日動いていません`}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.1875rem",
                              borderRadius: "var(--radius-badge)",
                              border: `1px solid ${
                                stagnation.severe
                                  ? "var(--color-error)"
                                  : "var(--color-border-default)"
                              }`,
                              color: stagnation.color,
                              fontSize: "0.6875rem",
                              fontWeight: stagnation.severe ? 600 : 500,
                              padding: "0.0625rem 0.375rem",
                              whiteSpace: "nowrap",
                              flexShrink: 0,
                            }}
                          >
                            {stagnation.severe && (
                              <AlertTriangle size={11} aria-hidden="true" />
                            )}
                            {stagnation.days}日 停滞
                          </span>
                        )}
                      </div>
                    );
                  })()}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.5rem",
                    }}
                  >
                    <span
                      className="truncate"
                      style={{
                        color: "var(--color-text-list)",
                        fontSize: "0.75rem",
                        fontWeight: 400,
                        maxWidth: 140,
                      }}
                    >
                      {getDealCounterpartyLabel(deal) || "—"}
                    </span>
                    <span
                      style={{
                        color: "var(--color-text-list)",
                        fontSize: "0.75rem",
                        fontWeight: 400,
                      }}
                    >
                      {deal.owner?.full_name ?? "—"}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- テーブルビュー ----------
function TableView({
  data,
  sort,
  onSortChange,
}: {
  data: ListData;
  sort: SortState;
  onSortChange: (next: SortState) => void;
}) {
  return (
    <DataTable<DealWithRelations>
      items={data?.rows ?? []}
      getKey={(deal) => deal.id}
      getHref={(deal) => `/deals/${deal.id}`}
      emptyIcon={Handshake}
      emptyMessage="商談がありません"
      sort={sort}
      onSortChange={onSortChange}
      columns={[
        {
          label: "取引名",
          sortKey: "name",
          card: "title",
          className: "min-w-[200px]",
          render: (deal) => (
            <Link
              href={`/deals/${deal.id}`}
              className="font-medium"
              style={{ color: "var(--color-text-list)" }}
              onClick={(e) => e.stopPropagation()}
            >
              {deal.name}
            </Link>
          ),
        },
        {
          label: "ステージ",
          card: "meta",
          className: "w-[130px] whitespace-nowrap",
          render: (deal) => (
            <StageBadge
              name={deal.deal_stage?.name}
              color={deal.deal_stage?.color}
              sortOrder={deal.deal_stage?.sort_order}
            />
          ),
        },
        {
          label: "ステータス",
          card: "meta",
          className: "w-[130px] whitespace-nowrap",
          render: (deal) => (
            <StatusBadge
              name={deal.deal_status?.name}
              color={deal.deal_status?.color}
              sortOrder={deal.deal_status?.sort_order}
            />
          ),
        },
        {
          /* 期限が近い・過ぎたものは色と太さで目立たせる */
          label: "クローズ予定日",
          sortKey: "expected_close_date",
          className: "w-[120px] whitespace-nowrap",
          render: (deal) => {
            const due = getDueInfo(deal);
            return (
              <span
                style={{
                  color: due ? due.color : "var(--color-text-list)",
                  fontWeight: due?.severe ? 600 : 400,
                }}
              >
                {deal.expected_close_date
                  ? new Date(deal.expected_close_date).toLocaleDateString("ja-JP")
                  : "—"}
              </span>
            );
          },
        },
        {
          label: "金額",
          sortKey: "amount",
          className: "w-[120px] text-right font-mono whitespace-nowrap",
          render: (deal) => formatAmount(deal.amount),
        },
        {
          label: "取引先",
          className: "min-w-[180px] max-w-[220px] truncate",
          render: (deal) => getDealCounterpartyLabel(deal) || "—",
        },
        {
          label: "担当者",
          className: "w-[120px] whitespace-nowrap",
          render: (deal) => deal.owner?.full_name ?? "—",
        },
        {
          label: "最終更新日",
          sortKey: "updated_at",
          className: "w-[150px] text-xs whitespace-nowrap",
          render: (deal) => formatDateTime(deal.updated_at),
        },
      ]}
    />
  );
}
