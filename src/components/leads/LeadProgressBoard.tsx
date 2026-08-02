"use client";

import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";

import type { LeadProgressCell } from "@/actions/leads";
import { kanbanColorFrom } from "@/lib/kanban-color";

/**
 * 進捗の集計。ステージごとに、その中のステータスの内訳を並べる。
 *
 * ステータスはステージに従属するので、行列にすると空欄だらけになる。
 * ステージを見出しにして中を入れ子にする方が読める。
 *
 * **件数 0 の枠も出す。** 消えると、どこが空いているのか読み取れない。
 * 件数は RLS が効いた範囲（member には自分の担当分だけ）。
 */
export function LeadProgressBoard({
  cells,
  categoryId,
}: {
  cells: LeadProgressCell[];
  /** 一覧へ降りるときに引き継ぐ */
  categoryId?: string;
}) {
  const router = useRouter();

  const stages = [...new Map(cells.map((c) => [c.stage_id, c])).values()].sort(
    (a, b) => a.stage_order - b.stage_order
  );

  const total = cells.reduce((sum, c) => sum + c.lead_count, 0);

  function openList(stageId: string, statusId?: string | null) {
    const params = new URLSearchParams({ stage: stageId });
    if (statusId) params.set("status", statusId);
    if (categoryId) params.set("category", categoryId);
    router.push(`/leads?${params.toString()}`);
  }

  return (
    <div style={styles.card}>
      {stages.map((s) => {
        const rows = cells
          .filter((c) => c.stage_id === s.stage_id && c.status_id)
          .sort((a, b) => (a.status_order ?? 0) - (b.status_order ?? 0));
        const stageTotal = cells
          .filter((c) => c.stage_id === s.stage_id)
          .reduce((sum, c) => sum + c.lead_count, 0);

        // カンバンと同じ色を使う。同じステージが画面ごとに違う色にならないように
        const color = kanbanColorFrom(s.stage_color);

        return (
          <div key={s.stage_id} style={styles.stage}>
            <button
              type="button"
              style={{ ...styles.stageHead, backgroundColor: color.bg }}
              onClick={() => openList(s.stage_id)}
            >
              <span style={{ ...styles.stageName, color: color.text }}>
                <span
                  style={{ ...styles.stageMark, backgroundColor: color.solid }}
                />
                {s.stage_name}
                {s.is_terminal && <span style={styles.terminal}>終了</span>}
              </span>
              <span style={styles.stageCount}>{stageTotal.toLocaleString()}</span>
            </button>

            {rows.length > 0 && (
              <div style={styles.statuses}>
                {rows.map((r) => (
                  <button
                    key={r.status_id}
                    type="button"
                    style={styles.statusRow}
                    className="hover:bg-[var(--color-bg-hover)]"
                    onClick={() => openList(s.stage_id, r.status_id)}
                  >
                    <span style={styles.statusName}>{r.status_name}</span>
                    <span
                      style={{
                        ...styles.statusCount,
                        ...(r.lead_count === 0 ? styles.zero : null),
                      }}
                    >
                      {r.lead_count.toLocaleString()}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div style={styles.totalRow}>
        <span>計</span>
        <span style={{ fontWeight: 700 }}>{total.toLocaleString()}</span>
      </div>
    </div>
  );
}

const styles = {
  card: {
    backgroundColor: "#fff",
    borderRadius: "var(--radius-card)",
    boxShadow: "var(--elevation-low)",
    padding: "0.5rem 0",
  } as CSSProperties,
  stage: {
    borderBottom: "1px solid var(--color-border-default)",
  } as CSSProperties,
  stageHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    border: "none",
    backgroundColor: "transparent",
    padding: "0.75rem 1.25rem",
    cursor: "pointer",
    textAlign: "left" as const,
  } as CSSProperties,
  stageName: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "0.9375rem",
    fontWeight: 600,
  } as CSSProperties,
  stageMark: {
    width: 8,
    height: 8,
    borderRadius: "var(--radius-full)",
    flexShrink: 0,
  } as CSSProperties,
  stageCount: {
    fontSize: "0.9375rem",
    fontWeight: 600,
    color: "var(--color-text-title)",
  } as CSSProperties,
  terminal: {
    marginLeft: "0.5rem",
    fontSize: "0.625rem",
    color: "var(--color-sumi500)",
  } as CSSProperties,
  statuses: {
    display: "flex",
    flexDirection: "column",
    paddingBottom: "0.5rem",
  } as CSSProperties,
  statusRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    border: "none",
    backgroundColor: "transparent",
    padding: "0.375rem 1.25rem 0.375rem 2.25rem",
    cursor: "pointer",
    textAlign: "left" as const,
  } as CSSProperties,
  statusName: {
    fontSize: "0.8125rem",
    color: "var(--color-sumi700)",
  } as CSSProperties,
  statusCount: {
    fontSize: "0.8125rem",
    color: "var(--color-text-list)",
  } as CSSProperties,
  zero: {
    color: "var(--color-sumi400)",
  } as CSSProperties,
  totalRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.75rem 1.25rem",
    fontSize: "0.9375rem",
    color: "var(--color-text-title)",
  } as CSSProperties,
};
