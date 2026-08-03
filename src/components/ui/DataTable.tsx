"use client";

import type { ComponentType, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * 一覧の列定義。
 *
 * 表とカードで同じ定義を使う。CRM の一覧は列が多く、狭い画面で横スクロール
 * させても実用にならないため、md 未満では 1 件 1 カードのリストに切り替える。
 * どちらで出すかを各画面で書き分けずに済むよう、ここで一括して面倒を見る。
 */
export type DataColumn<T> = {
  /** 見出し。カードでは項目ラベルになる */
  label: string;
  /** セルの中身 */
  render: (row: T) => ReactNode;
  /**
   * カード表示での扱い。
   *   title  … カードの見出し（1 列だけ指定する）
   *   meta   … 見出しの右。ステータスバッジなど短いもの向け
   *   hidden … カードには出さない。狭い画面で優先度の低い列に使う
   *   省略   … 「ラベル / 値」の行として並べる
   */
  card?: "title" | "meta" | "hidden";
  /** セル（th / td）に足すクラス */
  className?: string;
};

type Props<T> = {
  items: T[];
  columns: DataColumn<T>[];
  getKey: (row: T) => string;
  /** 行・カードをクリックしたときの遷移先。省略するとクリックできない */
  getHref?: (row: T) => string;
  /** 0 件のときのアイコン */
  emptyIcon?: ComponentType<{ size?: number; style?: React.CSSProperties }>;
  /** 0 件のときの文言 */
  emptyMessage?: string;
  /** 列幅を内容ではなく均等に割る */
  fixedLayout?: boolean;
};

const surfaceStyle = {
  backgroundColor: "var(--color-bg-surface)",
  borderRadius: "var(--radius-card)",
  boxShadow: "var(--elevation-low)",
} as const;

export function DataTable<T>({
  items,
  columns,
  getKey,
  getHref,
  emptyIcon: EmptyIcon,
  emptyMessage = "データが見つかりません",
  fixedLayout = false,
}: Props<T>) {
  const router = useRouter();

  if (items.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 py-16 px-4 text-center"
        style={surfaceStyle}
      >
        {EmptyIcon && <EmptyIcon size={40} style={{ color: "var(--color-sumi600)" }} />}
        <p className="text-sm" style={{ color: "var(--color-sumi600)" }}>
          {emptyMessage}
        </p>
      </div>
    );
  }

  const titleColumn = columns.find((c) => c.card === "title") ?? columns[0];
  const metaColumns = columns.filter((c) => c.card === "meta");
  const listColumns = columns.filter(
    (c) => c !== titleColumn && c.card !== "meta" && c.card !== "hidden"
  );

  const open = (row: T) => {
    if (getHref) router.push(getHref(row));
  };

  return (
    <>
      {/* ── md 以上: 表 ── */}
      <div className="hidden md:block table-scroll" style={surfaceStyle}>
        <table
          className="w-full text-sm"
          style={{ tableLayout: fixedLayout ? "fixed" : "auto" }}
        >
          <thead>
            <tr style={{ backgroundColor: "var(--color-sumi50)" }}>
              {columns.map((col) => (
                <th
                  key={col.label}
                  className={cn(
                    "px-4 py-3 text-left font-semibold text-xs whitespace-nowrap",
                    col.className
                  )}
                  style={{ color: "var(--color-sumi600)" }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr
                key={getKey(row)}
                className={cn("transition-colors", getHref && "cursor-pointer")}
                style={{ borderBottom: "1px solid var(--color-border-default)" }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = "var(--color-bg-hover)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "transparent")
                }
                onClick={() => open(row)}
              >
                {columns.map((col) => (
                  <td
                    key={col.label}
                    className={cn("px-4 py-3", col.className)}
                    style={{ color: "var(--color-text-list)" }}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── md 未満: カード ── */}
      <div className="md:hidden flex flex-col gap-2">
        {items.map((row) => (
          <div
            key={getKey(row)}
            className={cn("px-4 py-3", getHref && "cursor-pointer")}
            style={surfaceStyle}
            onClick={() => open(row)}
          >
            <div className="flex items-start justify-between gap-2">
              <div
                className="font-semibold text-sm min-w-0 break-words"
                style={{ color: "var(--color-text-title)" }}
              >
                {titleColumn.render(row)}
              </div>
              {metaColumns.length > 0 && (
                <div className="flex flex-wrap items-center justify-end gap-1 shrink-0">
                  {metaColumns.map((col) => (
                    <span key={col.label}>{col.render(row)}</span>
                  ))}
                </div>
              )}
            </div>

            {listColumns.length > 0 && (
              <dl className="mt-2 grid grid-cols-[minmax(5rem,auto)_1fr] gap-x-3 gap-y-1 text-xs">
                {listColumns.map((col) => (
                  <div key={col.label} className="contents">
                    <dt style={{ color: "var(--color-sumi600)" }}>{col.label}</dt>
                    <dd
                      className="min-w-0 break-words"
                      style={{ color: "var(--color-text-list)" }}
                    >
                      {col.render(row)}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
