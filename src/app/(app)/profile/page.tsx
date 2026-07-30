import { getCurrentUser } from "@/actions/users";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const { data: currentUser, error } = await getCurrentUser();

  if (error || !currentUser) {
    return (
      <div style={{ padding: "1.5rem", maxWidth: 960, margin: "0 auto" }}>
        <p style={{ color: "var(--color-error)" }}>
          {error ?? "ユーザー情報の取得に失敗しました"}
        </p>
      </div>
    );
  }

  return <ProfileForm user={currentUser} />;
}
