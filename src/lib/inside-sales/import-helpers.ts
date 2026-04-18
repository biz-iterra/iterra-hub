// ============================================================
// CSV取込用の正規化・マッピング定数
// ============================================================

/**
 * 架電ステータスのcode → (stage_code, phase_code) 推奨マッピング
 * CSV取込時のdeal.stage/phase自動判定に使用。
 * 注意: deal_stages.phase_id は deal_stages レコードに紐づくので、
 * ここで phase_code を持つのは「この架電ステータスの後に期待されるフェーズ」を示すメモ。
 * 実装上は stage_code から deal_stages.id を解決し、その stage の phase_id を使う。
 */
export const CALL_STATUS_TO_STAGE: Record<
  string,
  { stage_code: "listed" | "untouched" | "calling" | "callback_waiting" | "appointment_set" | "opportunity" | "closed"; phase_hint: "cold" | "warm" | "hot" }
> = {
  nt:            { stage_code: "calling", phase_hint: "cold" },
  no_answer:     { stage_code: "calling", phase_hint: "cold" },
  absent:        { stage_code: "calling", phase_hint: "cold" },
  voicemail:     { stage_code: "calling", phase_hint: "cold" },
  gatekeep:      { stage_code: "calling", phase_hint: "warm" },
  refused:       { stage_code: "calling", phase_hint: "warm" },
  form_sent:     { stage_code: "calling", phase_hint: "warm" },
  material_sent: { stage_code: "calling", phase_hint: "warm" },
  promising:     { stage_code: "appointment_set", phase_hint: "hot" },
  appointment:   { stage_code: "appointment_set", phase_hint: "hot" },
};

/**
 * deal_stages には code カラムがないので、seed で登録した stage 名で解決する
 * stage_code → stage_name のマッピング
 */
export const STAGE_CODE_TO_NAME: Record<string, string> = {
  listed: "リスト化済",
  untouched: "未架電",
  calling: "架電試行中",
  callback_waiting: "再架電待ち",
  appointment_set: "アポ獲得",
  opportunity: "商談化",
  closed: "クローズ",
};

/**
 * 架電ステータスのCSV名称 → code（マスタ解決に使う）
 */
export const CALL_STATUS_NAME_TO_CODE: Record<string, string> = {
  NT: "nt",
  不出: "no_answer",
  担当不在: "absent",
  現アナ: "voicemail",
  受付NG: "gatekeep",
  担当NG: "refused",
  新規フォーム: "form_sent",
  資料送付: "material_sent",
  見込み: "promising",
  アポ: "appointment",
};

// ============================================================
// 文字列正規化
// ============================================================

/**
 * 企業名の正規化。完全一致判定に使う。
 * - 前後空白除去
 * - 全角空白→半角
 * - 連続空白を1つに
 */
export function normalizeCompanyName(raw: string): string {
  return raw.trim().replace(/\u3000/g, " ").replace(/\s+/g, " ");
}

/**
 * URLからドメイン部分を抽出（重複判定キー）
 * - 'www.' プレフィックスは除去
 * - パスやクエリは無視
 * - 無効なURLなら null
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
 * 電話番号の正規化（数字のみ抽出）
 * - 全角ハイフン / 半角ハイフン / 括弧 / 空白を除去
 * - 国番号 +81 は 0 に正規化
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw
    .trim()
    .replace(/[‐－–—ー−]/g, "-")     // 各種ハイフンを統一（正規化用）
    .replace(/[()\s]/g, "")          // 括弧・空白除去
    .replace(/[^\d+]/g, "");         // 数字以外（+含む）を除去
  if (!s) return null;
  if (s.startsWith("+81")) s = "0" + s.slice(3);
  return s.length >= 8 ? s : null;  // あまりに短いものは無効扱い
}

/**
 * 架電日の正規化: 'YYYY/M/D' / 'YYYY/MM/DD' / 'M/D' → 'YYYY-MM-DD'
 * 年省略形式（M/D）の場合、defaultYear（未指定時はシステムの現在年）で補完
 * 不正値は null
 */
export function normalizeDate(
  raw: string | null | undefined,
  defaultYear?: number
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  // YYYY/M/D
  const m1 = trimmed.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m1) {
    const [, y, mo, d] = m1;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // M/D（年省略）
  const m2 = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (m2) {
    const [, mo, d] = m2;
    const year = defaultYear ?? new Date().getFullYear();
    return `${year}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

/**
 * 架電時間の正規化: '11' / '11:30' / '11:30:00' → 'HH:MM:SS'
 * 時のみの場合は ':00:00' を補完
 */
export function normalizeTime(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\d{1,2}$/.test(trimmed)) {
    const h = parseInt(trimmed, 10);
    if (h < 0 || h > 23) return null;
    return `${String(h).padStart(2, "0")}:00:00`;
  }
  const m = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [, h, mi, se] = m;
  const hn = parseInt(h, 10);
  if (hn < 0 || hn > 23) return null;
  return `${String(hn).padStart(2, "0")}:${mi}:${se ?? "00"}`;
}

// ============================================================
// CSV パース（最小限の実装。quote対応）
// RFC4180準拠: "..." でくくられた中は "" でescape された quote
// ============================================================

export function parseCsv(content: string): string[][] {
  // BOM除去
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
    } else {
      if (c === '"') {
        inQuotes = true;
        i++;
      } else if (c === ",") {
        row.push(field);
        field = "";
        i++;
      } else if (c === "\r") {
        i++; // CRLF handling
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
  }
  // 最終フィールド
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
