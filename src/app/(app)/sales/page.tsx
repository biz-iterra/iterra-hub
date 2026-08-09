import { DealPipelineWorkspace } from "@/components/deals/DealPipelineWorkspace";

/**
 * セールス（sales）。
 *
 * 中身は `DealPipelineWorkspace` が持つ。`/progress/*` と同じ作りで、
 * ここは画面の識別と見出しを渡すだけにしてある（T-0073）。
 */
export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <DealPipelineWorkspace
      screenKey="sales"
      title="セールス"
      description="顧客への営業。リードから起こしたディールを追う"
      searchParams={await searchParams}
    />
  );
}
