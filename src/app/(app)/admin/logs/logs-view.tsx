"use client";

import { useState, useTransition, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { getChangeLogs, type ChangeLogRow } from "@/actions/change-logs";
import { ToneBadge } from "@/components/ui/badges";
import { FilterGroup, FilterClearButton } from "@/components/ui/FilterGroup";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { DataTable } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import { detailContainerClass } from "@/lib/layout";
import type { Paged } from "@/types/relations";

/**
 * テーブル名は画面の呼び名に直して出す。
 * 内部名のまま並べても、どの画面の記録なのか分からない
 * （対応は CLAUDE.md「UI表示名と内部名の対応」が正本）。
 */
const TABLE_LABELS: Record<string, string> = {
  companies: "事業者情報",
  contacts: "連絡先",
  accounts: "取引先",
  deals: "商談",
  contracts: "契約",
  leads: "リード",
  campaigns: "キャンペーン",
  projects: "プロジェクト",
  talents: "タレント",
  business_cards: "名刺",
};

const OPERATION_LABELS: Record<string, { label: string; tone: "success" | "info" | "error" }> =
  {
    INSERT: { label: "作成", tone: "success" },
    UPDATE: { label: "更新", tone: "info" },
    DELETE: { label: "削除", tone: "error" },
  };

const OPERATION_OPTIONS = [
  { value: "INSERT", label: "作成" },
  { value: "UPDATE", label: "更新" },
  { value: "DELETE", label: "削除" },
];

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(
    d.getDate()
  ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

/** 変更内容は「項目名: 変更前 → 変更後」に開く。生の JSON は読めない */
function describeChange(changed: unknown): string {
  if (!changed || typeof changed !== "object") return "—";

  const entries = Object.entries(changed as Record<string, unknown>);
  if (entries.length === 0) return "—";

  return entries
    .map(([field, value]) => {
      if (value && typeof value === "object" && "old" in value && "new" in value) {
        const v = value as { old: unknown; new: unknown };
        return `${field}: ${format(v.old)} → ${format(v.new)}`;
      }
      return `${field}: ${format(value)}`;
    })
    .join(" / ");
}

function format(v: unknown): string {
  if (v === null || v === undefined || v === "") return "空";
  if (typeof v === "string") return v.length > 40 ? `${v.slice(0, 40)}…` : v;
  return JSON.stringify(v);
}

/**
 * 変更履歴。
 *
 * トリガーが全経路を記録しているので、画面からの操作だけでなく
 * SQL 直接操作や取込による変更もここに出る。
 */
export function ChangeLogsView({
  initialData,
  tables,
}: {
  initialData: Paged<ChangeLogRow> | null;
  tables: string[];
}) {
  const [data, setData] = useState(initialData);
  const [tableName, setTableName] = useState("");
  const [operation, setOperation] = useState("");
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();

  function reload(next: { tableName?: string; operation?: string; page?: number }) {
    const params = {
      tableName: (next.tableName ?? tableName) || undefined,
      operation: (next.operation ?? operation) || undefined,
      page: next.page ?? 1,
      perPage: DEFAULT_PAGE_SIZE,
    };
    setPage(params.page);
    startTransition(async () => {
      const { data: result } = await getChangeLogs(params);
      setData(result);
    });
  }

  const rows = data?.rows ?? [];

  return (
    <div className={detailContainerClass}>
      <Link href="/admin" className="hover:bg-[var(--color-bg-hover)]" style={styles.backLink}>
        <ArrowLeft size={14} />
        各種設定
      </Link>

      <h1 style={styles.title}>ログ</h1>
      <p style={styles.sub}>
        データの変更履歴。画面の操作だけでなく、取込や SQL による変更も記録されます。
        参照できる範囲は権限によります。
      </p>

      <FilterGroup className="mb-4">
        <FilterSelect
          label="対象"
          value={tableName}
          options={tables.map((t) => ({ value: t, label: TABLE_LABELS[t] ?? t }))}
          onChange={(v) => {
            setTableName(v);
            reload({ tableName: v, page: 1 });
          }}
        />
        <FilterSelect
          label="操作"
          value={operation}
          options={OPERATION_OPTIONS}
          onChange={(v) => {
            setOperation(v);
            reload({ operation: v, page: 1 });
          }}
        />
        <FilterClearButton
          onClear={() => {
            setTableName("");
            setOperation("");
            reload({ tableName: "", operation: "", page: 1 });
          }}
        />
        {isPending && <span style={styles.loading}>読み込み中...</span>}
      </FilterGroup>

      {/* 一覧（md 未満はカード） */}
      <DataTable
        items={rows}
        getKey={(log) => log.id}
        emptyMessage="記録がありません"
        fixedLayout
        columns={[
          {
            label: "対象",
            card: "title",
            className: "w-[14%]",
            render: (log) => TABLE_LABELS[log.table_name] ?? log.table_name,
          },
          {
            label: "操作",
            card: "meta",
            className: "w-[8%]",
            render: (log) => {
              const op = OPERATION_LABELS[log.operation] ?? {
                label: log.operation,
                tone: "info" as const,
              };
              return <ToneBadge tone={op.tone}>{op.label}</ToneBadge>;
            },
          },
          {
            label: "変更内容",
            className: "w-[46%]",
            render: (log) => describeChange(log.changed_fields),
          },
          {
            label: "変更者",
            className: "w-[16%]",
            render: (log) => log.changed_by?.full_name ?? "—",
          },
          {
            label: "日時",
            className: "w-[16%]",
            render: (log) => formatDateTime(log.changed_at),
          },
        ]}
      />

      <Pagination
        page={page}
        totalCount={data?.total ?? 0}
        pageSize={DEFAULT_PAGE_SIZE}
        onPageChange={(next) => reload({ page: next })}
      />
    </div>
  );
}

const styles = {
  backLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    color: "var(--color-sumi600)",
    fontSize: "0.875rem",
    textDecoration: "none",
    borderRadius: "var(--radius-sm)",
    padding: "0.125rem 0.375rem",
    margin: "0 0 0.75rem -0.375rem",
  } as CSSProperties,
  title: {
    color: "var(--color-text-title)",
    fontSize: "1.5rem",
    fontWeight: 700,
    margin: "0 0 0.375rem 0",
  } as CSSProperties,
  sub: {
    color: "var(--color-sumi600)",
    fontSize: "0.875rem",
    margin: "0 0 1.25rem 0",
    lineHeight: 1.6,
  } as CSSProperties,
  loading: {
    color: "var(--color-sumi500)",
    fontSize: "0.75rem",
    alignSelf: "flex-end",
    paddingBottom: "0.45rem",
  } as CSSProperties,
  card: {
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
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  } as CSSProperties,
  empty: {
    padding: "2.5rem",
    textAlign: "center" as const,
    color: "var(--color-sumi500)",
  } as CSSProperties,
};
