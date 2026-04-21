import { getCampaignById, getCampaignLeads, getUnassignedLeadsForCampaign } from "@/actions/campaigns";
import { getCurrentUser } from "@/actions/users";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { CampaignDetailClient } from "./campaign-detail-client";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!UUID_REGEX.test(id)) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "50vh",
          gap: "1rem",
        }}
      >
        <p style={{ color: "var(--color-text-body)", fontSize: "1rem" }}>
          不正なパラメータです
        </p>
        <Link
          href="/campaigns"
          className="hover:bg-[var(--color-bg-hover)]"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
            color: "var(--color-terra)",
            textDecoration: "none",
            padding: "0.125rem 0.375rem",
            borderRadius: "var(--radius-sm)",
            fontSize: "0.875rem",
          }}
        >
          キャンペーン一覧へ戻る
          <ArrowUpRight size={14} />
        </Link>
      </div>
    );
  }

  const { data: campaign, error } = await getCampaignById(id);

  if (error || !campaign) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "50vh",
          gap: "1rem",
        }}
      >
        <p style={{ color: "var(--color-text-body)", fontSize: "1rem" }}>
          キャンペーンが見つかりません
        </p>
        <Link
          href="/campaigns"
          className="hover:bg-[var(--color-bg-hover)]"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
            color: "var(--color-terra)",
            textDecoration: "none",
            padding: "0.125rem 0.375rem",
            borderRadius: "var(--radius-sm)",
            fontSize: "0.875rem",
          }}
        >
          <ArrowLeft size={14} />
          キャンペーン一覧へ戻る
        </Link>
      </div>
    );
  }

  const [campaignLeadsResult, unassignedLeadsResult, currentUserResult] =
    await Promise.all([
      getCampaignLeads(id),
      getUnassignedLeadsForCampaign(id),
      getCurrentUser(),
    ]);

  return (
    <CampaignDetailClient
      campaign={campaign}
      campaignLeads={campaignLeadsResult.data ?? []}
      unassignedLeads={unassignedLeadsResult.data ?? []}
      currentUser={currentUserResult.data ?? { id: "", full_name: "", role: "member" }}
    />
  );
}
