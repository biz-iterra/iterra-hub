import { getLeadById } from "@/actions/leads";
import {
  getLeadStages,
  getLeadStatuses,
  getLeadTemperatures,
  getLeadSources,
  getAccountTypes,
  getLeadCallStatuses,
  getLeadLargeSegments,
  getLeadSmallSegments,
  getLeadCategories,
} from "@/actions/masters";
import { getCrmUsers } from "@/actions/users";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { LeadEditClient } from "./lead-edit-client";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LeadEditPage({
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
    stagesResult,
    statusesResult,
    temperaturesResult,
    sourcesResult,
    accountTypesResult,
    callStatusesResult,
    largeSegmentsResult,
    smallSegmentsResult,
    categoriesResult,
    usersResult,
  ] = await Promise.all([
    getLeadStages(),
    getLeadStatuses(),
    getLeadTemperatures(),
    getLeadSources(),
    getAccountTypes(),
    getLeadCallStatuses(),
    getLeadLargeSegments(),
    getLeadSmallSegments(),
    getLeadCategories(),
    getCrmUsers(),
  ]);

  const masters = {
    stages: (stagesResult.data ?? []).map((s) => ({
      value: s.id,
      label: s.name,
      slug: s.slug,
      // 昇格の予告を出すかの判定に使う。slug で決め打たない（規則はマスタが持つ）
      auto_promote_to_deal: s.auto_promote_to_deal,
    })),
    statuses: (statusesResult.data ?? []).map((s) => ({
      value: s.id,
      label: s.name,
      stage_id: s.stage_id,
    })),
    temperatures: (temperaturesResult.data ?? []).map((t) => ({
      value: t.id,
      label: t.name,
      code: t.code,
    })),
    sources: (sourcesResult.data ?? []).map((s) => ({
      value: s.id,
      label: s.name,
    })),
    accountTypes: (accountTypesResult.data ?? []).map((a) => ({
      value: a.id,
      label: a.name,
      slug: a.slug ?? null,
    })),
    callStatuses: (callStatusesResult.data ?? []).map((c) => ({
      value: c.id,
      label: c.name,
    })),
    largeSegments: (largeSegmentsResult.data ?? []).map((s) => ({
      value: s.id,
      label: s.name,
    })),
    smallSegments: (smallSegmentsResult.data ?? []).map((s) => ({
      value: s.id,
      label: s.name,
      large_segment_id: s.large_segment_id,
    })),
    owners: (usersResult.data ?? []).map((u) => ({
      value: u.id,
      label: u.full_name,
    })),
    categories: (categoriesResult.data ?? []).map((c) => ({
      value: c.id,
      label: c.name,
    })),
  };

  return (
    <LeadEditClient
      lead={lead}
      masters={masters}
    />
  );
}
