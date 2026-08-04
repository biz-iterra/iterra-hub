import { Landmark } from "lucide-react";
import type { CSSProperties } from "react";

/**
 * freee と紐づいているかを示すアイコン。
 *
 * **カラー = 連携済み / グレー = 未連携。** 一覧で並べたときに
 * 一目で分かるよう、形は変えずに色だけで差を出す。
 *
 * サイドバーの freee 連携と同じ Landmark を使う（画面ごとに別の記号を
 * 当てると、それが freee のことだと分からなくなる）。
 *
 * **admin 以外には出さないこと。** `freee_partners` は RLS で admin しか
 * 読めないため、他ロールでは連携済みでも空で返り、未連携と区別がつかない。
 * 判断は呼び出し側で行う（このコンポーネントはロールを見ない）。
 */

type LinkStatus = "unlinked" | "auto" | "confirmed" | "excluded";

const LABELS: Record<LinkStatus, string> = {
  auto: "freee と連携済み（インボイス番号の一致で自動）",
  confirmed: "freee と連携済み（確定）",
  excluded: "freee の突合対象外",
  unlinked: "freee と未連携",
};

export function FreeeLinkIcon({
  status,
  size = 14,
  style,
}: {
  /** 紐づいていなければ null。`freee_partners` が空のときもこれ */
  status: LinkStatus | null;
  size?: number;
  style?: CSSProperties;
}) {
  // auto / confirmed だけを「連携済み」とする。
  // excluded は「対象外と判断した」状態なので、連携済みとは呼ばない
  const linked = status === "auto" || status === "confirmed";
  const label = LABELS[status ?? "unlinked"];

  return (
    <span
      title={label}
      aria-label={label}
      role="img"
      style={{
        display: "inline-flex",
        alignItems: "center",
        // 未連携は色を落としたうえで薄くする。色覚に頼らず濃淡でも差が出る
        color: linked ? "var(--color-terra)" : "var(--color-sumi300)",
        opacity: linked ? 1 : 0.65,
        ...style,
      }}
    >
      <Landmark size={size} />
    </span>
  );
}
