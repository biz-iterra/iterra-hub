"use client";

import { useEffect, useState, useTransition, type CSSProperties } from "react";
import { ShieldCheck, RefreshCw } from "lucide-react";
import {
  getHoujinApiStatus,
  verifyCompaniesBatch,
  type BatchVerifyResult,
} from "@/actions/company-verification";
import { useToast } from "@/components/ui/toast";

const styles = {
  card: {
    backgroundColor: "#fff",
    borderRadius: "var(--radius-card)",
    boxShadow: "var(--elevation-low)",
    padding: "1.25rem",
  } as CSSProperties,
  title: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "1rem",
    fontWeight: 600,
    color: "var(--color-text-title)",
    margin: "0 0 0.25rem 0",
  } as CSSProperties,
  hint: {
    fontSize: "0.75rem",
    color: "var(--color-sumi500)",
    margin: "0 0 1rem 0",
    lineHeight: 1.7,
  } as CSSProperties,
  notice: {
    borderRadius: "var(--radius-md)",
    padding: "0.75rem 1rem",
    fontSize: "0.8125rem",
    lineHeight: 1.7,
    marginBottom: "1rem",
    backgroundColor: "rgba(229, 196, 127, 0.18)",
    color: "#8A6D1E",
  } as CSSProperties,
  row: {
    display: "flex",
    alignItems: "flex-end",
    gap: "0.75rem",
    flexWrap: "wrap",
  } as CSSProperties,
  label: {
    display: "block",
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "var(--color-sumi700)",
    marginBottom: "0.25rem",
  } as CSSProperties,
  input: {
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-input)",
    padding: "0.5rem 0.75rem",
    fontSize: "0.875rem",
    width: 120,
    outline: "none",
  } as CSSProperties,
  button: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    backgroundColor: "var(--color-terra)",
    color: "#fff",
    border: "none",
    borderRadius: "var(--radius-button)",
    padding: "0.5rem 1.25rem",
    fontSize: "0.875rem",
    fontWeight: 500,
    cursor: "pointer",
  } as CSSProperties,
  summary: {
    marginTop: "1rem",
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5rem",
  } as CSSProperties,
  chip: (bg: string, fg: string): CSSProperties => ({
    borderRadius: "var(--radius-badge)",
    padding: "0.25rem 0.625rem",
    fontSize: "0.75rem",
    fontWeight: 600,
    backgroundColor: bg,
    color: fg,
  }),
  list: {
    marginTop: "0.75rem",
    fontSize: "0.75rem",
    color: "var(--color-sumi600)",
    lineHeight: 1.8,
    maxHeight: 220,
    overflowY: "auto",
  } as CSSProperties,
};

const OUTCOME_LABELS: Record<string, { label: string; bg: string; fg: string }> = {
  verified: { label: "実在確認済", bg: "rgba(122, 165, 146, 0.16)", fg: "#4D7A65" },
  changed: { label: "変更検知", bg: "rgba(229, 196, 127, 0.28)", fg: "#8A6D1E" },
  not_found: { label: "特定できず", bg: "rgba(229, 196, 127, 0.28)", fg: "#8A6D1E" },
  closed: { label: "閉鎖・解散", bg: "rgba(176, 58, 46, 0.14)", fg: "#B03A2E" },
  error: { label: "エラー", bg: "var(--color-sumi100)", fg: "var(--color-sumi700)" },
};

/**
 * 法人の実在確認をまとめて回すパネル。
 *
 * 未確認・確認が古い法人から順に、国税庁の法人番号 Web-API と照合する。
 * API の利用規約に配慮して 1 件ずつ間隔を空けるため、1 回の実行件数には上限を設ける。
 */
export function CompanyVerificationPanel() {
  const { showToast } = useToast();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [limit, setLimit] = useState("20");
  const [result, setResult] = useState<BatchVerifyResult | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    getHoujinApiStatus().then((r) => setConfigured(r.data?.configured ?? false));
  }, []);

  function handleRun() {
    const n = Number(limit);
    if (!Number.isFinite(n) || n < 1) {
      showToast({ type: "error", message: "件数は 1 以上で指定してください" });
      return;
    }

    startTransition(async () => {
      const { data, error } = await verifyCompaniesBatch(n);
      if (error || !data) {
        showToast({ type: "error", message: error ?? "実在確認に失敗しました" });
        return;
      }
      setResult(data);
      showToast({
        type: "success",
        message: `${data.processed} 件を照合しました`,
      });
    });
  }

  return (
    <div style={styles.card}>
      <h2 style={styles.title}>
        <ShieldCheck size={18} />
        法人の実在確認
      </h2>
      <p style={styles.hint}>
        国税庁の法人番号 Web-API と照合し、商号・所在地の変更や登記の閉鎖を検知します。
        未確認のもの・確認が古いものから順に処理します。
        法人番号が未登録の法人は商号で検索し、1 件に特定できた場合のみ法人番号を取り込みます。
      </p>

      {configured === false && (
        <div style={styles.notice}>
          アプリケーションID が未設定のため実行できません。
          国税庁の法人番号システム Web-API 利用申請（無償）で発行し、
          環境変数 <code>HOUJIN_BANGOU_APP_ID</code> に設定してください。
        </div>
      )}

      <div style={styles.row}>
        <div>
          <label style={styles.label}>1 回の処理件数</label>
          <input
            type="number"
            min={1}
            max={100}
            style={styles.input}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            disabled={isPending || configured === false}
          />
        </div>
        <button
          type="button"
          style={{
            ...styles.button,
            opacity: isPending || configured === false ? 0.6 : 1,
            cursor: isPending || configured === false ? "not-allowed" : "pointer",
          }}
          onClick={handleRun}
          disabled={isPending || configured === false}
        >
          <RefreshCw size={14} />
          {isPending ? "照合中..." : "実在確認を実行"}
        </button>
      </div>

      {result && (
        <>
          <div style={styles.summary}>
            {Object.entries(result.counts)
              .filter(([, count]) => count > 0)
              .map(([key, count]) => {
                const meta = OUTCOME_LABELS[key] ?? {
                  label: key,
                  bg: "var(--color-sumi100)",
                  fg: "var(--color-sumi700)",
                };
                return (
                  <span key={key} style={styles.chip(meta.bg, meta.fg)}>
                    {meta.label} {count}
                  </span>
                );
              })}
          </div>

          <div style={styles.list}>
            {result.results
              .filter((r) => r.outcome !== "verified")
              .map((r) => (
                <div key={r.companyId}>
                  {r.companyName}: {OUTCOME_LABELS[r.outcome]?.label ?? r.outcome}
                  {r.note ? ` — ${r.note}` : ""}
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
