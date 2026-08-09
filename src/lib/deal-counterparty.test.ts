import { describe, expect, it } from "vitest";
import {
  getDealCounterparties,
  getDealCounterparty,
  getDealCounterpartyLabel,
  type DealCounterpartySource,
} from "./deal-counterparty";

/**
 * UT-73: ディールの相手先表示
 *
 * 取引先は契約成立まで存在しないため、契約前は事業者情報 / 連絡先で相手を示す。
 * **事業者情報と連絡先は同時に紐づく**（「Ａ社のＢさん」。T-0064）ので、
 * 1 件だけ返す版と全件返す版で使い分ける。
 */

const empty: DealCounterpartySource = { account: null, company: null, contact: null };

const account = { id: "a1", name: "株式会社アカウント" };
const company = { id: "c1", name: "株式会社カンパニー" };
const contact = { id: "p1", last_name: "山田", first_name: "太郎" };

describe("getDealCounterparty（1 件だけ返す）", () => {
  it("取引先があれば取引先を返す", () => {
    const cp = getDealCounterparty({ account, company, contact });
    expect(cp).toEqual({
      kind: "account",
      label: "株式会社アカウント",
      href: "/accounts/a1",
    });
  });

  it("取引先が無ければ事業者情報を返す", () => {
    const cp = getDealCounterparty({ ...empty, company, contact });
    expect(cp?.kind).toBe("company");
    expect(cp?.href).toBe("/companies/c1");
  });

  it("連絡先しか無ければ連絡先を返す", () => {
    const cp = getDealCounterparty({ ...empty, contact });
    expect(cp).toEqual({ kind: "contact", label: "山田 太郎", href: "/contacts/p1" });
  });

  it("どれも無ければ null", () => {
    expect(getDealCounterparty(empty)).toBeNull();
    expect(getDealCounterpartyLabel(empty)).toBe("");
  });

  it("名が欠けた連絡先でも姓だけで組み立てる（名刺由来のデータ）", () => {
    const cp = getDealCounterparty({
      ...empty,
      contact: { id: "p2", last_name: "鈴木", first_name: null },
    });
    expect(cp?.label).toBe("鈴木");
  });
});

describe("getDealCounterparties（全部返す）", () => {
  it("事業者情報と連絡先が両方あれば 2 件返す（詳細ページで隠れないこと）", () => {
    const list = getDealCounterparties({ ...empty, company, contact });
    expect(list.map((c) => c.kind)).toEqual(["company", "contact"]);
    expect(list.map((c) => c.label)).toEqual(["株式会社カンパニー", "山田 太郎"]);
  });

  it("3 つとも紐づいていれば取引先→事業者情報→連絡先の順で返す", () => {
    const list = getDealCounterparties({ account, company, contact });
    expect(list.map((c) => c.kind)).toEqual(["account", "company", "contact"]);
  });

  it("どれも無ければ空配列", () => {
    expect(getDealCounterparties(empty)).toEqual([]);
  });

  it("1 件だけのときは getDealCounterparty と同じものを返す", () => {
    const source = { ...empty, company };
    expect(getDealCounterparties(source)).toEqual([getDealCounterparty(source)]);
  });
});
