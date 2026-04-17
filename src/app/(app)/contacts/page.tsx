import { getContacts } from "@/actions/contacts";
import { ContactsView } from "./contacts-view";

export default async function ContactsPage() {
  const { data } = await getContacts();
  return <ContactsView initialData={data} />;
}
