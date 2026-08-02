import { getChangeLogs, getChangeLogTables } from "@/actions/change-logs";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import { ChangeLogsView } from "./logs-view";

/**
 * 変更履歴。
 *
 * 参照範囲は RLS が決める（manager 以上は全件、それ以外は自分の変更のみ）ので、
 * ここでは役割で弾かない。誰でも自分の操作は追える。
 */
export default async function ChangeLogsPage() {
  const [{ data, error }, { data: tables }] = await Promise.all([
    getChangeLogs({ perPage: DEFAULT_PAGE_SIZE, page: 1 }),
    getChangeLogTables(),
  ]);

  if (error) {
    return (
      <div style={{ padding: "2rem" }}>
        <p style={{ color: "var(--color-error)", fontSize: "0.875rem" }}>{error}</p>
      </div>
    );
  }

  return <ChangeLogsView initialData={data} tables={tables ?? []} />;
}
