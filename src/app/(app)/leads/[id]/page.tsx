import { getLeadById } from "@/actions/leads";
import { getLeadActivities } from "@/actions/lead-activities";
import {
  getLeadStages,
  getLeadStatuses,
  getLeadTemperatures,
  getLeadSources,
  getAccountTypes,
  getLeadCallers,
  getLeadCallStatuses,
  getLeadLargeSegments,
  getLeadSmallSegments,
  getLeadCategories,
  getLeadActivityTypes,
  getLeadCustomerActivityTypes,
} from "@/actions/masters";
import { getCrmUsers, getCurrentUser } from "@/actions/users";
import { getCampaigns } from "@/actions/campaigns";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { LeadDetailClient } from "./lead-detail-client";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LeadDetailPage({
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
          href="/leads"
          className="hover:bg-[var(--color-bg-hover)]"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
            color: "var(--color-terra)",
            textDecoration: "none",
            padding: "0.125rem 0.375rem",
            margin: "-0.125rem -0.375rem",
            borderRadius: "var(--radius-sm)",
            transition: "background-color 0.15s",
            fontSize: "0.875rem",
          }}
        >
          リード一覧へ戻る
          <ArrowUpRight size={14} />
        </Link>
      </div>
    );
  }

  const { data: lead, error } = await getLeadById(id);

  if (error || !lead) {
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
          リードが見つかりません
        </p>
        <Link
          href="/leads"
          className="hover:bg-[var(--color-bg-hover)]"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
            color: "var(--color-terra)",
            textDecoration: "none",
            padding: "0.125rem 0.375rem",
            margin: "-0.125rem -0.375rem",
            borderRadius: "var(--radius-sm)",
            transition: "background-color 0.15s",
            fontSize: "0.875rem",
          }}
        >
          <ArrowLeft size={14} />
          リード一覧へ戻る
        </Link>
      </div>
    );
  }

  const [
    activitiesResult,
    stagesResult,
    statusesResult,
    temperaturesResult,
    sourcesResult,
    accountTypesResult,
    callersResult,
    callStatusesResult,
    largeSegmentsResult,
    smallSegmentsResult,
    categoriesResult,
    activityTypesResult,
    usersResult,
    currentUserResult,
    campaignsResult,
    customerActivityTypesResult,
  ] = await Promise.all([
    getLeadActivities(id),
    getLeadStages(),
    getLeadStatuses(),
    getLeadTemperatures(),
    getLeadSources(),
    getAccountTypes(),
    getLeadCallers(),
    getLeadCallStatuses(),
    getLeadLargeSegments(),
    getLeadSmallSegments(),
    getLeadCategories(),
    getLeadActivityTypes(),
    getCrmUsers(),
    getCurrentUser(),
    getCampaigns({ perPage: 100, page: 1 }),
    getLeadCustomerActivityTypes(),
  ]);

  const masters = {
    stages: (stagesResult.data ?? []).map((s: any) => ({
      value: s.id,
      label: s.name,
      slug: s.slug,
    })),
    statuses: (statusesResult.data ?? []).map((s: any) => ({
      value: s.id,
      label: s.name,
      stage_id: s.stage_id,
    })),
    temperatures: (temperaturesResult.data ?? []).map((t: any) => ({
      value: t.id,
      label: t.name,
      code: t.code,
    })),
    sources: (sourcesResult.data ?? []).map((s: any) => ({
      value: s.id,
      label: s.name,
    })),
    accountTypes: (accountTypesResult.data ?? []).map((a: any) => ({
      value: a.id,
      label: a.name,
    })),
    callers: (callersResult.data ?? []).map((c: any) => ({
      value: c.id,
      label: c.name,
    })),
    callStatuses: (callStatusesResult.data ?? []).map((c: any) => ({
      value: c.id,
      label: c.name,
    })),
    largeSegments: (largeSegmentsResult.data ?? []).map((s: any) => ({
      value: s.id,
      label: s.name,
    })),
    smallSegments: (smallSegmentsResult.data ?? []).map((s: any) => ({
      value: s.id,
      label: s.name,
      large_segment_id: s.large_segment_id,
    })),
    owners: (usersResult.data ?? []).map((u: any) => ({
      value: u.id,
      label: u.full_name,
    })),
    categories: (categoriesResult.data ?? []).map((c: any) => ({
      value: c.id,
      label: c.name,
    })),
    activityTypes: (activityTypesResult.data ?? []).map((a: any) => ({
      value: a.id,
      label: a.name,
      color: a.color as string | null,
    })),
    customerActivityTypes: (customerActivityTypesResult.data ?? []).map((a: any) => ({
      value: a.id,
      label: a.name,
    })),
  };

  const campaignIdSet = new Set<string>(lead.campaign_ids ?? []);
  const initialLeadCampaigns = (campaignsResult.data?.items ?? [])
    .filter((c: any) => campaignIdSet.has(c.id))
    .map((c: any) => ({ id: c.id, name: c.name }));

  return (
    <LeadDetailClient
      lead={lead}
      activities={activitiesResult.data ?? []}
      masters={masters}
      currentUser={currentUserResult.data ?? { id: "", full_name: "", role: "member" }}
      initialLeadCampaigns={initialLeadCampaigns}
    />
  );
}
