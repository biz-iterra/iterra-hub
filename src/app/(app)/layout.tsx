import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUser } from "@/actions/users";
import { ToastProvider } from "@/components/ui/toast";
import type { CrmUserRole } from "@/types/enums";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: currentUser } = await getCurrentUser();

  return (
    <ToastProvider>
      <AppShell
        userRole={(currentUser?.role as CrmUserRole) ?? "member"}
        userName={currentUser?.full_name}
      >
        {children}
      </AppShell>
    </ToastProvider>
  );
}
