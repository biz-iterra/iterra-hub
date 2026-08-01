import { afterEach, describe, expect, it } from "vitest";
import { isReachableOrigin, resolveExternalOrigin } from "./app-origin";

/** Docker の standalone サーバーで実際に得られる値 */
const CONTAINER_ORIGIN = "https://0.0.0.0";
const PUBLIC_ORIGIN = "https://hub.iterra.online";

afterEach(() => {
  delete process.env.APP_ORIGIN;
});

describe("isReachableOrigin", () => {
  it("公開ホストなら true", () => {
    expect(isReachableOrigin(PUBLIC_ORIGIN)).toBe(true);
    expect(isReachableOrigin("http://localhost:2000")).toBe(true);
  });

  it("待ち受け専用のアドレスは false", () => {
    expect(isReachableOrigin(CONTAINER_ORIGIN)).toBe(false);
    expect(isReachableOrigin("http://0.0.0.0:3000")).toBe(false);
    expect(isReachableOrigin("http://[::]")).toBe(false);
  });

  it("URL として壊れていれば false", () => {
    expect(isReachableOrigin("hub.iterra.online")).toBe(false);
    expect(isReachableOrigin("")).toBe(false);
  });
});

describe("resolveExternalOrigin", () => {
  it("APP_ORIGIN があればリクエストより優先する", () => {
    process.env.APP_ORIGIN = PUBLIC_ORIGIN;
    expect(resolveExternalOrigin(CONTAINER_ORIGIN)).toBe(PUBLIC_ORIGIN);
  });

  it("APP_ORIGIN の末尾スラッシュは落とす", () => {
    process.env.APP_ORIGIN = `${PUBLIC_ORIGIN}/`;
    expect(resolveExternalOrigin(CONTAINER_ORIGIN)).toBe(PUBLIC_ORIGIN);
  });

  it("APP_ORIGIN が無ければリクエスト由来の値を使う（開発機）", () => {
    expect(resolveExternalOrigin("http://localhost:2000")).toBe(
      "http://localhost:2000"
    );
  });

  it("どちらも辿り着けない値なら null（設定漏れとして扱う）", () => {
    expect(resolveExternalOrigin(CONTAINER_ORIGIN)).toBeNull();
  });

  it("APP_ORIGIN 自体が不正なら null（誤設定を黙って握り潰さない）", () => {
    process.env.APP_ORIGIN = "hub.iterra.online";
    expect(resolveExternalOrigin(PUBLIC_ORIGIN)).toBeNull();
  });
});
