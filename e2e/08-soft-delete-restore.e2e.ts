import { test, expect } from "@playwright/test";
import { authFile } from "./roles";
import {
  e2eName,
  expectSuccessToast,
  fieldByLabel,
  searchInList,
  selectFirstRealOption,
} from "./helpers";

/**
 * E2E-08 [A] 論理削除 → 削除済み一覧 → 復元
 * 仕様: docs/test-cases/08-e2e-scenarios.md §E2E-08
 *
 * **物理削除はしない**という方針（`docs/database-design.md`）が画面まで
 * 通っていることを見る。削除した行は消えたように見えるだけで、
 * `/admin/deleted` から戻せなければならない。
 *
 * 併せて変更履歴を見る。**履歴はアプリからではなくトリガーが書いている**ので、
 * 画面の操作が記録に載っているかは実際に操作してみないと分からない。
 * 論理削除が「更新」に見えていた不具合（2026-08-05）の回帰でもある。
 */

const COMPANY_SEARCH = "事業者名・カナ・事業者コードで検索...";

test.describe("E2E-08", () => {
  test.use({ storageState: authFile("admin") });

  test("事業者情報を論理削除して復元できる", async ({ page }) => {
    const companyName = e2eName("08");

    // ---- 1. 事業者情報を作る ----
    await page.goto("/companies/new");
    await fieldByLabel(page, "事業者名 *").fill(companyName);
    await selectFirstRealOption(fieldByLabel(page, "ステータス *"));
    await page.getByRole("button", { name: "作成" }).click();
    await expectSuccessToast(page, "事業者情報を作成しました");
    await page.waitForURL(/\/companies\/[0-9a-f-]{36}$/);
    const companyId = page.url().split("/").pop()!;

    // 一覧に出ること（削除後との対比のため先に確認しておく）
    await page.goto("/companies");
    await searchInList(page, COMPANY_SEARCH, companyName);
    await expect(page.getByRole("link", { name: companyName })).toBeVisible();

    // ---- 2. 編集ページ内のモーダルから削除する ----
    // 危険ゾーンの section は作らない方針なので、削除は編集ページの中にある
    await page.goto(`/companies/${companyId}/edit`);
    await page.getByRole("button", { name: "削除", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "削除する" }).click();
    await expectSuccessToast(page, "事業者情報を削除しました");

    // ---- 3. 一覧から消えること ----
    await page.goto("/companies");
    await searchInList(page, COMPANY_SEARCH, companyName);
    await expect(page.getByRole("link", { name: companyName })).toHaveCount(0);

    // 詳細への直 URL も「見つかりません」になること（多層防御）
    await page.goto(`/companies/${companyId}`);
    await expect(page.getByText(/見つかりません/)).toBeVisible();

    // ---- 4. 削除済み一覧に出ること ----
    await page.goto("/admin/deleted");
    await expect(page.getByRole("heading", { name: "削除済みレコード" })).toBeVisible();
    // 既定のタブが「事業者情報」。削除した順に並ぶので 1 ページ目に出る。
    // **DataTable は同じ内容をテーブルとカードの両方で描く**ので first() を取る
    await expect(page.getByText(companyName).first()).toBeVisible();

    // ---- 5. 復元すると通常の一覧へ戻ること ----
    const row = page.locator("tr", { hasText: companyName }).first();
    await row.getByRole("button", { name: "復元" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "復元する" }).click();
    await expectSuccessToast(page, "復元しました");

    await page.goto("/companies");
    await searchInList(page, COMPANY_SEARCH, companyName);
    await expect(page.getByRole("link", { name: companyName })).toBeVisible();

    // ---- 6. 変更履歴に削除と復活が残っていること ----
    // **アプリは履歴を INSERT しない。** トリガーが書いているので、
    // 画面の操作が載っているかはここでしか分からない
    await page.goto("/admin/logs");
    await page.getByLabel("対象").selectOption("companies");

    await page.getByLabel("操作").selectOption("SOFT_DELETE");
    await expect(page.locator("tr", { hasText: companyName }).first()).toBeVisible();

    await page.getByLabel("操作").selectOption("RESTORE");
    await expect(page.locator("tr", { hasText: companyName }).first()).toBeVisible();

    // ---- 後片付け ----
    await page.goto(`/companies/${companyId}/edit`);
    await page.getByRole("button", { name: "削除", exact: true }).click();
    await page.getByRole("button", { name: "削除する" }).click();
    await expectSuccessToast(page, "事業者情報を削除しました");
  });
});
