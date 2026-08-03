import { afterEach, describe, expect, it, vi } from "vitest";
import { getMessageMetadata, isGmailNotFound, listAddedMessageIds } from "./client";

/** Gmail API のレスポンスを 1 回だけ差し替える */
function mockGmailResponse(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status < 400,
      status,
      json: async () => body,
    })
  );
}

const errorBody = (message: string) => ({ error: { message } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Gmail API のエラー文言", () => {
  // 「Gmail API: Requested entity was not found.」が画面に出ていた
  it("404 は削除された可能性まで日本語で伝え、どの操作かを添える", async () => {
    mockGmailResponse(404, errorBody("Requested entity was not found."));
    await expect(getMessageMetadata("token", "abc")).rejects.toThrow(
      /対象が Gmail 上に見つかりませんでした。削除された可能性があります/
    );
  });

  it("404 の原文は調査用に残す", async () => {
    mockGmailResponse(404, errorBody("Requested entity was not found."));
    await expect(getMessageMetadata("token", "abc")).rejects.toThrow(
      /メール本体の取得: Requested entity was not found\./
    );
  });

  it("401 は再連携を促す", async () => {
    mockGmailResponse(401, errorBody("Invalid Credentials"));
    await expect(getMessageMetadata("token", "abc")).rejects.toThrow(
      /Gmail の認証が切れています。連携し直してください/
    );
  });

  it("403 の利用上限超過は待つよう促す", async () => {
    mockGmailResponse(403, errorBody("User Rate Limit Exceeded"));
    await expect(getMessageMetadata("token", "abc")).rejects.toThrow(
      /利用上限に達しました。時間をおいて/
    );
  });

  it("403 の権限不足は付与状況の確認を促す", async () => {
    mockGmailResponse(403, errorBody("Insufficient Permission"));
    await expect(getMessageMetadata("token", "abc")).rejects.toThrow(
      /参照が許可されていません/
    );
  });

  it("5xx は一時障害として伝える", async () => {
    mockGmailResponse(503, errorBody("Backend Error"));
    await expect(getMessageMetadata("token", "abc")).rejects.toThrow(
      /一時的な障害が発生しています/
    );
  });

  it("英語の原文をそのまま投げない", async () => {
    mockGmailResponse(404, errorBody("Requested entity was not found."));
    await expect(getMessageMetadata("token", "abc")).rejects.not.toThrow(
      /^Gmail API: Requested entity was not found\.$/
    );
  });
});

describe("isGmailNotFound", () => {
  it("404 のときだけ true", async () => {
    mockGmailResponse(404, errorBody("Requested entity was not found."));
    const notFound = await getMessageMetadata("token", "abc").catch((e) => e);
    expect(isGmailNotFound(notFound)).toBe(true);

    mockGmailResponse(500, errorBody("Backend Error"));
    const serverError = await getMessageMetadata("token", "abc").catch((e) => e);
    expect(isGmailNotFound(serverError)).toBe(false);
  });

  it("Error 以外を渡しても落ちない", () => {
    expect(isGmailNotFound(null)).toBe(false);
    expect(isGmailNotFound(undefined)).toBe(false);
    expect(isGmailNotFound("404")).toBe(false);
  });
});

describe("listAddedMessageIds", () => {
  // historyId は Gmail 側で数日しか保持されない。失効は異常ではない
  it("履歴が失効（404）したら expired を返して呼び出し側に判断を委ねる", async () => {
    mockGmailResponse(404, errorBody("Requested entity was not found."));
    const result = await listAddedMessageIds("token", "12345");
    expect(result).toEqual({ ids: [], historyId: null, expired: true });
  });

  it("404 以外は投げ直す（握り潰すと取りこぼしに気づけない）", async () => {
    mockGmailResponse(500, errorBody("Backend Error"));
    await expect(listAddedMessageIds("token", "12345")).rejects.toThrow(/一時的な障害/);
  });

  it("追加されたメッセージ ID を重複なく返す", async () => {
    mockGmailResponse(200, {
      history: [
        { messagesAdded: [{ message: { id: "m1" } }, { message: { id: "m2" } }] },
        { messagesAdded: [{ message: { id: "m1" } }] },
      ],
      historyId: "99999",
    });
    const result = await listAddedMessageIds("token", "12345");
    expect(result.ids.sort()).toEqual(["m1", "m2"]);
    expect(result.historyId).toBe("99999");
    expect(result.expired).toBe(false);
  });
});
