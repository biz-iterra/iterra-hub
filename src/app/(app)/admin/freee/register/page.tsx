import { redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/users";
import { listCompaniesWithoutFreeePartner } from "@/actions/freee";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import { parseSearchParams } from "@/lib/list-params";
import { LIST_FILTER_KEYS } from "@/lib/list-sort";
import { FreeeRegisterView } from "./freee-register-view";

/**
 * CRM にあって freee に無い事業者を、freee の取引先として登録する画面。
 *
 * **登録のときにしか取引先コードを入れられない**（更新 API は `code` を
 * 受け付けない。docs/database-design.md §26.8）。ここで作った相手は以後
 * コードで確実に突合できる。
 *
 * freee は取引先名の重複を許すため、**登録の前に似た取引先を必ず確認させる**。
 */
export default async function FreeeRegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const me = await getCurrentUser();
  if (me.data?.role !== "admin") {
    redirect("/dashboard");
  }

  // 条件は URL に載っている。登録して戻っても同じ条件で描く
  const state = parseSearchParams(await searchParams, LIST_FILTER_KEYS.freeeRegister);

  const result = await listCompaniesWithoutFreeePartner({
    search: state.filters.search || undefined,
    page: state.page,
    perPage: DEFAULT_PAGE_SIZE,
  });

  return <FreeeRegisterView initialData={result.data} loadError={result.error} />;
}
