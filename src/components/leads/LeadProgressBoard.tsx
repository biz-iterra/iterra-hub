"use client";

import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";

import type { LeadProgressCell } from "@/actions/leads";

/**
 * リードの進捗をステージ × カテゴリで見る。
 *
 * 一覧では「どの層がどこで滞っているか」が分からない。件数を面で並べ、
 * 気になるところから一覧へ降りられるようにする。
 *
 * 件数は RLS が効いた範囲。member には自分の担当分しか出ない。
 */
export function LeadProgressBoard({ cells }: { cells: LeadProgressCell[] }) {
  const router = useRouter();

  // 関数側で sort_order 順に返している。出現順を保って組み直す
  const stages = [...new Map(cells.map((c) => [c.stage_id, c])).values()].sort(
    (a, b) => a.stage_order - b.stage_order
  );
  const categories = [
    ...new Map(
      cells
        .filter((c) => c.category_id)
        .map((c) => [
          c.category_id,
          { id: c.category_id!, name: c.category_name!, color: c.category_color },
        ])
    ).values(),
  ];

  const countOf = (stageId: string, categoryId: string) =>
    cells.find((c) => c.stage_id === stageId && c.category_id === categoryId)
      ?.lead_count ?? 0;

  const stageTotal = (stageId: string) =>
    cells
      .filter((c) => c.stage_id === stageId)
      .reduce((sum, c) => sum + c.lead_count, 0);

  const categoryTotal = (categoryId: string) =>
    cells
      .filter((c) => c.category_id === categoryId)
      .reduce((sum, c) => sum + c.lead_count, 0);

  const total = cells.reduce((sum, c) => sum + c.lead_count, 0);

  return (
    <div style={styles.card}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ backgroundColor: "var(--color-sumi50)" }}>
            <th style={{ ...styles.th, textAlign: "left" }}>ステージ</th>
            {categories.map((c) => (
              <th key={c.id} style={styles.th}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.375rem",
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "var(--radius-full)",
                      backgroundColor: c.color ?? "var(--color-sumi400)",
                    }}
                  />
                  {c.name}
                </span>
              </th>
            ))}
            <th style={styles.th}>計</th>
          </tr>
        </thead>
        <tbody>
          {stages.map((s) => (
            <tr key={s.stage_id} style={styles.tr}>
              <td style={{ ...styles.td, textAlign: "left" }}>
                {s.stage_name}
                {s.is_terminal && <span style={styles.terminal}>終了</span>}
              </td>
              {categories.map((c) => {
                const n = countOf(s.stage_id, c.id);
                return (
                  <td key={c.id} style={styles.td}>
                    {n === 0 ? (
                      <span style={styles.zero}>—</span>
                    ) : (
                      <button
                        type="button"
                        style={styles.cellBtn}
                        className="hover:bg-[var(--color-bg-hover)]"
                        onClick={() =>
                          router.push(
                            `/leads?stage=${s.stage_id}&category=${c.id}`
                          )
                        }
                      >
                        {n.toLocaleString()}
                      </button>
                    )}
                  </td>
                );
              })}
              <td style={{ ...styles.td, fontWeight: 600 }}>
                {stageTotal(s.stage_id).toLocaleString()}
              </td>
            </tr>
          ))}
          <tr style={{ backgroundColor: "var(--color-sumi50)" }}>
            <td style={{ ...styles.td, textAlign: "left", fontWeight: 600 }}>計</td>
            {categories.map((c) => (
              <td key={c.id} style={{ ...styles.td, fontWeight: 600 }}>
                {categoryTotal(c.id).toLocaleString()}
              </td>
            ))}
            <td style={{ ...styles.td, fontWeight: 700 }}>
              {total.toLocaleString()}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const styles = {
  card: {
    backgroundColor: "#fff",
    borderRadius: "var(--radius-card)",
    boxShadow: "var(--elevation-low)",
    overflowX: "auto",
  } as CSSProperties,
  th: {
    padding: "0.75rem 1rem",
    textAlign: "center" as const,
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
    textAlign: "center" as const,
    color: "var(--color-text-list)",
    whiteSpace: "nowrap" as const,
  } as CSSProperties,
  cellBtn: {
    border: "none",
    backgroundColor: "transparent",
    color: "var(--color-terra)",
    fontSize: "0.875rem",
    fontWeight: 600,
    cursor: "pointer",
    padding: "0.25rem 0.5rem",
    borderRadius: "var(--radius-sm)",
  } as CSSProperties,
  zero: {
    color: "var(--color-sumi400)",
  } as CSSProperties,
  terminal: {
    marginLeft: "0.5rem",
    fontSize: "0.625rem",
    color: "var(--color-sumi500)",
  } as CSSProperties,
};
