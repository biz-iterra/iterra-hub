import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 同期の分岐だけを見る。People API と DB は差し替える。
 *
 * 確認したいのは:
 *   - 内容が変わっていない連絡先を無駄に送らないこと（指紋で判断）
 *   - CRM で論理削除された連絡先を Google からも消すこと
 *   - **1 件の失敗で同期全体が止まらないこと**
 *   - etag が無いまま更新して Google 側を黙って上書きしないこと
 */

const connectionRow = {
  id: "conn-1",
  crm_user_id: "user-1",
  email_address: "sales@iterra.jp",
  refresh_token_enc: "\\x00",
  access_token_enc: "\\x01",
  // 十分先の期限。リフレッシュを走らせない
  access_token_expires_at: "2099-01-01T00:00:00Z",
  contact_group_resource: "contactGroups/iterra",
};

/** list_google_push_targets が返す行。テストごとに差し替える */
let pushTargets: Record<string, unknown>[] = [];
/** record_google_push の呼び出しを記録する */
let recorded: Record<string, unknown>[] = [];
/** 接続への update を記録する */
let updates: Record<string, unknown>[] = [];

const source = {
  contact_id: "contact-1",
  contact_code: "CNT-000001",
  last_name: "山田",
  middle_name: null,
  first_name: "太郎",
  last_name_kana: null,
  middle_name_kana: null,
  first_name_kana: null,
  company_name: null,
  department: null,
  job_title: null,
  birth_date: null,
  emails: [],
  phones: [],
  addresses: [],
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: function () {
          return this;
        },
        maybeSingle: async () => ({ data: connectionRow, error: null }),
      }),
      update: (values: Record<string, unknown>) => ({
        eq: async () => {
          updates.push(values);
          return { error: null };
        },
      }),
    }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "list_google_push_targets") {
        return { data: pushTargets, error: null };
      }
      if (name === "get_contact_google_source") {
        return { data: source, error: null };
      }
      if (name === "record_google_push") {
        recorded.push(args);
        return { data: "link-1", error: null };
      }
      return { data: null, error: null };
    },
  }),
}));

vi.mock("./config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./config")>();
  return {
    ...actual,
    getGoogleContactsConfig: () => ({
      clientId: "id",
      clientSecret: "secret",
      encryptionKey: "key",
      allowedDomain: null,
    }),
  };
});

vi.mock("@/lib/gmail/crypto", () => ({
  encryptToken: () => Buffer.from("enc"),
  decryptToken: () => "access-token",
  toByteaLiteral: () => "\\x00",
  fromByteaLiteral: () => Buffer.from("00", "hex"),
}));

const created = vi.fn();
const updated = vi.fn();
const removed = vi.fn();
const groupModified = vi.fn();

vi.mock("./client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client")>();
  return {
    ...actual,
    createContact: (...args: unknown[]) => created(...args),
    updateContact: (...args: unknown[]) => updated(...args),
    deleteContact: (...args: unknown[]) => removed(...args),
    modifyGroupMembers: (...args: unknown[]) => groupModified(...args),
    listContactGroups: async () => [],
    createContactGroup: async () => ({ resourceName: "contactGroups/new" }),
    refreshAccessToken: async () => ({
      accessToken: "access-token",
      refreshToken: null,
      scope: "",
      expiresInSec: 3600,
      idToken: null,
    }),
  };
});

const { syncGoogleContactsConnection } = await import("./sync");
const { fingerprintSource } = await import("./mapping");

beforeEach(() => {
  pushTargets = [];
  recorded = [];
  updates = [];
  created.mockReset().mockResolvedValue({ resourceName: "people/c1", etag: "etag-1" });
  updated.mockReset().mockResolvedValue({ resourceName: "people/c1", etag: "etag-2" });
  removed.mockReset().mockResolvedValue(undefined);
  groupModified.mockReset().mockResolvedValue(undefined);
});

describe("syncGoogleContactsConnection", () => {
  it("未リンクの連絡先を新規作成し、グループへ入れる", async () => {
    pushTargets = [
      {
        contact_id: "contact-1",
        link_id: null,
        resource_name: null,
        etag: null,
        fingerprint: null,
        is_deleted: false,
      },
    ];

    const { data, error } = await syncGoogleContactsConnection("conn-1");

    expect(error).toBeNull();
    expect(data?.created).toBe(1);
    expect(created).toHaveBeenCalledTimes(1);
    // **作った連絡先は必ずグループへ入れる**（同期対象の境界）
    expect(groupModified).toHaveBeenCalledWith(
      expect.objectContaining({ add: ["people/c1"] })
    );
    expect(recorded[0]).toMatchObject({ p_operation: "create", p_succeeded: true });
  });

  it("内容が変わっていなければ送らない（指紋で判断）", async () => {
    pushTargets = [
      {
        contact_id: "contact-1",
        link_id: "link-1",
        resource_name: "people/c1",
        etag: "etag-1",
        fingerprint: fingerprintSource(source),
        is_deleted: false,
      },
    ];

    const { data } = await syncGoogleContactsConnection("conn-1");

    expect(data?.skipped).toBe(1);
    expect(updated).not.toHaveBeenCalled();
    expect(recorded).toHaveLength(0);
  });

  it("内容が変わっていれば更新する", async () => {
    pushTargets = [
      {
        contact_id: "contact-1",
        link_id: "link-1",
        resource_name: "people/c1",
        etag: "etag-1",
        fingerprint: "古い指紋",
        is_deleted: false,
      },
    ];

    const { data } = await syncGoogleContactsConnection("conn-1");

    expect(data?.updated).toBe(1);
    expect(updated).toHaveBeenCalledWith(
      expect.objectContaining({ etag: "etag-1", resourceName: "people/c1" })
    );
  });

  it("**etag が無ければ更新しない**（黙って上書きしない）", async () => {
    pushTargets = [
      {
        contact_id: "contact-1",
        link_id: "link-1",
        resource_name: "people/c1",
        etag: null,
        fingerprint: "古い指紋",
        is_deleted: false,
      },
    ];

    const { data } = await syncGoogleContactsConnection("conn-1");

    expect(data?.skipped).toBe(1);
    expect(updated).not.toHaveBeenCalled();
  });

  it("CRM で論理削除された連絡先は Google からも消す", async () => {
    pushTargets = [
      {
        contact_id: "contact-1",
        link_id: "link-1",
        resource_name: "people/c1",
        etag: "etag-1",
        fingerprint: "fp",
        is_deleted: true,
      },
    ];

    const { data } = await syncGoogleContactsConnection("conn-1");

    expect(data?.deleted).toBe(1);
    expect(removed).toHaveBeenCalledWith(
      expect.objectContaining({ resourceName: "people/c1" })
    );
    expect(recorded[0]).toMatchObject({ p_operation: "delete", p_succeeded: true });
  });

  it("1 件の失敗で同期全体が止まらない", async () => {
    created
      .mockRejectedValueOnce(new Error("Google に拒否されました"))
      .mockResolvedValueOnce({ resourceName: "people/c2", etag: "etag-2" });

    pushTargets = [
      { contact_id: "contact-1", link_id: null, resource_name: null, etag: null, fingerprint: null, is_deleted: false },
      { contact_id: "contact-2", link_id: null, resource_name: null, etag: null, fingerprint: null, is_deleted: false },
    ];

    const { data, error } = await syncGoogleContactsConnection("conn-1");

    expect(error).toBeNull();
    expect(data?.failed).toBe(1);
    expect(data?.created).toBe(1);
    // 失敗も必ず記録する（後から理由を追えるように）
    expect(recorded.some((r) => r.p_succeeded === false)).toBe(true);
  });

  it("最後に同期時刻を記録し、前回のエラーを消す", async () => {
    pushTargets = [];
    await syncGoogleContactsConnection("conn-1");
    expect(updates.at(-1)).toMatchObject({ last_error: null });
    expect(updates.at(-1)).toHaveProperty("last_synced_at");
  });
});
