/**
 * Server Action 側で並び順を組み立てる共通部品。
 *
 * 並び順は URL のクエリ由来なので、利用者が自由に書き換えられる。
 * 未知の列名をそのまま `order()` に渡すと Postgres の生エラーが
 * 画面に出るため、必ずここでホワイトリストに通す。
 */

import { resolveSort, type SortState } from "@/lib/list-params";

/** 並び替えを受け付ける Server Action が共通で受け取る引数 */
export type SortParams = {
  sortField?: string;
  sortDirection?: "asc" | "desc";
};

/**
 * 一覧ごとの「並び替えを許す列」。
 *
 * Server Action（`"use server"`）のファイルは async 関数しか export できないため、
 * 定数はここに置く。画面（DataTable の `sortKey`）と Server Action の両方が
 * これを参照することで、片方だけ増えて動かない列が生まれないようにする。
 *
 * 列名は DB のカラム名。埋め込み先のテーブルの列（`company.name` など）は
 * PostgREST の order でそのまま扱えないので入れない。
 */
/**
 * 一覧ごとの「URL に載せるフィルタ名」。
 *
 * Server Component（page.tsx）とクライアントの一覧ビューが同じ定義を使う。
 * `"use client"` のファイルに置くと Server Component から値として読めないので、
 * 両方から import できるここに置く。
 */
export const LIST_FILTER_KEYS = {
  contacts: ["statusId", "contactType", "ownerUserId", "search"],
  companies: ["statusId", "corporateTypeId", "ownerUserId", "search"],
  accounts: ["statusId", "typeId", "ownerUserId", "search"],
  // 商談はカンバンと表を切り替えるので、表示モードと分類軸も条件として持つ。
  // どちらの画面から詳細へ入っても、戻ったとき同じ見え方に復元する
  deals: [
    "view",
    "pipelineId",
    "groupBy",
    "kanbanColumn",
    "stageId",
    "statusId",
    "ownerUserId",
    "search",
  ],
  contracts: ["typeId", "methodId", "search"],
  projects: ["statusId", "ownerUserId", "search"],
  campaigns: ["type", "status", "search"],
  talents: ["potentialType", "search"],
  leads: ["stageId", "statusId", "categoryId", "temperatureId", "ownerUserId", "search"],
  // freee 取引先の突合。既定は未紐付けだけを見るが、状態を切り替えて確認する
  freeePartners: ["linkStatus", "includeInactive", "search"],
} as const satisfies Record<string, readonly string[]>;

export const SORT_FIELDS = {
  contacts: ["last_name", "contact_code", "created_at", "updated_at"],
  companies: ["name", "sort_key", "company_code", "created_at", "updated_at"],
  accounts: ["name", "account_code", "created_at", "updated_at"],
  deals: ["name", "deal_code", "amount", "expected_close_date", "created_at", "updated_at"],
  contracts: ["contract_code", "contract_name", "contract_date", "created_at", "updated_at"],
  projects: ["name", "project_code", "start_date", "end_date", "created_at", "updated_at"],
  campaigns: ["name", "start_date", "end_date", "created_at", "updated_at"],
  talents: ["created_at", "updated_at"],
  leads: ["lead_name", "company_name", "score", "created_at", "updated_at"],
} as const satisfies Record<string, readonly string[]>;

/**
 * 実際に適用する並び順を決める。
 *
 * @param params 画面から渡ってきた指定
 * @param allowed 並び替えを許す列名
 * @param fallback 指定が無い / 許可されていないときの既定
 */
export function resolveListSort(
  params: SortParams | undefined,
  allowed: readonly string[],
  fallback: { field: string; direction: "asc" | "desc" }
): { field: string; direction: "asc" | "desc" } {
  const requested: SortState =
    params?.sortField && params.sortDirection
      ? { field: params.sortField, direction: params.sortDirection }
      : null;

  return resolveSort(requested, allowed) ?? fallback;
}

/**
 * PostgREST の `.order()` に渡す形へ。
 *
 * NULL の扱いを明示する。既定では昇順で NULL が最後、降順で最初になるが、
 * 「未設定の行が先頭に来る」のは一覧として読みにくいので、
 * どちらの向きでも NULL を最後に送る。
 */
export function toOrderArgs(sort: { field: string; direction: "asc" | "desc" }): [
  string,
  { ascending: boolean; nullsFirst: boolean },
] {
  return [sort.field, { ascending: sort.direction === "asc", nullsFirst: false }];
}
