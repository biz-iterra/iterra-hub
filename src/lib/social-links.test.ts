import { describe, expect, it } from "vitest";

import { buildSocialDmUrl, isPassthroughTemplate } from "./social-links";

/** マイグレーション 20260802000020 で入れる雛形と同じもの */
const CHATWORK = {
  dm_url_template: "https://www.chatwork.com/#!rid{account_id}",
  requires_workspace: false,
};
const SLACK = {
  dm_url_template: "https://app.slack.com/client/{workspace}/{account_id}",
  requires_workspace: true,
};
const LINE = {
  dm_url_template: "https://line.me/ti/p/~{account_id}",
  requires_workspace: false,
};
const OTHER = { dm_url_template: "{account_id}", requires_workspace: false };

describe("buildSocialDmUrl", () => {
  it("ID を差し替えて相手ひとりの画面を開く", () => {
    expect(buildSocialDmUrl(CHATWORK, { account_id: "123456789" })).toBe(
      "https://www.chatwork.com/#!rid123456789"
    );
    expect(buildSocialDmUrl(LINE, { account_id: "itera_taro" })).toBe(
      "https://line.me/ti/p/~itera_taro"
    );
  });

  it("ワークスペースが要るサービスは両方揃って初めて開ける", () => {
    expect(
      buildSocialDmUrl(SLACK, { account_id: "U01ABCDEF", workspace: "T01ABCDEF" })
    ).toBe("https://app.slack.com/client/T01ABCDEF/U01ABCDEF");

    // 片方だけでは相手が定まらない。壊れた URL を作らず開けないと答える
    expect(buildSocialDmUrl(SLACK, { account_id: "U01ABCDEF" })).toBeNull();
    expect(
      buildSocialDmUrl(SLACK, { account_id: "U01ABCDEF", workspace: "  " })
    ).toBeNull();
  });

  it("ID が空なら開けない", () => {
    expect(buildSocialDmUrl(LINE, { account_id: "" })).toBeNull();
    expect(buildSocialDmUrl(LINE, { account_id: "   " })).toBeNull();
  });

  it("雛形が無いサービスは開けない", () => {
    expect(
      buildSocialDmUrl({ dm_url_template: null, requires_workspace: false }, {
        account_id: "abc",
      })
    ).toBeNull();
  });

  it("記号を含む ID を入れても雛形の形を壊さない", () => {
    // `/` がそのまま入るとパスが増えてしまう
    expect(buildSocialDmUrl(LINE, { account_id: "a/b" })).toBe(
      "https://line.me/ti/p/~a%2Fb"
    );
  });

  it("「その他」は入れた URL をそのまま開く", () => {
    expect(
      buildSocialDmUrl(OTHER, { account_id: "https://example.com/dm?u=1" })
    ).toBe("https://example.com/dm?u=1");
  });

  it("http(s) でない値は開かない", () => {
    // 「その他」の欄に何でも書けてしまうため、ここで止める
    expect(
      buildSocialDmUrl(OTHER, { account_id: "javascript:alert(1)" })
    ).toBeNull();
    expect(buildSocialDmUrl(OTHER, { account_id: "ただの文字列" })).toBeNull();
  });
});

describe("isPassthroughTemplate", () => {
  it("差し替えが ID だけの雛形を見分ける", () => {
    expect(isPassthroughTemplate("{account_id}")).toBe(true);
    expect(isPassthroughTemplate("  {account_id}  ")).toBe(true);
    expect(isPassthroughTemplate("https://line.me/ti/p/~{account_id}")).toBe(false);
    expect(isPassthroughTemplate(null)).toBe(false);
  });
});
