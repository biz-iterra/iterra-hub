import { getCampaignById } from "@/actions/campaigns";
import { getCurrentUser } from "@/actions/users";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { CampaignEditClient } from "./campaign-edit-client";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CampaignEditPage({
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

  const [campaignResult, currentUserResult] = await Promise.all([
    getCampaignById(id),
    getCurrentUser(),
  ]);

  const { data: campaign, error } = campaignResult;

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

  const currentUser = currentUserResult.data ?? { id: "", full_name: "", role: "member" };

  // manager 未満はアクセス不可
  if (currentUser.role === "member") {
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
          この操作には manager 以上の権限が必要です
        </p>
        <Link
          href={`/campaigns/${id}`}
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
          詳細に戻る
        </Link>
      </div>
    );
  }

  return (
    <CampaignEditClient
      campaign={campaign}
      currentUser={currentUser}
    />
  );
}
