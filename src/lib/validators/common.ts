import { z } from "zod";
import { ja } from "zod/locales";
import { describeZodIssue } from "./error-map";

// **Zod の既定文言（英語）を画面に出さないための設定**（docs/error-messages.md §1）。
// ここは全 validator が読み込む土台なので、置き場所として選んでいる。
// 個別のスキーマに `error:` を書いてあればそちらが勝つ。
z.config({
  customError: (issue) => describeZodIssue(issue as Parameters<typeof describeZodIssue>[0]),
  // customError で拾えなかった種類の受け皿。Zod を上げて issue が増えても英語にならない
  localeError: ja().localeError,
});

// PostgreSQL UUID 型は RFC 4122 のバージョンビットを検査せず、8-4-4-4-12 の hex 形式なら受け入れる。
// 一方 Zod 標準の .uuid() は version/variant ビットまで検査するため、開発用 seed（c0000000-0000-...）が弾かれる。
// 両者を橋渡しするため、Postgres と同じ寛容な形式でチェックする。
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 未選択（null / undefined）でも同じ文言を出す。既定のままだと
// "Invalid input: expected string, received null" が画面に出る
export const uuidString = (message?: string) =>
  z
    .string({ error: message ?? "UUID 形式で指定してください" })
    .regex(UUID_REGEX, message ?? "UUID 形式で指定してください");

// UUID
export const uuidSchema = uuidString();

// 任意UUID（nullable フォームフィールド用）
export const optionalUuidSchema = uuidString().nullable().optional();

// ページネーション
export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  perPage: z.number().int().min(1).max(100).default(20),
});

// ソート
export const sortSchema = z.object({
  field: z.string(),
  direction: z.enum(["asc", "desc"]).default("desc"),
});

// ---------- マスタ共通フィールドスキーマ ----------

/**
 * マスタの内部コード（code / slug）。
 *
 * URL・条件分岐・seed の識別子として使うため、DB 側の CHECK 制約
 * （`^[a-z][a-z0-9_]{0,31}$`）と同じ形式に揃える。ここを緩めると
 * DB で弾かれた生の Postgres エラーが画面に出る。
 *
 * 空文字は「未入力」として必須エラーの文言を出す（フォームは空欄を
 * 空文字で送ってくるため、min(1) だけでは意図が伝わらない文言になる）。
 */
export const masterCodeSchema = (
  field: "code" | "slug",
  label: string,
  example: string
) =>
  z
    .string({ error: `[${field}] ${label}を入力してください` })
    .min(1, { message: `[${field}] ${label}を入力してください` })
    .max(32, { message: `[${field}] ${label}は32文字以内で入力してください` })
    .regex(/^[a-z][a-z0-9_]{0,31}$/, {
      message: `[${field}] ${label}は半角英小文字で始め、半角英数字とアンダースコアのみで入力してください（例: ${example}）`,
    });

/** マスタの名称。上限は DB の CHECK 制約に合わせて呼び出し側で指定する */
export const masterNameSchema = (max: number) =>
  z
    .string({ error: "[name] 名称を入力してください" })
    .min(1, { message: "[name] 名称を入力してください" })
    .max(max, { message: `[name] 名称は${max}文字以内で入力してください` });

/** マスタの定義・説明文。空欄は「無し」として NULL に寄せる */
export const masterDefinitionSchema = z.preprocess(
  (v) => (v === "" ? null : v),
  z
    .string()
    .max(1000, { message: "[definition] 定義は1000文字以内で入力してください" })
    .nullable()
    .optional()
);

/**
 * バッジ色。ステータス／ステージ系マスタで共通に使う。
 * 表示側は受け取った値をそのまま style に入れるため、形式を厳密に縛る。
 *
 * 空欄は「色を指定しない」（表示側のフォールバック配色）を意味する NULL に
 * 正規化する。空文字のまま渡すと DB の CHECK 制約でも弾かれる。
 */
export const badgeColorSchema = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, {
      message: "[color] バッジ色は # と16進数6桁で入力してください（例: #E53935）",
    })
    .nullable()
    .optional()
);

/**
 * 表示順。DB 側に `CHECK (sort_order >= 0)` があるので下限を合わせる。
 * 空欄は 0 として扱う（フォームの既定値と同じ）。
 */
export const sortOrderSchema = z.preprocess(
  (v) => (v === "" || v === null ? undefined : v),
  z
    .number({ error: "[sort_order] 表示順は数値で入力してください" })
    .int({ message: "[sort_order] 表示順は整数で入力してください" })
    .min(0, { message: "[sort_order] 表示順は0以上の整数で入力してください" })
    .default(0)
);

/** 表示順（更新用）。未指定なら変更しないので default を持たせない */
export const sortOrderUpdateSchema = z.preprocess(
  (v) => (v === "" || v === null ? undefined : v),
  z
    .number({ error: "[sort_order] 表示順は数値で入力してください" })
    .int({ message: "[sort_order] 表示順は整数で入力してください" })
    .min(0, { message: "[sort_order] 表示順は0以上の整数で入力してください" })
    .optional()
);

// ---------- 共通フィールドスキーマ ----------

// メールスキーマ（空文字は null に変換、undefined 許容）
export const emailSchema = z
  .string()
  .email("[email] メール形式で入力してください")
  .max(255, "[email] メールアドレスは255文字以内で入力してください")
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));

// 電話番号スキーマ（最大 20 文字）
export const phoneSchema = z
  .string()
  .max(20, "[phone] 電話番号は20文字以内で入力してください")
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));

// 法人番号スキーマ（13桁数字のみ）
export const corporateNumberSchema = z
  .string()
  .regex(/^\d{13}$/, "[corporate_number] 法人番号は13桁の数字で入力してください")
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));

/**
 * 楽観ロック用フィールド。
 * 編集画面を開いた時点の updated_at を往復させ、更新時の WHERE 条件に含める。
 * 未指定の場合はロックなし（後方互換）で従来どおり後勝ちになる。
 */
export const expectedUpdatedAtSchema = z.string().optional();

/** 競合検知時の共通エラーメッセージ */
export function conflictErrorMessage(entityLabel: string): string {
  return `${entityLabel}は他のユーザーによって更新されています。画面を再読み込みしてから保存してください`;
}

// URL スキーマ
export const urlSchema = z
  .string()
  .max(500, "[url] URLは500文字以内で入力してください")
  .url("[url] URL 形式で入力してください")
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));

/**
 * 生年月日スキーマ。
 *
 * ポテンシャル診断（potential_number / constellation_id）は birth_date から
 * 算出されるため、未来日が入ると診断結果が意味を持たなくなる。
 * 空文字は「未入力」として null に寄せる。
 */
export const birthDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "[birth_date] 日付形式（YYYY-MM-DD）で入力してください")
  .refine(
    (v) => {
      const d = new Date(`${v}T00:00:00Z`);
      if (Number.isNaN(d.getTime())) return false;
      // 実在日チェック（2026-02-30 のような値を弾く）
      return d.toISOString().slice(0, 10) === v;
    },
    { message: "[birth_date] 存在しない日付です" }
  )
  .refine((v) => v <= new Date().toISOString().slice(0, 10), {
    message: "[birth_date] 生年月日に未来の日付は指定できません",
  })
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));
