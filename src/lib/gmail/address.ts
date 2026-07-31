/**
 * メールヘッダのアドレス解析と、記録対象かどうかの判定。
 *
 * Gmail から取るのはヘッダだけなので、ここでやることは
 *   1. `名前 <addr@example.com>` 形式のパース
 *   2. 連絡先として扱うべきアドレスかの選別
 * の 2 つ。突合そのもの（連絡先を引く）は DB 側の関数が行う。
 *
 * 選別が要る理由: 受信箱には配信メール・自動通知・社内メールが大量に混ざる。
 * これらを候補に溜めると、担当者が承認すべき相手が埋もれる。
 */

/** ヘッダ 1 件分。`山田 太郎 <taro@example.co.jp>` を分解したもの */
export type ParsedAddress = {
  email: string;
  /** 表示名。無ければ null */
  name: string | null;
};

/**
 * From / To / Cc ヘッダをパースする。
 *
 * カンマ区切りで複数入るが、表示名がクォートされていてカンマを含む場合がある
 * （例: `"Yamada, Taro" <taro@example.com>`）ため、クォート内のカンマは
 * 区切りとして扱わない。
 */
export function parseAddressList(header: string | null | undefined): ParsedAddress[] {
  if (!header) return [];

  const parts: string[] = [];
  let current = "";
  let inQuote = false;

  for (const ch of header) {
    if (ch === '"') {
      inQuote = !inQuote;
      current += ch;
    } else if (ch === "," && !inQuote) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);

  const result: ParsedAddress[] = [];
  for (const raw of parts) {
    const parsed = parseSingleAddress(raw);
    if (parsed) result.push(parsed);
  }
  return result;
}

function parseSingleAddress(raw: string): ParsedAddress | null {
  const text = raw.trim();
  if (!text) return null;

  // `表示名 <addr>` 形式
  const angle = text.match(/^(.*?)<([^>]+)>$/);
  if (angle) {
    const name = angle[1].trim().replace(/^"(.*)"$/, "$1").trim();
    const email = normalizeEmail(angle[2]);
    return email ? { email, name: name || null } : null;
  }

  // アドレスのみ
  const email = normalizeEmail(text);
  return email ? { email, name: null } : null;
}

/** 比較・保存に使う形へ。大文字小文字は区別しない */
export function normalizeEmail(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim().toLowerCase();
  if (!trimmed) return null;
  // 最低限の形だけ見る。厳密な RFC 準拠は判定の目的ではない
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed) ? trimmed : null;
}

/** アドレスのドメイン部 */
export function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at < 0 ? "" : email.slice(at + 1);
}

/**
 * 連絡先として記録する価値が無いアドレス。
 *
 * no-reply 等の自動送信、メーリングリスト、バウンス通知を弾く。
 * 見落とすと候補一覧がこれらで埋まり、本当に登録すべき相手が埋もれる。
 */
const NOREPLY_PATTERNS = [
  /^no-?reply/,
  /^do-?not-?reply/,
  /^donotreply/,
  /^notifications?@/,
  /^automated?@/,
  /^bounce/,
  /^mailer-daemon/,
  /^postmaster@/,
  /^support@(github|slack|google|microsoft|atlassian)\./,
];

/** メーリングリスト・配信系によくあるローカル部 */
const LIST_LOCAL_PARTS = new Set([
  "info",
  "news",
  "newsletter",
  "magazine",
  "mailmagazine",
  "press",
  "marketing",
  "campaign",
  "notice",
  "alert",
  "system",
  "webmaster",
  "admin",
]);

export type SkipReason = "noreply" | "list" | "own_domain" | "self";

export type AddressFilterOptions = {
  /** 自社のドメイン。ここ宛/発は社内メールとして候補に入れない */
  ownDomains: string[];
  /** 連携中の Gmail アドレス。自分自身は候補にしない */
  connectedAddresses: string[];
};

/**
 * 候補として溜めるべきアドレスかを判定する。
 * 記録対象外なら理由を返す（null なら対象）。
 */
export function getSkipReason(
  email: string,
  options: AddressFilterOptions
): SkipReason | null {
  const normalized = email.toLowerCase();

  if (options.connectedAddresses.some((a) => a.toLowerCase() === normalized)) {
    return "self";
  }

  const domain = emailDomain(normalized);
  if (options.ownDomains.some((d) => d.toLowerCase() === domain)) {
    return "own_domain";
  }

  if (NOREPLY_PATTERNS.some((re) => re.test(normalized))) {
    return "noreply";
  }

  const localPart = normalized.slice(0, normalized.lastIndexOf("@"));
  // info+123@ のようなサブアドレスも本体で判定する
  const base = localPart.split("+")[0];
  if (LIST_LOCAL_PARTS.has(base)) {
    return "list";
  }

  return null;
}

/**
 * メール 1 通から、記録対象の相手アドレスを役割つきで取り出す。
 * 自分・社内・自動送信は落とす。
 */
export type MessageParticipant = ParsedAddress & { role: "from" | "to" | "cc" };

export function extractParticipants(
  headers: { from: string | null; to: string | null; cc: string | null },
  options: AddressFilterOptions
): MessageParticipant[] {
  const seen = new Set<string>();
  const result: MessageParticipant[] = [];

  const push = (list: ParsedAddress[], role: "from" | "to" | "cc") => {
    for (const addr of list) {
      if (seen.has(addr.email)) continue;
      if (getSkipReason(addr.email, options)) continue;
      seen.add(addr.email);
      result.push({ ...addr, role });
    }
  };

  push(parseAddressList(headers.from), "from");
  push(parseAddressList(headers.to), "to");
  push(parseAddressList(headers.cc), "cc");

  return result;
}
