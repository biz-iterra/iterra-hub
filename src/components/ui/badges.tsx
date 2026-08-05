/**
 * ITERRA CRM — 共通バッジコンポーネント
 *
 * 品目ごとに見た目を統一するバッジ群。
 * すべて var(--radius-badge) / var(--color-*) トークンを使用し、ハードコード直値は持たない。
 *
 * 使い方:
 *   import { TemperatureBadge, StageBadge, StatusBadge, CategoryBadge,
 *            CampaignTypeBadge, CampaignStatusBadge, ContractMethodBadge,
 *            ProjectStatusBadge, ActivityTypeBadge } from "@/components/ui/badges";
 */

import React from "react";

// ──────────────────────────────────────────────────────────────────────────────
// 共通ベーススタイル
// ──────────────────────────────────────────────────────────────────────────────
const BASE: React.CSSProperties = {
  borderRadius: "var(--radius-badge)",
  padding: "0.125rem 0.5rem",
  fontSize: "0.75rem",
  fontWeight: 500,
  whiteSpace: "nowrap",
  display: "inline-block",
};

/** 値が空のとき表示するダッシュ */
function EmptyDash() {
  return <span style={{ color: "var(--color-sumi400)" }}>—</span>;
}

// ──────────────────────────────────────────────────────────────────────────────
// パイプラインバッジ: ソリッド塗り（terra）+ 白文字 + 広めの letter-spacing
// 「種別」を強く識別するマーカー
// ──────────────────────────────────────────────────────────────────────────────
export function PipelineBadge({ name }: { name: string | null | undefined }) {
  if (!name) return <EmptyDash />;
  return (
    <span
      style={{
        ...BASE,
        backgroundColor: "var(--color-terra)",
        color: "#fff",
        fontWeight: 600,
        letterSpacing: "0.04em",
        padding: "0.125rem 0.625rem",
      }}
    >
      {name}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 段階カラーパレット（開始 → 初期進行 → 中期 → 後期 → 完了）
// Stage/Status は sortOrder と total から位置を算出してこの 5 色を割り当てる
// ──────────────────────────────────────────────────────────────────────────────
// 各段階: bg/fg はソフト塗り用、accent はドット等のアクセント用、
// solidBg/solidFg はソリッド塗り用（白文字可読性を確保した色を選定）
const PROGRESSION_PALETTE: Array<{
  bg: string;
  fg: string;
  accent: string;
  solidBg: string;
  solidFg: string;
}> = [
  { bg: "rgba(59, 130, 246, 0.12)",  fg: "#1E40AF", accent: "#3B82F6", solidBg: "#2563EB", solidFg: "#fff" }, // 0: 開始（info blue）
  { bg: "rgba(20, 184, 166, 0.14)",  fg: "#0F766E", accent: "#14B8A6", solidBg: "#0F766E", solidFg: "#fff" }, // 1: 初期進行（teal）
  { bg: "rgba(229, 196, 127, 0.3)",  fg: "#8A6D1E", accent: "#E5C47F", solidBg: "#B88A2E", solidFg: "#fff" }, // 2: 中期（amber: 白文字可読性のため濃色）
  { bg: "rgba(215, 119, 93, 0.18)",  fg: "#A34E35", accent: "#D7775D", solidBg: "#B85A3F", solidFg: "#fff" }, // 3: 後期（soleil: 白文字可読性のため濃色）
  { bg: "rgba(122, 165, 146, 0.14)", fg: "#4D7A65", accent: "#7AA592", solidBg: "#4D7A65", solidFg: "#fff" }, // 4: 完了/最終（sage）
];

/** sortOrder / total から 0-4 のパレットインデックスを算出 */
function progressionIndex(
  sortOrder: number | null | undefined,
  total: number | null | undefined
): number | null {
  if (sortOrder == null) return null;
  if (total != null && total > 1) {
    const ratio = Math.max(0, Math.min(1, sortOrder / (total - 1)));
    return Math.round(ratio * (PROGRESSION_PALETTE.length - 1));
  }
  // total 未指定時は sortOrder を直接バケットに（4 でクランプ）
  return Math.min(Math.max(sortOrder, 0), PROGRESSION_PALETTE.length - 1);
}

/** 識別子から安定したパレットインデックスを算出（sortOrder 未使用のマスタ向けフォールバック） */
function hashPaletteIndex(seed: string | null | undefined): number {
  if (!seed) return 0;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % PROGRESSION_PALETTE.length;
}

// ──────────────────────────────────────────────────────────────────────────────
// ステージバッジ: ピル型（完全丸）ソリッド塗り + 白文字 + bold
// 他のバッジ（角丸小・ソフト塗り・アウトライン・ドット）と形状レベルで差別化。
// 色付きボーダー・アクセントバー・下線等は禁止方針のため使用しない。
// ──────────────────────────────────────────────────────────────────────────────
export function StageBadge({
  name,
  color,
  sortOrder,
  total,
  seed,
}: {
  name: string | null | undefined;
  /** マスタに設定された色（#RRGGBB）。指定があれば最優先で使う */
  color?: string | null;
  sortOrder?: number | null;
  total?: number | null;
  /** sortOrder が無い場合に色を安定化するためのキー（id 等） */
  seed?: string | null;
}) {
  if (!name) return <EmptyDash />;
  const idx = progressionIndex(sortOrder, total) ?? hashPaletteIndex(seed ?? name);
  const palette = PROGRESSION_PALETTE[idx];
  return (
    <span
      style={{
        display: "inline-block",
        backgroundColor: color ?? palette.solidBg,
        color: color ? "#fff" : palette.solidFg,
        borderRadius: "var(--radius-full)",
        padding: "0.125rem 0.75rem",
        fontSize: "0.75rem",
        fontWeight: 600,
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
      }}
    >
      {name}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// ステータスバッジ: カラードット + テキスト（背景なし）
// sortOrder + total から進行段階に応じたドット色を割り当てる
// ──────────────────────────────────────────────────────────────────────────────
export function StatusBadge({
  name,
  color,
  sortOrder,
  total,
  seed,
}: {
  name: string | null | undefined;
  /** マスタに設定された色（#RRGGBB）。指定があれば最優先で使う */
  color?: string | null;
  sortOrder?: number | null;
  total?: number | null;
  /** sortOrder が無い場合に色を安定化するためのキー（id 等） */
  seed?: string | null;
}) {
  if (!name) return <EmptyDash />;
  const idx = progressionIndex(sortOrder, total) ?? hashPaletteIndex(seed ?? name);
  const palette = PROGRESSION_PALETTE[idx];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.375rem",
        fontSize: "0.75rem",
        fontWeight: 500,
        color: color ?? palette.fg,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "var(--radius-full)",
          backgroundColor: color ?? palette.accent,
          flexShrink: 0,
        }}
      />
      {name}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// カテゴリバッジ: 1px アウトライン + 透明背景（マスタ color 使用）
// 任意タグ感・二次的分類
// ──────────────────────────────────────────────────────────────────────────────
export function CategoryBadge({
  name,
  color,
}: {
  name: string | null | undefined;
  color: string | null | undefined;
}) {
  if (!name) return <EmptyDash />;
  const borderColor = color ?? "var(--color-border-strong)";
  const textColor = color ?? "var(--color-sumi700)";
  return (
    <span
      style={{
        display: "inline-block",
        borderRadius: "var(--radius-badge)",
        border: `1px solid ${borderColor}`,
        backgroundColor: "transparent",
        color: textColor,
        padding: "0 0.4375rem",
        fontSize: "0.75rem",
        fontWeight: 500,
        whiteSpace: "nowrap",
        lineHeight: 1.5,
      }}
    >
      {name}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 温度感バッジ: 絵文字アイコン + ソフト塗り + bold
// 3値の温度メーター的表現
// ──────────────────────────────────────────────────────────────────────────────
const TEMPERATURE_COLORS: Record<string, React.CSSProperties> = {
  hot:  { backgroundColor: "rgba(215, 119, 93, 0.18)",  color: "#A34E35" },
  warm: { backgroundColor: "rgba(229, 196, 127, 0.3)",  color: "#8A6D1E" },
  cold: { backgroundColor: "rgba(59, 130, 246, 0.14)",  color: "#1E40AF" },
};

const TEMPERATURE_ICONS: Record<string, string> = {
  hot:  "🔥",
  warm: "☀",
  cold: "❄",
};

export function TemperatureBadge({
  code,
  name,
  color,
}: {
  /** 既存の温度感（hot / warm など）のアイコン選択に使う。自動採番の値では null */
  code: string | null | undefined;
  name: string;
  /**
   * マスタの色。**これがあれば最優先で使う。**
   * 「バッジ色はマスタの color を使い、画面ごとに算出しない」という規約
   * （CLAUDE.md）。コードから色を引く仕組みは、コードが自動採番になった
   * 時点で新しい行に色が付かなくなるため残せない
   */
  color?: string | null;
}) {
  const colorStyle = color
    ? { backgroundColor: `${color}1A`, color }
    : (code ? TEMPERATURE_COLORS[code] : undefined) ?? {
        backgroundColor: "var(--color-sumi100)",
        color: "var(--color-sumi700)",
      };
  const icon = code ? TEMPERATURE_ICONS[code] : undefined;
  return (
    <span
      style={{
        ...BASE,
        ...colorStyle,
        fontWeight: 600,
        display: "inline-flex",
        alignItems: "center",
        gap: "0.25rem",
      }}
    >
      {icon && <span aria-hidden>{icon}</span>}
      {name}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// アクティビティ種別バッジ (マスタ color を使用、CategoryBadge と同ルール)
// ──────────────────────────────────────────────────────────────────────────────
export function ActivityTypeBadge({
  name,
  color,
}: {
  name: string | null | undefined;
  color: string | null | undefined;
}) {
  if (!name) return <EmptyDash />;
  return (
    <span
      style={{
        ...BASE,
        backgroundColor: color ? `${color}26` : "var(--color-sumi100)",
        color: color ?? "var(--color-sumi700)",
      }}
    >
      {name}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// キャンペーン種別バッジ (generation / nurturing / qualification)
// ──────────────────────────────────────────────────────────────────────────────
const CAMPAIGN_TYPE_COLORS: Record<string, React.CSSProperties> = {
  generation:    { backgroundColor: "rgba(215, 119, 93, 0.15)",  color: "#A34E35" },
  nurturing:     { backgroundColor: "rgba(122, 165, 146, 0.15)", color: "#4D7A65" },
  qualification: { backgroundColor: "rgba(229, 196, 127, 0.25)", color: "#8A6D1E" },
};

const CAMPAIGN_TYPE_LABELS: Record<string, string> = {
  generation:    "獲得",
  nurturing:     "育成",
  qualification: "選定",
};

export function CampaignTypeBadge({ type }: { type: string | null | undefined }) {
  if (!type) return <EmptyDash />;
  const colorStyle =
    CAMPAIGN_TYPE_COLORS[type] ?? {
      backgroundColor: "var(--color-sumi100)",
      color: "var(--color-sumi700)",
    };
  return (
    <span style={{ ...BASE, ...colorStyle }}>
      {CAMPAIGN_TYPE_LABELS[type] ?? type}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// キャンペーンステータスバッジ (draft / active / paused / completed / cancelled)
// ──────────────────────────────────────────────────────────────────────────────
const CAMPAIGN_STATUS_COLORS: Record<string, React.CSSProperties> = {
  draft:     { backgroundColor: "var(--color-sumi100)",     color: "var(--color-sumi600)" },
  active:    { backgroundColor: "rgba(16, 185, 129, 0.12)", color: "#047857" },
  paused:    { backgroundColor: "rgba(245, 158, 11, 0.14)", color: "#B45309" },
  completed: { backgroundColor: "rgba(59, 130, 246, 0.12)", color: "#1E40AF" },
  cancelled: { backgroundColor: "rgba(239, 68, 68, 0.12)",  color: "#B91C1C" },
};

const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  draft:     "下書き",
  active:    "実施中",
  paused:    "一時停止",
  completed: "完了",
  cancelled: "中止",
};

export function CampaignStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <EmptyDash />;
  const colorStyle =
    CAMPAIGN_STATUS_COLORS[status] ?? {
      backgroundColor: "var(--color-sumi100)",
      color: "var(--color-sumi700)",
    };
  return (
    <span style={{ ...BASE, ...colorStyle }}>
      {CAMPAIGN_STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 契約方法バッジ (paper / electronic / verbal)
// ──────────────────────────────────────────────────────────────────────────────
const CONTRACT_METHOD_COLORS: Record<string, React.CSSProperties> = {
  paper:      { backgroundColor: "var(--color-sumi100)",        color: "var(--color-sumi700)" },
  electronic: { backgroundColor: "rgba(122, 165, 146, 0.14)",   color: "#4D7A65" },
  verbal:     { backgroundColor: "rgba(229, 196, 127, 0.25)",   color: "#8A6D1E" },
};

const CONTRACT_METHOD_LABELS: Record<string, string> = {
  paper:      "紙面",
  electronic: "電子",
  verbal:     "口頭",
};

export function ContractMethodBadge({ method }: { method: string | null | undefined }) {
  if (!method) return <EmptyDash />;
  const colorStyle =
    CONTRACT_METHOD_COLORS[method] ?? {
      backgroundColor: "var(--color-sumi100)",
      color: "var(--color-sumi700)",
    };
  return (
    <span style={{ ...BASE, ...colorStyle }}>
      {CONTRACT_METHOD_LABELS[method] ?? method}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// プロジェクトステータスバッジ
// StatusBadge と同じドット + テキストの見た目。sortOrder/seed で色を切替。
// ──────────────────────────────────────────────────────────────────────────────
export function ProjectStatusBadge({
  name,
  color,
  sortOrder,
  total,
  seed,
}: {
  name: string | null | undefined;
  color?: string | null;
  sortOrder?: number | null;
  total?: number | null;
  seed?: string | null;
}) {
  return (
    <StatusBadge
      name={name}
      color={color}
      sortOrder={sortOrder}
      total={total}
      seed={seed}
    />
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// コンタクト種別バッジ (individual / corporate_rep / employee / other)
// ──────────────────────────────────────────────────────────────────────────────
const CONTACT_TYPE_COLORS: Record<string, React.CSSProperties> = {
  individual:    { backgroundColor: "var(--color-sage)",   color: "#fff" },
  corporate_rep: { backgroundColor: "var(--color-terra)",  color: "#fff" },
  employee:      { backgroundColor: "rgba(229, 196, 127, 0.25)", color: "#8A6D1E" },
  other:         { backgroundColor: "var(--color-sumi100)", color: "var(--color-sumi700)" },
};

const CONTACT_TYPE_LABELS: Record<string, string> = {
  individual:    "個人",
  corporate_rep: "法人代表",
  employee:      "従業員",
  other:         "その他",
};

export function ContactTypeBadge({ type }: { type: string | null | undefined }) {
  if (!type) return <EmptyDash />;
  const colorStyle =
    CONTACT_TYPE_COLORS[type] ?? {
      backgroundColor: "var(--color-sumi100)",
      color: "var(--color-sumi700)",
    };
  return (
    <span style={{ ...BASE, ...colorStyle }}>
      {CONTACT_TYPE_LABELS[type] ?? type}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// アカウント種別バッジ (corporate / sole_proprietor / government)
// 取引先が「法人」「個人事業主」「官公庁」のどれかを一目で判別させる。
// 取引先名の直後に並べるため、名前の可読性を落とさないソフト塗りに統一する。
// ──────────────────────────────────────────────────────────────────────────────
const ACCOUNT_TYPE_COLORS: Record<string, React.CSSProperties> = {
  corporate:       { backgroundColor: "rgba(59, 130, 246, 0.14)",  color: "#1E40AF" },
  sole_proprietor: { backgroundColor: "rgba(122, 165, 146, 0.14)", color: "#4D7A65" },
  government:      { backgroundColor: "var(--color-sumi100)",      color: "var(--color-sumi700)" },
};

/**
 * 表示名はマスタの name をそのまま使う（マスタ側で改名されても追従させるため）。
 * 色の割り当てだけを slug で決め、未知の slug / slug 無しは中立色にフォールバックする。
 */
export function AccountTypeBadge({
  name,
  slug,
}: {
  name: string | null | undefined;
  slug?: string | null;
}) {
  if (!name) return <EmptyDash />;
  const colorStyle =
    (slug ? ACCOUNT_TYPE_COLORS[slug] : undefined) ?? {
      backgroundColor: "var(--color-sumi100)",
      color: "var(--color-sumi700)",
    };
  return <span style={{ ...BASE, ...colorStyle }}>{name}</span>;
}

// ──────────────────────────────────────────────────────────────────────────────
// トーンバッジ（成功 / 注意 / エラー / 情報 / 中立）
//
// マスタを持たない、その場の結果や状態を示すラベル向け。
// 取込結果の「新規 / 追記」のように画面ごとに直書きされていたものをここへ集約する。
// 文字色は WCAG AA（4.5:1）を満たすまで濃くした値を選んでいる。
// ──────────────────────────────────────────────────────────────────────────────
export type BadgeTone = "success" | "warning" | "error" | "info" | "neutral";

const TONE_COLORS: Record<BadgeTone, React.CSSProperties> = {
  success: { backgroundColor: "rgba(16, 185, 129, 0.14)", color: "#047857" },
  warning: { backgroundColor: "rgba(245, 158, 11, 0.14)", color: "#B45309" },
  error:   { backgroundColor: "rgba(239, 68, 68, 0.12)",  color: "#B91C1C" },
  info:    { backgroundColor: "rgba(59, 130, 246, 0.12)", color: "#1E40AF" },
  neutral: { backgroundColor: "var(--color-sumi100)",     color: "var(--color-sumi700)" },
};

export function ToneBadge({
  tone = "neutral",
  children,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
}) {
  return (
    <span style={{ ...BASE, ...TONE_COLORS[tone], fontWeight: 600 }}>{children}</span>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 汎用ラベルバッジ (マスタ color を持つ任意品目向け)
// ──────────────────────────────────────────────────────────────────────────────
export function LabelBadge({
  name,
  color,
}: {
  name: string | null | undefined;
  color?: string | null;
}) {
  if (!name) return <EmptyDash />;
  return (
    <span
      style={{
        ...BASE,
        backgroundColor: color ? `${color}26` : "var(--color-sumi100)",
        color: color ?? "var(--color-sumi700)",
      }}
    >
      {name}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 系統バッジ（G / SP / CO の固定色）
// G=info blue, SP=soleil, CO=sage
// ──────────────────────────────────────────────────────────────────────────────
const SYSTEM_TAG_COLORS: Record<string, React.CSSProperties> = {
  G:  { backgroundColor: "rgba(59, 130, 246, 0.14)", color: "#1E40AF" },
  SP: { backgroundColor: "rgba(215, 119, 93, 0.18)", color: "#A34E35" },
  CO: { backgroundColor: "rgba(122, 165, 146, 0.14)", color: "#4D7A65" },
};

export function SystemTagBadge({
  code,
  name,
  primary = false,
}: {
  code: string;
  name: string;
  /** プライマリ系統（最上位グレード）の場合 true でソリッド塗りにする */
  primary?: boolean;
}) {
  const softs = SYSTEM_TAG_COLORS[code] ?? {
    backgroundColor: "var(--color-sumi100)",
    color: "var(--color-sumi700)",
  };

  // primary の場合はソリッド塗り（PROGRESSION_PALETTE と同系色）
  const solidColors: Record<string, React.CSSProperties> = {
    G:  { backgroundColor: "#2563EB", color: "#fff" },
    SP: { backgroundColor: "#B85A3F", color: "#fff" },
    CO: { backgroundColor: "#4D7A65", color: "#fff" },
  };
  const solidFallback: React.CSSProperties = {
    backgroundColor: "var(--color-sumi600)",
    color: "#fff",
  };

  const colorStyle = primary
    ? (solidColors[code] ?? solidFallback)
    : softs;

  return (
    <span
      style={{
        ...BASE,
        ...colorStyle,
        fontWeight: primary ? 600 : 500,
      }}
    >
      {name}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// グレードバッジ（band 別固定色: A=sumi / P=sage / S=amber / L=soleil）
// ──────────────────────────────────────────────────────────────────────────────
const GRADE_BAND_COLORS: Record<string, React.CSSProperties> = {
  A: { backgroundColor: "var(--color-sumi100)", color: "var(--color-sumi700)" },
  P: { backgroundColor: "rgba(122, 165, 146, 0.14)", color: "#4D7A65" },
  S: { backgroundColor: "rgba(229, 196, 127, 0.28)", color: "#8A6D1E" },
  L: { backgroundColor: "rgba(215, 119, 93, 0.18)", color: "#A34E35" },
};

export function GradeBadge({
  gradeCode,
}: {
  gradeCode: string | null | undefined;
}) {
  if (!gradeCode) return <EmptyDash />;
  const band = gradeCode.charAt(0).toUpperCase();
  const colorStyle =
    GRADE_BAND_COLORS[band] ?? {
      backgroundColor: "var(--color-sumi100)",
      color: "var(--color-sumi700)",
    };
  return (
    <span
      style={{
        ...BASE,
        ...colorStyle,
        fontWeight: 600,
        letterSpacing: "0.04em",
      }}
    >
      {gradeCode}
    </span>
  );
}
