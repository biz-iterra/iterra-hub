/**
 * タレント分類プロファイル統合計算
 *
 * 使い方:
 *   import { calculateTalentProfile } from "@/lib/talent-classification";
 *   const profile = calculateTalentProfile({ talentSkills, achievements, masters });
 */

import {
  classifySystems,
  type TalentSkillForClassification,
  type TalentSystemTagRow,
} from "./system-classifier";

import {
  calculateGrade,
  type TalentGradeRequirementRow,
  type TalentGradeRow,
} from "./grade-calculator";

import {
  classifyJobTypes,
  type TalentJobTypeRow,
} from "./job-type-classifier";

// ─── 型定義 ───────────────────────────────────────────────────────────────────

export interface TalentClassificationMasters {
  systemTags: TalentSystemTagRow[];
  grades: TalentGradeRow[];
  requirements: TalentGradeRequirementRow[];
  jobTypes: TalentJobTypeRow[];
}

export interface SystemResult {
  system_code: string;
  name: string;
  matched: boolean;
}

export interface GradeResult {
  system_code: string;
  /** null = 系統未保有（判定対象外） */
  grade_code: string | null;
  grade_info: TalentGradeRow | null;
  satisfied_achievements: string[];
  unmet_achievements: string[];
}

export interface TalentProfileResult {
  systems: SystemResult[];
  /** matched の中で sort_order が最高のグレードを出した系統（タイの場合は先頭） */
  primary_system: string | null;
  grades: GradeResult[];
  highest_grade: { system_code: string; grade_code: string } | null;
  job_types: TalentJobTypeRow[];
}

// ─── メイン統合関数 ───────────────────────────────────────────────────────────

/**
 * タレントのスキル・実績・マスタから職種プロファイルを計算する。
 * 純粋関数（副作用なし）。
 *
 * @param talentSkills  talent_skills + skills JOIN データ
 * @param achievements  保有実績コードの配列（achievement_code[]）
 * @param masters       分類マスタ（system_tags / grades / requirements / job_types）
 */
export function calculateTalentProfile({
  talentSkills,
  achievements,
  masters,
}: {
  talentSkills: TalentSkillForClassification[];
  achievements: string[];
  masters: TalentClassificationMasters;
}): TalentProfileResult {
  const { systemTags, grades, requirements, jobTypes } = masters;

  // ── 1. 系統判定 ──────────────────────────────────────────────────────────────
  const matchedSystemCodes = classifySystems(talentSkills, systemTags);

  const systems: SystemResult[] = systemTags.map((tag) => ({
    system_code: tag.system_code,
    name: tag.name,
    matched: matchedSystemCodes.includes(tag.system_code),
  }));

  // ── 2. グレード算定（保有系統のみ） ──────────────────────────────────────────
  const gradeResults: GradeResult[] = systems.map((sys) => {
    if (!sys.matched) {
      return {
        system_code: sys.system_code,
        grade_code: null,
        grade_info: null,
        satisfied_achievements: [],
        unmet_achievements: [],
      };
    }

    const result = calculateGrade(
      sys.system_code,
      talentSkills,
      achievements,
      requirements,
      grades
    );

    const gradeInfo =
      grades.find((g) => g.grade_code === result.grade_code) ?? null;

    return {
      system_code: sys.system_code,
      grade_code: result.grade_code,
      grade_info: gradeInfo,
      satisfied_achievements: result.satisfied_achievements,
      unmet_achievements: result.unmet_achievements,
    };
  });

  // ── 3. 最上位グレードを出した系統（primary_system）────────────────────────────
  const matchedGrades = gradeResults.filter((g) => g.grade_code !== null);

  let highestGradeResult: GradeResult | null = null;
  for (const gr of matchedGrades) {
    if (!gr.grade_code) continue;
    const gradeInfo = grades.find((g) => g.grade_code === gr.grade_code);
    if (!gradeInfo) continue;

    if (
      highestGradeResult === null ||
      (grades.find((g) => g.grade_code === highestGradeResult!.grade_code)
        ?.sort_order ?? 0) < gradeInfo.sort_order
    ) {
      highestGradeResult = gr;
    }
  }

  const primary_system = highestGradeResult?.system_code ?? null;
  const highest_grade =
    highestGradeResult?.grade_code && highestGradeResult?.system_code
      ? {
          system_code: highestGradeResult.system_code,
          grade_code: highestGradeResult.grade_code,
        }
      : null;

  // ── 4. 職種判定 ──────────────────────────────────────────────────────────────
  const { matched: matchedJobTypes } = classifyJobTypes(talentSkills, jobTypes);

  return {
    systems,
    primary_system,
    grades: gradeResults,
    highest_grade,
    job_types: matchedJobTypes,
  };
}

// re-exports
export type { TalentSkillForClassification } from "./system-classifier";
export type { TalentJobTypeRow } from "./job-type-classifier";
export type { TalentGradeRow } from "./grade-calculator";
