import { test, expect } from "@playwright/test";
import { authFile } from "./roles";
import {
  e2eName,
  expectSuccessToast,
  fieldByLabel,
  selectFirstRealOption,
} from "./helpers";

/**
 * E2E-15 [A] 兼務（1 人が複数の事業者情報に関わる）
 * 仕様: docs/test-cases/08-e2e-scenarios.md §E2E-15
 *
 * `contacts.company_id` は「主たる所属」で 1 社しか持てない。
 * 2 社目以降は `company_contacts` に入れる（2026-08-06。T-0059）。
 *
 * freee の突合で、同じ人が 2 社の担当者になっている例が出たのが発端。
 * **主たる所属だけを見ていると、関わりのある人を取りこぼす。**
 */

test.describe("E2E-15", () => {
  test.use({ storageState: authFile("admin") });

  test("連絡先を 2 社目の事業者情報に兼務として紐づけられる", async ({ page }) => {
    const mainCompany = e2eName("15A");
    const sideCompany = e2eName("15B");
    const lastName = e2eName("15C");

    const createCompany = async (name: string) => {
      await page.goto("/companies/new");
      await fieldByLabel(page, "事業者名 *").fill(name);
      await selectFirstRealOption(fieldByLabel(page, "ステータス *"));
      await page.getByRole("button", { name: "作成" }).click();
      await expectSuccessToast(page, "事業者情報を作成しました");
      await page.waitForURL(/\/companies\/[0-9a-f-]{36}$/);
      return page.url().split("/").pop()!;
    };

    const mainId = await createCompany(mainCompany);
    const sideId = await createCompany(sideCompany);

    // ---- 1. 主たる所属を持つ連絡先を作る ----
    await page.goto(`/contacts/new?company_id=${mainId}`);
    await fieldByLabel(page, "姓 *").fill(lastName);
    await fieldByLabel(page, "名 *").fill("太郎");
    await selectFirstRealOption(fieldByLabel(page, "ステータス *"));
    await page.getByRole("button", { name: "作成" }).click();
    await expectSuccessToast(page, "連絡先を作成しました");
    await page.waitForURL(/\/contacts\/[0-9a-f-]{36}$/);
    const contactId = page.url().split("/").pop()!;

    // ---- 2. 最初は兼務なし ----
    await expect(page.getByRole("heading", { name: "兼務先" })).toBeVisible();
    await expect(page.getByText("兼務先はありません。")).toBeVisible();

    // ---- 3. 2 社目を兼務として足す ----
    await page.getByRole("button", { name: "兼務先を追加" }).click();
    const select = page.getByLabel("兼務先の事業者情報");
    await select.fill(sideCompany);
    await page.getByRole("option", { name: new RegExp(sideCompany) }).first().click();
    await page.getByLabel("兼務先での役職").fill("取締役");
    await page.getByRole("button", { name: "追加する" }).click();
    await expectSuccessToast(page, "兼務先を追加しました");

    await expect(page.getByRole("link", { name: sideCompany })).toBeVisible();
    await expect(page.getByText("取締役")).toBeVisible();

    // ---- 4. 兼務先の事業者情報から見えること ----
    // **主たる所属だけを見ていると出てこない**のがこの機能の要点
    await page.goto(`/companies/${sideId}`);
    const listed = page.locator("div").filter({ hasText: lastName });
    await expect(listed.first()).toBeVisible();
    await expect(page.getByText("兼務").first()).toBeVisible();

    // 主たる所属の側にも今までどおり出ること
    await page.goto(`/companies/${mainId}`);
    await expect(page.getByRole("link", { name: new RegExp(lastName) }).first()).toBeVisible();

    // ---- 5. 主たる所属と同じ事業者は選べないこと ----
    // DB のトリガーも拒むが、押せてからエラーになるより出さない方がよい
    await page.goto(`/contacts/${contactId}`);
    await page.getByRole("button", { name: "兼務先を追加" }).click();
    await page.getByLabel("兼務先の事業者情報").fill(mainCompany);
    await expect(
      page.getByRole("option", { name: new RegExp(mainCompany) }),
      "主たる所属が兼務の候補に出ている"
    ).toHaveCount(0);

    // ---- 6. 外せること ----
    await page.reload();
    await page.getByRole("button", { name: "この兼務先を外す" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "外す", exact: true }).click();
    await expectSuccessToast(page, "兼務先を外しました");
    await expect(page.getByText("兼務先はありません。")).toBeVisible();

    // ---- 後片付け ----
    await page.goto(`/contacts/${contactId}/edit`);
    await page.getByRole("button", { name: "削除", exact: true }).click();
    await page.getByRole("button", { name: "削除する" }).click();
    await expectSuccessToast(page, "連絡先を削除しました");

    for (const id of [sideId, mainId]) {
      await page.goto(`/companies/${id}/edit`);
      await page.getByRole("button", { name: "削除", exact: true }).click();
      await page.getByRole("button", { name: "削除する" }).click();
      await expectSuccessToast(page, "事業者情報を削除しました");
    }
  });
});
