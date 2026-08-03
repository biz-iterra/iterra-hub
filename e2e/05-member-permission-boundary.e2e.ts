import { test, expect } from "@playwright/test";
import { authFile } from "./roles";
import { e2eName, expectSuccessToast, fieldByLabel, openAs, selectFirstRealOption } from "./helpers";

/**
 * E2E-05 [S] 権限境界の通し確認（member）
 * 仕様: docs/test-cases/08-e2e-scenarios.md §3
 *
 * 2026-08-03 に /admin のロールガードを追加したばかりのため、その回帰を
 * 毎回検知する役目を持つ（member で /admin 直 URL が /dashboard へリダイレクトされること）。
 */
test.describe("E2E-05", () => {
  test.use({ storageState: authFile("member") });

  test("member の権限境界が一通り効いている @smoke", async ({ page, browser }) => {
    // 他人（admin）の事業者情報を用意しておく（見つからないことの確認用）
    const { context: adminCtx, page: adminPage } = await openAs(browser, "admin");
    const othersCompanyName = e2eName("05");
    let othersCompanyId = "";
    try {
      await adminPage.goto("/companies/new");
      await fieldByLabel(adminPage, "会社名 *").fill(othersCompanyName);
      await selectFirstRealOption(fieldByLabel(adminPage, "ステータス *"));
      await adminPage.getByRole("button", { name: "作成" }).click();
      await expectSuccessToast(adminPage, "事業者情報を作成しました");
      // 作成直後の自動遷移は待たず、一覧の検索から辿る（e2e/helpers.ts 冒頭の既知の問題を参照）
      await adminPage.goto("/companies");
      await adminPage.getByPlaceholder("会社名で検索...").fill(othersCompanyName);
      const createdCompanyLink = adminPage.getByRole("link", { name: othersCompanyName, exact: true });
      await expect(createdCompanyLink).toBeVisible();
      await createdCompanyLink.click();
      await adminPage.waitForURL(/\/companies\/[0-9a-f-]{36}$/);
      othersCompanyId = new URL(adminPage.url()).pathname.split("/").pop()!;

      // 2. /contracts が閲覧不可（0 件・作成導線なし）であること
      await page.goto("/contracts");
      await expect(page.getByRole("heading", { name: "契約" })).toBeVisible();
      await expect(page.getByText("契約がまだありません")).toBeVisible();
      await expect(page.getByRole("link", { name: "新規作成" })).toHaveCount(0);

      // /contracts/new への直 URL も拒否される（多層防御: ページ側でも弾く）
      await page.goto("/contracts/new");
      await expect(page.getByText("作成権限がありません")).toBeVisible();

      // 3. /admin への直 URL が拒否される（/dashboard へリダイレクト）
      await page.goto("/admin");
      await page.waitForURL("**/dashboard");
      await expect(page.getByRole("heading", { name: "ダッシュボード" })).toBeVisible();

      // 4. 他人（admin）の事業者情報詳細へ直 URL → 「見つかりません」
      await page.goto(`/companies/${othersCompanyId}`);
      await expect(page.getByText("事業者情報が見つかりません")).toBeVisible();
      await expect(page.getByRole("link", { name: "事業者情報一覧" })).toBeVisible();

      // 5. サイドバーに管理・契約メニューが出ないこと
      await page.goto("/dashboard");
      const nav = page.locator("nav").first();
      await expect(nav.getByRole("link", { name: "各種設定" })).toHaveCount(0);
      await expect(nav.getByRole("link", { name: "メンバー管理" })).toHaveCount(0);
      await expect(nav.getByRole("link", { name: "インポート" })).toHaveCount(0);
      await expect(nav.getByRole("link", { name: "契約" })).toHaveCount(0);
    } finally {
      // ---- 後片付け（admin）----
      if (othersCompanyId) {
        await adminPage.goto(`/companies/${othersCompanyId}/edit`);
        await adminPage.getByRole("button", { name: "削除", exact: true }).click();
        await adminPage.getByRole("button", { name: "削除する" }).click();
        await expectSuccessToast(adminPage, "事業者情報を削除しました");
      }
      await adminCtx.close();
    }
  });
});
