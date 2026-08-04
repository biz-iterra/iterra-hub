"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Link2,
  Link2Off,
  RefreshCw,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { disconnectFreee, runFreeeSyncNow } from "@/actions/freee";
import type { FreeeConnectionStatus } from "@/types/relations";

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
  error: {
    borderRadius: "var(--radius-md)",
    padding: "0.75rem 1rem",
    fontSize: "0.8125rem",
    lineHeight: 1.7,
    marginBottom: "1rem",
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    color: "#B91C1C",
  } as CSSProperties,
  dl: {
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    gap: "0.5rem 1rem",
    fontSize: "0.8125rem",
    margin: "0 0 1rem 0",
  } as CSSProperties,
  dt: { color: "var(--color-sumi500)", fontWeight: 600 } as CSSProperties,
  dd: { margin: 0, color: "var(--color-text-body)" } as CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    flexWrap: "wrap",
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
    padding: "0.5rem 1.25rem",
    fontSize: "0.875rem",
    fontWeight: 500,
    cursor: "pointer",
    textDecoration: "none",
  } as CSSProperties,
  buttonDisabled: { opacity: 0.6, cursor: "not-allowed" } as CSSProperties,
  link: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    color: "var(--color-terra)",
    textDecoration: "none",
    fontSize: "0.8125rem",
    padding: "0.375rem 0.625rem",
    borderRadius: "var(--radius-sm)",
  } as CSSProperties,
} as const;

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(
    d.getDate()
  ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

export function FreeeSettingsView({
  status,
  loadError,
}: {
  status: FreeeConnectionStatus;
  loadError: string | null;
}) {
  const { showToast } = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState<"sync" | "full" | "disconnect" | null>(null);
  // OAuth の戻りは 1 度だけ通知する（再描画で二重に出さない）
  const notified = useRef(false);

  useEffect(() => {
    if (notified.current) return;
    const connected = params.get("freee_connected");
    const error = params.get("freee_error");
    if (!connected && !error) return;

    notified.current = true;
    if (error) {
      showToast({ type: "error", message: error });
    } else if (connected) {
      showToast({ type: "success", message: `freee（${connected}）と接続しました` });
    }
    // クエリを消しておく。再読み込みで同じ通知が出ないようにする
    router.replace("/admin/freee");
  }, [params, router, showToast]);

  const conn = status.connection;

  const runSync = async (full: boolean) => {
    setBusy(full ? "full" : "sync");
    try {
      const res = await runFreeeSyncNow(full);
      if (res.error || !res.data) {
        showToast({ type: "error", message: res.error ?? "同期に失敗しました" });
        return;
      }
      const d = res.data;
      showToast({
        type: "success",
        message:
          `freee から ${d.fetched} 件を取り込みました` +
          `（自動で紐付いた ${d.autoLinked} 件` +
          (d.markedDeleted > 0 ? ` / freee 側で消えていた ${d.markedDeleted} 件` : "") +
          "）",
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const runDisconnect = async () => {
    setBusy("disconnect");
    try {
      const res = await disconnectFreee();
      if (res.error) {
        showToast({ type: "error", message: res.error });
        return;
      }
      showToast({ type: "success", message: "freee との接続を解除しました" });
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <h1
          className="text-xl sm:text-2xl font-bold"
          style={{ color: "var(--color-text-title)", marginBottom: "0.25rem" }}
        >
          freee 会計連携
        </h1>
        <p style={styles.hint}>
          freee の取引先を取り込み、事業者情報・取引先と突き合わせます。
          <strong>freee 側へは自動で書き込みません。</strong>
          差分の画面で項目ごとに確認して確定したものだけを反映します。
        </p>
      </div>

      <div style={styles.card}>
        <h2 style={styles.title}>
          <Link2 size={18} />
          接続
        </h2>

        {loadError && <div style={styles.error}>{loadError}</div>}

        {!status.configured && (
          <div style={styles.notice}>
            freee 連携が未設定です。環境変数（FREEE_CLIENT_ID / FREEE_CLIENT_SECRET /
            FREEE_TOKEN_ENCRYPTION_KEY）を設定してください。
          </div>
        )}

        {conn?.lastError && (
          <div style={styles.error}>
            <strong
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.375rem",
                marginBottom: "0.25rem",
              }}
            >
              <AlertTriangle size={16} />
              前回の同期でエラーが出ています
            </strong>
            {conn.lastError}
          </div>
        )}

        {conn ? (
          <>
            <dl style={styles.dl}>
              <dt style={styles.dt}>事業所</dt>
              <dd style={styles.dd}>
                {conn.freeeCompanyName ?? "—"}（ID: {conn.freeeCompanyId}）
              </dd>
              <dt style={styles.dt}>接続日時</dt>
              <dd style={styles.dd}>{formatDateTime(conn.connectedAt)}</dd>
              <dt style={styles.dt}>最終同期</dt>
              <dd style={styles.dd}>{formatDateTime(conn.lastSyncedAt)}</dd>
              <dt style={styles.dt}>最終の全件同期</dt>
              <dd style={styles.dd}>
                {formatDateTime(conn.lastFullSyncedAt)}
                <span style={{ color: "var(--color-sumi500)", marginLeft: "0.5rem" }}>
                  （freee 側で削除された取引先はこのときだけ検出します）
                </span>
              </dd>
            </dl>

            <div style={styles.row}>
              <button
                type="button"
                style={{ ...styles.button, ...(busy ? styles.buttonDisabled : {}) }}
                onClick={() => void runSync(false)}
                disabled={busy !== null}
              >
                <RefreshCw size={16} />
                {busy === "sync" ? "同期中..." : "今すぐ同期"}
              </button>
              <button
                type="button"
                style={{ ...styles.buttonGhost, ...(busy ? styles.buttonDisabled : {}) }}
                onClick={() => void runSync(true)}
                disabled={busy !== null}
              >
                <RefreshCw size={16} />
                {busy === "full" ? "同期中..." : "全件同期（削除も検出）"}
              </button>
              <button
                type="button"
                style={{ ...styles.buttonGhost, ...(busy ? styles.buttonDisabled : {}) }}
                onClick={() => void runDisconnect()}
                disabled={busy !== null}
              >
                <Link2Off size={16} />
                接続を解除
              </button>
            </div>
          </>
        ) : (
          <div style={styles.row}>
            {status.configured ? (
              <>
                {/* Server Action ではなく OAuth の入口へ遷移する */}
                <a href="/api/freee/auth" style={styles.button}>
                  <Link2 size={16} />
                  freee と接続する
                </a>
                <span style={{ fontSize: "0.75rem", color: "var(--color-sumi500)" }}>
                  freee のログイン画面が開きます。事業所へのアクセスを許可してください。
                </span>
              </>
            ) : (
              <span style={{ fontSize: "0.8125rem", color: "var(--color-sumi500)" }}>
                環境変数を設定すると接続ボタンが表示されます。
              </span>
            )}
          </div>
        )}
      </div>

      <div style={styles.card}>
        <h2 style={styles.title}>
          <CheckCircle2 size={18} />
          取引先の突合
        </h2>
        <p style={styles.hint}>
          インボイス登録番号が一致した取引先は自動で紐付きます。
          それ以外は候補を見ながら、事業者情報への紐付けを人が確定します。
          <strong>
            取引先（Account）は自動作成しません
          </strong>
          — 契約が成立したときにだけ作られる仕組みを守るためです。
        </p>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Link href="/admin/freee/partners" style={styles.link}>
            突合画面を開く
            <ArrowUpRight size={14} />
          </Link>
          <Link href="/admin/freee/sync" style={styles.link}>
            差分を確認して反映する
            <ArrowUpRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}
