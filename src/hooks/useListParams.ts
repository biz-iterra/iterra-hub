"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  buildListQuery,
  nextSortState,
  parseListState,
  type ListState,
  type SortState,
} from "@/lib/list-params";

/**
 * 一覧の状態（フィルタ・ページ・並び順）を URL のクエリで持つ。
 *
 * 詳細ページへ移動して戻ったとき、クライアントコンポーネントは作り直される。
 * `useState` に置いた条件はそこで消えるが、URL にあれば復元できる。
 *
 * 履歴の扱い:
 *   - 一覧内の操作（フィルタ・ページ・並び替え）は `replace`。
 *     条件を変えるたびに履歴が積まれると、戻るボタンで一覧から抜けるのに
 *     何度も押すことになる
 *   - 詳細への遷移は通常の `push`（各画面のリンクのまま）。
 *     戻ると一覧の URL に戻り、条件が復元される
 *
 * @param filterKeys この一覧が扱うフィルタ名。ここに無いクエリは読まない
 */
export function useListParams(filterKeys: readonly string[]) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // filterKeys は呼び出し側でリテラル配列として渡される想定だが、
  // 毎レンダーで新しい配列になっても再計算が走らないよう中身で比較する
  const keysKey = filterKeys.join(",");
  const state = useMemo(
    () => parseListState(searchParams, keysKey ? keysKey.split(",") : []),
    [searchParams, keysKey]
  );

  const apply = useCallback(
    (next: ListState) => {
      const query = buildListQuery(next);
      // scroll: false … 一覧の途中で絞り込んだときに先頭へ飛ばさない
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname]
  );

  /** フィルタを 1 つ変える。条件が変わると件数も変わるので 1 ページ目へ戻す */
  const setFilter = useCallback(
    (key: string, value: string) => {
      apply({ ...state, filters: { ...state.filters, [key]: value }, page: 1 });
    },
    [apply, state]
  );

  /** 複数のフィルタをまとめて変える（連動する条件がある画面向け） */
  const setFilters = useCallback(
    (values: Record<string, string>) => {
      apply({ ...state, filters: { ...state.filters, ...values }, page: 1 });
    },
    [apply, state]
  );

  const setPage = useCallback(
    (page: number) => {
      apply({ ...state, page });
    },
    [apply, state]
  );

  /** 列見出しを押したとき。昇順 → 降順 → 解除 で回す */
  const toggleSort = useCallback(
    (field: string) => {
      apply({ ...state, sort: nextSortState(state.sort, field), page: 1 });
    },
    [apply, state]
  );

  /**
   * 並び順を直接指定する。
   * DataTable は次の状態を確定させて渡してくるので、そちらはこれを使う。
   * 並び替えると表示位置が変わるため 1 ページ目へ戻す
   */
  const setSortState = useCallback(
    (sort: SortState) => {
      apply({ ...state, sort, page: 1 });
    },
    [apply, state]
  );

  /** 「リセット」。並び順も含めて条件をすべて捨てる */
  const clear = useCallback(() => {
    apply({ filters: {}, page: 1, sort: null });
  }, [apply]);

  return {
    filters: state.filters,
    page: state.page,
    sort: state.sort as SortState,
    /** 何か 1 つでも条件が付いているか（「リセット」の出し分けに使う） */
    hasCondition:
      Object.values(state.filters).some(Boolean) || state.page > 1 || state.sort !== null,
    setFilter,
    setFilters,
    setPage,
    toggleSort,
    setSortState,
    clear,
  };
}
