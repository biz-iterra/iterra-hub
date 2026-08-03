import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 同期の分岐だけを見る。Gmail API と DB は差し替える。
 *
 * 確認したいのは「1 通の欠落で同期全体が止まらないこと」。
 * 差分履歴に載った直後に削除されたメールは 404 になり、以前は
 * その時点で同期全体が失敗して次回以降も同じ ID で失敗し続けていた。
 */

const gmailApiError = (status: number, message: string) => {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
};

const connectionRow = {
  id: "conn-1",
  crm_user_id: "user-1",
  email_address: "sales@iterra.jp",
  refresh_token_enc: "\\x00",
  last_history_id: "1000",
  last_synced_at: "2026-08-01T00:00:00Z",
};

/** gmail_connections への update を記録する */
let updates: Record<string, unknown>[] = [];
/** record_email_message の呼び出しを記録する */
let rpcCalls: string[] = [];

function makeQuery(columns: string) {
  const isConnectionLookup = columns.includes("refresh_token_enc");
  const result = isConnectionLookup
    ? { data: connectionRow, error: null }
    : { data: [{ email_address: connectionRow.email_address }], error: null };

  const query: Record<string, unknown> = {
    eq: () => makeQuery(columns),
    maybeSingle: async () => result,
    // `await admin.from(...).select(...).eq(...)` を成立させる
    then: (resolve: (v: unknown) => unknown) => resolve(result),
  };
  return query;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: (columns: string) => makeQuery(columns),
      update: (values: Record<string, unknown>) => ({
        eq: async () => {
          updates.push(values);
          return { error: null };
        },
      }),
    }),
    rpc: async (name: string) => {
      rpcCalls.push(name);
      return { error: null };
    },
  }),
}));

vi.mock("./config", () => ({
  getGmailConfig: () => ({
    clientId: "id",
    clientSecret: "secret",
    encryptionKey: Buffer.alloc(32),
    redirectUri: "http://localhost/callback",
  }),
}));

vi.mock("./crypto", () => ({
  decryptToken: () => "refresh-token",
  fromByteaLiteral: () => Buffer.alloc(0),
}));

const clientMocks = vi.hoisted(() => ({
  refreshAccessToken: vi.fn(),
  getProfile: vi.fn(),
  listMessageIds: vi.fn(),
  listAddedMessageIds: vi.fn(),
  getMessageMetadata: vi.fn(),
}));

vi.mock("./client", async () => {
  const actual = await vi.importActual<typeof import("./client")>("./client");
  return { ...actual, ...clientMocks };
});

const { syncConnection } = await import("./sync");

function metaOf(id: string) {
  return {
    id,
    threadId: `thread-${id}`,
    internalDate: "1754179200000",
    labelIds: ["INBOX"],
    headers: {
      from: "取引先 太郎 <taro@example.com>",
      to: "sales@iterra.jp",
      subject: "見積の件",
    },
  };
}

beforeEach(() => {
  updates = [];
  rpcCalls = [];
  vi.clearAllMocks();
  clientMocks.refreshAccessToken.mockResolvedValue({
    accessToken: "access-token",
    refreshToken: null,
    scope: "",
    expiresInSec: 3600,
  });
  clientMocks.getProfile.mockResolvedValue({
    emailAddress: connectionRow.email_address,
    historyId: "2000",
  });
  clientMocks.listMessageIds.mockResolvedValue({ ids: [], nextPageToken: null });
  clientMocks.listAddedMessageIds.mockResolvedValue({
    ids: [],
    historyId: "1500",
    expired: false,
  });
  clientMocks.getMessageMetadata.mockImplementation(async (_t: string, id: string) =>
    metaOf(id)
  );
});

describe("syncConnection", () => {
  it("削除済みメール（404）は飛ばして残りの取り込みを続ける", async () => {
    clientMocks.listAddedMessageIds.mockResolvedValue({
      ids: ["gone", "alive"],
      historyId: "1500",
      expired: false,
    });
    clientMocks.getMessageMetadata.mockImplementation(async (_t: string, id: string) => {
      if (id === "gone") {
        throw gmailApiError(404, "対象が Gmail 上に見つかりませんでした");
      }
      return metaOf(id);
    });

    const { data, error } = await syncConnection("conn-1");

    expect(error).toBeNull();
    expect(data?.missing).toBe(1);
    expect(data?.recorded).toBe(1);
    expect(rpcCalls).toEqual(["record_email_message"]);
  });

  it("404 以外は同期を止め、理由を last_error に残す", async () => {
    clientMocks.listAddedMessageIds.mockResolvedValue({
      ids: ["boom"],
      historyId: "1500",
      expired: false,
    });
    clientMocks.getMessageMetadata.mockRejectedValue(
      gmailApiError(500, "Gmail 側で一時的な障害が発生しています")
    );

    const { data, error } = await syncConnection("conn-1");

    expect(data).toBeNull();
    expect(error).toMatch(/一時的な障害/);
    expect(updates.at(-1)).toMatchObject({ last_error: expect.stringMatching(/一時的な障害/) });
  });

  it("成功したら last_error を消して historyId を進める", async () => {
    clientMocks.listAddedMessageIds.mockResolvedValue({
      ids: [],
      historyId: "1500",
      expired: false,
    });

    const { error } = await syncConnection("conn-1");

    expect(error).toBeNull();
    expect(updates.at(-1)).toMatchObject({ last_history_id: "1500", last_error: null });
  });

  // 失効のたびに直近分を走査していると、いつまでも差分同期に戻れない
  it("履歴が失効したら現在の historyId を控えて次回から差分に戻す", async () => {
    clientMocks.listAddedMessageIds.mockResolvedValue({
      ids: [],
      historyId: null,
      expired: true,
    });
    clientMocks.listMessageIds.mockResolvedValue({ ids: [], nextPageToken: null });

    const { data, error } = await syncConnection("conn-1");

    expect(error).toBeNull();
    expect(data?.fellBackToFullScan).toBe(true);
    expect(clientMocks.getProfile).toHaveBeenCalled();
    expect(updates.at(-1)).toMatchObject({ last_history_id: "2000" });
  });

  it("初回同期でも historyId を控える", async () => {
    const firstSync = { ...connectionRow, last_history_id: null, last_synced_at: null };
    Object.assign(connectionRow, firstSync);

    const { error } = await syncConnection("conn-1");

    expect(error).toBeNull();
    expect(clientMocks.listAddedMessageIds).not.toHaveBeenCalled();
    expect(updates.at(-1)).toMatchObject({ last_history_id: "2000" });

    // 他のテストへ影響させない
    Object.assign(connectionRow, {
      last_history_id: "1000",
      last_synced_at: "2026-08-01T00:00:00Z",
    });
  });
});
