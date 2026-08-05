import { describe, expect, it } from "vitest";
import {
  crmAccountTypeToFreee,
  freeeAccountTypeToCrm,
  normalizeAccountType,
} from "./account-type";

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

/**
 * UT-72: 比較の正規化。
 *
 * **freee は口座種別に未設定を持てない**（何も選ばなくても ordinary が返る）。
 * CRM は NULL を取れるので、素で比べるとどちらも未設定なのに差分になる。
 * DB 側の `normalize_account_type` と同じ規則を持つ。**片方だけ直さないこと。**
 */
describe("normalizeAccountType", () => {
  it("未設定は普通預金として扱う", () => {
    expect(normalizeAccountType(null)).toBe("ordinary");
    expect(normalizeAccountType(undefined)).toBe("ordinary");
    expect(normalizeAccountType("")).toBe("ordinary");
    expect(normalizeAccountType("   ")).toBe("ordinary");
  });

  it("値があればそのまま（前後の空白だけ落とす）", () => {
    expect(normalizeAccountType("current")).toBe("current");
    expect(normalizeAccountType(" savings ")).toBe("savings");
  });

  it("揃えても本当の差分は消えない", () => {
    // freee=当座 / CRM=未設定 → 差分として残る
    expect(normalizeAccountType(freeeAccountTypeToCrm("checking"))).not.toBe(
      normalizeAccountType(null)
    );
    // freee=普通 / CRM=貯蓄 → 差分として残る
    expect(normalizeAccountType(freeeAccountTypeToCrm("ordinary"))).not.toBe(
      normalizeAccountType("savings")
    );
    // freee=普通 / CRM=未設定 → 消える（これが今回の狙い）
    expect(normalizeAccountType(freeeAccountTypeToCrm("ordinary"))).toBe(
      normalizeAccountType(null)
    );
  });
});
