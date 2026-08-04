"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type CSSProperties } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, RefreshCw } from "lucide-react";
import { pullFieldsFromFreee, pushFieldsToFreee } from "@/actions/freee";
import { useToast } from "@/components/ui/toast";
import type { FreeePartnerDiff } from "@/types/relations";

/**
 * 差分の確認と反映。
 *
 * 既定はすべて「CRM → freee」（CRM が正）。会計側の修正を採りたい項目だけ
 * 「freee → CRM」に切り替える。**触らない**も選べる。
 * 反映は方向ごとにまとめて実行する（1 相手ずつ）。
 */

type Direction = "to_freee" | "to_crm" | "skip";

const styles = {
  card: {
    backgroundColor: "#fff",
    borderRadius: "var(--radius-card)",
    boxShadow: "var(--elevation-low)",
    padding: "1.25rem",
    marginBottom: "1rem",
  } as CSSProperties,
  head: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.75rem",
    flexWrap: "wrap",
    marginBottom: "0.75rem",
  } as CSSProperties,
  title: {
    fontSize: "0.9375rem",
    fontWeight: 600,
    color: "var(--color-text-title)",
    margin: 0,
  } as CSSProperties,
  table: { width: "100%", borderCollapse: "collapse" } as CSSProperties,
  th: {
    textAlign: "left",
    fontSize: "0.6875rem",
    fontWeight: 600,
    color: "var(--color-sumi500)",
    padding: "0.375rem 0.5rem",
    borderBottom: "1px solid var(--color-border-default)",
  } as CSSProperties,
  td: {
    fontSize: "0.8125rem",
    color: "var(--color-text-body)",
    padding: "0.5rem",
    borderBottom: "1px solid var(--color-border-subtle)",
    verticalAlign: "top",
  } as CSSProperties,
  radioRow: {
    display: "flex",
    gap: "0.625rem",
    flexWrap: "wrap",
    fontSize: "0.75rem",
  } as CSSProperties,
  button: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    backgroundColor: "var(--color-terra)",
    color: "#fff",
    border: "none",
    borderRadius: "var(--radius-button)",
    padding: "0.375rem 1rem",
    fontSize: "0.8125rem",
    fontWeight: 500,
    cursor: "pointer",
  } as CSSProperties,
  empty: {
    padding: "2rem",
    textAlign: "center",
    color: "var(--color-sumi500)",
    fontSize: "0.875rem",
  } as CSSProperties,
  warn: {
    display: "flex",
    alignItems: "center",
    gap: "0.375rem",
    fontSize: "0.75rem",
    color: "#8A6D1E",
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    border: "1px solid rgba(245, 158, 11, 0.35)",
    borderRadius: "var(--radius-md)",
    padding: "0.5rem 0.75rem",
    marginBottom: "1rem",
  } as CSSProperties,
} as const;

function valueText(v: string | null): string {
  return v === null || v === "" ? "（未入力）" : v;
}

export function FreeeSyncView({
  diffs,
  loadError,
}: {
  diffs: FreeePartnerDiff[];
  loadError: string | null;
}) {
  const { showToast } = useToast();
  const router = useRouter();

  // partnerId → field → 方向。既定は CRM を正とする
  const [choices, setChoices] = useState<Record<string, Record<string, Direction>>>(
    () =>
      Object.fromEntries(
        diffs.map((d) => [
          d.partnerId,
          Object.fromEntries(d.fields.map((f) => [f.field, "to_freee" as Direction])),
        ])
      )
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  const setChoice = (partnerId: string, field: string, dir: Direction) =>
    setChoices((c) => ({
      ...c,
      [partnerId]: { ...(c[partnerId] ?? {}), [field]: dir },
    }));

  const apply = async (d: FreeePartnerDiff) => {
    const picked = choices[d.partnerId] ?? {};
    const toFreee = d.fields.filter((f) => picked[f.field] === "to_freee").map((f) => f.field);
    const toCrm = d.fields.filter((f) => picked[f.field] === "to_crm").map((f) => f.field);

    if (toFreee.length === 0 && toCrm.length === 0) {
      showToast({ type: "error", message: "反映する項目を選んでください" });
      return;
    }

    setBusyId(d.partnerId);
    try {
      // 先に CRM への取り込みを済ませてから freee へ送る。
      // 逆にすると、freee へ送った直後に CRM 側を書き換えることになり
      // どちらが最新か分からなくなる
      if (toCrm.length > 0) {
        const res = await pullFieldsFromFreee({ partnerId: d.partnerId, fields: toCrm });
        if (res.error) {
          showToast({ type: "error", message: res.error });
          return;
        }
      }
      if (toFreee.length > 0) {
        const res = await pushFieldsToFreee({ partnerId: d.partnerId, fields: toFreee });
        if (res.error) {
          showToast({ type: "error", message: res.error });
          return;
        }
      }
      showToast({
        type: "success",
        message: `${d.companyName} の差分を反映しました`,
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <Link
          href="/admin/freee"
          className="hover:bg-[var(--color-bg-hover)]"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
            color: "var(--color-terra)",
            textDecoration: "none",
            padding: "0.375rem 0.625rem",
            borderRadius: "var(--radius-sm)",
            fontSize: "0.8125rem",
          }}
        >
          <ArrowLeft size={14} />
          freee 連携
        </Link>
        <h1
          className="text-xl sm:text-2xl font-bold"
          style={{ color: "var(--color-text-title)" }}
        >
          差分の確認と反映
        </h1>
      </div>

      <div style={styles.warn}>
        <AlertTriangle size={16} />
        <span>
          <strong>freee は会計のデータです。</strong>
          「CRM → freee」を選んだ項目は freee 側が書き換わります。
          既定は CRM を正としていますが、会計側で直した内容を残したい項目は
          「freee → CRM」か「触らない」に切り替えてください。
        </span>
      </div>

      {loadError && (
        <div style={{ ...styles.warn, color: "#B91C1C" }}>
          <AlertTriangle size={16} />
          {loadError}
        </div>
      )}

      {diffs.length === 0 ? (
        <div style={{ ...styles.card, ...styles.empty }}>
          差分はありません。
          <br />
          <span style={{ fontSize: "0.75rem" }}>
            freee 側の最新を取り込んでから比較しています。取り込みは
            「freee 連携」の同期ボタン、または定期同期で行われます。
          </span>
        </div>
      ) : (
        diffs.map((d) => (
          <div key={d.partnerId} style={styles.card}>
            <div style={styles.head}>
              <div>
                <h2 style={styles.title}>{d.companyName}</h2>
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--color-sumi500)",
                    margin: "0.125rem 0 0 0",
                  }}
                >
                  freee 側の名称: {d.partnerName}
                </p>
              </div>
              <button
                type="button"
                style={{
                  ...styles.button,
                  ...(busyId === d.partnerId
                    ? { opacity: 0.6, cursor: "not-allowed" }
                    : {}),
                }}
                disabled={busyId === d.partnerId}
                onClick={() => void apply(d)}
              >
                {busyId === d.partnerId ? (
                  <>
                    <RefreshCw size={14} />
                    反映中...
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    この相手の差分を反映
                  </>
                )}
              </button>
            </div>

            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>項目</th>
                  <th style={styles.th}>CRM の値</th>
                  <th style={styles.th}>freee の値</th>
                  <th style={styles.th}>どちらを採るか</th>
                </tr>
              </thead>
              <tbody>
                {d.fields.map((f) => {
                  const picked = choices[d.partnerId]?.[f.field] ?? "to_freee";
                  return (
                    <tr key={f.field}>
                      <td style={styles.td}>{f.label}</td>
                      <td style={styles.td}>{valueText(f.crm)}</td>
                      <td style={styles.td}>{valueText(f.freee)}</td>
                      <td style={styles.td}>
                        <div style={styles.radioRow}>
                          <label style={{ display: "inline-flex", gap: "0.25rem", alignItems: "center", cursor: "pointer" }}>
                            <input
                              type="radio"
                              name={`${d.partnerId}-${f.field}`}
                              checked={picked === "to_freee"}
                              onChange={() => setChoice(d.partnerId, f.field, "to_freee")}
                            />
                            CRM <ArrowRight size={11} /> freee
                          </label>
                          <label style={{ display: "inline-flex", gap: "0.25rem", alignItems: "center", cursor: "pointer" }}>
                            <input
                              type="radio"
                              name={`${d.partnerId}-${f.field}`}
                              checked={picked === "to_crm"}
                              onChange={() => setChoice(d.partnerId, f.field, "to_crm")}
                            />
                            freee <ArrowRight size={11} /> CRM
                          </label>
                          <label style={{ display: "inline-flex", gap: "0.25rem", alignItems: "center", cursor: "pointer" }}>
                            <input
                              type="radio"
                              name={`${d.partnerId}-${f.field}`}
                              checked={picked === "skip"}
                              onChange={() => setChoice(d.partnerId, f.field, "skip")}
                            />
                            触らない
                          </label>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
}
