import { test, describe } from "vitest";
import assert from "node:assert/strict";

import {
  classifyJobTypes,
  type TalentJobTypeRow,
} from "./job-type-classifier";
import type { TalentSkillForClassification } from "./system-classifier";

function skill(
  code: string,
  axis: string,
  level: number
): TalentSkillForClassification {
  return { skill_code: code, axis, system_tags: [], proficiency_level: level };
}

function jobType(
  code: string,
  rules: TalentJobTypeRow["rules"]
): TalentJobTypeRow {
  return { id: code, job_type_code: code, name: code, category: null, rules, sort_order: 1 };
}

describe("classifyJobTypes", () => {
  test("skill_ids_any は OR（いずれか 1 つが min_star 以上）", () => {
    const jt = jobType("ENG_BACKEND", [
      { skill_ids_any: ["T15", "T17", "T18"], min_star: 3 },
    ]);
    assert.equal(classifyJobTypes([skill("T17", "T", 3)], [jt]).matched.length, 1);
    assert.equal(classifyJobTypes([skill("T17", "T", 2)], [jt]).matched.length, 0);
  });

  test("rules 配列は AND（全ルールを満たす必要がある）", () => {
    const jt = jobType("ENG_INFRA", [
      { skill_ids_any: ["T08"], min_star: 3 },
      { skill_ids_any: ["T11"], min_star: 2 },
    ]);
    assert.equal(classifyJobTypes([skill("T08", "T", 3)], [jt]).matched.length, 0);
    assert.equal(
      classifyJobTypes([skill("T08", "T", 3), skill("T11", "T", 2)], [jt]).matched.length,
      1
    );
  });

  test("axis_filter は min_count 件以上が min_star 以上", () => {
    const jt = jobType("ARCHITECT", [{ axis_filter: "T", min_star: 4, min_count: 3 }]);
    const two = [skill("T01", "T", 4), skill("T02", "T", 5)];
    assert.equal(classifyJobTypes(two, [jt]).matched.length, 0);
    assert.equal(
      classifyJobTypes([...two, skill("T03", "T", 4)], [jt]).matched.length,
      1
    );
  });

  test("skill_ids_any と axis_filter の併記は AND で評価する", () => {
    // 旧実装は skill_ids_any で早期 return し axis_filter を無視していた
    const jt = jobType("MIXED", [
      { skill_ids_any: ["T15"], axis_filter: "D", min_star: 3, min_count: 2 },
    ]);

    // skill_ids_any は満たすが D 軸 ★3 以上が 1 件しかない → 不一致
    const notEnoughD = [skill("T15", "T", 4), skill("D09", "D", 3)];
    assert.equal(classifyJobTypes(notEnoughD, [jt]).matched.length, 0);

    // 両方満たす → 一致
    const enough = [...notEnoughD, skill("D10", "D", 3)];
    assert.equal(classifyJobTypes(enough, [jt]).matched.length, 1);
  });

  test("rules が空の職種はマッチさせない", () => {
    const jt = jobType("EMPTY", []);
    assert.equal(classifyJobTypes([skill("T01", "T", 5)], [jt]).matched.length, 0);
  });
});
