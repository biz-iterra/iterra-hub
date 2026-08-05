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
    // 商談が要るステージ（Sales 以降）は新規作成では選べない。
    // 新規リードに商談は無く、選ばせても DB トリガーに弾かれるだけになる。
    // 商談化はリードを作ったあとステージを進める操作で行う
    stages: (stagesResult.data ?? [])
      .filter((s) => !s.requires_deal)
      .map((s) => ({
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
      // 法人向けの入力欄を出すかは**マスタの設定**で決まる（20260805000018）。
      // スラッグは自動採番の値になったので判定に使わない
      requiresCorporateFields: a.requires_corporate_fields,
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
