import { test, expect } from "@playwright/test";
import { TEST_USERS } from "./roles";

/**
 * E2E-01 [S] ログイン → ダッシュボード → ログアウト
 * 仕様: docs/test-cases/08-e2e-scenarios.md §3
 *
 * ファイル名は 06 だが、シナリオ番号は仕様どおり E2E-01。
 * 実行順を最後に回しているのは、Supabase の signOut() が既定で
 * scope: "global"（そのユーザーの全セッションを失効）であるため。
 * このテストが admin で signOut すると、global-setup が admin 用に作った
 * storageState（他の E2E-02〜05 が使い回す）まで無効化してしまう。
 * ファイル名（= 実行順）でこのテストを最後に回し、他シナリオの admin
 * セッションを壊さないようにしている。
 */
/**
 * **このファイルは必ず最後に実行されること。** ファイル名を 99 にしているのはそのため。
 *
 * 本シナリオはログアウトを行い、Supabase 側で admin のセッションを無効化する。
 * 全テストが同じ storageState（global setup で作った Cookie）を使い回すため、
 * この後に走るテストは未認証になり、開いた画面がログインフォームになる。
 * 実際に E2E-12 を足したとき、ファイル名順で 06 の後に走って赤くなった（2026-08-04）。
 */
test.describe("E2E-01", () => {
  // このシナリオは未認証状態から始める必要があるため、既定の storageState を使わない
  test.use({ storageState: { cookies: [], origins: [] } });

  test("未認証リダイレクト→admin ログイン→ダッシュボード表示→ログアウト @smoke", async ({ page }) => {
    // 1. 未認証で /dashboard へ → /login にリダイレクトされる
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login(\?.*)?$/);

    // 2. admin でログイン → /dashboard 表示、KPI カードとファネルが描画される
    await page.getByLabel("メールアドレス").fill(TEST_USERS.admin.email);
    await page.getByLabel("パスワード").fill(TEST_USERS.admin.password);
    await page.getByRole("button", { name: "ログイン" }).click();
    await page.waitForURL("**/dashboard");

    await expect(page.getByRole("heading", { name: "ダッシュボード" })).toBeVisible();
    await expect(page.getByText("進行中ディール")).toBeVisible();
    await expect(page.getByText("パイプラインファネル")).toBeVisible();

    // 3. ログアウト → /login へ戻り、/deals への直アクセスが再び弾かれる
    await page.getByRole("button", { name: TEST_USERS.admin.fullName }).click();
    await page.getByRole("menuitem", { name: "ログアウト" }).click();
    await page.waitForURL("**/login");

    await page.goto("/sales");
    await expect(page).toHaveURL(/\/login(\?.*)?$/);
  });
});
