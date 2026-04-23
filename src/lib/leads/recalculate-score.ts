import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Lead スコアを再計算して leads.score / temperature_id / lead_score_breakdowns を更新する。
 * DB 関数 recalculate_lead_score を 1 round-trip で呼び出す。
 *
 * 書き込みのため service_role クライアント（createAdminClient）を推奨。
 * RPC 内で breakdowns の DELETE + INSERT を行うため、呼び出し側は RLS バイパス必須。
 *
 * 失敗時はエラーをログに出力して null を返す（Lead 本体更新の成否に影響しない）。
 *
 * @param adminClient - createAdminClient() で生成した service_role クライアント
 * @param leadId      - 再計算対象の Lead ID（UUID 形式）
 * @returns 算出後の score（0-100）。失敗時は null
 */
export async function recalculateLeadScore(
  adminClient: SupabaseClient,
  leadId: string
): Promise<number | null> {
  const { data, error } = await adminClient.rpc("recalculate_lead_score", {
    p_lead_id: leadId,
  });
  if (error) {
    console.error("[recalculateLeadScore] failed", { leadId, error });
    return null;
  }
  return typeof data === "number" ? data : null;
}
