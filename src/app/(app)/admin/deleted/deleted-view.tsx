"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowLeft, RotateCcw } from "lucide-react";
import {
  getDeletedRecords,
  restoreRecord,
  type DeletedEntity,
} from "@/actions/deleted";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

const ENTITY_LABELS: Record<DeletedEntity, string> = {
  companies: "会社情報",
  accounts: "取引先",
  contacts: "連絡先",
  deals: "商談",
  contracts: "契約",
  talents: "タレント",
  leads: "リード",
};

const ENTITIES: DeletedEntity[] = [
  "companies",
  "accounts",
  "contacts",
  "deals",
  "contracts",
  "talents",
  "leads",
];

const PER_PAGE = 20;

const styles = {
  container: { padding: "1.5rem", maxWidth: 1200, margin: "0 auto" } as CSSProperties,
  backLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    color: "var(--color-sumi600)",
    fontSize: "0.875rem",
    textDecoration: "none",
    marginBottom: "0.75rem",
  } as CSSProperties,
  title: {
    color: "var(--color-text-title)",
    fontSize: "1.5rem",
    fontWeight: 700,
    margin: "0 0 0.5rem 0",
  } as CSSProperties,
  description: {
    color: "var(--color-sumi600)",
    fontSize: "0.875rem",
    margin: "0 0 1.5rem 0",
  } as CSSProperties,
  tabs: {
    display: "flex",
    gap: 0,
    overflowX: "auto",
    borderBottom: "1px solid var(--color-border-default)",
    marginBottom: "1.5rem",
  } as CSSProperties,
  card: {
    backgroundColor: "#fff",
    borderRadius: "var(--radius-card)",
    boxShadow: "var(--elevation-low)",
  } as CSSProperties,
  tableHead: {
    backgroundColor: "var(--color-sumi50)",
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "var(--color-sumi700)",
  } as CSSProperties,
  th: { padding: "0.75rem 1rem", textAlign: "left" as const },
  td: {
    padding: "0.75rem 1rem",
    fontSize: "0.875rem",
    color: "var(--color-text-body)",
    borderBottom: "1px solid var(--color-border-default)",
  } as CSSProperties,
  codeCell: {
    fontFamily: "monospace",
    fontSize: "0.75rem",
    color: "var(--color-sumi600)",
  } as CSSProperties,
  restoreBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    backgroundColor: "transparent",
    color: "var(--color-terra)",
    borderRadius: "var(--radius-sm)",
    padding: "0.25rem 0.5rem",
    border: "1px solid var(--color-border-default)",
    cursor: "pointer",
    fontSize: "0.75rem",
    fontWeight: 500,
  } as CSSProperties,
  empty: {
    textAlign: "center" as const,
    padding: "3rem",
    color: "var(--color-sumi600)",
    fontSize: "0.875rem",
  } as CSSProperties,
  pagination: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.75rem 1rem",
    borderTop: "1px solid var(--color-border-default)",
  } as CSSProperties,
};

type RecordItem = Record<string, unknown>;

function formatDate(iso: unknown): string {
  if (!iso || typeof iso !== "string") return "-";
  const d = new Date(iso);
  return `${d.toLocaleDateString("ja-JP")} ${d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`;
}

function displayName(entity: DeletedEntity, r: RecordItem): string {
  switch (entity) {
    case "companies":
      return (r.name as string) ?? "-";
    case "accounts":
      return (r.name as string) ?? "-";
    case "contacts":
      return `${(r.last_name as string) ?? ""} ${(r.first_name as string) ?? ""}`.trim() || "-";
    case "deals":
      return (r.name as string) ?? "-";
    case "contracts":
      return (r.contract_name as string) ?? "-";
    case "talents": {
      const c = r.contact as { last_name?: string; first_name?: string } | null;
      if (!c) return "（連絡先不明）";
      return `${c.last_name ?? ""} ${c.first_name ?? ""}`.trim() || "-";
    }
    case "leads":
      return (r.lead_name as string) ?? "-";
  }
}

function displayCode(entity: DeletedEntity, r: RecordItem): string {
  switch (entity) {
    case "companies":
      return (r.company_code as string) ?? "";
    case "accounts":
      return (r.account_code as string) ?? "";
    case "contacts":
      return (r.contact_code as string) ?? "";
    case "deals":
      return (r.deal_code as string) ?? "";
    case "contracts":
      return (r.contract_code as string) ?? "";
    case "talents":
      return "";
    case "leads": {
      // ステージ名 / オーナー名をコードセルに表示（コード列はなし）
      const stage = r.stage as { name?: string } | null;
      const owner = r.owner as { full_name?: string } | null;
      const parts: string[] = [];
      if (stage?.name) parts.push(stage.name);
      if (owner?.full_name) parts.push(owner.full_name);
      return parts.join(" / ");
    }
  }
}

export function DeletedView({
  userMap,
  initialCounts,
}: {
  userMap: Record<string, string>;
  initialCounts: Record<DeletedEntity, number>;
}) {
  const [active, setActive] = useState<DeletedEntity>("companies");
  const [counts, setCounts] = useState<Record<DeletedEntity, number>>(initialCounts);
  const [items, setItems] = useState<RecordItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<RecordItem | null>(null);
  const { showToast } = useToast();

  const load = useCallback(async (entity: DeletedEntity, p: number) => {
    setLoading(true);
    setError(null);
    const result = await getDeletedRecords(entity, { page: p, perPage: PER_PAGE });
    setLoading(false);
    if (result.error) {
      setError(result.error);
      setItems([]);
      setTotal(0);
      return;
    }
    setItems(result.data?.items ?? []);
    setTotal(result.data?.count ?? 0);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(active, page);
  }, [active, page, load]);

  const handleTabChange = (entity: DeletedEntity) => {
    setActive(entity);
    setPage(1);
  };

  const handleRestore = async () => {
    if (!confirmTarget) return { error: "対象が不明です" };
    const id = confirmTarget.id as string;
    const result = await restoreRecord(active, id);
    if (result.error) return { error: result.error };
    setCounts((c) => ({ ...c, [active]: Math.max(0, c[active] - 1) }));
    await load(active, page);
    showToast({ type: "success", message: "復元しました" });
    return { error: null };
  };

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div style={styles.container}>
      <Link
        href="/admin"
        className="hover:bg-[var(--color-bg-hover)]"
        style={{
          ...styles.backLink,
          padding: "0.125rem 0.375rem",
          margin: "-0.125rem -0.375rem",
          borderRadius: "var(--radius-sm)",
          transition: "background-color 0.15s",
        }}
      >
        <ArrowLeft size={16} />
        マスタ管理
      </Link>
      <h1 style={styles.title}>削除済みレコード</h1>
      <p style={styles.description}>
        削除済みレコードの一覧と復元を行います。復元後は通常の一覧に再び表示されます。
      </p>

      {/* タブ */}
      <div style={styles.tabs}>
        {ENTITIES.map((e) => {
          const isActive = active === e;
          return (
            <button
              key={e}
              onClick={() => handleTabChange(e)}
              style={{
                padding: "0.75rem 1.25rem",
                fontSize: "0.875rem",
                fontWeight: isActive ? 600 : 400,
                color: isActive ? "var(--color-terra)" : "var(--color-sumi600)",
                borderBottomWidth: 2,
                borderBottomStyle: "solid",
                borderBottomColor: isActive ? "var(--color-terra)" : "transparent",
                backgroundColor: "transparent",
                borderLeft: "none",
                borderRight: "none",
                borderTop: "none",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "color 0.15s, border-color 0.15s",
              }}
            >
              {ENTITY_LABELS[e]}
              {counts[e] > 0 && (
                <span
                  style={{
                    marginLeft: "0.375rem",
                    fontSize: "0.7rem",
                    color: isActive ? "var(--color-terra)" : "var(--color-sumi500)",
                  }}
                >
                  ({counts[e]})
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* テーブル */}
      <div style={styles.card}>
        {loading ? (
          <div style={styles.empty}>読み込み中...</div>
        ) : error ? (
          <div style={{ ...styles.empty, color: "var(--color-error)" }}>{error}</div>
        ) : items.length === 0 ? (
          <div style={styles.empty}>削除済みレコードはありません</div>
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={styles.tableHead}>
                    <th style={styles.th}>コード</th>
                    <th style={styles.th}>名前</th>
                    <th style={styles.th}>削除日時</th>
                    <th style={styles.th}>削除者</th>
                    <th style={styles.th}>理由</th>
                    <th style={{ ...styles.th, textAlign: "right" }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => {
                    const deletedBy = r.deleted_by as string | null;
                    const deleterName = deletedBy ? userMap[deletedBy] ?? "（不明）" : "-";
                    const reason = (r.deletion_reason as string | null) ?? "-";
                    return (
                      <tr key={r.id as string}>
                        <td style={{ ...styles.td, ...styles.codeCell }}>
                          {displayCode(active, r) || "-"}
                        </td>
                        <td style={styles.td}>{displayName(active, r)}</td>
                        <td style={{ ...styles.td, fontSize: "0.75rem", color: "var(--color-sumi600)" }}>
                          {formatDate(r.deleted_at)}
                        </td>
                        <td style={{ ...styles.td, fontSize: "0.75rem" }}>{deleterName}</td>
                        <td style={{ ...styles.td, fontSize: "0.75rem" }}>{reason}</td>
                        <td style={{ ...styles.td, textAlign: "right" }}>
                          <button
                            type="button"
                            style={styles.restoreBtn}
                            onClick={() => setConfirmTarget(r)}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.backgroundColor = "var(--color-bg-hover)")
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.backgroundColor = "transparent")
                            }
                          >
                            <RotateCcw size={12} />
                            復元
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ページネーション */}
            <div style={styles.pagination}>
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--color-terra)",
                  fontSize: "0.875rem",
                  cursor: page <= 1 ? "default" : "pointer",
                  opacity: page <= 1 ? 0.4 : 1,
                }}
              >
                前へ
              </button>
              <span style={{ fontSize: "0.75rem", color: "var(--color-sumi600)" }}>
                {page} / {totalPages} ページ
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--color-terra)",
                  fontSize: "0.875rem",
                  cursor: page >= totalPages ? "default" : "pointer",
                  opacity: page >= totalPages ? 0.4 : 1,
                }}
              >
                次へ
              </button>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmTarget !== null}
        title="レコードを復元"
        message={
          confirmTarget
            ? `「${displayName(active, confirmTarget)}」を復元します。通常の一覧に再び表示されます。`
            : ""
        }
        confirmLabel="復元する"
        onConfirm={handleRestore}
        onClose={() => setConfirmTarget(null)}
      />
    </div>
  );
}
