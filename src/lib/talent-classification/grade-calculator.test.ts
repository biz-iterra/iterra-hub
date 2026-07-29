import { test, describe } from "vitest";
import assert from "node:assert/strict";

import {
  calculateGrade,
  type TalentGradeRequirementRow,
  type TalentGradeRow,
} from "./grade-calculator";
import type { TalentSkillForClassification } from "./system-classifier";

function skill(
  code: string,
  axis: string,
  level: number
): TalentSkillForClassification {
  return { skill_code: code, axis, system_tags: [], proficiency_level: level };
}

/** A1(1) / A2(2) / S1(9) / L1(13) / L2(14) の 5 段階に簡略化したマスタ */
const GRADES: TalentGradeRow[] = [
  { grade_code: "A1", band: "A", sort_order: 1, expected_role: null, evaluation_points: null },
  { grade_code: "A2", band: "A", sort_order: 2, expected_role: null, evaluation_points: null },
  { grade_code: "S1", band: "S", sort_order: 9, expected_role: null, evaluation_points: null },
  { grade_code: "L1", band: "L", sort_order: 13, expected_role: null, evaluation_points: null },
  { grade_code: "L2", band: "L", sort_order: 14, expected_role: null, evaluation_points: null },
];

function req(
  grade: string,
  sort: number,
  thresholds: TalentGradeRequirementRow["skill_thresholds"],
  achievements: string[] = []
): TalentGradeRequirementRow {
  return {
    system_code: "G",
    grade_code: grade,
    skill_thresholds: thresholds,
    required_achievements: achievements,
    sort_order: sort,
  };
}

describe("calculateGrade", () => {
  test("充足する中で最上位のグレードを返す", () => {
    const reqs = [
      req("A2", 1, [{ axis_filter: "D", min_star: 2, min_count: 1 }]),
      req("S1", 2, [{ axis_filter: "D", min_star: 4, min_count: 1 }]),
    ];
    const skills = [skill("D01", "D", 4)];
    assert.equal(calculateGrade("G", skills, [], reqs, GRADES).grade_code, "S1");
  });

  test("実績が足りなければそのグレードは充足しない", () => {
    const reqs = [
      req("A2", 1, [{ axis_filter: "D", min_star: 2, min_count: 1 }]),
      req("S1", 2, [{ axis_filter: "D", min_star: 4, min_count: 1 }], ["LEAD_PROJECT"]),
    ];
    const skills = [skill("D01", "D", 4)];
    assert.equal(calculateGrade("G", skills, [], reqs, GRADES).grade_code, "A2");

    const withAchievement = calculateGrade("G", skills, ["LEAD_PROJECT"], reqs, GRADES);
    assert.equal(withAchievement.grade_code, "S1");
    assert.deepEqual(withAchievement.satisfied_achievements, ["LEAD_PROJECT"]);
  });

  test("L2 以上は自動判定の対象外（sort_order が L1 超のものは評価しない）", () => {
    const reqs = [
      req("L1", 1, [{ axis_filter: "D", min_star: 5, min_count: 1 }]),
      req("L2", 2, [{ axis_filter: "D", min_star: 1, min_count: 1 }]), // 誰でも満たせる要件
    ];
    const skills = [skill("D01", "D", 5)];
    assert.equal(calculateGrade("G", skills, [], reqs, GRADES).grade_code, "L1");
  });

  test("どの要件も満たさなければマスタ最下位グレードを返す", () => {
    const reqs = [req("A2", 1, [{ axis_filter: "D", min_star: 5, min_count: 3 }])];
    const result = calculateGrade("G", [skill("D01", "D", 1)], [], reqs, GRADES);
    assert.equal(result.grade_code, "A1");
  });

  test("グレードマスタが空なら null を返す", () => {
    const reqs = [req("A2", 1, [{ axis_filter: "D", min_star: 5, min_count: 3 }])];
    assert.equal(calculateGrade("G", [], [], reqs, []).grade_code, null);
  });

  test("未充足の要件では不足している実績を返す", () => {
    const reqs = [
      req("A2", 1, [{ axis_filter: "D", min_star: 1, min_count: 1 }], ["LEAD_PROJECT", "MENTOR_JUNIOR"]),
    ];
    const result = calculateGrade("G", [skill("D01", "D", 2)], ["LEAD_PROJECT"], reqs, GRADES);
    assert.equal(result.grade_code, "A1");
    assert.deepEqual(result.unmet_achievements, ["MENTOR_JUNIOR"]);
  });

  test("skill_ids_any_pool と axis_filter は AND で絞り込む", () => {
    // D_CO プールに含まれない D 軸スキルでは充足しない
    const reqs = [
      req("A2", 1, [
        { axis_filter: "D", skill_ids_any_pool: "d_co_system_skill_ids", min_star: 3, min_count: 1 },
      ]),
    ];
    assert.equal(
      calculateGrade("G", [skill("D03", "D", 5)], [], reqs, GRADES).grade_code,
      "A1"
    );
    assert.equal(
      calculateGrade("G", [skill("D09", "D", 3)], [], reqs, GRADES).grade_code,
      "A2"
    );
  });

  test("他系統の要件は評価対象に含めない", () => {
    const reqs: TalentGradeRequirementRow[] = [
      { ...req("S1", 1, [{ axis_filter: "D", min_star: 1, min_count: 1 }]), system_code: "SP" },
    ];
    assert.equal(
      calculateGrade("G", [skill("D01", "D", 5)], [], reqs, GRADES).grade_code,
      "A1"
    );
  });
});
