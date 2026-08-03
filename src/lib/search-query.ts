/**
 * 検索キーワードを PostgREST のフィルタ式に埋め込める形に均す。
 *
 * `.or()` の引数は `,` で条件を割り `(` `)` でグループを作る文法なので、
 * ユーザー入力をそのまま埋めると式が壊れて検索が失敗する。
 * `.` も演算子の区切り（`col.ilike.value`）なので落とす。
 * `%` `_` は LIKE のワイルドカードで、意図しない広域一致になるため空白へ寄せる。
 */
export function sanitizeSearchTerm(input: string | null | undefined): string {
  return (input ?? "").replace(/[,()."'\\%_]/g, " ").trim();
}

/**
 * `ilike` に渡す前方後方一致パターンを作る。空文字なら null を返すので
 * 呼び出し側は「検索条件を付けない」判断ができる。
 */
export function buildIlikePattern(input: string | null | undefined): string | null {
  const safe = sanitizeSearchTerm(input);
  return safe ? `%${safe}%` : null;
}
