"use client";

import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";

import type { LeadKanbanCard, LeadProgressCell } from "@/actions/leads";

/**
 * リードのカンバン。
 *
 * 3,800 件あるので**全部は並べない**。ステージごとに上位（スコア順）だけを出し、
 * 総数と件数の差は「他 N 件」として示す。全部を見るときは一覧へ移る。
 *
 * 商談のカンバンと違い、ドラッグでの移動は付けていない。リードのステージは
 * 架電の結果で動くもので、ボード上で動かす操作とは結び付きにくいため。
 */
export function LeadKanbanBoard({
  cards,
  summary,
  limitPerStage,
}: {
  cards: LeadKanbanCard[];
  summary: LeadProgressCell[];
  limitPerStage: number;
}) {
  const router = useRouter();

  const stages = [...new Map(cards.map((c) => [c.stage_id, c])).values()].sort(
    (a, b) => a.stage_order - b.stage_order
  );

  const totalOf = (stageId: string) =>
    summary
      .filter((s) => s.stage_id === stageId)
      .reduce((sum, s) => sum + s.lead_count, 0);

  return (
    <div style={styles.board} className="no-scrollbar">
      {stages.map((s) => {
        const items = cards.filter(
          (c) => c.stage_id === s.stage_id && c.lead_id !== null
        );
        const total = totalOf(s.stage_id);
        const rest = total - items.length;

        return (
          <div key={s.stage_id} style={styles.column}>
            <div style={styles.columnHead}>
              <span style={styles.stageName}>{s.stage_name}</span>
              <span style={styles.stageCount}>{total.toLocaleString()}</span>
            </div>

            {items.length === 0 ? (
              <p style={styles.empty}>なし</p>
            ) : (
              items.map((c) => (
                <button
                  key={c.lead_id}
                  type="button"
                  style={styles.card}
                  className="hover:bg-[var(--color-bg-hover)]"
                  onClick={() => router.push(`/leads/${c.lead_id}`)}
                >
                  <span style={styles.leadName}>{c.lead_name}</span>
                  {c.company_name && (
                    <span style={styles.company}>{c.company_name}</span>
                  )}
                  <span style={styles.meta}>
                    {c.category_name && (
                      <span
                        style={{
                          ...styles.chip,
                          backgroundColor: c.category_color
                            ? `${c.category_color}22`
                            : "var(--color-sumi100)",
                          color: c.category_color ?? "var(--color-sumi700)",
                        }}
                      >
                        {c.category_name}
                      </span>
                    )}
                    {c.temperature_name && (
                      <span
                        style={{
                          ...styles.chip,
                          backgroundColor: c.temperature_color
                            ? `${c.temperature_color}22`
                            : "var(--color-sumi100)",
                          color: c.temperature_color ?? "var(--color-sumi700)",
                        }}
                      >
                        {c.temperature_name}
                      </span>
                    )}
                    {c.score != null && (
                      <span style={styles.score}>{c.score}</span>
                    )}
                  </span>
                </button>
              ))
            )}

            {rest > 0 && (
              <button
                type="button"
                style={styles.more}
                className="hover:bg-[var(--color-bg-hover)]"
                onClick={() => router.push(`/leads?stage=${s.stage_id}`)}
              >
                他 {rest.toLocaleString()} 件を一覧で見る
              </button>
            )}
          </div>
        );
      })}

      {stages.length > 0 && (
        <p style={styles.note}>
          スコアの高い順に各 {limitPerStage} 件まで表示しています
        </p>
      )}
    </div>
  );
}

const styles = {
  board: {
    display: "flex",
    gap: "0.75rem",
    overflowX: "auto",
    paddingBottom: "0.5rem",
    alignItems: "flex-start",
  } as CSSProperties,
  column: {
    flex: "0 0 240px",
    backgroundColor: "var(--color-sumi50)",
    borderRadius: "var(--radius-card)",
    padding: "0.625rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  } as CSSProperties,
  columnHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.5rem",
    padding: "0 0.25rem 0.25rem",
  } as CSSProperties,
  stageName: {
    fontSize: "0.8125rem",
    fontWeight: 600,
    color: "var(--color-text-title)",
  } as CSSProperties,
  stageCount: {
    fontSize: "0.75rem",
    color: "var(--color-sumi600)",
  } as CSSProperties,
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    alignItems: "flex-start",
    textAlign: "left" as const,
    backgroundColor: "#fff",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-sm)",
    padding: "0.5rem 0.625rem",
    cursor: "pointer",
    width: "100%",
  } as CSSProperties,
  leadName: {
    fontSize: "0.8125rem",
    fontWeight: 500,
    color: "var(--color-text-title)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    width: "100%",
  } as CSSProperties,
  company: {
    fontSize: "0.6875rem",
    color: "var(--color-sumi600)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    width: "100%",
  } as CSSProperties,
  meta: {
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
    flexWrap: "wrap",
    marginTop: "0.125rem",
  } as CSSProperties,
  chip: {
    borderRadius: "var(--radius-badge)",
    padding: "0.0625rem 0.375rem",
    fontSize: "0.625rem",
    fontWeight: 500,
  } as CSSProperties,
  score: {
    marginLeft: "auto",
    fontSize: "0.6875rem",
    fontWeight: 600,
    color: "var(--color-sumi600)",
  } as CSSProperties,
  empty: {
    fontSize: "0.75rem",
    color: "var(--color-sumi400)",
    margin: "0.25rem 0.25rem 0.5rem",
  } as CSSProperties,
  more: {
    border: "1px dashed var(--color-border-default)",
    backgroundColor: "transparent",
    borderRadius: "var(--radius-sm)",
    padding: "0.375rem",
    fontSize: "0.6875rem",
    color: "var(--color-sumi600)",
    cursor: "pointer",
  } as CSSProperties,
  note: {
    flex: "0 0 auto",
    alignSelf: "flex-end",
    fontSize: "0.6875rem",
    color: "var(--color-sumi500)",
    margin: 0,
    padding: "0 0.5rem",
    whiteSpace: "nowrap" as const,
  } as CSSProperties,
};
