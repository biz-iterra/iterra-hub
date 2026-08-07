"use client";

/**
 * 商談の編集画面に置く契約セクション。
 *
 * **商談フォームの「契約名」を置き換えるもの**（T-0063）。以前は
 * `deals.contract_name` というテキスト列を手入力させていたが、契約の実体は
 * `contracts` にあり二重管理になっていた。ここでは契約レコードそのものを扱う。
 *
 * **契約は商談が保存されるまで作れない**（新規作成画面には置かない）。
 * 商談の ID が無いと `/contracts/new?deal_id=` を組み立てられないため。
 *
 * **紐づけ・解除は商談本体の「保存」とは別に、その場で反映される。**
 * フォームの中に置いてあるので（T-0066。以前はフォームの外にあり、
 * 削除・保存ボタンと接して見えた）、そのことが分かるよう
 * アクセント罫・「すぐ反映」バッジ・説明文の 3 つで示す。
 * **中のボタンはすべて `type="button"`。** submit すると商談が保存されてしまう。
 */

import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Link2, Plus, Unlink, X } from "lucide-react";
import {
  linkContractToDeal,
  listLinkableContracts,
  unlinkContractFromDeal,
} from "@/actions/contracts";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
  /** 自動生成の契約名。契約コードを必ず含むので空にならない */
  contract_display_name: string | null;
  contract_method: string | null;
  start_date: string | null;
  end_date: string | null;
  amount: number | null;
  /** 紐づけ解除の楽観ロックに使う */
  updated_at: string;
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
    // 入力カードと見た目を変える。ここだけ「保存」と無関係に反映されるため
    borderLeft: "3px solid var(--color-terra)",
    padding: "1.5rem",
    marginBottom: "1.5rem",
  } as CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "1rem",
    flexWrap: "wrap",
    marginBottom: "0.5rem",
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
  instantBadge: {
    display: "inline-flex",
    alignItems: "center",
    marginLeft: "0.5rem",
    padding: "0.0625rem 0.375rem",
    borderRadius: "var(--radius-sm)",
    backgroundColor: "var(--color-terra-50, rgba(200, 90, 40, 0.1))",
    color: "var(--color-terra)",
    fontSize: "0.6875rem",
    fontWeight: 600,
    verticalAlign: "middle",
  } as CSSProperties,
  lead: {
    color: "var(--color-sumi600)",
    fontSize: "0.75rem",
    margin: "0 0 1rem 0",
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
  /** 解除は削除ではない。赤にせず、控えめな枠線ボタンにする */
  unlinkButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    fontSize: "0.75rem",
    color: "var(--color-sumi600)",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-button)",
    backgroundColor: "transparent",
    padding: "0.25rem 0.625rem",
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
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

function methodLabel(value: string | null): string {
  if (!value) return "—";
  return CONTRACT_METHOD_LABELS[value] ?? value;
}

/** 一覧・見出しで使う契約の呼び名。自動生成名を優先する */
function contractLabel(row: {
  contract_display_name: string | null;
  contract_name: string | null;
  contract_code: string;
}): string {
  return row.contract_display_name ?? row.contract_name ?? row.contract_code;
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
  const router = useRouter();
  const { showToast } = useToast();
  const [linking, setLinking] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState<DealContractRow | null>(null);
  const alive = contracts.filter((c) => !c.deleted_at);

  const handleUnlink = async () => {
    if (!unlinkTarget) return { error: null };
    const result = await unlinkContractFromDeal({
      contract_id: unlinkTarget.id,
      deal_id: dealId,
      expected_updated_at: unlinkTarget.updated_at,
    });
    if (result.error) return { error: result.error };
    showToast({ type: "success", message: "契約の紐づけを解除しました" });
    router.refresh();
    return { error: null };
  };

  return (
    <div style={styles.card}>
      <div style={styles.headerRow}>
        <h2 style={styles.sectionTitle}>
          <FileText size={16} />
          契約
          <span style={styles.instantBadge}>すぐ反映</span>
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

      <p style={styles.lead}>
        契約の新規作成・紐づけ・解除は、この画面の「保存」とは別に<strong>すぐ反映されます</strong>。
      </p>

      {alive.length === 0 ? (
        <p style={styles.empty}>この商談に紐づく契約はまだありません。</p>
      ) : (
        <div className={tableScrollClass}>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}
          >
            <thead>
              <tr>
                <th style={styles.th}>契約名</th>
                <th style={styles.th}>契約方法</th>
                <th style={styles.th}>期間</th>
                {canManage && <th style={styles.th} />}
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
                      {contractLabel(c)}
                    </Link>
                  </td>
                  <td style={styles.td}>{methodLabel(c.contract_method)}</td>
                  <td style={styles.td}>
                    {formatDate(c.start_date)} ~ {formatDate(c.end_date)}
                  </td>
                  {canManage && (
                    <td style={{ ...styles.td, textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={() => setUnlinkTarget(c)}
                        className="hover:bg-[var(--color-bg-hover)]"
                        style={styles.unlinkButton}
                      >
                        <Unlink size={12} />
                        紐づけ解除
                      </button>
                    </td>
                  )}
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

      {/* 削除ではないので danger にしない。取り違えると契約そのものを消したと思われる */}
      <ConfirmDialog
        open={unlinkTarget !== null}
        title="契約の紐づけを解除"
        message={
          unlinkTarget
            ? `「${contractLabel(unlinkTarget)}」をこの商談から外します。契約そのものは残り、どの商談にも紐づかない状態になります。あとから同じ商談にも別の商談にも紐づけ直せます。`
            : ""
        }
        confirmLabel="解除する"
        onConfirm={handleUnlink}
        onClose={() => setUnlinkTarget(null)}
      />
    </div>
  );
}

/**
 * どの商談にも紐づいていない契約を選んで、この商談へ紐づけるモーダル。
 *
 * **他の商談に紐づいている契約は候補に出さない**（T-0065）。出すと、
 * 選んだ瞬間にその商談から契約が消える付け替えになってしまう。
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

  const fetchCandidates = useCallback((keyword: string) => {
    startTransition(async () => {
      const { data } = await listLinkableContracts({
        search: keyword || undefined,
      });
      setRows(data ?? []);
    });
  }, []);

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
          maxWidth: 720,
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
            <strong>どの商談にも紐づいていない契約</strong>だけが候補です。
            他の商談に紐づいている契約は、その商談で紐づけを解除してから選んでください。
          </p>

          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="契約コード・契約名で絞り込み"
          />

          <div style={{ marginTop: "0.75rem" }}>
            {isLoading ? (
              <p style={styles.empty}>読み込み中...</p>
            ) : rows.length === 0 ? (
              <p style={styles.empty}>
                紐づけられる契約がありません。新しく登録するか、他の商談で紐づけを解除してください。
              </p>
            ) : (
              <table
                style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}
              >
                <thead>
                  <tr>
                    <th style={styles.th}>契約名</th>
                    <th style={styles.th}>契約方法</th>
                    <th style={styles.th}>締結日</th>
                    <th style={styles.th} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td style={styles.td}>{contractLabel(row)}</td>
                      <td style={styles.td}>{methodLabel(row.contract_method)}</td>
                      <td style={styles.td}>{formatDate(row.execution_date)}</td>
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
                            whiteSpace: "nowrap",
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
