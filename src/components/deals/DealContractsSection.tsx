"use client";

/**
 * 商談の編集画面に置く契約セクション。
 *
 * **商談フォームの「契約名」を置き換えるもの**（T-0063）。以前は
 * `deals.contract_name` というテキスト列を手入力させていたが、契約の実体は
 * `contracts` にあり二重管理になっていた。ここでは契約レコードそのものを扱う。
 *
 * **契約は商談が保存されるまで作れない**（`contracts.deal_id` が NOT NULL）。
 * そのため新規作成画面には置かず、編集画面にだけ出す。
 *
 * 紐づけは商談本体の「保存」とは別に即時反映される。フォームの外に置いてあるのは
 * そのため（保存ボタンを押さずに反映されることを見た目でも分ける）。
 */

import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Link2, Plus, X } from "lucide-react";
import { linkContractToDeal, listLinkableContracts } from "@/actions/contracts";
import { SearchInput } from "@/components/ui/SearchInput";
import { useToast } from "@/components/ui/toast";
import { tableScrollClass } from "@/lib/layout";
import type { LinkableContract } from "@/types/relations";
import type { CSSProperties } from "react";

/** 編集画面が受け取る、この商談に紐づいている契約 */
export type DealContractRow = {
  id: string;
  contract_code: string;
  contract_name: string | null;
  contract_method: string | null;
  start_date: string | null;
  end_date: string | null;
  deleted_at: string | null;
};

const CONTRACT_METHOD_LABELS: Record<string, string> = {
  paper: "書面",
  electronic: "電子",
  verbal: "口頭",
};

const styles = {
  card: {
    backgroundColor: "#fff",
    borderRadius: "var(--radius-card)",
    boxShadow: "var(--elevation-low)",
    padding: "1.5rem",
    marginBottom: "1.5rem",
  } as CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "1rem",
    flexWrap: "wrap",
    marginBottom: "1rem",
  } as CSSProperties,
  sectionTitle: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    color: "var(--color-text-title)",
    fontSize: "1rem",
    fontWeight: 600,
    margin: 0,
  } as CSSProperties,
  actions: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    flexWrap: "wrap",
  } as CSSProperties,
  actionLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    fontSize: "0.8125rem",
    color: "var(--color-terra)",
    textDecoration: "none",
    padding: "0.25rem 0.5rem",
    margin: "-0.25rem -0.5rem",
    borderRadius: "var(--radius-sm)",
    border: "none",
    backgroundColor: "transparent",
    cursor: "pointer",
    fontFamily: "inherit",
  } as CSSProperties,
  empty: {
    color: "var(--color-sumi400)",
    fontSize: "0.875rem",
    margin: 0,
  } as CSSProperties,
  th: {
    textAlign: "left",
    padding: "0.5rem 0.75rem",
    color: "var(--color-sumi600)",
    fontSize: "0.75rem",
    fontWeight: 600,
    whiteSpace: "nowrap",
  } as CSSProperties,
  td: {
    padding: "0.5rem 0.75rem",
    color: "var(--color-text-body)",
    fontSize: "0.875rem",
    borderTop: "1px solid var(--color-border-default)",
  } as CSSProperties,
  helper: {
    color: "var(--color-sumi500)",
    fontSize: "0.75rem",
    margin: "0.75rem 0 0 0",
  } as CSSProperties,
};

function formatDate(value: string | null): string {
  return value ? value.replaceAll("-", "/") : "—";
}

export function DealContractsSection({
  dealId,
  contracts,
  canManage,
}: {
  dealId: string;
  contracts: DealContractRow[];
  /** contracts の書き込みは manager 以上に限る（RLS と同じ条件） */
  canManage: boolean;
}) {
  const [linking, setLinking] = useState(false);
  const alive = contracts.filter((c) => !c.deleted_at);

  return (
    <div style={styles.card}>
      <div style={styles.headerRow}>
        <h2 style={styles.sectionTitle}>
          <FileText size={16} />
          契約
        </h2>
        {canManage && (
          <div style={styles.actions}>
            <Link
              href={`/contracts/new?deal_id=${dealId}`}
              className="hover:bg-[var(--color-bg-hover)]"
              style={styles.actionLink}
            >
              <Plus size={14} />
              契約を新規作成
            </Link>
            <button
              type="button"
              onClick={() => setLinking(true)}
              className="hover:bg-[var(--color-bg-hover)]"
              style={styles.actionLink}
            >
              <Link2 size={14} />
              既存の契約を紐づける
            </button>
          </div>
        )}
      </div>

      {alive.length === 0 ? (
        <p style={styles.empty}>
          この商談に紐づく契約はまだありません。
        </p>
      ) : (
        <div className={tableScrollClass}>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}
          >
            <thead>
              <tr>
                <th style={styles.th}>契約コード</th>
                <th style={styles.th}>契約書名</th>
                <th style={styles.th}>契約方法</th>
                <th style={styles.th}>期間</th>
              </tr>
            </thead>
            <tbody>
              {alive.map((c) => (
                <tr key={c.id}>
                  <td style={styles.td}>
                    <Link
                      href={`/contracts/${c.id}`}
                      style={{ color: "var(--color-terra)", textDecoration: "none" }}
                    >
                      {c.contract_code}
                    </Link>
                  </td>
                  <td style={styles.td}>{c.contract_name ?? "—"}</td>
                  <td style={styles.td}>
                    {c.contract_method
                      ? (CONTRACT_METHOD_LABELS[c.contract_method] ?? c.contract_method)
                      : "—"}
                  </td>
                  <td style={styles.td}>
                    {formatDate(c.start_date)} ~ {formatDate(c.end_date)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!canManage && (
        <p style={styles.helper}>
          契約の登録・紐づけには manager 以上の権限が必要です。
        </p>
      )}

      {linking && (
        <LinkContractModal dealId={dealId} onClose={() => setLinking(false)} />
      )}
    </div>
  );
}

/**
 * 既存の契約を選んでこの商談へ付け替えるモーダル。
 *
 * **候補は必ず別の商談に属している**（`deal_id` は NOT NULL）。付け替えると
 * 元の商談からは外れるので、移動元を必ず見せてから実行させる。
 */
function LinkContractModal({
  dealId,
  onClose,
}: {
  dealId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const titleId = useId();
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<LinkableContract[]>([]);
  const [saving, setSaving] = useState(false);
  const [isLoading, startTransition] = useTransition();

  const fetchCandidates = useCallback(
    (keyword: string) => {
      startTransition(async () => {
        const { data } = await listLinkableContracts({
          dealId,
          search: keyword || undefined,
        });
        setRows(data ?? []);
      });
    },
    [dealId]
  );

  // 初回は即座に、以降の検索語の変更はデバウンスして引き直す
  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      fetchCandidates("");
      return;
    }
    const timer = setTimeout(() => fetchCandidates(search), 300);
    return () => clearTimeout(timer);
  }, [search, fetchCandidates]);

  const handleLink = async (row: LinkableContract) => {
    setSaving(true);
    const result = await linkContractToDeal({
      contract_id: row.id,
      deal_id: dealId,
      expected_updated_at: row.updated_at,
    });
    setSaving(false);
    if (result.error) {
      showToast({ type: "error", message: result.error });
      return;
    }
    showToast({ type: "success", message: "契約をこの商談に紐づけました" });
    onClose();
    router.refresh();
  };

  const overlayStyle: CSSProperties = {
    position: "fixed",
    inset: 0,
    backgroundColor: "var(--color-overlay)",
    zIndex: 50,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "1rem",
  };

  return (
    <div style={overlayStyle} onClick={saving ? undefined : onClose}>
      {/* 支援技術にモーダルだと伝える（T-0048 と同じ理由。E2E も位置でしか掴めなくなる） */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "#fff",
          borderRadius: "var(--radius-modal)",
          boxShadow: "var(--elevation-overlay)",
          maxWidth: 640,
          width: "100%",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid var(--color-border-default)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
          }}
        >
          <h2
            id={titleId}
            style={{
              color: "var(--color-text-title)",
              fontSize: "1rem",
              fontWeight: 600,
              margin: 0,
            }}
          >
            既存の契約を紐づける
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: "var(--color-sumi600)",
              display: "inline-flex",
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: "1rem 1.5rem", overflowY: "auto" }}>
          <p
            style={{
              color: "var(--color-sumi600)",
              fontSize: "0.75rem",
              margin: "0 0 0.75rem 0",
            }}
          >
            契約は 1 つの商談にだけ属します。<strong>紐づけると、いま属している商談からは外れます。</strong>
          </p>

          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="契約コード・契約書名で絞り込み"
          />

          <div style={{ marginTop: "0.75rem" }}>
            {isLoading ? (
              <p style={styles.empty}>読み込み中...</p>
            ) : rows.length === 0 ? (
              <p style={styles.empty}>
                紐づけられる契約がありません。新しく登録してください。
              </p>
            ) : (
              <table
                style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}
              >
                <thead>
                  <tr>
                    <th style={styles.th}>契約コード</th>
                    <th style={styles.th}>契約書名</th>
                    <th style={styles.th}>いま属している商談</th>
                    <th style={styles.th} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td style={styles.td}>{row.contract_code}</td>
                      <td style={styles.td}>{row.contract_name ?? "—"}</td>
                      <td style={styles.td}>
                        {row.deal ? `${row.deal.deal_code} ${row.deal.name}` : "—"}
                      </td>
                      <td style={{ ...styles.td, textAlign: "right" }}>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => handleLink(row)}
                          style={{
                            ...styles.actionLink,
                            margin: 0,
                            border: "1px solid var(--color-border-default)",
                            borderRadius: "var(--radius-button)",
                          }}
                          className="hover:bg-[var(--color-bg-hover)]"
                        >
                          紐づける
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
