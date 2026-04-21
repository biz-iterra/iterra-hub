"use client";

import { type ReactNode, type CSSProperties } from "react";
import { RotateCcw } from "lucide-react";

export interface FilterGroupProps {
  children: ReactNode;
  className?: string;
}

/**
 * フィルタコントロール（FilterSelect / SearchInput 等）を横並びで配置するコンテナ。
 * - モバイル: flex-wrap で折り返し
 * - 各子要素が自身の flex-basis / min-width を保持しつつ伸縮
 */
const groupStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-end",
  gap: "0.5rem",
};

export function FilterGroup({ children, className }: FilterGroupProps) {
  return (
    <div style={groupStyle} className={className} role="group" aria-label="絞り込み">
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
