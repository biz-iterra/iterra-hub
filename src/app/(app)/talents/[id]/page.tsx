import { getTalent } from "@/actions/talents";
import { getTalentProfile, getTalentAchievements, getTalentAchievementsMaster } from "@/actions/talent-classification";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { TalentDetailClient } from "./talent-detail-client";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TalentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!UUID_REGEX.test(id)) {
    return (
      <div style={{ padding: "2rem" }}>
        <p style={{ color: "var(--color-text-body)", marginBottom: "1rem" }}>
          不正なパラメータです
        </p>
        <Link
          href="/talents"
          className="hover:bg-[var(--color-bg-hover)]"
          style={{
            color: "var(--color-terra)",
            padding: "0.125rem 0.375rem",
            margin: "-0.125rem -0.375rem",
            borderRadius: "var(--radius-sm)",
            transition: "background-color 0.15s",
          }}
        >
          タレント一覧へ戻る
        </Link>
      </div>
    );
  }

  const { data: talent, error } = await getTalent(id);

  if (error || !talent) {
    return (
      <div style={{ padding: "2rem" }}>
        <p style={{ color: "var(--color-text-body)", marginBottom: "1rem" }}>
          タレントが見つかりません
        </p>
        <Link
          href="/talents"
          className="hover:bg-[var(--color-bg-hover)]"
          style={{
            color: "var(--color-sumi600)",
            padding: "0.125rem 0.375rem",
            margin: "-0.125rem -0.375rem",
            borderRadius: "var(--radius-sm)",
            transition: "background-color 0.15s",
          }}
        >
          タレント一覧へ戻る
        </Link>
      </div>
    );
  }

  // 現在ユーザーのロールと、プロファイル・実績・実績マスタを並行取得
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let userRole: string | null = null;
  if (user) {
    const { data: crmUser } = await supabase
      .from("crm_users")
      .select("role")
      .eq("id", user.id)
      .single();
    userRole = crmUser?.role ?? null;
  }

  const [
    { data: profile },
    { data: achievements },
    { data: achievementsMaster },
  ] = await Promise.all([
    getTalentProfile(id),
    getTalentAchievements(id),
    getTalentAchievementsMaster(),
  ]);

  return (
    <TalentDetailClient
      talent={talent}
      profile={profile}
      achievements={achievements ?? []}
      achievementsMaster={achievementsMaster ?? []}
      userRole={userRole}
    />
  );
}
