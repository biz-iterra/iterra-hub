"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useListParams } from "@/hooks/useListParams";
import {
  buildListQuery,
  parseListState,
  type ListState,
  type SortState,
} from "@/lib/list-params";

type LoadResult<T> = { data: T | null; error: string | null };

/**
 * 一覧画面の共通の振る舞い。
 *
 * - 条件（フィルタ・ページ・並び順）を URL に置く（詳細から戻っても消えない）
 * - URL が変わったら Server Action を呼び直す
 * - サーバーが最初に描いた分は取り直さない
 *
 * 各一覧は「どのフィルタを持つか」と「どう取得するか」だけを渡す。
 *
 * @param filterKeys この一覧が扱うフィルタ名
 * @param initialData Server Component が現在の URL の条件で取得済みのデータ
 * @param load 条件から一覧を取り直す Server Action の呼び出し
 */
export function useListView<T>({
  filterKeys,
  initialData,
  load,
}: {
  filterKeys: readonly string[];
  initialData: T | null;
  load: (state: ListState) => Promise<LoadResult<T>>;
}) {
  const params = useListParams(filterKeys);
  const [data, setData] = useState<T | null>(initialData);
  const [isPending, startTransition] = useTransition();

  const state: ListState = {
    filters: params.filters,
    page: params.page,
    sort: params.sort,
  };
  const query = buildListQuery(state);

  // サーバーが描いた分の条件。これと同じ間は取り直さない。
  // 初期化に query を使うので、マウント直後の 1 回目は必ずスキップされる
  const loadedQuery = useRef<string | null>(query);
  // load は各画面でインラインに書かれる想定で、毎レンダー新しい関数になる。
  // 依存に入れると無限ループするため ref 経由で最新を読む
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (loadedQuery.current === query) return;
    loadedQuery.current = query;

    startTransition(async () => {
      const result = await loadRef.current(
        parseListState(new URLSearchParams(query), filterKeys)
      );
      // エラー時は前のデータを残す。空にすると「0 件」と区別が付かない
      if (result.data) setData(result.data);
    });
    // filterKeys は呼び出し側でモジュールスコープの定数を渡す想定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const setSort = useCallback(
    (next: SortState) => {
      // DataTable が次の状態を確定させて渡してくるので、そのまま URL へ入れる
      params.setSortState(next);
    },
    [params]
  );

  return {
    filters: params.filters,
    page: params.page,
    sort: params.sort,
    hasCondition: params.hasCondition,
    setFilter: params.setFilter,
    setFilters: params.setFilters,
    setPage: params.setPage,
    setSort,
    clear: params.clear,
    isPending,
    data,
  };
}

