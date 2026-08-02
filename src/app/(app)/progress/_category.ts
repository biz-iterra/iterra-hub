import { createClient } from "@/lib/supabase/server";

/**
 * 進捗管理はカテゴリ 1 つ分を見る画面。
 * 絞り込みに使う ID をコードから引く（コードは運用で変わらない前提）。
 */
export async function getCategoryIdByCode(code: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("lead_categories")
    .select("id")
    .eq("code", code)
    .is("deleted_at", null)
    .maybeSingle();

  return data?.id ?? null;
}
