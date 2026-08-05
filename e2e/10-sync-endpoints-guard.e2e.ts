import { test, expect } from "@playwright/test";

/**
 * E2E-10 [B] 定期同期の入口が合言葉なしでは動かないこと
 * 仕様: docs/test-cases/08-e2e-scenarios.md §E2E-10
 *
 * 4 つの同期エンドポイントは **middleware の認証対象から外してある**
 * （タスクスケジューラから叩くため）。認証は各ルートが自前で行う。
 * つまり**ここが緩むと、ログインなしで叩ける口が本番に開く**。
 *
 * コンテナはポートを公開していないので外から到達する経路は無いが、
 * 同一ホストの別プロセスからは叩ける。合言葉の要求はそのための備え。
 *
 * 取り込みそのもの（D1 の問い合わせがリードになる）は、
 * `CLOUDFLARE_*` と合言葉が要るためローカルでは動かせない。
 * **本番での確認は T-0036 / T-0055 に残してある。**
 */

const ENDPOINTS = [
  { path: "/api/leads/inquiry-sync", label: "問い合わせ取込" },
  { path: "/api/gmail/sync", label: "Gmail 同期" },
  { path: "/api/freee/sync", label: "freee 同期" },
  { path: "/api/google-contacts/sync", label: "Google コンタクト同期" },
];

test.describe("E2E-10", () => {
  for (const { path, label } of ENDPOINTS) {
    test(`${label}は合言葉なしでは実行されない`, async ({ request }) => {
      // 未設定なら 503、設定済みなら 401。**どちらでも「実行されない」**
      const noAuth = await request.post(path, { data: "" });
      expect([401, 503], `${path} が認証なしで通っている`).toContain(noAuth.status());

      // 間違った合言葉でも同じ
      const wrongAuth = await request.post(path, {
        data: "",
        headers: { Authorization: "Bearer wrong-secret-for-e2e" },
      });
      expect([401, 503], `${path} が誤った合言葉で通っている`).toContain(wrongAuth.status());

      // 返す本文は日本語であること（英語の生エラーを出さない）
      const body = await noAuth.json();
      expect(typeof body.error).toBe("string");
      expect(body.error, `${path} のエラー文言が英語のまま`).toMatch(/[ぁ-んァ-ヶ一-龠]/);
    });

    test(`${label}は GET では動かない`, async ({ request }) => {
      const res = await request.get(path);
      // App Router は未定義のメソッドに 405 を返す
      expect(res.status()).toBe(405);
    });
  }
});
