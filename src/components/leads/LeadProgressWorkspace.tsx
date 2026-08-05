"use client";

import { useEffect, useState, useTransition, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Columns3, LayoutGrid, List } from "lucide-react";

import {
  getLeads,
  getLeadKanbanCards,
  getLeadProgressSummary,
  type LeadKanbanCard,
  type LeadProgressCell,
} from "@/actions/leads";
import { LeadKanbanBoard } from "@/components/leads/LeadKanbanBoard";
import { LeadProgressBoard } from "@/components/leads/LeadProgressBoard";
import { StageBadge, StatusBadge, TemperatureBadge } from "@/components/ui/badges";
import { Pagination } from "@/components/ui/Pagination";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import { tableScrollClass } from "@/lib/layout";
import type { LeadListRow, Paged } from "@/types/relations";

type ProgressView = "kanban" | "list" | "board";

const VIEW_OPTIONS = [
  { value: "kanban" as const, label: "カンバン", icon: Columns3 },
  { value: "list" as const, label: "一覧", icon: List },
  { value: "board" as const, label: "集計", icon: LayoutGrid },
];

/** カンバンに並べる 1 ステージあたりの上限。全件は一覧で見る */
const KANBAN_LIMIT = 20;

/**
 * カテゴリ 1 つ分の進捗管理。
 *
 * 追い方はカテゴリごとに違うので、画面を分けて 1 つずつ見る
 * （問い合わせ / インバウンド / アウトバウンド）。母集団は固定なので
 * ここではカテゴリの絞り込みを出さない。
 *
 * リードの登録・編集は `/leads` で行う。ここは進み具合を見る場所。
 */
export function LeadProgressWorkspace({
  categoryId,
  title,
  description,
}: {
  categoryId: string | null;
  title: string;
  description: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<ProgressView>("kanban");
  const [isPending, startTransition] = useTransition();

  const [summary, setSummary] = useState<LeadProgressCell[] | null>(null);
  const [kanban, setKanban] = useState<LeadKanbanCard[] | null>(null);
  const [list, setList] = useState<Paged<LeadListRow> | null>(null);
  const [page, setPage] = useState(1);

  // 総数はカンバンでも集計でも要る。最初に一度だけ取る
  useEffect(() => {
    startTransition(async () => {
      const [{ data: s }, { data: k }] = await Promise.all([
        getLeadProgressSummary(categoryId ?? undefined),
        getLeadKanbanCards(KANBAN_LIMIT, categoryId ?? undefined),
      ]);
      setSummary(s);
      setKanban(k);
    });
  }, [categoryId]);

  function loadList(nextPage: number) {
    setPage(nextPage);
    startTransition(async () => {
      const { data } = await getLeads({
        category_id: categoryId ?? undefined,
        page: nextPage,
        perPage: DEFAULT_PAGE_SIZE,
      });
      setList(data);
    });
  }

  function switchView(next: ProgressView) {
    setView(next);
    if (next === "list" && !list) loadList(1);
  }

  const total = (summary ?? []).reduce((sum, c) => sum + c.lead_count, 0);

  return (
    <div>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>{title}</h1>
          <p style={styles.sub}>{description}</p>
        </div>

        <div style={styles.group} role="tablist" aria-label="表示の切り替え">
          {VIEW_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={view === opt.value}
              style={{
                ...styles.switchBtn,
                ...(view === opt.value ? styles.switchBtnActive : null),
              }}
              onClick={() => switchView(opt.value)}
            >
              <opt.icon size={14} />
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div style={styles.summaryRow}>
        <span style={styles.total}>{total.toLocaleString()} 件</span>
        <Link href="/leads" style={styles.toLeads} className="hover:bg-[var(--color-bg-hover)]">
          リード一覧で編集する
          <ArrowUpRight size={13} />
        </Link>
        {isPending && <span style={styles.loading}>読み込み中...</span>}
      </div>

      {view === "kanban" &&
        (kanban ? (
          <LeadKanbanBoard
            cards={kanban}
            summary={summary ?? []}
            limitPerStage={KANBAN_LIMIT}
            categoryId={categoryId ?? undefined}
          />
        ) : (
          <p style={styles.loading}>読み込み中...</p>
        ))}

      {view === "board" &&
        (summary ? (
          <LeadProgressBoard cells={summary} categoryId={categoryId ?? undefined} />
        ) : (
          <p style={styles.loading}>読み込み中...</p>
        ))}

      {view === "list" && (
        <>
          <div style={styles.tableCard} className={tableScrollClass}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: "var(--color-sumi50)" }}>
                  {["リード名", "ステージ", "ステータス", "温度感", "スコア", "担当者"].map(
                    (label) => (
                      <th key={label} style={styles.th}>
                        {label}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {(list?.rows ?? []).map((l) => (
                  <tr
                    key={l.id}
                    style={styles.tr}
                    className="cursor-pointer hover:bg-[var(--color-bg-hover)]"
                    onClick={() => router.push(`/leads/${l.id}`)}
                  >
                    <td style={styles.td}>{l.lead_name}</td>
                    <td style={styles.td}>
                      <StageBadge name={l.stage?.name} color={l.stage?.color} />
                    </td>
                    <td style={styles.td}>
                      <StatusBadge name={l.status?.name} color={l.status?.color} />
                    </td>
                    <td style={styles.td}>
                      {l.temperature ? (
                        <TemperatureBadge
                          code={l.temperature.code}
                          name={l.temperature.name}
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={styles.td}>{l.score ?? "—"}</td>
                    <td style={styles.td}>{l.owner?.full_name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            totalCount={list?.total ?? 0}
            pageSize={DEFAULT_PAGE_SIZE}
            onPageChange={loadList}
          />
        </>
      )}
    </div>
  );
}

const styles = {
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "1rem",
    marginBottom: "0.75rem",
    flexWrap: "wrap",
  } as CSSProperties,
  title: {
    color: "var(--color-text-title)",
    fontSize: "1.5rem",
    fontWeight: 700,
    margin: "0 0 0.25rem 0",
  } as CSSProperties,
  sub: {
    color: "var(--color-sumi600)",
    fontSize: "0.8125rem",
    margin: 0,
  } as CSSProperties,
  group: {
    display: "inline-flex",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-button)",
    overflow: "hidden",
    backgroundColor: "#fff",
    flexShrink: 0,
  } as CSSProperties,
  switchBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    border: "none",
    backgroundColor: "transparent",
    color: "var(--color-sumi600)",
    fontSize: "0.75rem",
    padding: "0.375rem 0.75rem",
    cursor: "pointer",
  } as CSSProperties,
  switchBtnActive: {
    backgroundColor: "var(--color-terra)",
    color: "#fff",
    fontWeight: 500,
  } as CSSProperties,
  summaryRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    marginBottom: "1rem",
  } as CSSProperties,
  total: {
    fontSize: "0.875rem",
    fontWeight: 600,
    color: "var(--color-text-title)",
  } as CSSProperties,
  toLeads: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    color: "var(--color-sumi600)",
    fontSize: "0.75rem",
    textDecoration: "none",
    padding: "0.25rem 0.5rem",
    borderRadius: "var(--radius-sm)",
  } as CSSProperties,
  loading: {
    color: "var(--color-sumi500)",
    fontSize: "0.75rem",
  } as CSSProperties,
  tableCard: {
    backgroundColor: "#fff",
    borderRadius: "var(--radius-card)",
    boxShadow: "var(--elevation-low)",
    overflowX: "auto",
  } as CSSProperties,
  th: {
    padding: "0.75rem 1rem",
    textAlign: "left" as const,
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "var(--color-sumi600)",
    whiteSpace: "nowrap" as const,
  } as CSSProperties,
  tr: {
    borderBottom: "1px solid var(--color-border-default)",
  } as CSSProperties,
  td: {
    padding: "0.625rem 1rem",
    color: "var(--color-text-list)",
    whiteSpace: "nowrap" as const,
  } as CSSProperties,
};
