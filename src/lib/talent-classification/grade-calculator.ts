/**
 * グレード算定ロジック
 * 系統コード・スキル・実績・昇格要件マスタを受け取り、
 * 最上位充足グレードを返す。
 */

import { D_CO_SYSTEM_SKILL_IDS } from "./d-co-pool";
import type { TalentSkillForClassification } from "./system-classifier";

// ─── 型定義 ───────────────────────────────────────────────────────────────────

/**
 * skill_thresholds の1要素
 * （validators の SkillThreshold と同型、ここでは純粋関数用に再定義）
 */
export interface SkillThresholdEntry {
  axis_filter?: "T" | "D" | "B" | "M";
  skill_ids_any_pool?: string;
  skill_ids_any?: string[];
  min_star: number;
  min_count: number;
}

/** talent_grade_requirements の1行 */
export interface TalentGradeRequirementRow {
  system_code: string;
  grade_code: string;
  skill_thresholds: SkillThresholdEntry[];
  required_achievements: string[];
  sort_order: number;
}

/** talent_grades の1行（sort_order で昇順: 1=最低 16=最高） */
export interface TalentGradeRow {
  grade_code: string;
  band: string;
  sort_order: number;
  expected_role: string | null;
  evaluation_points: string | null;
}

/** 算定結果 */
export interface GradeCalculationResult {
  /** null = グレードマスタが空で算定できない */
  grade_code: string | null;
  /** 充足した実績コード */
  satisfied_achievements: string[];
  /** 不足している実績コード（次グレードに必要だが未達） */
  unmet_achievements: string[];
}

// ─── Pool 解決 ────────────────────────────────────────────────────────────────

const POOL_MAP: Record<string, readonly string[]> = {
  d_co_system_skill_ids: D_CO_SYSTEM_SKILL_IDS,
};

function resolvePool(poolName: string): readonly string[] {
  const pool = POOL_MAP[poolName];
  if (!pool) {
    // 空配列を返すと該当スキル0件 = 常に要件未達となり原因が追えないため警告する
    console.warn(
      `[talent-classification] 未知のスキルプール "${poolName}" が参照されました。` +
        `d-co-pool.ts の POOL_MAP とマスタ設定を確認してください。`
    );
    return [];
  }
  return pool;
}

// ─── 1閾値の評価 ──────────────────────────────────────────────────────────────

function evaluateThreshold(
  threshold: SkillThresholdEntry,
  skills: TalentSkillForClassification[]
): boolean {
  // 対象スキルを絞り込む
  let candidates = skills;

  if (threshold.skill_ids_any_pool) {
    const pool = resolvePool(threshold.skill_ids_any_pool);
    candidates = candidates.filter(
      (s) => s.skill_code && pool.includes(s.skill_code)
    );
  }

  if (threshold.skill_ids_any && threshold.skill_ids_any.length > 0) {
    const ids = threshold.skill_ids_any;
    candidates = candidates.filter(
      (s) => s.skill_code && ids.includes(s.skill_code)
    );
  }

  if (threshold.axis_filter) {
    candidates = candidates.filter((s) => s.axis === threshold.axis_filter);
  }

  // min_star 以上の件数をカウント
  const count = candidates.filter(
    (s) => (s.proficiency_level ?? 0) >= threshold.min_star
  ).length;

  return count >= threshold.min_count;
}

// ─── メイン関数 ───────────────────────────────────────────────────────────────

/**
 * 指定系統のグレードを算定する。
 *
 * @param systemCode    算定対象の系統コード
 * @param talentSkills  タレントの保有スキル
 * @param achievements  タレントが保有する実績コードの配列
 * @param requirements  talent_grade_requirements マスタ（全系統 or 当該系統分）
 * @param grades        talent_grades マスタ（sort_order 昇順）
 * @returns グレードコードと充足・不足実績
 */
export function calculateGrade(
  systemCode: string,
  talentSkills: TalentSkillForClassification[],
  achievements: string[],
  requirements: TalentGradeRequirementRow[],
  grades: TalentGradeRow[]
): GradeCalculationResult {
  const gradeSortOrder = new Map(grades.map((g) => [g.grade_code, g.sort_order]));

  // 当該系統の要件を sort_order 降順（高位から低位）にソート
  const sysReqs = requirements
    .filter((r) => r.system_code === systemCode)
    .sort((a, b) => b.sort_order - a.sort_order);

  // L1 より上（L2/L3/L4）は人事評価によるためロジック対象外。
  // grade_code の命名ではなくグレードマスタの sort_order を基準に判定する。
  const l1SortOrder = gradeSortOrder.get("L1") ?? null;
  const evalReqs =
    l1SortOrder === null
      ? sysReqs
      : sysReqs.filter((r) => {
          const so = gradeSortOrder.get(r.grade_code);
          // マスタに無いグレードは判断材料がないため評価を試みる
          return so == null || so <= l1SortOrder;
        });

  for (const req of evalReqs) {
    // スキル閾値の全評価（AND 結合）
    const thresholdsOk = req.skill_thresholds.every((t) =>
      evaluateThreshold(t, talentSkills)
    );
    if (!thresholdsOk) continue;

    // 実績の全評価（AND 結合）
    const satisfiedAchievements = req.required_achievements.filter((code) =>
      achievements.includes(code)
    );
    const unmetAchievements = req.required_achievements.filter(
      (code) => !achievements.includes(code)
    );
    const achievementsOk = unmetAchievements.length === 0;
    if (!achievementsOk) continue;

    return {
      grade_code: req.grade_code,
      satisfied_achievements: satisfiedAchievements,
      unmet_achievements: [],
    };
  }

  // どれも満たさない場合 → マスタ最下位グレード（新規参入デフォルト）
  // 次グレード（evalReqs の最低位）の不足情報を返す
  const lowestReq = evalReqs[evalReqs.length - 1];
  const unmetAchievements = lowestReq
    ? lowestReq.required_achievements.filter(
        (code) => !achievements.includes(code)
      )
    : [];

  const lowestGrade = grades.reduce<TalentGradeRow | null>(
    (min, g) => (min === null || g.sort_order < min.sort_order ? g : min),
    null
  );

  return {
    grade_code: lowestGrade?.grade_code ?? null,
    satisfied_achievements: [],
    unmet_achievements: unmetAchievements,
  };
}
