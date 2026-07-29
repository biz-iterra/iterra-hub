/**
 * 系統判定ロジック
 * talent_system_tags.determination_rule.conditions を評価して
 * 該当する system_code の配列を返す。
 */

import { D_CO_SYSTEM_SKILL_IDS } from "./d-co-pool";

// ─── 型定義 ───────────────────────────────────────────────────────────────────

/** skills テーブルから取得したスキル行（判定に必要な列のみ） */
export interface TalentSkillForClassification {
  /** skills.skill_code（T01 等） */
  skill_code: string | null;
  /** skills.axis (T/D/B/M) */
  axis: string | null;
  /** skills.system_tags (["G","SP"] 等) */
  system_tags: string[];
  /** talent_skills.proficiency_level (0-5) */
  proficiency_level: number | null;
}

/** determination_rule.conditions の1要素 */
interface SystemCondition {
  /** G / SP / CO のいずれか。スキルの system_tags にこの値が含まれることを要求 */
  tag_filter?: string;
  /** T/D/B/M — 対象をこの軸にさらにフィルタ */
  axis_filter?: string;
  /** このレベル以上であること */
  min_star: number;
  /** 上記条件を満たすスキルが min_count 件以上あること */
  min_count: number;
}

/** talent_system_tags 1行 */
export interface TalentSystemTagRow {
  system_code: string;
  name: string;
  determination_rule: {
    conditions?: SystemCondition[];
    [key: string]: unknown;
  };
}

// ─── ヘルパー ─────────────────────────────────────────────────────────────────

/**
 * スキルリストを `condition` でフィルタして proficiency_level >= min_star の件数を返す。
 */
function countMatchingSkills(
  skills: TalentSkillForClassification[],
  condition: SystemCondition
): number {
  return skills.filter((ts) => {
    const level = ts.proficiency_level ?? 0;
    if (level < condition.min_star) return false;

    // tag_filter: skills.system_tags に含まれているか
    if (condition.tag_filter && !ts.system_tags.includes(condition.tag_filter)) {
      return false;
    }
    // axis_filter: skills.axis が一致するか
    if (condition.axis_filter && ts.axis !== condition.axis_filter) {
      return false;
    }
    return true;
  }).length;
}

// ─── メイン関数 ───────────────────────────────────────────────────────────────

/**
 * タレントの保有スキルと系統マスタから、合致する系統コードの配列を返す。
 *
 * @param talentSkills  talent_skills + skills JOIN の結果
 * @param systemTags    talent_system_tags マスタ全件
 * @returns 合致した system_code の配列（0件もあり得る）
 */
export function classifySystems(
  talentSkills: TalentSkillForClassification[],
  systemTags: TalentSystemTagRow[]
): string[] {
  const matched: string[] = [];

  for (const tag of systemTags) {
    const conditions = tag.determination_rule.conditions;
    if (!conditions || conditions.length === 0) {
      // 条件なし ＝ 全員マッチとはしない（マスタ設定ミスとして除外）
      continue;
    }

    // 全条件を AND 評価
    const allSatisfied = conditions.every((cond) => {
      const count = countMatchingSkills(talentSkills, cond);
      return count >= cond.min_count;
    });

    if (allSatisfied) {
      matched.push(tag.system_code);
    }
  }

  return matched;
}

// 参照用に D_CO_SYSTEM_SKILL_IDS を re-export
export { D_CO_SYSTEM_SKILL_IDS };
