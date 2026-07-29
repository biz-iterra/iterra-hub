import Link from "next/link";
import { getTalent } from "@/actions/talents";
import { getCurrentUser } from "@/actions/users";
import { TalentEditForm } from "./talent-edit-form";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TalentEditPage({
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
            textDecoration: "none",
            padding: "0.125rem 0.375rem",
            margin: "-0.125rem -0.375rem",
            borderRadius: "var(--radius-sm)",
          }}
        >
          タレント一覧へ戻る
        </Link>
      </div>
    );
  }

  const [talentResult, meResult] = await Promise.all([
    getTalent(id),
    getCurrentUser(),
  ]);

  const talent = talentResult.data;
  if (!talent) {
    return (
      <div style={{ padding: "2rem" }}>
        <p style={{ color: "var(--color-text-body)", marginBottom: "1rem" }}>
          タレントが見つかりません
        </p>
        <Link
          href="/talents"
          className="hover:bg-[var(--color-bg-hover)]"
          style={{
            color: "var(--color-terra)",
            textDecoration: "none",
            padding: "0.125rem 0.375rem",
            margin: "-0.125rem -0.375rem",
            borderRadius: "var(--radius-sm)",
          }}
        >
          タレント一覧へ戻る
        </Link>
      </div>
    );
  }

  const isAdmin = meResult.data?.role === "admin";

  const contactName = talent.contact
    ? `${talent.contact.last_name} ${talent.contact.first_name}`
    : "タレント";

  return (
    <TalentEditForm
      talent={{
        id: talent.id,
        personality_memo: talent.personality_memo ?? null,
        custom_strengths: talent.custom_strengths ?? null,
        custom_weaknesses: talent.custom_weaknesses ?? null,
        aptitude_notes: talent.aptitude_notes ?? null,
        overall_assessment: talent.overall_assessment ?? null,
        updated_at: talent.updated_at ?? null,
      }}
      initialCareers={talent.talent_careers ?? []}
      contactName={contactName}
      isAdmin={isAdmin}
    />
  );
}
