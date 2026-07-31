/**
 * 国税庁 法人番号 Web-API（Ver.4）のレスポンス解析。
 *
 * CSV/Unicode（type=02）を使う。XML だとパーサの依存が増えるうえ、
 * 取込側に既に CSV パーサ（parseCsv）があるため。
 *
 * CSV にヘッダ行は無く、列は仕様で固定されている。
 * https://www.houjin-bangou.nta.go.jp/webapi/
 */

// Vitest はパスエイリアスを解決しないため相対で参照する（既存テスト群と同じ）
import { parseCsv } from "../leads/import-helpers";

/** 仕様上の列位置（0 始まり）。必要なものだけ名前を付ける */
const COL = {
  corporateNumber: 1,
  process: 2,
  updateDate: 4,
  changeDate: 5,
  name: 6,
  kind: 8,
  prefecture: 9,
  city: 10,
  street: 11,
  postCode: 15,
  closeDate: 18,
  closeCause: 19,
  successorNumber: 20,
  latest: 23,
} as const;

/** API が返す 1 件分。使う列だけを取り出す */
export type HoujinRecord = {
  corporateNumber: string;
  name: string;
  prefecture: string;
  city: string;
  street: string;
  postCode: string;
  /** 登記記録の閉鎖等年月日。空なら現存 */
  closeDate: string;
  /** 閉鎖の事由コード（01=清算結了等, 11=合併, 21=登記官による閉鎖 など） */
  closeCause: string;
  /** 承継先法人番号（合併時） */
  successorNumber: string;
  /** 最新履歴かどうか（1 = 最新） */
  isLatest: boolean;
};

/** 所在地を 1 本の文字列にする（表示・差分比較用） */
export function formatAddress(r: HoujinRecord): string {
  return `${r.prefecture}${r.city}${r.street}`.trim();
}

/** 登記が閉鎖されているか */
export function isClosed(r: HoujinRecord): boolean {
  return r.closeDate.trim() !== "";
}

/**
 * CSV 本文をレコード配列にする。
 *
 * 列数が仕様と違う行は壊れたレスポンスとみなして捨てる。
 * 落とした行があっても処理全体は止めない（1 社の照合失敗で
 * 一括処理が止まる方が運用上つらい）。
 */
export function parseHoujinCsv(body: string): HoujinRecord[] {
  const rows = parseCsv(body);
  const records: HoujinRecord[] = [];

  for (const row of rows) {
    // 仕様は 30 列。末尾の空列が落ちることがあるので最低限必要な位置まであれば通す
    if (row.length <= COL.latest) continue;

    const corporateNumber = (row[COL.corporateNumber] ?? "").trim();
    if (!/^\d{13}$/.test(corporateNumber)) continue;

    records.push({
      corporateNumber,
      name: (row[COL.name] ?? "").trim(),
      prefecture: (row[COL.prefecture] ?? "").trim(),
      city: (row[COL.city] ?? "").trim(),
      street: (row[COL.street] ?? "").trim(),
      postCode: (row[COL.postCode] ?? "").trim(),
      closeDate: (row[COL.closeDate] ?? "").trim(),
      closeCause: (row[COL.closeCause] ?? "").trim(),
      successorNumber: (row[COL.successorNumber] ?? "").trim(),
      isLatest: (row[COL.latest] ?? "").trim() === "1",
    });
  }

  return records;
}
