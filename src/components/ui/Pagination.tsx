"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import type { CSSProperties } from "react";

type Props = {
  page: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
};

export function Pagination({ page, totalCount, pageSize, onPageChange }: Props) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);

  if (totalCount <= pageSize) return null;

  const canPrev = page > 1;
  const canNext = page < totalPages;

  const btn: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "2rem",
    height: "2rem",
    flexShrink: 0,
    borderRadius: "var(--radius-button)",
    border: "1px solid var(--color-border-default)",
    backgroundColor: "var(--color-bg-default)",
    cursor: "pointer",
    color: "var(--color-text-body)",
    transition: "background-color 0.15s",
  };
  const btnDisabled: CSSProperties = {
    ...btn,
    cursor: "not-allowed",
    opacity: 0.4,
    transition: undefined,
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
  };
  const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.backgroundColor = "var(--color-bg-default)";
  };

  return (
    <div
      className="flex flex-col sm:flex-row items-center justify-between gap-2 mt-4"
      style={{ fontSize: "0.875rem", color: "var(--color-text-body)" }}
    >
      <span style={{ color: "var(--color-sumi600)" }}>
        {from.toLocaleString()}〜{to.toLocaleString()} / {totalCount.toLocaleString()}件
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(1)}
          disabled={!canPrev}
          style={canPrev ? btn : btnDisabled}
          aria-label="先頭ページ"
          className="tap-target"
          onMouseEnter={canPrev ? handleMouseEnter : undefined}
          onMouseLeave={canPrev ? handleMouseLeave : undefined}
        >
          <ChevronsLeft size={16} />
        </button>
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={!canPrev}
          style={canPrev ? btn : btnDisabled}
          aria-label="前ページ"
          className="tap-target"
          onMouseEnter={canPrev ? handleMouseEnter : undefined}
          onMouseLeave={canPrev ? handleMouseLeave : undefined}
        >
          <ChevronLeft size={16} />
        </button>
        <span style={{ minWidth: "4rem", textAlign: "center", color: "var(--color-sumi600)" }}>
          {page} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={!canNext}
          style={canNext ? btn : btnDisabled}
          aria-label="次ページ"
          className="tap-target"
          onMouseEnter={canNext ? handleMouseEnter : undefined}
          onMouseLeave={canNext ? handleMouseLeave : undefined}
        >
          <ChevronRight size={16} />
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={!canNext}
          style={canNext ? btn : btnDisabled}
          aria-label="末尾ページ"
          className="tap-target"
          onMouseEnter={canNext ? handleMouseEnter : undefined}
          onMouseLeave={canNext ? handleMouseLeave : undefined}
        >
          <ChevronsRight size={16} />
        </button>
      </div>
    </div>
  );
}
