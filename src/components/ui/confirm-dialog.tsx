"use client";

import { useState, useId, type CSSProperties } from "react";
import { useScrollLock } from "@/hooks/useScrollLock";
import { formActionsClass } from "@/lib/layout";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => Promise<{ error: string | null }> | void;
  onClose: () => void;
};

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "var(--color-overlay)",
    zIndex: 50,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "1rem",
  } as CSSProperties,
  modal: {
    backgroundColor: "#fff",
    borderRadius: "var(--radius-modal)",
    boxShadow: "var(--elevation-overlay)",
    maxWidth: 440,
    width: "100%",
    padding: "1.5rem",
    // 画面の低い端末で、長い確認文が下のボタンごと画面外へ出るのを防ぐ
    maxHeight: "calc(100vh - 2rem)",
    overflowY: "auto",
  } as CSSProperties,
  title: {
    color: "var(--color-text-title)",
    fontSize: "1.125rem",
    fontWeight: 600,
    margin: "0 0 0.75rem 0",
  } as CSSProperties,
  message: {
    color: "var(--color-text-body)",
    fontSize: "0.875rem",
    margin: "0 0 1.5rem 0",
    lineHeight: 1.6,
    // 何が起きるかを行ごとに分けて書けるようにする。
    // 改行を含まないメッセージの見え方は変わらない
    whiteSpace: "pre-line",
  } as CSSProperties,
  btnOutline: {
    backgroundColor: "transparent",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-button)",
    padding: "0.5rem 1.25rem",
    cursor: "pointer",
    fontSize: "0.875rem",
    color: "var(--color-text-body)",
  } as CSSProperties,
  btnDanger: {
    backgroundColor: "var(--color-error)",
    color: "#fff",
    borderRadius: "var(--radius-button)",
    padding: "0.5rem 1.25rem",
    border: "none",
    cursor: "pointer",
    fontSize: "0.875rem",
    fontWeight: 500,
  } as CSSProperties,
  btnPrimary: {
    backgroundColor: "var(--color-terra)",
    color: "#fff",
    borderRadius: "var(--radius-button)",
    padding: "0.5rem 1.25rem",
    border: "none",
    cursor: "pointer",
    fontSize: "0.875rem",
    fontWeight: 500,
  } as CSSProperties,
  error: {
    color: "var(--color-error)",
    fontSize: "0.875rem",
    margin: "0 0 0.75rem 0",
  } as CSSProperties,
};

export function ConfirmDialog(props: ConfirmDialogProps) {
  if (!props.open) return null;
  return <ConfirmDialogInner {...props} />;
}

function ConfirmDialogInner({
  title,
  message,
  confirmLabel = "実行",
  cancelLabel = "キャンセル",
  danger = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 支援技術にモーダルだと伝える（T-0048）。本文も読み上げ対象に含める
  const titleId = useId();
  const messageId = useId();
  // 開いている間は背面を止める（T-0091）
  useScrollLock(true);

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    const result = await onConfirm();
    setLoading(false);
    if (result && result.error) {
      setError(result.error);
      return;
    }
    onClose();
  };

  return (
    <div style={styles.overlay} onClick={loading ? undefined : onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        style={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} style={styles.title}>{title}</h2>
        <p id={messageId} style={styles.message}>{message}</p>
        {error && <p style={styles.error}>{error}</p>}
        <div className={formActionsClass}>
          <button type="button" style={styles.btnOutline} onClick={onClose} disabled={loading}>
            {cancelLabel}
          </button>
          <button
            type="button"
            style={danger ? styles.btnDanger : styles.btnPrimary}
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? "処理中..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
