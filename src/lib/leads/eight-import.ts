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

/**
 * leads の CHECK 制約に合わせた上限。
 * 名刺には制約を超える値が入ることがある（実データで役職 134 文字の行が 1 件）。
 * 行を落とすより切り詰めて取り込む方が有益なので、警告を出して詰める。
 * 原文は lead_import_records.raw に残るので後から復元できる。
 *
 * DB 側の制約（chk_leads_*_length）と対応させること。
 */
const MAX_LENGTH = {
  lead_name: 300,
  company_name: 200,
  contact_last_name: 50,
  contact_first_name: 50,
  contact_department: 100,
  contact_job_title: 100,
  contact_email: 255,
  url: 500,
} as const;

/** 上限を超える値を切り詰め、警告を積む */
function clamp(
  value: string | null,
  max: number,
  label: string,
  warnings: string[]
): string | null {
  if (!value) return null;
  if (value.length <= max) return value;
  warnings.push(
    `${label}が ${max} 文字を超えるため切り詰めました（元は ${value.length} 文字。原文は取込記録に保持）`
  );
  return value.slice(0, max);
}

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
  /**
   * CSV の「名刺交換日」（YYYY-MM-DD）。
   *
   * **列名に反して、実態は利用者が Eight にデータを登録した日。**
   * 名刺情報の変更日でも在籍期間でもないため、所属の順序の根拠には使わない
   * （docs/contact-identity.md）。行の統合順と lead_activities の記録日に使う。
   */
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
      lead_name: clamp(leadName ?? "", MAX_LENGTH.lead_name, "リード名", warnings) ?? "",
      company_name: clamp(companyName, MAX_LENGTH.company_name, "会社名", warnings),
      contact_last_name: clamp(lastName, MAX_LENGTH.contact_last_name, "姓", warnings),
      contact_first_name: clamp(firstName, MAX_LENGTH.contact_first_name, "名", warnings),
      contact_department: clamp(
        get("部署名") || null,
        MAX_LENGTH.contact_department,
        "部署名",
        warnings
      ),
      contact_job_title: clamp(
        get("役職") || null,
        MAX_LENGTH.contact_job_title,
        "役職",
        warnings
      ),
      contact_email: clamp(email, MAX_LENGTH.contact_email, "メールアドレス", warnings),
      // 直通が入っていれば個人の番号として優先する。実データでは両方持つ行は 0 件
      contact_phone: normalizePhone(get("TEL直通")) ?? normalizePhone(get("携帯電話")),
      company_phone: normalizePhone(get("TEL会社")),
      url: clamp(get("URL") || null, MAX_LENGTH.url, "URL", warnings),
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
