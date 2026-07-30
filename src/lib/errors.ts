/**
 * Server Action が返すエラー文字列の分類。
 *
 * Server Action は現状、入力値に紐づくエラー（Zod のフィールドエラー、
 * マスタ未投入で特定フィールドが解決できない等）と、入力と無関係なエラー
 * （認証・権限・楽観ロック競合・DB エラー）を 1 本の `error: string` で返す。
 *
 * トースト導入にあたり、前者は入力欄の近くにインライン表示、
 * 後者はトーストという住み分けにしたため、その判定をここに集約する。
 * 各画面で同じ判定を重複実装しないこと。
 *
 * 判定は文字列パターンに依存する暫定実装。
 * 恒久対応は Server Action の戻り値を { fieldErrors, error } に分けること
 * （contacts / talents は既に fieldErrors を返す設計なので、他エンティティを揃える）。
 */

/** Zod のフィールドエラーは "[field] message / 受信値: ..." 形式で返る（CLAUDE.md のバリデーション規約） */
const FIELD_ERROR_PREFIX = "[";

/** マスタ未投入エラーは特定フィールド（生年月日等）の入力に起因するのでインライン扱い */
const MASTER_ERROR_KEYWORD = "マスタ";

export function isFieldValidationError(message: string | null | undefined): boolean {
  if (!message) return false;
  return (
    message.startsWith(FIELD_ERROR_PREFIX) || message.includes(MASTER_ERROR_KEYWORD)
  );
}
