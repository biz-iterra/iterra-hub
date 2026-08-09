import {
  getLeadStages,
  getLeadStatuses,
  getLeadTemperatures,
  getLeadSources,
  getAccountTypes,
  getLeadLargeSegments,
  getLeadSmallSegments,
} from "@/actions/masters";
import { getCrmUsers, getCurrentUser } from "@/actions/users";
import { getCompanies } from "@/actions/companies";
import { getContacts } from "@/actions/contacts";
import { LeadNewForm } from "./lead-new-form";
import { redirect } from "next/navigation";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LeadNewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // 事業者情報の詳細から「リードを追加」で来たとき（T-0072）
  const sp = await searchParams;
  const rawCompanyId = Array.isArray(sp.company_id) ? sp.company_id[0] : sp.company_id;
  const initialCompanyId = rawCompanyId && UUID_RE.test(rawCompanyId) ? rawCompanyId : "";

  const [
    stagesResult,
    statusesResult,
    temperaturesResult,
    sourcesResult,
    accountTypesResult,
    largeSegmentsResult,
    smallSegmentsResult,
    usersResult,
    companiesResult,
    contactsResult,
    currentUserResult,
  ] = await Promise.all([
    getLeadStages(),
    getLeadStatuses(),
    getLeadTemperatures(),
    getLeadSources(),
    getAccountTypes(),
    getLeadLargeSegments(),
    getLeadSmallSegments(),
    getCrmUsers(),
    getCompanies({ perPage: 1000 }),
    getContacts({ perPage: 1000 }),
    getCurrentUser(),
  ]);

  if (!currentUserResult.data) {
    redirect("/login");
  }

  const masters = {
    // ディールが要るステージ（Sales 以降）は新規作成では選べない。
    // 新規リードにディールは無く、選ばせても DB トリガーに弾かれるだけになる。
    // ディール化はリードを作ったあとステージを進める操作で行う
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
    companies: ((companiesResult.data?.rows ?? []) as { id: string; name: string }[]).map(
      (c) => ({ value: c.id, label: c.name })
    ),
    contacts: (
      (contactsResult.data?.rows ?? []) as {
        id: string;
        last_name: string | null;
        first_name: string | null;
      }[]
    ).map((c) => ({
      value: c.id,
      label: [c.last_name, c.first_name].filter(Boolean).join(" ") || "（名称未設定）",
    })),
    owners: (usersResult.data ?? []).map((u) => ({
      value: u.id,
      label: u.full_name,
    })),
  };

  return (
    <LeadNewForm
      masters={masters}
      currentUser={currentUserResult.data}
      initialCompanyId={initialCompanyId}
    />
  );
}
