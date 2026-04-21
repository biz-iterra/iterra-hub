/**
 * score → temperature_id 判定ヘルパー
 * lead_scoring_rules を参照して、与えられたスコアに対応する temperature_id を返す。
 * score が null の場合は null を返す（手動設定を尊重するため呼び出し側で制御）。
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * スコアに対応する temperature_id を返す。
 * @param supabase - Supabase クライアント（Server Action から渡す）
 * @param score    - リードスコア（0以上の整数 or null）
 * @returns temperature_id の文字列（マッチしない場合 null）
 */
export async function resolveTemperatureByScore(
  supabase: SupabaseClient,
  score: number
): Promise<string | null> {
  const { data: rules, error } = await supabase
    .from("lead_scoring_rules")
    .select("id, temperature_id, min_score, max_score")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });

  if (error || !rules || rules.length === 0) return null;

  for (const rule of rules) {
    const min = Number(rule.min_score);
    const max = rule.max_score !== null ? Number(rule.max_score) : null;

    if (score >= min && (max === null || score <= max)) {
      return rule.temperature_id as string;
    }
  }

  return null;
}
