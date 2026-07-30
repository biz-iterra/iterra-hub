import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { getCurrentUser } from "@/actions/users";
import type { CrmUserRole } from "@/types/enums";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: currentUser } = await getCurrentUser();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar userRole={(currentUser?.role as CrmUserRole) ?? "member"} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header userName={currentUser?.full_name} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
