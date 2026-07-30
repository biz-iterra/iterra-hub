import {
  getLeadStages,
  getLeadStatuses,
  getLeadTemperatures,
  getLeadSources,
  getAccountTypes,
  getLeadLargeSegments,
  getLeadSmallSegments,
  getLeadCategories,
} from "@/actions/masters";
import { getCrmUsers, getCurrentUser } from "@/actions/users";
import { LeadNewForm } from "./lead-new-form";
import { redirect } from "next/navigation";

export default async function LeadNewPage() {
  const [
    stagesResult,
    statusesResult,
    temperaturesResult,
    sourcesResult,
    accountTypesResult,
    largeSegmentsResult,
    smallSegmentsResult,
    categoriesResult,
    usersResult,
    currentUserResult,
  ] = await Promise.all([
    getLeadStages(),
    getLeadStatuses(),
    getLeadTemperatures(),
    getLeadSources(),
    getAccountTypes(),
    getLeadLargeSegments(),
    getLeadSmallSegments(),
    getLeadCategories(),
    getCrmUsers(),
    getCurrentUser(),
  ]);

  if (!currentUserResult.data) {
    redirect("/login");
  }

  const masters = {
    stages: (stagesResult.data ?? []).map((s) => ({
      value: s.id,
      label: s.name,
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
    <LeadNewForm
      masters={masters}
      currentUser={currentUserResult.data}
    />
  );
}
