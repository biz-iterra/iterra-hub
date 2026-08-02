"use server";

import { createClient } from "@/lib/supabase/server";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import type { Paged } from "@/types/relations";

/**
 * 変更履歴。
 *
 * `entity_change_logs` はトリガーが全経路を自動記録する（画面・Server Action・
 * service_role・SQL 直接操作のいずれも）。**アプリからは INSERT しない。**
 *
 * 参照範囲は RLS が決める（manager 以上は全件、それ以外は自分の変更のみ）。
 */

type ActionResult<T> = { data: T | null; error: string | null };

export type ChangeLogRow = {
  id: string;
  table_name: string;
  record_id: string;
  operation: string;
  changed_fields: unknown;
  changed_at: string;
  changed_by: { id: string; full_name: string } | null;
};

export async function getChangeLogs(params?: {
  tableName?: string;
  operation?: string;
  page?: number;
  perPage?: number;
}): Promise<ActionResult<Paged<ChangeLogRow>>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "認証が必要です" };

  const page = params?.page ?? 1;
  const perPage = params?.perPage ?? DEFAULT_PAGE_SIZE;
  const from = (page - 1) * perPage;

  let query = supabase
    .from("entity_change_logs")
    .select(
      "id, table_name, record_id, operation, changed_fields, changed_at, changed_by:crm_users!entity_change_logs_changed_by_fkey(id, full_name)",
      { count: "exact" }
    );

  if (params?.tableName) query = query.eq("table_name", params.tableName);
  if (params?.operation) query = query.eq("operation", params.operation);

  const { data, error, count } = await query
    .order("changed_at", { ascending: false })
    .range(from, from + perPage - 1);

  if (error) return { data: null, error: error.message };

  return {
    data: {
      rows: (data ?? []) as unknown as ChangeLogRow[],
      total: count ?? 0,
    },
    error: null,
  };
}

/** 絞り込みに出す対象。記録のあるものだけを並べる */
export async function getChangeLogTables(): Promise<ActionResult<string[]>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "認証が必要です" };

  // DISTINCT は PostgREST で取れないので、件数の多い方から拾って重複を除く。
  // 対象テーブルは 9 つなので先頭 1000 行あれば全部出る
  const { data, error } = await supabase
    .from("entity_change_logs")
    .select("table_name")
    .order("changed_at", { ascending: false })
    .limit(1000);

  if (error) return { data: null, error: error.message };

  return {
    data: [...new Set((data ?? []).map((r) => r.table_name))].sort(),
    error: null,
  };
}
