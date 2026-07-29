import { getContacts } from "@/actions/contacts";
import { getContactStatuses } from "@/actions/masters";
import { getCrmUsers } from "@/actions/users";
import { ContactsView } from "./contacts-view";

export default async function ContactsPage() {
  const [contactsResult, statusesResult, usersResult] = await Promise.all([
    getContacts({ perPage: 50, page: 1 }),
    getContactStatuses(),
    getCrmUsers(),
  ]);

  return (
    <ContactsView
      initialData={contactsResult.data}
      statuses={statusesResult.data ?? []}
      users={usersResult.data ?? []}
    />
  );
}
