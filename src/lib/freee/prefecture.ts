/**
 * freee の都道府県コード（0: 北海道 〜 46: 沖縄県）と和名の対応。
 *
 * **DB 側にも同じ対応がある**（`freee_prefecture_name` / `freee_prefecture_code`）。
 * 取り込みは DB 関数、送信は TS と経路が分かれているため両方に必要になった。
 * **片方だけ直さないこと。**
 */
const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
  "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
  "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
  "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
] as const;

/** 和名 → freee のコード。判定できないときは null（送らない） */
export function freeePrefectureCode(name: string | null | undefined): number | null {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return null;
  const index = PREFECTURES.indexOf(trimmed as (typeof PREFECTURES)[number]);
  return index >= 0 ? index : null;
}

/** freee のコード → 和名。範囲外・未設定は null */
export function freeePrefectureName(code: number | null | undefined): string | null {
  if (code === null || code === undefined) return null;
  return PREFECTURES[code] ?? null;
}
