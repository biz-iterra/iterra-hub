"use client";

import { useState, type CSSProperties } from "react";

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
  footer: {
    display: "flex",
    gap: "0.75rem",
    justifyContent: "flex-end",
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
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.title}>{title}</h2>
        <p style={styles.message}>{message}</p>
        {error && <p style={styles.error}>{error}</p>}
        <div style={styles.footer}>
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
