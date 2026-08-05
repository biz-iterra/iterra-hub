/**
 * Zod の既定エラー文言を日本語にする。
 *
 * `docs/error-messages.md` §1 の「英語の生エラーを画面に出さない」を、
 * **個別のスキーマで書き忘れても守られる形**にするための受け皿。
 *
 * 優先順位は スキーマの `error` > ここ（`customError`）> ロケール > Zod 既定（英語）。
 * ロケールにも `zod/locales` の日本語を入れてあるので、
 * ここで拾えない種類が増えても英語にはならない。
 *
 * 判定は純粋関数にしてある（UT-71）。**Zod のバージョンを上げたときは
 * まずこのテストを走らせること。** issue の形が変わると静かに英語へ戻る。
 */

/** Zod の issue から、文言の組み立てに使う部分だけを取り出した形 */
export type ZodIssueLike = {
  code?: string;
  /** too_small / too_big の対象（"string" | "number" | "array" | "date" | ...） */
  origin?: string;
  /** invalid_type が期待した型 */
  expected?: string;
  /** invalid_format の形式（"email" | "url" | "uuid" | "regex" | ...） */
  format?: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
  /** 境界を含むか。false なら「より大きい／より小さい」 */
  inclusive?: boolean;
  /** invalid_value の候補 */
  values?: unknown[];
  /** not_multiple_of の除数 */
  divisor?: number;
  input?: unknown;
};

const num = (v: number | bigint | undefined) => (v == null ? "" : String(v));

/** 下限を割ったときの言い方。対象ごとに助数詞と動詞が変わる */
const TOO_SMALL: Record<string, (v: string, exclusive: boolean) => string> = {
  string: (v, ex) =>
    ex ? `${v} 文字より多く入力してください` : `${v} 文字以上で入力してください`,
  number: (v, ex) => (ex ? `${v} より大きい数値を入力してください` : `${v} 以上の数値を入力してください`),
  bigint: (v, ex) => (ex ? `${v} より大きい数値を入力してください` : `${v} 以上の数値を入力してください`),
  array: (v, ex) => (ex ? `${v} 件より多く選んでください` : `${v} 件以上選んでください`),
  set: (v, ex) => (ex ? `${v} 件より多く選んでください` : `${v} 件以上選んでください`),
  file: (v) => `${v} バイト以上のファイルを選んでください`,
};

/** 上限を超えたときの言い方 */
const TOO_BIG: Record<string, (v: string, exclusive: boolean) => string> = {
  string: (v, ex) =>
    ex ? `${v} 文字より少なく入力してください` : `${v} 文字以内で入力してください`,
  number: (v, ex) => (ex ? `${v} より小さい数値を入力してください` : `${v} 以下の数値を入力してください`),
  bigint: (v, ex) => (ex ? `${v} より小さい数値を入力してください` : `${v} 以下の数値を入力してください`),
  array: (v, ex) => (ex ? `${v} 件より少なく選んでください` : `${v} 件以内で選んでください`),
  set: (v, ex) => (ex ? `${v} 件より少なく選んでください` : `${v} 件以内で選んでください`),
  file: (v) => `${v} バイト以内のファイルを選んでください`,
};

const FORMAT: Record<string, string> = {
  email: "メールアドレスの形式で入力してください",
  url: "URL の形式で入力してください（https:// から始めます）",
  uuid: "UUID 形式で指定してください",
  guid: "UUID 形式で指定してください",
  datetime: "日時の形式で入力してください",
  date: "日付の形式で入力してください（YYYY-MM-DD）",
  time: "時刻の形式で入力してください（HH:MM）",
  regex: "使える文字が決まっています。形式を確認してください",
  includes: "含まれていなければならない文字があります",
  starts_with: "決まった文字で始めてください",
  ends_with: "決まった文字で終えてください",
};

/**
 * issue から日本語の文言を作る。
 * 拾えない種類は `undefined` を返し、ロケール側へ委ねる。
 */
export function describeZodIssue(issue: ZodIssueLike): string | undefined {
  const exclusive = issue.inclusive === false;

  switch (issue.code) {
    case "invalid_type": {
      // 未入力・未選択が「expected string, received undefined」で出るのを防ぐ。
      // **利用者にとっては型の話ではなく「入れていない」だけ**
      if (issue.input == null) return "入力してください";
      if (issue.expected === "number") return "数値で入力してください";
      if (issue.expected === "boolean") return "選択してください";
      if (issue.expected === "date") return "日付を入力してください";
      return "入力の形式が正しくありません";
    }

    case "too_small": {
      if (issue.origin === "date") return "指定できる日付より前です";
      // 「1 文字以上」は要するに未入力。文字数を言われても直しようがない
      if (issue.origin === "string" && !exclusive && Number(issue.minimum) === 1) {
        return "入力してください";
      }
      const build = TOO_SMALL[issue.origin ?? ""] ?? TOO_SMALL.string;
      return build(num(issue.minimum), exclusive);
    }

    case "too_big": {
      if (issue.origin === "date") return "指定できる日付より後です";
      const build = TOO_BIG[issue.origin ?? ""] ?? TOO_BIG.string;
      return build(num(issue.maximum), exclusive);
    }

    case "invalid_format":
      return FORMAT[issue.format ?? ""] ?? "入力の形式が正しくありません";

    case "invalid_value": {
      const values = issue.values ?? [];
      if (values.length === 1) return `${String(values[0])} を指定してください`;
      return "選択肢から選んでください";
    }

    case "invalid_union":
    case "invalid_key":
    case "invalid_element":
      return "入力の形式が正しくありません";

    case "unrecognized_keys":
      return "扱えない項目が含まれています";

    case "not_multiple_of":
      return `${num(issue.divisor)} の倍数で入力してください`;

    // custom（refine / superRefine）は呼び出し側が文言を持っている
    default:
      return undefined;
  }
}
