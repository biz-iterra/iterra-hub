import { describe, expect, it } from "vitest";
import {
  emailTypeToCrm,
  fingerprintSource,
  normalizePhone,
  phoneTypeToCrm,
  toGoogleBirthday,
  toGoogleContactRow,
  toGooglePerson,
  type ContactSource,
} from "./mapping";

/**
 * 対応表の正本は docs/google-contacts-sync.md §4。
 * **ここが仕様の固定点**で、表を変えたら必ずこのテストも変える。
 */

const base: ContactSource = {
  contact_id: "10000000-0000-0000-0000-000000000001",
  contact_code: "CNT-000123",
  last_name: "田中",
  middle_name: null,
  first_name: "真理子",
  last_name_kana: "タナカ",
  middle_name_kana: null,
  first_name_kana: "マリコ",
  company_name: null,
  department: null,
  job_title: null,
  birth_date: null,
  emails: [],
  phones: [],
  addresses: [],
};

describe("toGooglePerson", () => {
  it("姓名とカナを構造のまま渡す（切れ目を推測しない）", () => {
    const p = toGooglePerson(base);
    expect(p.names?.[0]).toMatchObject({
      familyName: "田中",
      givenName: "真理子",
      phoneticFamilyName: "タナカ",
      phoneticGivenName: "マリコ",
    });
  });

  it("連絡先コードを clientData に刻む（対応付けの復元用）", () => {
    expect(toGooglePerson(base).clientData).toEqual([
      { key: "iterra_contact_code", value: "CNT-000123" },
    ]);
  });

  it("メールのラベルを変換し、主のものを先頭に置く", () => {
    const p = toGooglePerson({
      ...base,
      emails: [
        { email: "sub@example.com", label: "personal", is_primary: false },
        { email: "main@example.com", label: "work", is_primary: true },
      ],
    });
    expect(p.emailAddresses).toEqual([
      { value: "main@example.com", type: "work" },
      { value: "sub@example.com", type: "home" },
    ]);
  });

  it("電話のラベルを変換する（fax は workFax）", () => {
    const p = toGooglePerson({
      ...base,
      phones: [
        { phone: "03-1234-5678", label: "fax", is_primary: false },
        { phone: "090-0000-0000", label: "mobile", is_primary: true },
      ],
    });
    expect(p.phoneNumbers).toEqual([
      { value: "090-0000-0000", type: "mobile" },
      { value: "03-1234-5678", type: "workFax" },
    ]);
  });

  it("住所を Google の項目名へ移す", () => {
    const p = toGooglePerson({
      ...base,
      addresses: [
        {
          label: "main",
          is_primary: true,
          postal_code: "150-0001",
          prefecture: "東京都",
          city: "渋谷区",
          address_line1: "神宮前1-1-1",
          address_line2: "イテラビル 3F",
        },
      ],
    });
    expect(p.addresses).toEqual([
      {
        type: "work",
        postalCode: "150-0001",
        region: "東京都",
        city: "渋谷区",
        streetAddress: "神宮前1-1-1",
        extendedAddress: "イテラビル 3F",
      },
    ]);
  });

  it("会社・部署・役職が全て無ければ organizations を送らない", () => {
    expect(toGooglePerson(base).organizations).toBeUndefined();
    const p = toGooglePerson({ ...base, department: "営業部" });
    expect(p.organizations).toEqual([
      { name: undefined, department: "営業部", title: undefined },
    ]);
  });

  it("誕生日を送る（同期対象。2026-08-05 の依頼）", () => {
    expect(toGooglePerson({ ...base, birth_date: "1990-04-05" }).birthdays).toEqual([
      { date: { year: 1990, month: 4, day: 5 } },
    ]);
    expect(toGooglePerson(base).birthdays).toBeUndefined();
  });

  it("空文字の項目は undefined にして送らない", () => {
    const p = toGooglePerson({ ...base, middle_name: "  ", last_name_kana: "" });
    expect(p.names?.[0].middleName).toBeUndefined();
    expect(p.names?.[0].phoneticFamilyName).toBeUndefined();
  });
});

describe("toGoogleBirthday", () => {
  it("yyyy-mm-dd を分解する", () => {
    expect(toGoogleBirthday("1990-04-05")).toEqual({ year: 1990, month: 4, day: 5 });
  });
  it("形式が違えば送らない", () => {
    expect(toGoogleBirthday("1990/04/05")).toBeNull();
    expect(toGoogleBirthday(null)).toBeNull();
  });
});

describe("ラベルの逆変換", () => {
  it("メールは home を personal に戻し、知らない型は other", () => {
    expect(emailTypeToCrm("work")).toBe("work");
    expect(emailTypeToCrm("home")).toBe("personal");
    expect(emailTypeToCrm("カスタム")).toBe("other");
    expect(emailTypeToCrm(undefined)).toBe("other");
  });

  it("電話は fax 系をまとめ、main は work に寄せる", () => {
    expect(phoneTypeToCrm("main")).toBe("work");
    expect(phoneTypeToCrm("homeFax")).toBe("fax");
    expect(phoneTypeToCrm("otherFax")).toBe("fax");
    expect(phoneTypeToCrm("mobile")).toBe("mobile");
    expect(phoneTypeToCrm(undefined)).toBe("other");
  });
});

describe("toGoogleContactRow", () => {
  it("Google の連絡先をミラーの行へ落とす", () => {
    const row = toGoogleContactRow({
      resourceName: "people/c1",
      etag: "etag-1",
      names: [{ familyName: "鈴木", givenName: "次郎", phoneticFamilyName: "スズキ" }],
      emailAddresses: [{ value: " Jiro@Example.com ", type: "home" }],
      phoneNumbers: [{ value: "090-1111-2222", type: "mobile" }],
      organizations: [{ name: "株式会社イテラ", title: "部長" }],
      clientData: [{ key: "iterra_contact_code", value: "CNT-000999" }],
      memberships: [
        { contactGroupMembership: { contactGroupResourceName: "contactGroups/abc" } },
      ],
    });

    expect(row.family_name).toBe("鈴木");
    expect(row.emails).toEqual([{ email: "Jiro@Example.com", label: "personal" }]);
    expect(row.phones).toEqual([{ phone: "090-1111-2222", label: "mobile" }]);
    expect(row.org_name).toBe("株式会社イテラ");
    expect(row.client_contact_code).toBe("CNT-000999");
    expect(row.group_resource_names).toEqual(["contactGroups/abc"]);
    expect(row.google_deleted).toBe(false);
  });

  it("**年なしの誕生日は取り込めない**（CRM は DATE）。表示用に別で持つ", () => {
    const row = toGoogleContactRow({
      resourceName: "people/c2",
      birthdays: [{ date: { month: 4, day: 5 } }],
    });
    expect(row.birth_date).toBeNull();
    expect(row.birthday_without_year).toBe("04-05");
  });

  it("年ありの誕生日は yyyy-mm-dd にする", () => {
    const row = toGoogleContactRow({
      resourceName: "people/c3",
      birthdays: [{ date: { year: 1985, month: 12, day: 1 } }],
    });
    expect(row.birth_date).toBe("1985-12-01");
    expect(row.birthday_without_year).toBeNull();
  });

  it("削除された連絡先を見分ける（差分取得で現れる）", () => {
    const row = toGoogleContactRow({
      resourceName: "people/c4",
      metadata: { deleted: true },
    });
    expect(row.google_deleted).toBe(true);
  });

  it("値が空のメール・電話は落とす", () => {
    const row = toGoogleContactRow({
      resourceName: "people/c5",
      emailAddresses: [{ value: "  ", type: "work" }],
      phoneNumbers: [{ type: "work" }],
    });
    expect(row.emails).toEqual([]);
    expect(row.phones).toEqual([]);
  });
});

describe("fingerprintSource", () => {
  it("同じ内容なら同じ指紋になる（並び順が違っても）", () => {
    const a: ContactSource = {
      ...base,
      emails: [
        { email: "a@example.com", label: "work", is_primary: true },
        { email: "b@example.com", label: "other", is_primary: false },
      ],
    };
    const b: ContactSource = {
      ...base,
      emails: [
        { email: "B@example.com", label: "other", is_primary: false },
        { email: "a@example.com", label: "work", is_primary: true },
      ],
    };
    // メールは小文字化して比べるので、大文字違いも同じ扱い
    expect(fingerprintSource(a)).toBe(fingerprintSource(b));
  });

  it("電話は書式が違っても数字が同じなら同じ指紋", () => {
    const a = { ...base, phones: [{ phone: "03-1234-5678", label: "work", is_primary: true }] };
    const b = { ...base, phones: [{ phone: "0312345678", label: "work", is_primary: true }] };
    expect(fingerprintSource(a)).toBe(fingerprintSource(b));
    expect(normalizePhone("03-1234-5678")).toBe("0312345678");
  });

  it("同期対象が変われば指紋が変わる", () => {
    expect(fingerprintSource({ ...base, department: "営業部" })).not.toBe(
      fingerprintSource(base)
    );
    expect(fingerprintSource({ ...base, birth_date: "1990-04-05" })).not.toBe(
      fingerprintSource(base)
    );
  });
});
