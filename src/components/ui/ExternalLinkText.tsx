import type { CSSProperties } from "react";

/**
 * URL をそのまま出しつつ、押して開けるようにする。
 *
 * 詳細ページの各所で同じ `<a>` を書いていたので 1 つにまとめた。
 * **http(s) でない値はリンクにしない。** 取り込んだデータには
 * `example.co.jp` のようにスキームが無いものや、URL ですらない値が混ざる。
 * スキームが無いだけなら https:// を補って開けるようにし、それでも URL に
 * ならなければただの文字として出す。
 */

const linkStyle: CSSProperties = {
  color: "var(--color-terra)",
  textDecoration: "underline",
  wordBreak: "break-all",
};

const plainStyle: CSSProperties = {
  wordBreak: "break-all",
};

/** 開ける URL に直す。直せなければ null */
export function toHref(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function ExternalLinkText({
  value,
  /** 出す文字。省略すると値そのまま */
  label,
}: {
  value: string | null | undefined;
  label?: string;
}) {
  if (!value) return null;

  const href = toHref(value);
  const text = label ?? value;

  if (!href) return <span style={plainStyle}>{text}</span>;

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={linkStyle}>
      {text}
    </a>
  );
}
