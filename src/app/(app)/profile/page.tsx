import { getCurrentUser } from "@/actions/users";
import { getMyGmailConnections, getGmailSetupStatus } from "@/actions/email-sync";
import {
  getGoogleContactsSetupStatus,
  getMyGoogleContactConnections,
} from "@/actions/google-contacts";
import { ProfileForm } from "./profile-form";
import { GmailConnectionsSection } from "@/components/profile/GmailConnectionsSection";
import { GoogleContactsSection } from "@/components/profile/GoogleContactsSection";
import { formContainerClass } from "@/lib/layout";

export default async function ProfilePage({
  searchParams,
}: {
  // 連携の結果は /api/gmail/callback と /api/google-contacts/callback から
  // クエリで戻る
  searchParams: Promise<{
    gmail_connected?: string;
    gmail_error?: string;
    google_contacts_connected?: string;
    google_contacts_error?: string;
  }>;
}) {
  const [
    { data: currentUser, error },
    connections,
    setup,
    contactConnections,
    contactSetup,
    params,
  ] = await Promise.all([
    getCurrentUser(),
    getMyGmailConnections(),
    getGmailSetupStatus(),
    getMyGoogleContactConnections(),
    getGoogleContactsSetupStatus(),
    searchParams,
  ]);

  if (error || !currentUser) {
    return (
      <div className={formContainerClass}>
        <p style={{ color: "var(--color-error)" }}>
          {error ?? "ユーザー情報の取得に失敗しました"}
        </p>
      </div>
    );
  }

  return (
    <>
      <ProfileForm user={currentUser} />
      <div className={formContainerClass}>
        <GmailConnectionsSection
          connections={connections.data ?? []}
          configured={setup.data?.configured ?? false}
          connectedEmail={params.gmail_connected}
          connectError={params.gmail_error}
        />
        <GoogleContactsSection
          connections={contactConnections.data ?? []}
          configured={contactSetup.data?.configured ?? false}
          connectedEmail={params.google_contacts_connected}
          connectError={params.google_contacts_error}
        />
      </div>
    </>
  );
}
