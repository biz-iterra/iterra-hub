"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Mail, RefreshCw, Unlink, Plus, AlertTriangle } from "lucide-react";
import { disconnectGmail, syncMyGmailConnection } from "@/actions/email-sync";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { GmailConnectionSummary } from "@/types/relations";

/**
 * Gmail 連携の管理。
 *
 * 連携すると、そのアカウントの送受信が連絡先のアクティビティとして並ぶ。
 * 取得するのは件名・相手・日時だけで、本文と添付は CRM に保存しない。
 */
export function GmailConnectionsSection({
  connections,
  configured,
  connectedEmail,
  connectError,
}: {
  connections: GmailConnectionSummary[];
  configured: boolean;
  /** コールバックから戻ったときの結果。トーストで知らせる */
  connectedEmail?: string;
  connectError?: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ id: string; email: string } | null>(
    null
  );

  // 連携の結果は API ルートからのリダイレクトで返るため、
  // クエリを読んでトーストに変換する。URL からは消して再表示を防ぐ
  const notified = useRef(false);
  useEffect(() => {
    if (notified.current) return;
    if (!connectedEmail && !connectError) return;
    notified.current = true;

    if (connectError) {
      showToast({ type: "error", message: connectError });
    } else if (connectedEmail) {
      showToast({
        type: "success",
        message: `${connectedEmail} を連携しました。「同期」で取り込みを開始できます`,
      });
    }
    window.history.replaceState(null, "", "/profile");
  }, [connectedEmail, connectError, showToast]);

  async function handleSync(id: string) {
    setBusyId(id);
    const { data, error } = await syncMyGmailConnection(id);
    setBusyId(null);

    if (error) {
      showToast({ type: "error", message: error });
      return;
    }
    const recorded = data?.recorded ?? 0;
    showToast({
      type: "success",
      message:
        recorded === 0
          ? "新しいやり取りはありませんでした"
          : `${recorded} 件のやり取りを取り込みました`,
    });
    router.refresh();
  }

  async function handleDisconnect() {
    if (!confirming) return { error: null };

    const { error } = await disconnectGmail(confirming.id);
    if (error) {
      showToast({ type: "error", message: error });
      return { error };
    }

    setConfirming(null);
    showToast({ type: "success", message: "連携を解除しました" });
    router.refresh();
    return { error: null };
  }

  return (
    <div style={styles.card}>
      <h2 style={styles.sectionTitle}>
        <Mail size={16} />
        Gmail 連携
      </h2>

      <p style={styles.description}>
        連携すると、そのアカウントの送受信が連絡先のアクティビティとして並びます。
        取り込むのは件名・相手・日時だけで、本文と添付は保存しません（中身は Gmail で開きます）。
      </p>

      {!configured ? (
        <p style={styles.notice}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            Gmail 連携が未設定です。環境変数（GOOGLE_OAUTH_CLIENT_ID /
            GOOGLE_OAUTH_CLIENT_SECRET / GMAIL_TOKEN_ENCRYPTION_KEY）を設定してください。
          </span>
        </p>
      ) : (
        <>
          {connections.length === 0 ? (
            <p style={styles.empty}>連携しているアカウントはありません</p>
          ) : (
            <div style={styles.list}>
              {connections.map((c) => (
                <div key={c.id} style={styles.row}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={styles.email}>{c.email_address}</div>
                    <div style={styles.meta}>
                      {c.last_synced_at
                        ? `最終同期 ${formatDateTime(c.last_synced_at)}`
                        : "未同期"}
                    </div>
                    {c.last_error && (
                      <div style={styles.error}>
                        <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                        {c.last_error}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                    <button
                      style={styles.btnGhost}
                      onClick={() => handleSync(c.id)}
                      disabled={busyId === c.id}
                    >
                      <RefreshCw size={13} />
                      {busyId === c.id ? "同期中..." : "同期"}
                    </button>
                    <button
                      style={styles.btnGhost}
                      onClick={() =>
                        setConfirming({ id: c.id, email: c.email_address })
                      }
                      disabled={busyId === c.id}
                    >
                      <Unlink size={13} />
                      解除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Server Action ではなく通常の遷移。Google の認可画面へ出るため */}
          <a href="/api/gmail/auth" style={styles.btnPrimary}>
            <Plus size={14} />
            アカウントを連携
          </a>
        </>
      )}

      <ConfirmDialog
        open={confirming !== null}
        title="連携を解除しますか"
        message={`${confirming?.email ?? ""} の連携を解除します。取り込み済みのやり取りは履歴として残ります。`}
        confirmLabel="解除する"
        danger
        onConfirm={handleDisconnect}
        onClose={() => setConfirming(null)}
      />
    </div>
  );
}

function formatDateTime(value: string): string {
  const d = new Date(value);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(
    d.getDate()
  ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

const styles = {
  card: {
    backgroundColor: "#fff",
    borderRadius: "var(--radius-card)",
    boxShadow: "var(--elevation-low)",
    padding: "1.5rem",
    marginBottom: "1.5rem",
  } as CSSProperties,
  sectionTitle: {
    color: "var(--color-text-title)",
    fontSize: "1rem",
    fontWeight: 600,
    margin: "0 0 0.75rem 0",
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  } as CSSProperties,
  description: {
    color: "var(--color-sumi500)",
    fontSize: "0.8125rem",
    lineHeight: 1.7,
    margin: "0 0 1rem 0",
  } as CSSProperties,
  notice: {
    display: "flex",
    gap: "0.5rem",
    color: "var(--color-sumi600)",
    fontSize: "0.8125rem",
    lineHeight: 1.7,
    backgroundColor: "var(--color-sumi50)",
    borderRadius: "var(--radius-sm)",
    padding: "0.75rem",
    margin: 0,
  } as CSSProperties,
  empty: {
    color: "var(--color-sumi500)",
    fontSize: "0.875rem",
    margin: "0 0 1rem 0",
  } as CSSProperties,
  list: {
    display: "flex",
    flexDirection: "column",
    marginBottom: "1rem",
  } as CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: "1rem",
    padding: "0.75rem 0",
    borderBottom: "1px solid var(--color-border-default)",
  } as CSSProperties,
  email: {
    color: "var(--color-text-body)",
    fontSize: "0.875rem",
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } as CSSProperties,
  meta: {
    color: "var(--color-sumi500)",
    fontSize: "0.75rem",
    marginTop: "0.125rem",
  } as CSSProperties,
  error: {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.25rem",
    color: "var(--color-error)",
    fontSize: "0.75rem",
    marginTop: "0.25rem",
    lineHeight: 1.5,
  } as CSSProperties,
  btnGhost: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    padding: "0.375rem 0.75rem",
    fontSize: "0.8125rem",
    color: "var(--color-terra)",
    backgroundColor: "transparent",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-button)",
    cursor: "pointer",
  } as CSSProperties,
  btnPrimary: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    padding: "0.5rem 1rem",
    fontSize: "0.875rem",
    fontWeight: 500,
    color: "#fff",
    backgroundColor: "var(--color-terra)",
    borderRadius: "var(--radius-button)",
    textDecoration: "none",
  } as CSSProperties,
};
