// ポテンシャル診断のコア計算ロジック（pure functions）
// 出典: potential-profiling プロジェクトの lib/calc/index.ts より必要部分のみ移植。
// iterra-hub では「生年月日を登録した時点で potential_number と constellation_id を
// 自動算出する」という最小要件に合わせており、LLM 生成・履歴保存・トキ算出等は含まない。

// system_settings 相当の基準値。potential-profiling の seed に合わせた初期値。
// 変更が必要になった場合はここを書き換える（CRM 側に system_settings テーブルは持たない方針）。
// potential-profiling の calcPotentialValue（0-59）に +1 した値を potential_number（1-60 FK）として使用する。
export const POTENTIAL_BASE_DATE = "1920-01-01";

function toUTCDate(dateInput: string | Date): Date {
  if (typeof dateInput === "string") {
    const parts = dateInput.split("-");
    if (parts.length !== 3) {
      throw new Error(`Invalid date format: ${dateInput}. Expected YYYY-MM-DD`);
    }
    const [year, month, day] = parts.map(Number);
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      throw new Error(`Invalid date values: ${dateInput}`);
    }
    return new Date(Date.UTC(year, month - 1, day));
  }
  return new Date(
    Date.UTC(
      dateInput.getFullYear(),
      dateInput.getMonth(),
      dateInput.getDate(),
    ),
  );
}

function calcDiffDays(from: string | Date, to: string | Date): number {
  const fromDate = toUTCDate(from);
  const toDate = toUTCDate(to);
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((toDate.getTime() - fromDate.getTime()) / msPerDay);
}

/**
 * 生年月日からポテンシャル番号（1〜60）を算出する。
 * iterra-hub の `contacts.potential_number` / `number_diagnosis.number` に対応。
 * potential-profiling の calcPotentialValue（0-59）に +1 したもの。
 * この番号から R02 の `type` カラム（IL+ 等の 12 ポテンシャルタイプ）が引ける。
 */
export function calcPotentialNumber(birthdate: string | Date): number {
  const diffDays = calcDiffDays(POTENTIAL_BASE_DATE, birthdate);
  return (((diffDays + 1) % 60) + 60) % 60 + 1;
}

/**
 * 生年月日から星座名（日本語）を返す。
 * 戻り値は `constellation_fortune_telling.constellation` と一致する前提。
 */
export function calcZodiacSign(birthdate: string | Date): string {
  const date = toUTCDate(birthdate);
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();

  if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return "牡羊座";
  if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return "牡牛座";
  if ((month === 5 && day >= 21) || (month === 6 && day <= 21)) return "双子座";
  if ((month === 6 && day >= 22) || (month === 7 && day <= 22)) return "蟹座";
  if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return "獅子座";
  if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return "乙女座";
  if ((month === 9 && day >= 23) || (month === 10 && day <= 23)) return "天秤座";
  if ((month === 10 && day >= 24) || (month === 11 && day <= 22)) return "蠍座";
  if ((month === 11 && day >= 23) || (month === 12 && day <= 21)) return "射手座";
  if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) return "山羊座";
  if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return "水瓶座";
  return "魚座";
}
