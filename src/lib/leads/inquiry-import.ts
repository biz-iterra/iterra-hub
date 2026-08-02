/**
 * コーポレートサイトの問い合わせを CRM のリードへ移し替える（純粋関数のみ）。
 *
 * 取得元は D1 `corporate-iterra-leads` の `leads` テーブル。
 * 元テーブルはフォームの生の記録なので、CRM の項目に合わせて組み替える。
 *
 * DB アクセスも I/O も行わないので Vitest で直接テストできる。
 * 設計: docs/lead-import-inquiry.md
 */

import { formatCompanyName } from "../company-name";

/** 取り込み元。D1 `leads` の 1 行 */
export type InquiryRow = {
  id: string;
  form_type: string;
  label: string;
  email: string;
  name: string;
  company: string;
  tel: string;
  source: string;
  is_first: number;
  detail_json: string;
  created_at: string;
};

/** CRM へ渡す形 */
export type InquiryLead = {
  /** 再取込しても重複しないための鍵。名刺取込と衝突しないよう接頭辞を付ける */
  external_key: string;
  lead_name: string;
  company_name: string | null;
  contact_last_name: string | null;
  contact_first_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  /** 顧客行動（問合せフォーム送信）として残す本文 */
  detail: string;
  occurred_at: string;
};

/** 名刺取込（eight:）と混ざらないようにする */
export const INQUIRY_SOURCE_SLUG = "inquiry";

/** 問い合わせ種別の表示名。D1 の label をそのまま出すと社内で通じない */
const LABEL_NAMES: Record<string, string> = {
  consult: "無料相談",
  "hands-on": "ハンズオン",
  learning: "学習・研修",
  recruit: "採用",
  other: "その他",
};

/** フォームの種類 */
const FORM_TYPE_NAMES: Record<string, string> = {
  "lp-consult": "無料相談 LP",
  contact: "お問い合わせフォーム",
};

/**
 * 氏名を姓と名に分ける。
 *
 * サイト側は「姓 名」を結合して 1 つの欄に入れている。区切りが無いものは
 * 分けようがないので姓に寄せる（`resolve_or_create_contact` は姓だけでも動く）。
 */
export function splitPersonName(raw: string | null | undefined): {
  last: string | null;
  first: string | null;
} {
  const name = (raw ?? "").replace(/[　\s]+/g, " ").trim();
  if (!name) return { last: null, first: null };

  const parts = name.split(" ");
  if (parts.length === 1) return { last: parts[0], first: null };

  // 3 つ以上に割れたら、最後を名、残りを姓として扱う
  return {
    last: parts.slice(0, -1).join(" "),
    first: parts[parts.length - 1],
  };
}

/**
 * フォーム固有の項目を人が読める形にする。
 * 壊れた JSON でも取込は止めない（本文が少し欠けるだけ）。
 */
export function formatDetailJson(raw: string | null | undefined): string[] {
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];

  return Object.entries(parsed as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
}

/**
 * D1 の 1 行を CRM のリードへ。
 *
 * リード名は会社名を優先する。個人の問い合わせで会社名が無いときは氏名、
 * それも無ければメールアドレスを使う（一覧で「無題」が並ぶのを避ける）。
 */
export function toInquiryLead(row: InquiryRow): InquiryLead {
  const company = formatCompanyName(row.company);
  const { last, first } = splitPersonName(row.name);
  const personName = [last, first].filter(Boolean).join(" ");
  const email = row.email?.trim().toLowerCase() || null;

  const lines = [
    `種別: ${FORM_TYPE_NAMES[row.form_type] ?? row.form_type}`,
    `内容: ${LABEL_NAMES[row.label] ?? row.label}`,
    row.source ? `経路: ${row.source}` : null,
    ...formatDetailJson(row.detail_json),
  ].filter((v): v is string => Boolean(v));

  return {
    external_key: `${INQUIRY_SOURCE_SLUG}:${row.id}`,
    lead_name: company || personName || email || "（名称なし）",
    company_name: company || null,
    contact_last_name: last,
    contact_first_name: first,
    contact_email: email,
    contact_phone: row.tel?.trim() || null,
    detail: lines.join("\n"),
    occurred_at: row.created_at,
  };
}
