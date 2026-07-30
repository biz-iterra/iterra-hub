/**
 * Eight（名刺アプリ）CSV の行を Lead の形に変換する純粋関数。
 *
 * 列構成は Eight プレミアムの CSV ダウンロードに準拠する。
 * 仕様と実データの統計は docs/lead-import-eight.md を参照。
 *
 * DB アクセスは行わない。Server Action 側でこの結果を DB 関数に渡す。
 */

import {
  buildExternalKey,
  normalizeCompanyName,
  normalizeDate,
  normalizeEmail,
  normalizePhone,
  parseAddress,
  type ParsedAddress,
} from "./import-helpers";

export const EIGHT_SOURCE_SLUG = "eight";

/**
 * Eight CSV の列名。位置ではなく列名でマッピングする
 * （列順が変わっても壊れないようにするため）。
 */
export const EIGHT_COLUMNS = [
  "会社名",
  "部署名",
  "役職",
  "姓",
  "名",
  "e-mail",
  "郵便番号",
  "住所",
  "TEL会社",
  "TEL部門",
  "TEL直通",
  "Fax",
  "携帯電話",
  "URL",
  "名刺交換日",
  "Eightでつながっている人",
  "再データ化中の名刺",
  "'?'を含んだデータ",
] as const;

export type EightColumn = (typeof EIGHT_COLUMNS)[number];

/** 取込に最低限必要な列。これが欠けていればファイル自体を受け付けない */
const REQUIRED_COLUMNS: EightColumn[] = ["会社名", "姓", "名", "e-mail", "名刺交換日"];

export type HeaderCheckResult =
  | { ok: true; indexOf: Record<string, number> }
  | { ok: false; error: string };

/**
 * ヘッダ行を検証し、列名 → 列番号の対応を返す。
 * 未知の列は無視する（Eight 側で列が増えても取込を止めない。値は raw に残る）。
 */
export function checkEightHeader(header: string[]): HeaderCheckResult {
  const indexOf: Record<string, number> = {};
  header.forEach((h, i) => {
    const key = h.trim();
    if (key && !(key in indexOf)) indexOf[key] = i;
  });

  const missing = REQUIRED_COLUMNS.filter((c) => !(c in indexOf));
  if (missing.length > 0) {
    return {
      ok: false,
      error:
        `Eight の CSV として認識できません。次の列が見つかりませんでした: ${missing.join(", ")}` +
        `（受信したヘッダ: ${header.slice(0, 5).join(", ")}...）`,
    };
  }
  return { ok: true, indexOf };
}

/** パース結果。lead_name が決まらない行は error になる */
export type ParsedEightRow = {
  rowNumber: number;
  raw: Record<string, string>;
  externalKey: string | null;
  /** 名刺交換日（YYYY-MM-DD）。ソートと lead_activities に使う */
  exchangedOn: string | null;
  lead: {
    lead_name: string;
    company_name: string | null;
    contact_last_name: string | null;
    contact_first_name: string | null;
    contact_department: string | null;
    contact_job_title: string | null
    contact_email: string | null;
    contact_phone: string | null;
    company_phone: string | null;
    url: string | null;
  };
  address: ParsedAddress;
  /** データ品質に注意が必要な行（Eight 側のフラグ） */
  warnings: string[];
  error: string | null;
};

/**
 * CSV の 1 行を Lead の形にする。
 *
 * lead_name は NOT NULL なので、会社名 → 氏名 → メールアドレス の順で決める。
 * 実データでは会社名なしが 46 行、そのうち氏名もない行が 3 行あり、
 * 3 行のうち 2 行はメールを持っている。メールがあれば識別できるので取り込む。
 */
export function parseEightRow(
  row: string[],
  indexOf: Record<string, number>,
  rowNumber: number
): ParsedEightRow {
  const get = (col: string): string => {
    const i = indexOf[col];
    if (i === undefined) return "";
    return (row[i] ?? "").trim();
  };

  // raw は列名 → 値でそのまま保持する。マッピングしない列も後から参照できる
  const raw: Record<string, string> = {};
  for (const [col, i] of Object.entries(indexOf)) {
    const v = (row[i] ?? "").trim();
    if (v) raw[col] = v;
  }

  const companyName = normalizeCompanyName(get("会社名")) || null;
  const lastName = get("姓") || null;
  const firstName = get("名") || null;
  const email = normalizeEmail(get("e-mail"));

  const personName = [lastName, firstName].filter(Boolean).join(" ");
  const leadName = companyName ?? (personName || email);

  const warnings: string[] = [];
  if (get("再データ化中の名刺")) warnings.push("Eight 側でデータ化中の名刺（内容が未確定）");
  if (get("'?'を含んだデータ")) warnings.push("読み取れない文字を含む名刺");

  const address = parseAddress(get("郵便番号"), get("住所"));

  return {
    rowNumber,
    raw,
    externalKey: buildExternalKey(EIGHT_SOURCE_SLUG, {
      email,
      companyName,
      lastName,
      firstName,
    }),
    exchangedOn: normalizeDate(get("名刺交換日")),
    lead: {
      lead_name: leadName ?? "",
      company_name: companyName,
      contact_last_name: lastName,
      contact_first_name: firstName,
      contact_department: get("部署名") || null,
      contact_job_title: get("役職") || null,
      contact_email: email,
      // 直通が入っていれば個人の番号として優先する。実データでは両方持つ行は 0 件
      contact_phone: normalizePhone(get("TEL直通")) ?? normalizePhone(get("携帯電話")),
      company_phone: normalizePhone(get("TEL会社")),
      url: get("URL") || null,
    },
    address,
    warnings,
    error: leadName
      ? null
      : "会社名・氏名・メールアドレスがすべて空のため、リード名を決められません",
  };
}

/**
 * 同一人物の複数行を 1 件にまとめる。
 *
 * 同じ人と複数回名刺交換すると行が増える（実データでは 100 キーが複数行・最大 6 行）。
 * Lead は 1 件にし、属性は「名刺交換日が最新の行」を採用する。
 * 転職などで会社名が変わっている場合に古い情報で上書きしないため
 * （同一メールで会社名が異なる行が 24 件ある）。
 *
 * 名刺交換の履歴は行ごとに全件残すので、交換日の配列も返す。
 */
export type MergedEightLead = {
  externalKey: string;
  /** 属性として採用した行（交換日が最新のもの） */
  primary: ParsedEightRow;
  /** この人物に対応する全行（交換履歴の作成に使う） */
  rows: ParsedEightRow[];
};

export function mergeEightRows(parsed: ParsedEightRow[]): {
  merged: MergedEightLead[];
  errors: ParsedEightRow[];
} {
  const errors: ParsedEightRow[] = [];
  const byKey = new Map<string, ParsedEightRow[]>();

  for (const p of parsed) {
    if (p.error || !p.externalKey) {
      errors.push(p);
      continue;
    }
    const list = byKey.get(p.externalKey);
    if (list) list.push(p);
    else byKey.set(p.externalKey, [p]);
  }

  const merged: MergedEightLead[] = [];
  for (const [externalKey, rows] of byKey) {
    // 交換日の降順。日付が無い行は最後に回す。
    // 同じ日付なら CSV の後ろにある行を優先する（Eight は新しい順に出力しないため
    // 決定的な順序を保つ目的で行番号を第 2 キーにする）
    const sorted = [...rows].sort((a, b) => {
      if (a.exchangedOn && b.exchangedOn && a.exchangedOn !== b.exchangedOn) {
        return b.exchangedOn.localeCompare(a.exchangedOn);
      }
      if (a.exchangedOn && !b.exchangedOn) return -1;
      if (!a.exchangedOn && b.exchangedOn) return 1;
      return b.rowNumber - a.rowNumber;
    });
    merged.push({ externalKey, primary: sorted[0], rows: sorted });
  }

  return { merged, errors };
}
