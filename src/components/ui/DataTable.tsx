"use client";

import type { ComponentType, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { nextSortState, parseSort, type SortState } from "@/lib/list-params";

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
   * 並び替えに使う列名（DB のカラム名）。
   * 指定した列だけ見出しを押して昇順・降順を切り替えられる。
   * 表示が複数カラムの合成になっている列（所属・スキル等）には付けない
   */
  sortKey?: string;
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
  /** 現在の並び順。`sortKey` を持つ列に矢印を出すために使う */
  sort?: SortState;
  /**
   * 並び順が変わったとき。**次の状態そのもの**を受け取る。
   * 「押すたびに 1 段階進める」判断は DataTable 側で済ませてあるので、
   * 呼び出し側は受け取った値をそのまま反映すればよい
   */
  onSortChange?: (next: SortState) => void;
};

const surfaceStyle = {
  backgroundColor: "var(--color-bg-surface)",
  borderRadius: "var(--radius-card)",
  boxShadow: "var(--elevation-low)",
} as const;

/**
 * 並び替えできる見出し。
 *
 * 未指定の列は矢印を薄く出して「押せる」ことを伝える。何も出さないと
 * どの列が並び替えできるのか画面から分からない。
 */
function SortableHeader({
  label,
  field,
  sort,
  onSortChange,
}: {
  label: string;
  field: string;
  sort: SortState;
  onSortChange: (next: SortState) => void;
}) {
  const active = sort?.field === field;
  const direction = active ? sort.direction : null;
  const Icon = direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ChevronsUpDown;

  return (
    <button
      type="button"
      onClick={() => onSortChange(nextSortState(sort, field))}
      // aria-sort は th 側に付ける決まりなので、ここでは押した結果を文言で伝える
      aria-label={
        direction === "asc"
          ? `${label}（昇順）。押すと降順`
          : direction === "desc"
            ? `${label}（降順）。押すと解除`
            : `${label}。押すと昇順で並び替え`
      }
      className="inline-flex items-center gap-1 hover:opacity-70"
      style={{
        border: "none",
        background: "none",
        padding: 0,
        margin: 0,
        font: "inherit",
        color: active ? "var(--color-text-title)" : "inherit",
        cursor: "pointer",
      }}
    >
      {label}
      <Icon
        size={12}
        aria-hidden="true"
        style={{ flexShrink: 0, opacity: active ? 1 : 0.35 }}
      />
    </button>
  );
}

export function DataTable<T>({
  items,
  columns,
  getKey,
  getHref,
  emptyIcon: EmptyIcon,
  emptyMessage = "データが見つかりません",
  fixedLayout = false,
  sort = null,
  onSortChange,
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
              {columns.map((col) => {
                const sortable = col.sortKey && onSortChange;
                return (
                  <th
                    key={col.label}
                    className={cn(
                      "px-4 py-3 text-left font-semibold text-xs whitespace-nowrap",
                      col.className
                    )}
                    style={{ color: "var(--color-sumi600)" }}
                    aria-sort={
                      col.sortKey && sort?.field === col.sortKey
                        ? sort.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : sortable
                          ? "none"
                          : undefined
                    }
                  >
                    {sortable ? (
                      <SortableHeader
                        label={col.label}
                        field={col.sortKey!}
                        sort={sort}
                        onSortChange={onSortChange}
                      />
                    ) : (
                      col.label
                    )}
                  </th>
                );
              })}
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
        {/* カード表示には見出し行が無いので、並び替えは選択式で出す */}
        {onSortChange && columns.some((c) => c.sortKey) && (
          <div className="flex items-center gap-2 text-xs">
            <label htmlFor="datatable-sort" style={{ color: "var(--color-sumi600)" }}>
              並び替え
            </label>
            <select
              id="datatable-sort"
              value={sort ? `${sort.field}:${sort.direction}` : ""}
              onChange={(e) => onSortChange(parseSort(e.target.value))}
              style={{
                border: "1px solid var(--color-border-default)",
                borderRadius: "var(--radius-input)",
                padding: "0.25rem 0.5rem",
                backgroundColor: "#fff",
                fontSize: "0.75rem",
              }}
            >
              <option value="">既定</option>
              {columns
                .filter((c) => c.sortKey)
                .flatMap((c) => [
                  <option key={`${c.sortKey}:asc`} value={`${c.sortKey}:asc`}>
                    {c.label}（昇順）
                  </option>,
                  <option key={`${c.sortKey}:desc`} value={`${c.sortKey}:desc`}>
                    {c.label}（降順）
                  </option>,
                ])}
            </select>
          </div>
        )}
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
