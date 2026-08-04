import { redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/users";
import { listFreeePartners } from "@/actions/freee";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import { parseSearchParams } from "@/lib/list-params";
import { LIST_FILTER_KEYS } from "@/lib/list-sort";
import { FreeePartnersView } from "./freee-partners-view";

/** 既定は未紐付けだけを見せる（突合すべきものが最初に出る） */
const DEFAULT_LINK_STATUS = "unlinked";

export default async function FreeePartnersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const me = await getCurrentUser();
  if (me.data?.role !== "admin") {
    redirect("/dashboard");
  }

  // 条件は URL に載っている。詳細を開いて戻っても同じ条件で描く
  const state = parseSearchParams(await searchParams, LIST_FILTER_KEYS.freeePartners);

  const result = await listFreeePartners({
    linkStatus: state.filters.linkStatus ?? DEFAULT_LINK_STATUS,
    search: state.filters.search || undefined,
    includeInactive: state.filters.includeInactive === "1",
    page: state.page,
    perPage: DEFAULT_PAGE_SIZE,
  });

  return (
    <FreeePartnersView
      initialData={result.data}
      loadError={result.error}
      defaultLinkStatus={DEFAULT_LINK_STATUS}
    />
  );
}
