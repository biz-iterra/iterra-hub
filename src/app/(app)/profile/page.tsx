import { getCurrentUser } from "@/actions/users";
import { getMyGmailConnections, getGmailSetupStatus } from "@/actions/email-sync";
import { ProfileForm } from "./profile-form";
import { GmailConnectionsSection } from "@/components/profile/GmailConnectionsSection";
import { formContainerStyle } from "@/lib/layout";

export default async function ProfilePage({
  searchParams,
}: {
  // 連携の結果は /api/gmail/callback からクエリで戻る
  searchParams: Promise<{ gmail_connected?: string; gmail_error?: string }>;
}) {
  const [{ data: currentUser, error }, connections, setup, params] = await Promise.all([
    getCurrentUser(),
    getMyGmailConnections(),
    getGmailSetupStatus(),
    searchParams,
  ]);

  if (error || !currentUser) {
    return (
      <div style={formContainerStyle}>
        <p style={{ color: "var(--color-error)" }}>
          {error ?? "ユーザー情報の取得に失敗しました"}
        </p>
      </div>
    );
  }

  return (
    <>
      <ProfileForm user={currentUser} />
      <div style={formContainerStyle}>
        <GmailConnectionsSection
          connections={connections.data ?? []}
          configured={setup.data?.configured ?? false}
          connectedEmail={params.gmail_connected}
          connectError={params.gmail_error}
        />
      </div>
    </>
  );
}
