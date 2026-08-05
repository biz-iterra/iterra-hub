import { test, expect, type Locator } from "@playwright/test";
import { authFile } from "./roles";
import {
  e2eName,
  expectSuccessToast,
  fieldByLabel,
  searchInList,
} from "./helpers";

/**
 * E2E-09 [A] マスタ変更の波及: color 編集 → バッジ反映
 * 仕様: docs/test-cases/08-e2e-scenarios.md §E2E-09
 *
 * **バッジの色は DB の `color` をそのまま使う**（CLAUDE.md の規約）。
 * 画面ごとに sort_order から算出していた時代があり、同じ状態が
 * 画面によって別の色で出ていた。マスタを直したら一覧に出る、を実際に見る。
 *
 * 既存のマスタの色を書き換えると他のテストや実データの見え方に影響するので、
 * **このテスト専用のステータスを作って、それを付けた事業者情報で確かめる**。
 */

const COMPANY_SEARCH = "事業者名・カナ・事業者コードで検索...";
const BEFORE = { hex: "#123456", rgb: "rgb(18, 52, 86)" };
const AFTER = { hex: "#8A4B2F", rgb: "rgb(138, 75, 47)" };

/** バッジの文字色を読む。StatusBadge は `color` をそのまま文字色に使う */
async function badgeColor(badge: Locator): Promise<string> {
  return badge.evaluate((el) => getComputedStyle(el).color);
}

/** 事業者情報ステータスのタブを開く */
async function openCompanyStatusTab(page: import("@playwright/test").Page) {
  await page.goto("/admin");
  await page.getByRole("button", { name: "事業者情報", exact: true }).click();
  await page.getByRole("button", { name: "事業者情報ステータス", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "事業者情報ステータス", level: 2 })
  ).toBeVisible();
}

test.describe("E2E-09", () => {
  test.use({ storageState: authFile("admin") });

  test("マスタのバッジ色を変えると一覧のバッジに出る", async ({ page }) => {
    const statusName = e2eName("09");
    const companyName = e2eName("09c");

    // ---- 1. 色を決めたステータスを作る ----
    await openCompanyStatusTab(page);
    await page.getByRole("button", { name: "追加", exact: true }).click();

    const createDialog = page.getByRole("dialog");
    await expect(createDialog).toBeVisible();
    await fieldByLabel(createDialog, "名前 *").fill(statusName);
    await fieldByLabel(createDialog, "バッジ色 (#RRGGBB)").fill(BEFORE.hex);
    await createDialog.getByRole("button", { name: "保存" }).click();
    await expectSuccessToast(page, "事業者情報ステータスを追加しました");

    // ---- 2. そのステータスを付けた事業者情報を作る ----
    await page.goto("/companies/new");
    await fieldByLabel(page, "事業者名 *").fill(companyName);
    await fieldByLabel(page, "ステータス *").selectOption({ label: statusName });
    await page.getByRole("button", { name: "作成" }).click();
    await expectSuccessToast(page, "事業者情報を作成しました");
    await page.waitForURL(/\/companies\/[0-9a-f-]{36}$/);
    const companyId = page.url().split("/").pop()!;

    // ---- 3. 一覧のバッジが指定した色で出ること ----
    await page.goto("/companies");
    await searchInList(page, COMPANY_SEARCH, companyName);
    // **一覧の絞り込みにも同じ名前の <option> がある**ので、対象の行の中で探す
    const badge = page.locator("tr", { hasText: companyName }).first().getByText(statusName);
    await expect(badge).toBeVisible();
    expect(await badgeColor(badge)).toBe(BEFORE.rgb);

    // ---- 4. マスタの色を変える ----
    await openCompanyStatusTab(page);
    const row = page.locator("tr", { hasText: statusName }).first();
    await row.getByRole("button", { name: "編集" }).click();

    const editDialog = page.getByRole("dialog");
    await expect(editDialog).toBeVisible();
    await fieldByLabel(editDialog, "バッジ色 (#RRGGBB)").fill(AFTER.hex);
    await editDialog.getByRole("button", { name: "保存" }).click();
    await expectSuccessToast(page, "事業者情報ステータスを保存しました");

    // ---- 5. 一覧のバッジが変わった色で出ること ----
    await page.goto("/companies");
    await searchInList(page, COMPANY_SEARCH, companyName);
    const updated = page.locator("tr", { hasText: companyName }).first().getByText(statusName);
    await expect(updated).toBeVisible();
    expect(await badgeColor(updated)).toBe(AFTER.rgb);

    // 詳細ページは**バッジではなく素のテキスト**で出している（`InfoField`）。
    // 色は付かないので、ここでは表示されることだけを見る。
    // バッジにするかどうかは項目ごとの設計判断なので、勝手に変えない（T-0056）
    await page.goto(`/companies/${companyId}`);
    await expect(page.getByText(statusName, { exact: true }).first()).toBeVisible();

    // ---- 後片付け ----
    // **使用中のマスタは削除できない**ので、事業者情報を先に消す
    await page.goto(`/companies/${companyId}/edit`);
    await page.getByRole("button", { name: "削除", exact: true }).click();
    await page.getByRole("button", { name: "削除する" }).click();
    await expectSuccessToast(page, "事業者情報を削除しました");

    await openCompanyStatusTab(page);
    await page
      .locator("tr", { hasText: statusName })
      .first()
      .getByRole("button", { name: "削除" })
      .click();
    // マスタの確認ダイアログは「削除」（エンティティ側の「削除する」とは違う）
    await page.getByRole("dialog").getByRole("button", { name: "削除", exact: true }).click();
    await expectSuccessToast(page, "事業者情報ステータスを削除しました");
  });
});
