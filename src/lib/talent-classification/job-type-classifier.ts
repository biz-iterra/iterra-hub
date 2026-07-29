/**
 * 職種自動付与ロジック
 * talent_job_types.rules を評価してマッチした職種を返す。
 *
 * ルール評価セマンティクス:
 *   - rules 配列: AND 結合（全ルールを満たすこと）
 *   - 各 rule 内の skill_ids_any: OR 結合（いずれか1つが min_star 以上）
 *   - axis_filter: その軸のスキルが min_count 件以上 min_star 以上
 */

import type { TalentSkillForClassification } from "./system-classifier";

// ─── 型定義 ───────────────────────────────────────────────────────────────────

export interface JobTypeRuleEntry {
  axis_filter?: "T" | "D" | "B" | "M";
  skill_ids_any?: string[];
  min_star: number;
  min_count?: number;
}

export interface TalentJobTypeRow {
  id: string;
  job_type_code: string;
  name: string;
  category: string | null;
  rules: JobTypeRuleEntry[];
  sort_order: number;
}

export interface JobTypeClassificationResult {
  matched: TalentJobTypeRow[];
}

// ─── ルール評価 ───────────────────────────────────────────────────────────────

function evaluateRule(
  rule: JobTypeRuleEntry,
  skills: TalentSkillForClassification[]
): boolean {
  const minStar = rule.min_star;
  // skill_ids_any と axis_filter が併記された場合は両方満たすこと（AND）
  let satisfied = true;

  if (rule.skill_ids_any && rule.skill_ids_any.length > 0) {
    // OR 結合: リスト内の任意1スキルが min_star 以上
    satisfied = rule.skill_ids_any.some((code) =>
      skills.some(
        (s) => s.skill_code === code && (s.proficiency_level ?? 0) >= minStar
      )
    );
  }

  if (satisfied && rule.axis_filter) {
    // 軸全体で min_count 件以上 min_star 以上
    const minCount = rule.min_count ?? 1;
    const count = skills.filter(
      (s) =>
        s.axis === rule.axis_filter &&
        (s.proficiency_level ?? 0) >= minStar
    ).length;
    satisfied = count >= minCount;
  }

  // 条件なし → 常に true（マスタ設定による）
  return satisfied;
}

// ─── メイン関数 ───────────────────────────────────────────────────────────────

/**
 * タレントの保有スキルと職種マスタから、合致する職種を返す。
 *
 * @param talentSkills  タレントの保有スキル
 * @param jobTypes      talent_job_types マスタ全件
 */
export function classifyJobTypes(
  talentSkills: TalentSkillForClassification[],
  jobTypes: TalentJobTypeRow[]
): JobTypeClassificationResult {
  const matched = jobTypes.filter((jt) => {
    if (!jt.rules || jt.rules.length === 0) return false;
    // AND 結合
    return jt.rules.every((rule) => evaluateRule(rule, talentSkills));
  });

  return { matched };
}
