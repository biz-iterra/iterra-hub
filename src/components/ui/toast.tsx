"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "info";

export type ToastInput = {
  type: ToastType;
  message: string;
};

type ToastItem = ToastInput & { id: number };

type ToastContextValue = {
  showToast: (toast: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

// 自動消滅までの時間。error は読む時間が要るので長く取る。
// 以前は error を消さない仕様だったが、画面に残り続けて操作の邪魔になるため
// 2026-08-03 に自動消滅へ変更した。閉じるボタンは残してある
const AUTO_DISMISS_MS: Record<ToastType, number> = {
  success: 4000,
  info: 4000,
  error: 10000,
};
// フェードイン/アウトのトランジション時間（prefers-reduced-motion時は0）
const TRANSITION_MS = 200;
// 消えるときの縮小率。位置ではなく大きさが変わることで
// 「閉じた」ことが視野の端でも分かる
const DISMISS_SCALE = 0.9;

const ICONS: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
};

// 配色は eight-import-view.tsx の alertOk/alertError/alertWarn と同じ方式:
// 背景はトークン値（--color-success #10B981 / --color-error #EF4444 / --color-info #3B82F6）
// 由来の rgba、文字色は WCAG AA（4.5:1 以上）を満たすまで濃くした色を選定
// - success: #047857 は #10B981 系背景に対し約 5.2:1
// - error:   #B91C1C は #EF4444 系背景に対し約 6.4:1（既存 alertError と同一）
// - info:    #1D4ED8 は #3B82F6 系背景に対し約 6.3:1
const TONE_STYLES: Record<ToastType, { background: string; border: string; color: string }> = {
  success: {
    background: "rgba(16, 185, 129, 0.1)",
    border: "1px solid rgba(16, 185, 129, 0.35)",
    color: "#047857",
  },
  error: {
    background: "rgba(239, 68, 68, 0.08)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    color: "#B91C1C",
  },
  info: {
    background: "rgba(59, 130, 246, 0.08)",
    border: "1px solid rgba(59, 130, 246, 0.3)",
    color: "#1D4ED8",
  },
};

/**
 * 共通トースト通知の Context フック。
 *
 * ```tsx
 * import { useToast } from "@/components/ui/toast";
 * const { showToast } = useToast();
 * showToast({ type: "success", message: "保存しました" });
 * ```
 *
 * - success / info: 約4秒で自動消滅（role="status" aria-live="polite"）
 * - error: 約10秒で自動消滅（role="alert" aria-live="assertive"）。
 *   読む時間を確保するため長め。どちらも閉じるボタンで即座に消せる
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast() は ToastProvider の内側でのみ使用できます");
  }
  return ctx;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onStoreChange: () => void) {
  const mql = window.matchMedia(REDUCED_MOTION_QUERY);
  mql.addEventListener("change", onStoreChange);
  return () => mql.removeEventListener("change", onStoreChange);
}

function usePrefersReducedMotion(): boolean {
  // matchMedia は外部ストアなので useSyncExternalStore で購読する。
  // エフェクト内で setState すると初回に必ずカスケードレンダーが起きる。
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false, // SSR 時はアニメーションありを既定にする（window が無いため）
  );
}

function ToastItemView({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: number) => void;
}) {
  const [visible, setVisible] = useState(false);
  const removeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  // マウント時にフェードイン
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const startDismiss = useCallback(() => {
    setVisible(false);
    if (reducedMotion) {
      onDismiss(toast.id);
      return;
    }
    removeTimerRef.current = setTimeout(() => onDismiss(toast.id), TRANSITION_MS);
  }, [onDismiss, toast.id, reducedMotion]);

  // 種別ごとの時間で自動消滅する。error は長め
  useEffect(() => {
    const timer = setTimeout(startDismiss, AUTO_DISMISS_MS[toast.type]);
    return () => clearTimeout(timer);
    // startDismiss は toast.id ごとに安定しているため依存に含めない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.type]);

  useEffect(() => {
    return () => {
      if (removeTimerRef.current) clearTimeout(removeTimerRef.current);
    };
  }, []);

  const tone = TONE_STYLES[toast.type];
  const Icon = ICONS[toast.type];
  const isError = toast.type === "error";

  const style: CSSProperties = {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.625rem",
    minWidth: "20rem",
    maxWidth: "26rem",
    padding: "0.875rem 1rem",
    borderRadius: "var(--radius-md)",
    boxShadow: "var(--elevation-high)",
    backgroundColor: tone.background,
    border: tone.border,
    color: tone.color,
    opacity: visible ? 1 : 0,
    // 入るときは下から、消えるときは縮む。同じ transform で両方を賄うため
    // 初期状態も scale を掛けておく（そうしないと消え際だけ挙動が変わる）
    transform: visible
      ? "translateY(0) scale(1)"
      : `translateY(0.5rem) scale(${DISMISS_SCALE})`,
    transformOrigin: "bottom right",
    transition: reducedMotion ? "none" : `opacity ${TRANSITION_MS}ms ease, transform ${TRANSITION_MS}ms ease`,
  };

  return (
    <div role={isError ? "alert" : "status"} aria-live={isError ? "assertive" : "polite"} style={style}>
      <Icon size={18} style={{ flexShrink: 0, marginTop: "0.0625rem" }} aria-hidden="true" />
      <p style={{ flex: 1, fontSize: "0.875rem", lineHeight: 1.5, margin: 0 }}>{toast.message}</p>
      <button
        type="button"
        onClick={startDismiss}
        aria-label="通知を閉じる"
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "1.25rem",
          height: "1.25rem",
          border: "none",
          background: "none",
          padding: 0,
          color: tone.color,
          cursor: "pointer",
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const showToast = useCallback((toast: ToastInput) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { ...toast, id }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-label="通知"
        style={{
          position: "fixed",
          right: "1.25rem",
          bottom: "1.25rem",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          gap: "0.625rem",
          // --zindex-tooltip (60) と同値。モーダル(40)・オーバーレイ(50)より前面に出す
          zIndex: 60,
          pointerEvents: "none",
        }}
      >
        {toasts.map((toast) => (
          <div key={toast.id} style={{ pointerEvents: "auto" }}>
            <ToastItemView toast={toast} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
