import { describe, expect, it } from "vitest";
import {
  parseAddressList,
  normalizeEmail,
  emailDomain,
  getSkipReason,
  extractParticipants,
} from "./address";

describe("parseAddressList", () => {
  it("表示名つきアドレスを分解する", () => {
    expect(parseAddressList("山田 太郎 <taro@example.co.jp>")).toEqual([
      { email: "taro@example.co.jp", name: "山田 太郎" },
    ]);
  });

  it("アドレスのみでも読む", () => {
    expect(parseAddressList("taro@example.co.jp")).toEqual([
      { email: "taro@example.co.jp", name: null },
    ]);
  });

  it("複数アドレスをカンマで分ける", () => {
    const result = parseAddressList(
      "a@example.com, 佐藤 <b@example.com>, c@example.com"
    );
    expect(result.map((r) => r.email)).toEqual([
      "a@example.com",
      "b@example.com",
      "c@example.com",
    ]);
  });

  it("クォート内のカンマで区切らない", () => {
    const result = parseAddressList('"Yamada, Taro" <taro@example.com>, b@example.com');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ email: "taro@example.com", name: "Yamada, Taro" });
  });

  it("大文字は小文字に寄せる", () => {
    expect(parseAddressList("Taro@Example.CO.JP")[0].email).toBe("taro@example.co.jp");
  });

  it("空・不正な値は落とす", () => {
    expect(parseAddressList(null)).toEqual([]);
    expect(parseAddressList("")).toEqual([]);
    expect(parseAddressList("not-an-address")).toEqual([]);
  });
});

describe("normalizeEmail / emailDomain", () => {
  it("前後の空白と大文字を整える", () => {
    expect(normalizeEmail("  Taro@Example.com ")).toBe("taro@example.com");
  });

  it("形が不正なら null", () => {
    expect(normalizeEmail("taro@localhost")).toBeNull();
    expect(normalizeEmail("@example.com")).toBeNull();
    expect(normalizeEmail("")).toBeNull();
  });

  it("ドメインを取り出す", () => {
    expect(emailDomain("taro@example.co.jp")).toBe("example.co.jp");
  });
});

describe("getSkipReason", () => {
  const options = {
    ownDomains: ["iterra.jp"],
    connectedAddresses: ["me@iterra.jp", "sales@iterra.jp"],
  };

  it("連携中の自分のアドレスは対象外", () => {
    expect(getSkipReason("me@iterra.jp", options)).toBe("self");
  });

  it("自社ドメインは社内メールとして対象外", () => {
    expect(getSkipReason("other@iterra.jp", options)).toBe("own_domain");
  });

  it("自動送信アドレスは対象外", () => {
    expect(getSkipReason("no-reply@service.com", options)).toBe("noreply");
    expect(getSkipReason("noreply@service.com", options)).toBe("noreply");
    expect(getSkipReason("mailer-daemon@service.com", options)).toBe("noreply");
  });

  it("配信系のローカル部は対象外", () => {
    expect(getSkipReason("newsletter@service.com", options)).toBe("list");
    expect(getSkipReason("info@service.com", options)).toBe("list");
  });

  it("サブアドレス付きでも本体で判定する", () => {
    expect(getSkipReason("info+campaign@service.com", options)).toBe("list");
  });

  it("通常の相手は対象", () => {
    expect(getSkipReason("taro@example.co.jp", options)).toBeNull();
  });
});

describe("extractParticipants", () => {
  const options = {
    ownDomains: ["iterra.jp"],
    connectedAddresses: ["me@iterra.jp"],
  };

  it("From / To / Cc を役割つきで返す", () => {
    const result = extractParticipants(
      {
        from: "山田 <taro@example.co.jp>",
        to: "me@iterra.jp, 鈴木 <suzuki@other.co.jp>",
        cc: "sato@third.co.jp",
      },
      options
    );
    expect(result).toEqual([
      { email: "taro@example.co.jp", name: "山田", role: "from" },
      { email: "suzuki@other.co.jp", name: "鈴木", role: "to" },
      { email: "sato@third.co.jp", name: null, role: "cc" },
    ]);
  });

  it("同じアドレスが複数欄にあっても 1 度だけ返す", () => {
    const result = extractParticipants(
      { from: "taro@example.co.jp", to: "taro@example.co.jp", cc: null },
      options
    );
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("from");
  });

  it("社内・自動送信だけのメールでは空になる", () => {
    const result = extractParticipants(
      { from: "me@iterra.jp", to: "colleague@iterra.jp", cc: "no-reply@x.com" },
      options
    );
    expect(result).toEqual([]);
  });
});
