"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Contact, Plus, RefreshCw, Unlink } from "lucide-react";
import {
  disconnectGoogleContacts,
  syncMyGoogleContacts,
} from "@/actions/google-contacts";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { GoogleContactConnectionSummary } from "@/types/relations";

/**
 * Google コンタクト連携の管理。
 *
 * 連携すると CRM の連絡先が Google の「ITERRA CRM」グループへ同期され、
 * スマホの電話帳や Gmail の宛先補完に出るようになる。
 * **触るのはこのグループの中だけ**で、個人の連絡先には手を付けない。
 */

const styles = {
  card: {
    backgroundColor: "#fff",
    borderRadius: "var(--radius-card)",
    boxShadow: "var(--elevation-low)",
    padding: "1.25rem",
    marginTop: "1rem",
  } as CSSProperties,
  title: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "0.9375rem",
    fontWeight: 600,
    color: "var(--color-text-title)",
    margin: "0 0 0.5rem 0",
  } as CSSProperties,
  hint: {
    fontSize: "0.75rem",
    color: "var(--color-sumi500)",
    lineHeight: 1.7,
    margin: "0 0 1rem 0",
  } as CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.75rem",
    flexWrap: "wrap",
    padding: "0.75rem 0",
    borderTop: "1px solid var(--color-border-subtle)",
  } as CSSProperties,
  button: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    backgroundColor: "var(--color-terra)",
    color: "#fff",
    border: "none",
    borderRadius: "var(--radius-button)",
    padding: "0.375rem 0.875rem",
    fontSize: "0.8125rem",
    fontWeight: 500,
    cursor: "pointer",
    textDecoration: "none",
  } as CSSProperties,
  buttonGhost: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    backgroundColor: "#fff",
    color: "var(--color-sumi700)",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-button)",
    padding: "0.375rem 0.875rem",
    fontSize: "0.8125rem",
    fontWeight: 500,
    cursor: "pointer",
  } as CSSProperties,
  meta: {
    fontSize: "0.6875rem",
    color: "var(--color-sumi500)",
  } as CSSProperties,
  warn: {
    display: "flex",
    alignItems: "center",
    gap: "0.375rem",
    fontSize: "0.75rem",
    color: "#B91C1C",
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    borderRadius: "var(--radius-md)",
    padding: "0.5rem 0.75rem",
    marginTop: "0.5rem",
  } as CSSProperties,
} as const;

function formatDateTime(value: string | null): string {
  if (!value) return "未同期";
  const d = new Date(value);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(
    d.getHours()
  ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function GoogleContactsSection({
  connections,
  configured,
  connectedEmail,
  connectError,
}: {
  connections: GoogleContactConnectionSummary[];
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
        message: `${connectedEmail} を連携しました。「同期」で連絡先の登録を開始できます`,
      });
    }
    window.history.replaceState(null, "", "/profile");
  }, [connectedEmail, connectError, showToast]);

  async function handleSync(id: string) {
    setBusyId(id);
    const { data, error } = await syncMyGoogleContacts(id);
    setBusyId(null);

    if (error) {
      showToast({ type: "error", message: error });
      return;
    }
    const parts = [
      data?.created ? `${data.created} 件を登録` : null,
      data?.updated ? `${data.updated} 件を更新` : null,
      data?.deleted ? `${data.deleted} 件を削除` : null,
    ].filter(Boolean);
    // **上限で残った分は次に持ち越す。** 押せば続きから進むことを伝える
    const remainingNote = data?.remaining
      ? `（残り ${data.remaining} 件。もう一度「同期」を押すと続きから進みます）`
      : "";
    showToast({
      type: "success",
      message: parts.length
        ? `${parts.join("・")}しました${remainingNote}`
        : "変更はありませんでした",
    });
    router.refresh();
  }

  return (
    <div style={styles.card}>
      <h2 style={styles.title}>
        <Contact size={18} />
        Google コンタクト連携
      </h2>
      <p style={styles.hint}>
        CRM の連絡先を Google コンタクトの
        <strong>「ITERRA CRM」グループ</strong>へ同期します。
        スマホの電話帳に相手の名前が出て、Gmail の宛先補完にも並びます。
        <strong>このグループの中だけを操作する</strong>ので、
        個人の連絡先には手を付けません。
        社内メモ・診断結果・ステータスは同期しません。
      </p>

      {!configured ? (
        <p style={styles.meta}>
          環境変数が未設定です（GOOGLE_CONTACTS_CLIENT_ID / CLIENT_SECRET /
          TOKEN_ENCRYPTION_KEY）。設定すると接続ボタンが表示されます。
        </p>
      ) : (
        <>
          {connections.map((c) => (
            <div key={c.id} style={styles.row}>
              <div>
                <div style={{ fontSize: "0.8125rem", fontWeight: 500 }}>
                  {c.email_address}
                </div>
                <div style={styles.meta}>
                  最終同期: {formatDateTime(c.last_synced_at)} / 同期中の連絡先{" "}
                  {c.syncedCount} 件
                </div>
                {c.last_error && (
                  <div style={styles.warn}>
                    <AlertTriangle size={14} />
                    {c.last_error}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  style={{
                    ...styles.buttonGhost,
                    ...(busyId === c.id ? { opacity: 0.6, cursor: "not-allowed" } : {}),
                  }}
                  disabled={busyId === c.id}
                  onClick={() => void handleSync(c.id)}
                >
                  <RefreshCw size={14} />
                  {busyId === c.id ? "同期中..." : "同期"}
                </button>
                <button
                  type="button"
                  style={styles.buttonGhost}
                  onClick={() =>
                    setConfirming({ id: c.id, email: c.email_address })
                  }
                >
                  <Unlink size={14} />
                  解除
                </button>
              </div>
            </div>
          ))}

          <div style={{ ...styles.row, borderTop: connections.length ? undefined : "none" }}>
            <span style={styles.meta}>
              会社の Google アカウントで連携してください。
            </span>
            <a href="/api/google-contacts/auth" style={styles.button}>
              <Plus size={14} />
              {connections.length ? "別のアカウントを連携" : "Google と連携する"}
            </a>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirming !== null}
        title="連携を解除します"
        message={
          confirming
            ? `${confirming.email} との同期を止めます。` +
              `Google 側の連絡先は残ります（消したい場合は Google の画面で「ITERRA CRM」グループごと削除してください）。`
            : ""
        }
        confirmLabel="解除する"
        onConfirm={async () => {
          const target = confirming;
          if (!target) return { error: null };
          const res = await disconnectGoogleContacts(target.id);
          if (!res.error) {
            showToast({ type: "success", message: "連携を解除しました" });
            setConfirming(null);
            router.refresh();
          }
          return { error: res.error };
        }}
        onClose={() => setConfirming(null)}
      />
    </div>
  );
}
