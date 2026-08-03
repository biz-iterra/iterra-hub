import { getContacts } from "@/actions/contacts";
import { getContactStatuses } from "@/actions/masters";
import { getCrmUsers } from "@/actions/users";
import { getPendingCandidateCount } from "@/actions/email-sync";
import { countPendingMergeCandidates } from "@/actions/contact-merge";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import { parseSearchParams } from "@/lib/list-params";
import { LIST_FILTER_KEYS } from "@/lib/list-sort";
import { ContactsView } from "./contacts-view";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // 一覧の条件は URL に載っている。詳細から戻ってきたときも同じ条件で描くため、
  // サーバー側の初回取得もクエリを見る（クライアントで取り直さずに済む）
  const state = parseSearchParams(await searchParams, LIST_FILTER_KEYS.contacts);

  const [contactsResult, statusesResult, usersResult, candidateCount, mergeCount] =
    await Promise.all([
      getContacts({
        statusId: state.filters.statusId || undefined,
        contactType: state.filters.contactType || undefined,
        ownerUserId: state.filters.ownerUserId || undefined,
        search: state.filters.search || undefined,
        perPage: DEFAULT_PAGE_SIZE,
        page: state.page,
        sortField: state.sort?.field,
        sortDirection: state.sort?.direction,
      }),
      getContactStatuses(),
      getCrmUsers(),
      // member は 0 が返る（候補の閲覧は manager 以上）
      getPendingCandidateCount(),
      // RLS により、自分が担当する連絡先が絡む候補だけが数えられる
      countPendingMergeCandidates(),
    ]);

  return (
    <ContactsView
      initialData={contactsResult.data}
      statuses={statusesResult.data ?? []}
      users={usersResult.data ?? []}
      pendingCandidateCount={candidateCount.data ?? 0}
      mergeCandidateCount={mergeCount}
    />
  );
}
