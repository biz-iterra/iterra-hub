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

/**
 * `[field] 本文` を分解する。
 *
 * 入力欄の近くにエラーを出すのに使う。プレフィックスを付けたままトーストに
 * 流すと `[code] コードを入力してください` のように内部名が利用者へ露出する。
 * 該当する入力欄が画面に無い場合もあるので、呼び出し側は field 不一致時の
 * 表示先（フォーム冒頭など）を用意すること。
 */
export function parseFieldError(
  message: string | null | undefined
): { field: string; message: string } | null {
  if (!message) return null;
  const matched = message.match(/^\[([A-Za-z0-9_]+)\]\s*([\s\S]+)$/);
  if (!matched) return null;
  return { field: matched[1], message: matched[2].trim() };
}

/**
 * Server Action そのものが失敗したときの文言。
 *
 * `error: string` を返す前にサーバー側で例外になった場合、呼び出し側の
 * Promise は reject する。ここで拾わないと画面は処理中のまま止まる。
 * 例外は英語（`Body exceeded 1 MB limit` / `Failed to fetch` 等）なので
 * 日本語へ寄せる。文言の正本は docs/error-messages.md。
 *
 * @param file 送信していたファイル。サイズを文言に含めるために受け取る
 */
export function describeTransportError(error: unknown, file?: File | null): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const sizeNote = file
    ? `（${file.name} / ${(file.size / 1024 / 1024).toFixed(2)}MB）`
    : "";

  if (/body exceeded|payload too large|413/i.test(raw)) {
    return `ファイルが大きすぎて送信できませんでした${sizeNote}。分割して取り込んでください`;
  }
  if (/failed to fetch|network|load failed/i.test(raw)) {
    return `サーバーとの通信が切れました${sizeNote}。取り込まれた件数を取込履歴で確認してから、やり直してください`;
  }
  if (/timeout|timed out|504|524/i.test(raw)) {
    return `処理が時間内に終わりませんでした${sizeNote}。件数を分けて取り込んでください`;
  }
  return `処理に失敗しました${sizeNote}${raw ? `（${raw}）` : ""}`;
}
