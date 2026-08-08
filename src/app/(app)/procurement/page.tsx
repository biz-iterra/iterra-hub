import { DealPipelineWorkspace } from "@/components/deals/DealPipelineWorkspace";

/**
 * プロキュアメント（procurement）。
 *
 * 中身は `DealPipelineWorkspace` が持つ。`/progress/*` と同じ作りで、
 * ここは画面の識別と見出しを渡すだけにしてある（T-0073）。
 */
export default async function ProcurementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <DealPipelineWorkspace
      screenKey="procurement"
      title="プロキュアメント"
      description="仕入れ先との取引。候補の把握から発注・支払いまで"
      searchParams={await searchParams}
    />
  );
}
