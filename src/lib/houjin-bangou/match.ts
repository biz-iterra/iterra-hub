/**
 * 法人名の照合。
 *
 * 商号検索は部分一致で複数件返るため、どれが目的の法人かを決める必要がある。
 * 正規化した名前が完全一致するものだけを採用し、複数該当・該当なしは
 * 「要確認」として人に回す。自動で 1 件に決め打つと誤った法人番号が
 * 台帳に入り、以降の照合がすべてその法人を追ってしまう。
 */

import type { HoujinRecord } from "./parse";
import { isClosed } from "./parse";

/**
 * 会社名の名寄せキー。
 *
 * **DB 関数 `normalize_company_name`（20260731000003）と同じ規則。**
 * 片方だけ変えると取込時の名寄せと API 照合の結果がずれるため、
 * 変更するときは必ず両方を直すこと。規則は match.test.ts で固定している。
 */
export function normalizeCompanyName(name: string | null | undefined): string {
  if (!name) return "";

  // 全角英数字 → 半角
  const halfWidth = name.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
  );

  return halfWidth
    .toLowerCase()
    .replace(
      /(株式会社|有限会社|合同会社|合資会社|合名会社|一般社団法人|一般財団法人|公益社団法人|公益財団法人|特定非営利活動法人|npo法人|医療法人|学校法人|社会福祉法人|宗教法人|\(株\)|（株）|\(有\)|（有）|\(同\)|（同）)/g,
      ""
    )
    .replace(/[\s　・．，、.,\-ー－_/\\&＆]/g, "");
}

export type MatchResult =
  | { kind: "matched"; record: HoujinRecord }
  | { kind: "closed"; record: HoujinRecord }
  /** 名前が一致する候補が複数あり、1 件に決められない */
  | { kind: "ambiguous"; candidates: HoujinRecord[] }
  | { kind: "not_found" };

/**
 * 候補群から目的の法人を決める。
 *
 * - 最新履歴（isLatest）のみを対象にする。過去の商号で引っかかった行を
 *   拾うと、現在は別名の法人を「一致」と判定してしまう
 * - 正規化名の完全一致だけを採用する
 * - 閉鎖済みは matched ではなく closed として返し、ステータスを分ける
 */
export function matchCompany(
  targetName: string,
  candidates: HoujinRecord[]
): MatchResult {
  const key = normalizeCompanyName(targetName);
  if (!key) return { kind: "not_found" };

  const exact = candidates.filter(
    (c) => c.isLatest && normalizeCompanyName(c.name) === key
  );

  if (exact.length === 0) return { kind: "not_found" };

  if (exact.length > 1) {
    // 同名法人（支店・同名別会社）は所在地でしか区別できない。人に回す
    return { kind: "ambiguous", candidates: exact };
  }

  const record = exact[0];
  return isClosed(record)
    ? { kind: "closed", record }
    : { kind: "matched", record };
}

/**
 * 台帳の値と API の値の差分。
 * 商号・所在地が変わっていたら「要確認」にして人が見る。
 */
export type CompanyDiff = {
  field: "name" | "address";
  before: string;
  after: string;
};

export function diffCompany(
  current: { name: string; address: string },
  record: HoujinRecord
): CompanyDiff[] {
  const diffs: CompanyDiff[] = [];

  // 表記ゆれ（(株) と 株式会社 など）は差分としない
  if (normalizeCompanyName(current.name) !== normalizeCompanyName(record.name)) {
    diffs.push({ field: "name", before: current.name, after: record.name });
  }

  const after = `${record.prefecture}${record.city}${record.street}`.trim();
  // 台帳に住所が無い場合は「変更」ではなく単なる未入力なので差分にしない
  if (current.address.trim() !== "" && current.address.trim() !== after) {
    diffs.push({ field: "address", before: current.address, after });
  }

  return diffs;
}
