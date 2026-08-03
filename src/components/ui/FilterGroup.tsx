"use client";

import { type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { filterBarClass } from "@/lib/layout";
import { cn } from "@/lib/utils";

export interface FilterGroupProps {
  children: ReactNode;
  className?: string;
}

/**
 * フィルタコントロール（FilterSelect / SearchInput 等）を配置するコンテナ。
 * - sm 未満: 縦積み。各コントロールが全幅になる
 * - sm 以上: flex-wrap で横並び。折り返しつつ下端を揃える
 *
 * 実体は globals.css の .filter-bar。
 */
export function FilterGroup({ children, className }: FilterGroupProps) {
  return (
    <div className={cn(filterBarClass, className)} role="group" aria-label="絞り込み">
      {children}
    </div>
  );
}

export interface FilterClearButtonProps {
  onClear: () => void;
  className?: string;
}

/**
 * フィルタ一括クリアボタン。FilterGroup の末尾に配置する。
 * onClear コールバックで呼び出し元の全フィルタ state をリセットする。
 */
export function FilterClearButton({ onClear, className }: FilterClearButtonProps) {
  return (
    <button
      type="button"
      onClick={onClear}
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.375rem",
        padding: "0.4rem 0.75rem",
        fontSize: "0.8125rem",
        fontWeight: 500,
        border: "1px solid var(--color-border-default)",
        borderRadius: "var(--radius-button)",
        backgroundColor: "#fff",
        color: "var(--color-sumi600)",
        cursor: "pointer",
        whiteSpace: "nowrap",
        alignSelf: "flex-end",
        transition: "background-color 0.15s, color 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
        e.currentTarget.style.color = "var(--color-text-title)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "#fff";
        e.currentTarget.style.color = "var(--color-sumi600)";
      }}
    >
      <RotateCcw size={13} />
      リセット
    </button>
  );
}
