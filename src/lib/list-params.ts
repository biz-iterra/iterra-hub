/**
 * 一覧画面の状態（フィルタ・ページ・並び順）を URL のクエリで持つための共通部品。
 *
 * これまでは各一覧が `useState` で持っていたため、詳細ページへ移動して
 * 戻ってくるとクライアントコンポーネントが作り直されて条件が消えていた。
 * URL に置けばブラウザの戻るで復元でき、条件付きの一覧をそのまま
 * 共有・ブックマークもできる。
 *
 * ここは純粋関数だけを置く（フックは `src/hooks/useListParams.ts`）。
 */

/** 並び順。`null` は「並び替えを指定していない」= 各一覧の既定順 */
export type SortState = { field: string; direction: "asc" | "desc" } | null;

/** 一覧が URL に持つ状態 */
export type ListState = {
  /** フィルタ。値が空文字のものは URL に出さない */
  filters: Record<string, string>;
  page: number;
  sort: SortState;
};

/** ページ番号のクエリ名。フィルタ名と衝突しないよう固定で予約する */
export const PAGE_PARAM = "page";
/** 並び順のクエリ名。`field:direction` の形で入れる */
export const SORT_PARAM = "sort";

const RESERVED = new Set([PAGE_PARAM, SORT_PARAM]);

/**
 * URL のクエリから一覧の状態を読む。
 *
 * @param search URLSearchParams（`useSearchParams()` の戻り値も渡せる）
 * @param filterKeys この一覧が扱うフィルタ名。ここに無いクエリは無視する
 *   （他の機能が付けたクエリを Server Action へ横流ししないため）
 */
export function parseListState(
  search: URLSearchParams | { get(name: string): string | null },
  filterKeys: readonly string[]
): ListState {
  const filters: Record<string, string> = {};
  for (const key of filterKeys) {
    if (RESERVED.has(key)) continue;
    const value = search.get(key);
    if (value) filters[key] = value;
  }

  const rawPage = Number.parseInt(search.get(PAGE_PARAM) ?? "", 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;

  return { filters, page, sort: parseSort(search.get(SORT_PARAM)) };
}

/**
 * Server Component の `searchParams` から一覧の状態を読む。
 *
 * App Router の `searchParams` は同名クエリが複数あると配列になる。
 * 一覧の条件は 1 つずつなので、配列で来たものは無視する
 * （URL を手で書き換えられても意図しない値が混ざらない）。
 */
export function parseSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
  filterKeys: readonly string[]
): ListState {
  const entries = Object.entries(searchParams).flatMap(([key, value]) =>
    typeof value === "string" ? [[key, value] as [string, string]] : []
  );
  return parseListState(new URLSearchParams(entries), filterKeys);
}

/** `field:direction` を分解する。壊れた値は「指定なし」として捨てる */
export function parseSort(raw: string | null | undefined): SortState {
  if (!raw) return null;
  const [field, direction] = raw.split(":");
  if (!field) return null;
  if (direction !== "asc" && direction !== "desc") return null;
  return { field, direction };
}

/** SortState を URL に入れる形へ */
export function formatSort(sort: SortState): string | null {
  return sort ? `${sort.field}:${sort.direction}` : null;
}

/**
 * 状態から URL のクエリ文字列を組み立てる。
 *
 * 既定値（1 ページ目・並び順なし・空のフィルタ）は入れない。
 * 何も操作していない状態の URL を `/contacts?page=1` のように
 * 汚さないため。
 */
export function buildListQuery(state: ListState): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(state.filters)) {
    if (value) params.set(key, value);
  }
  if (state.page > 1) params.set(PAGE_PARAM, String(state.page));

  const sort = formatSort(state.sort);
  if (sort) params.set(SORT_PARAM, sort);

  // 見た目を安定させるため名前順に並べる（同じ条件なら常に同じ URL になる）
  params.sort();
  return params.toString();
}

/**
 * 列見出しを押したときの次の並び順を決める。
 *
 * 同じ列: 昇順 → 降順 → 解除（既定順に戻す）の 3 段階。
 * 解除を挟むのは、一度並び替えた後に既定順へ戻す手段が他に無いため。
 */
export function nextSortState(current: SortState, field: string): SortState {
  if (!current || current.field !== field) return { field, direction: "asc" };
  if (current.direction === "asc") return { field, direction: "desc" };
  return null;
}

/**
 * 並び順の指定が許可された列かを判定する。
 *
 * クエリは利用者が自由に書き換えられるので、Server Action へ渡す前に
 * ホワイトリストで絞る。未知の列名をそのまま `order()` に渡すと
 * DB エラーの原文が画面に出る。
 */
export function resolveSort(
  sort: SortState,
  allowedFields: readonly string[]
): SortState {
  if (!sort) return null;
  return allowedFields.includes(sort.field) ? sort : null;
}
