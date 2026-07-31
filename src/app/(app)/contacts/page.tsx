import { getContacts } from "@/actions/contacts";
import { getContactStatuses } from "@/actions/masters";
import { getCrmUsers } from "@/actions/users";
import { getPendingCandidateCount } from "@/actions/email-sync";
import { ContactsView } from "./contacts-view";

export default async function ContactsPage() {
  const [contactsResult, statusesResult, usersResult, candidateCount] =
    await Promise.all([
      getContacts({ perPage: 50, page: 1 }),
      getContactStatuses(),
      getCrmUsers(),
      // member は 0 が返る（候補の閲覧は manager 以上）
      getPendingCandidateCount(),
    ]);

  return (
    <ContactsView
      initialData={contactsResult.data}
      statuses={statusesResult.data ?? []}
      users={usersResult.data ?? []}
      pendingCandidateCount={candidateCount.data ?? 0}
    />
  );
}
