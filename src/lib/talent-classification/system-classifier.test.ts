import { test, describe } from "vitest";
import assert from "node:assert/strict";

import {
  classifySystems,
  type TalentSkillForClassification,
  type TalentSystemTagRow,
} from "./system-classifier";

/** テスト用スキルを組み立てる */
function skill(
  code: string,
  axis: string,
  tags: string[],
  level: number
): TalentSkillForClassification {
  return { skill_code: code, axis, system_tags: tags, proficiency_level: level };
}

const G_TAG: TalentSystemTagRow = {
  system_code: "G",
  name: "ジェネラリスト",
  determination_rule: {
    conditions: [
      { tag_filter: "G", min_star: 2, min_count: 3 },
      { tag_filter: "G", min_star: 3, min_count: 1 },
    ],
  },
};

const CO_TAG: TalentSystemTagRow = {
  system_code: "CO",
  name: "コーポレート",
  determination_rule: {
    conditions: [
      { tag_filter: "CO", axis_filter: "D", min_star: 3, min_count: 2 },
    ],
  },
};

describe("classifySystems", () => {
  test("全条件を満たす系統だけを返す", () => {
    const skills = [
      skill("B01", "B", ["G"], 3),
      skill("B02", "B", ["G"], 2),
      skill("B03", "B", ["G"], 2),
    ];
    assert.deepEqual(classifySystems(skills, [G_TAG]), ["G"]);
  });

  test("条件を 1 つでも満たさなければマッチしない", () => {
    // ★2 以上が 3 件あるが ★3 以上が 0 件
    const skills = [
      skill("B01", "B", ["G"], 2),
      skill("B02", "B", ["G"], 2),
      skill("B03", "B", ["G"], 2),
    ];
    assert.deepEqual(classifySystems(skills, [G_TAG]), []);
  });

  test("tag_filter と axis_filter は AND で効く", () => {
    // CO タグ ★3 以上は 2 件あるが、D 軸は 1 件だけ
    const skills = [
      skill("D09", "D", ["CO"], 3),
      skill("T38", "T", ["CO"], 4),
    ];
    assert.deepEqual(classifySystems(skills, [CO_TAG]), []);

    const withTwoD = [...skills, skill("D10", "D", ["CO"], 3)];
    assert.deepEqual(classifySystems(withTwoD, [CO_TAG]), ["CO"]);
  });

  test("conditions が空のマスタはマッチさせない（設定ミス扱い）", () => {
    const broken: TalentSystemTagRow = {
      system_code: "X",
      name: "未設定",
      determination_rule: {},
    };
    assert.deepEqual(classifySystems([skill("B01", "B", ["X"], 5)], [broken]), []);
  });

  test("proficiency_level が null のスキルは 0 として扱う", () => {
    const skills: TalentSkillForClassification[] = [
      { skill_code: "B01", axis: "B", system_tags: ["G"], proficiency_level: null },
    ];
    assert.deepEqual(classifySystems(skills, [G_TAG]), []);
  });
});
