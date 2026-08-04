import { describe, expect, it } from "vitest";
import { crmAccountTypeToFreee, freeeAccountTypeToCrm } from "./account-type";

/**
 * **当座の綴りが freee と CRM で違う**（checking / current）。
 * 取り違えると普通預金として振り込まれかねないので往復を固定する。
 */
describe("口座種別の対応", () => {
  it("当座は checking ↔ current", () => {
    expect(crmAccountTypeToFreee("current")).toBe("checking");
    expect(freeeAccountTypeToCrm("checking")).toBe("current");
  });

  it("普通・貯蓄はそのまま", () => {
    expect(crmAccountTypeToFreee("ordinary")).toBe("ordinary");
    expect(freeeAccountTypeToCrm("ordinary")).toBe("ordinary");
    expect(crmAccountTypeToFreee("savings")).toBe("savings");
    expect(freeeAccountTypeToCrm("savings")).toBe("savings");
  });

  it("往復しても変わらない", () => {
    for (const t of ["ordinary", "current", "savings"]) {
      expect(freeeAccountTypeToCrm(crmAccountTypeToFreee(t)!)).toBe(t);
    }
  });

  it("納税準備預金は CRM に無いので null（普通預金に寄せない）", () => {
    expect(freeeAccountTypeToCrm("earmarked")).toBeNull();
  });

  it("未知の値・空は null", () => {
    expect(crmAccountTypeToFreee("")).toBeNull();
    expect(crmAccountTypeToFreee(null)).toBeNull();
    expect(freeeAccountTypeToCrm("unknown")).toBeNull();
  });
});
