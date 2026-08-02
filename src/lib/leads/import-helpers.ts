/**
 * リード取込の正規化ヘルパー（純粋関数のみ）。
 *
 * 元は inside-sales の CSV 取込にあったものを、Lead 取込の共通基盤として復活させた。
 * DB アクセスも I/O も行わないので Vitest で直接テストできる。
 */

import { createHash } from "node:crypto";

import { formatCompanyName } from "../company-name";

// ============================================================
// 文字コード判定
// ============================================================

/** decodeCsv が試すエンコーディング */
export type CsvEncoding = "utf-8" | "shift_jis";

export type DecodeResult = { text: string; encoding: CsvEncoding };

/**
 * CSV のバイト列を文字列にする。
 *
 * Eight は Shift_JIS(cp932) を BOM なしで出力するため、拡張子や BOM からは判別できない。
 * `fatal: true` を付けて順に試すことで判別する。実データで検証済み:
 *   - Shift_JIS のバイト列を utf-8 で読むと 2 バイト文字が不正シーケンスになり例外
 *   - UTF-8 のバイト列を shift_jis で読むと 3 バイト文字が未定義領域に当たり例外
 * 双方向で例外になるため誤判定しない。
 *
 * `fatal` を外すと shift_jis デコーダが UTF-8 を例外なく化けさせるので、必ず付ける。
 */
export function decodeCsv(bytes: Uint8Array): DecodeResult {
  const order: CsvEncoding[] = ["utf-8", "shift_jis"];
  for (const encoding of order) {
    try {
      const text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
      return { text, encoding };
    } catch {
      // 次の候補へ
    }
  }
  throw new Error(
    "CSV の文字コードを判別できませんでした（UTF-8 / Shift_JIS のいずれでもありません）"
  );
}

// ============================================================
// 値の正規化
// ============================================================

/**
 * 企業名の正規化。表示・保存する値に使う。
 *
 * 法人格の除去はしない。「株式会社A」と「有限会社A」を同一視してしまうため、
 * 略記を正式表記に開いて表記揺れを吸収するに留める。
 *
 * 規則は `src/lib/company-name.ts` に集約した。画面からの保存でも同じ整えが
 * 要るようになったため、取込専用の実装を持たない。
 */
export const normalizeCompanyName = formatCompanyName;

/**
 * URL からドメインを抽出する（重複判定の補助キー）。
 * www. は除去し、パス・クエリは無視する。無効なら null。
 */
export function extractDomain(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed.startsWith("http") ? trimmed : `http://${trimmed}`);
    let host = u.hostname.toLowerCase();
    if (host.startsWith("www.")) host = host.slice(4);
    return host || null;
  } catch {
    return null;
  }
}

/**
 * 電話番号の正規化。
 * 各種ハイフン・括弧・空白を除去し、国番号 +81 は 0 に直す。
 * Eight 実データには `+81-90-...` 形式が 8 件ある。
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw
    .trim()
    .replace(/[‐－–—ー−]/g, "-")
    .replace(/[()\s]/g, "")
    .replace(/[^\d+]/g, "");
  if (!s) return null;
  if (s.startsWith("+81")) s = "0" + s.slice(3);
  // 市外局番を含まない短すぎる値はノイズとして捨てる
  return s.length >= 8 ? s : null;
}

/** メールアドレスの正規化。外部キーの一部になるため必ずこれを通す。 */
export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  // 取込では厳密な検証をしない（名刺の OCR 誤りを弾いて行を落とすより残す方が有益）。
  // 最低限 @ を含むことだけ確認する。
  return s.includes("@") ? s : null;
}

/**
 * 日付の正規化: `YYYY/M/D` `YYYY-MM-DD` `M/D` → `YYYY-MM-DD`
 * Eight の名刺交換日は `YYYY/MM/DD`。年省略形式は defaultYear で補完する。
 */
export function normalizeDate(
  raw: string | null | undefined,
  defaultYear?: number
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const m1 = trimmed.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (m1) {
    const [, y, mo, d] = m1;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const m2 = trimmed.match(/^(\d{1,2})[/-](\d{1,2})$/);
  if (m2) {
    const [, mo, d] = m2;
    const year = defaultYear ?? new Date().getFullYear();
    return `${year}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

// ============================================================
// 住所のパース
// ============================================================

/** 都道府県は列挙する。正規表現の文字数指定では神奈川県・鹿児島県などを取り違えるため。 */
const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
  "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
  "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
  "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
] as const;

export type ParsedAddress = {
  postal_code: string | null;
  prefecture: string | null;
  city: string | null;
  address_line1: string | null;
  address_line2: string | null;
  raw_text: string | null;
};

/**
 * 名刺の住所をパースする。
 *
 * Eight は郵便番号と住所を別列に持つが、住所は都道府県から建物名までが 1 列に入る。
 * 実データ 839 件のうち 35 件は都道府県が省略されている（`墨田区江東橋…` 等）。
 *
 * 都道府県を特定できない場合は prefecture を null にし、全文を address_line1 に入れる。
 * 市区町村名から都道府県を逆引きする辞書は持たない（35 件のために辞書を抱えるのは過剰で、
 * 同名の区がある政令市で誤判定する）。raw_text に原文が残るので後から手で直せる。
 *
 * 政令指定都市の区は city に含めず address_line1 に回す。予測可能さを優先する。
 * 「郡」は区切り文字に入れていないため、「北佐久郡軽井沢町」のように
 * 郡＋町村がまとまって city になる（市区町村レベルの単位として扱う）。
 */
export function parseAddress(
  postalCodeRaw: string | null | undefined,
  addressRaw: string | null | undefined
): ParsedAddress {
  const postal = (postalCodeRaw ?? "").trim();
  const postal_code = postal ? postal.replace(/[^\d-]/g, "") || null : null;

  const address = (addressRaw ?? "").replace(/　/g, " ").trim();
  if (!address) {
    return {
      postal_code,
      prefecture: null,
      city: null,
      address_line1: null,
      address_line2: null,
      raw_text: null,
    };
  }

  const prefecture = PREFECTURES.find((p) => address.startsWith(p)) ?? null;
  const rest = prefecture ? address.slice(prefecture.length).trim() : address;

  let city: string | null = null;
  let line1 = rest;

  // 都道府県が取れなかった住所に市区町村判定をかけると、
  // 建物名の「町」などを拾って誤るため、prefecture があるときだけ切り出す。
  if (prefecture) {
    const m = rest.match(/^(.+?[市区町村])/);
    if (m) {
      city = m[1];
      let after = rest.slice(city.length);
      // 「四日市市」「市川市」のように市が連続する地名を取りこぼさない
      if (after.startsWith("市")) {
        city += "市";
        after = after.slice(1);
      }
      line1 = after.trim();
    }
  }

  return {
    postal_code,
    prefecture,
    city,
    address_line1: line1 || null,
    address_line2: null,
    raw_text: address,
  };
}

// ============================================================
// 冪等性キー
// ============================================================

/**
 * 取込元での一意キーを作る。再取込時の重複判定に使う。
 *
 * メールがあればそれを使い、無ければ会社名 + 氏名のハッシュにする。
 * Eight 実データ 922 行の内訳はメール由来 710 / ハッシュ由来 92。
 *
 * ハッシュにするのは、会社名と氏名をそのままキーにすると
 * 長さ制限とインデックス効率で不利になるため。
 */
export function buildExternalKey(
  sourceSlug: string,
  params: {
    email?: string | null;
    companyName?: string | null;
    lastName?: string | null;
    firstName?: string | null;
  }
): string | null {
  const email = normalizeEmail(params.email);
  if (email) return `${sourceSlug}:mail:${email}`;

  const company = normalizeCompanyName(params.companyName ?? "");
  const last = (params.lastName ?? "").trim();
  const first = (params.firstName ?? "").trim();
  if (!company && !last && !first) return null;

  const digest = createHash("sha256")
    .update(`${company}|${last}|${first}`)
    .digest("hex")
    .slice(0, 16);
  return `${sourceSlug}:hash:${digest}`;
}

// ============================================================
// CSV パース（RFC4180 準拠の最小実装）
// ============================================================

export function parseCsv(content: string): string[][] {
  // BOM 除去
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < content.length) {
    const c = content[i];
    if (inQuotes) {
      if (c === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
    } else if (c === '"') {
      inQuotes = true;
      i++;
    } else if (c === ",") {
      row.push(field);
      field = "";
      i++;
    } else if (c === "\r") {
      i++;
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
    } else {
      field += c;
      i++;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** 空行（全フィールドが空文字）を除いた行を返す */
export function dropEmptyRows(rows: string[][]): string[][] {
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
