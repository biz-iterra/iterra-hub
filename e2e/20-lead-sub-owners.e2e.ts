import { test, expect } from "@playwright/test";
import { authFile } from "./roles";
import {
  e2eName,
  expectSuccessToast,
  fieldByLabel,
  selectFirstRealOption,
} from "./helpers";

/**
 * E2E-20 [S] 副担当を付けたリードが 1 トランザクションで作られること
 * 仕様: docs/test-cases/08-e2e-scenarios.md §20
 *
 * **リード本体と副担当は別テーブル**（`leads` と `lead_owners`）。
 * 以前はアプリが 2 回に分けて INSERT しており、副担当側が失敗しても
 * `console.warn` を出すだけで成功として返していた。**画面には
 * 「作成しました」と出るのに副担当が付かない**（T-0094）。
 *
 * `create_lead_with_owners` へ寄せて、入り切らなければリードごと
 * 巻き戻す形にしてある。ここでは正常系（副担当が本当に付くこと）を見る。
 * 巻き戻りの側は DB 関数の例外なので、UT ではなく DB の責務として置く。
 */

test.describe("E2E-20", () => {
  test.use({ storageState: authFile("admin") });

  test("副担当を選んで作ったリードに副担当が付く @smoke", async ({ page }) => {
    const leadName = e2eName("20");

    await page.goto("/leads/new");
    await fieldByLabel(page, "リード名 *").fill(leadName);
    await fieldByLabel(page, "ステージ *").selectOption({ label: "ナーチャリング" });
    await selectFirstRealOption(fieldByLabel(page, "ステータス *"));
    await fieldByLabel(page, "事業者種別 *").selectOption({ label: "法人" });

    // 副担当はチェックボックスの並び。主担当は候補から外れている
    const subOwners = page
      .locator("label")
      .filter({ hasText: "社内担当者（副）" })
      .first()
      .locator("xpath=following-sibling::div[1]")
      .locator('input[type="checkbox"]');
    const count = await subOwners.count();
    expect(count, "副担当の候補がいない（seed のユーザーを確認）").toBeGreaterThan(0);

    await subOwners.first().check();
    const picked = await subOwners
      .first()
      .locator("xpath=..")
      .innerText();

    await page.getByRole("button", { name: "作成" }).click();
    await expectSuccessToast(page, "リードを作成しました");
    await page.waitForURL(/\/leads\/[0-9a-f-]{36}$/);

    // **詳細に副担当が出ること。** ここが空なら 2 回に分けていた頃の症状
    const body = await page.locator("main").innerText();
    expect(body, `副担当「${picked.trim()}」が詳細に出ていない`).toContain(picked.trim());
  });
});
