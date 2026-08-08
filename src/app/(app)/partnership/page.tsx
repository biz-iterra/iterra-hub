import { DealPipelineWorkspace } from "@/components/deals/DealPipelineWorkspace";

/**
 * パートナーシップ（partnership）。
 *
 * 中身は `DealPipelineWorkspace` が持つ。`/progress/*` と同じ作りで、
 * ここは画面の識別と見出しを渡すだけにしてある（T-0073）。
 */
export default async function PartnershipPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <DealPipelineWorkspace
      screenKey="partnership"
      title="パートナーシップ"
      description="業務委託先との関係。打診から稼働・検収まで"
      searchParams={await searchParams}
    />
  );
}
