import { test, expect } from "@playwright/test";
import { authFile } from "./roles";
import {
  e2eName,
  expectErrorToastAndClose,
  expectSuccessToast,
  fieldByLabel,
  selectFirstRealOption,
} from "./helpers";

/**
 * E2E-12 [S] リードステージと実体（商談・契約）の整合規則
 * 仕様: docs/test-cases/06-system-leads-campaigns.md LD-23 / LD-24 / LD-26
 *       規則の設計: docs/database-design.md §24
 *
 * DB トリガーの動作自体は 02-integration-db.md の IT-LEADSTAGE-01（SQL 検証）で見る。
 * ここは**画面から操作したときに規則が効き、理由が読める文言で出る**ことを守る。
 * 規則は「商談・契約が無ければ先へ進めない」なので、他のシナリオと違い
 * 失敗系が主役になる。
 */
test.describe("E2E-12", () => {
  test.use({ storageState: authFile("admin") });

  test("ステージ要件を満たさない遷移は画面から行えない @smoke", async ({ page }) => {
    const leadName = e2eName("12");

    // ---- 1. 新規作成では商談が要るステージを選べない（LD-26）----
    await page.goto("/leads/new");
    const stageSelect = fieldByLabel(page, "ステージ *");
    await expect(stageSelect).toBeVisible();

    const stageLabels = await stageSelect.locator("option").allInnerTexts();
    // 商談が無いリードを Sales 以降で作れてしまうと、DB トリガーに弾かれるだけになる
    expect(stageLabels).not.toContain("Sales");
    expect(stageLabels).not.toContain("Opportunity");
    expect(stageLabels).not.toContain("取引先");
    // 商談が要らないステージは従来どおり選べる
    expect(stageLabels).toContain("獲得");
    expect(stageLabels).toContain("育成");

    await fieldByLabel(page, "リード名 *").fill(leadName);
    await stageSelect.selectOption({ label: "育成" });
    await selectFirstRealOption(fieldByLabel(page, "ステータス *"));
    await fieldByLabel(page, "事業者種別 *").selectOption({ label: "法人" });
    await page.getByRole("button", { name: "作成" }).click();
    await expectSuccessToast(page, "リードを作成しました");

    await page.waitForURL(/\/leads\/[0-9a-f-]{36}$/);
    const leadId = page.url().split("/").pop()!;

    // ---- 2. 商談が無いまま「取引先」へは進めない（LD-23）----
    await page.goto(`/leads/${leadId}/edit`);
    await fieldByLabel(page, "ステージ *").selectOption({ label: "取引先" });
    await selectFirstRealOption(fieldByLabel(page, "ステータス *"));
    await page.getByRole("button", { name: "保存" }).first().click();

    // 何が足りないかが読める文言で拒否される
    await expectErrorToastAndClose(page, "商談が必要です");

    // ステージは変わっていない（拒否なので保存自体が起きていない）
    await page.goto(`/leads/${leadId}`);
    await expect(page.getByText("育成").first()).toBeVisible();

    // ---- 3. Sales へ進めると商談が作られ、ステータスも残る（LD-24）----
    await page.goto(`/leads/${leadId}/edit`);
    await fieldByLabel(page, "ステージ *").selectOption({ label: "Sales" });
    // Sales はステータスを持つ。**昇格ステージでもステータス欄が消えないこと**が要点
    // （auto_promote_to_deal で判定していた頃はここが消えていた）
    const statusSelect = fieldByLabel(page, "ステータス *");
    await expect(statusSelect).toBeVisible();
    await statusSelect.selectOption({ label: "商談化" });

    await page.getByRole("button", { name: "保存" }).first().click();
    // 昇格の確認モーダル（auto_promote_to_deal なステージのため出る）
    await expect(
      page.getByRole("heading", { name: "Sales に昇格します" })
    ).toBeVisible();
    await page.getByRole("button", { name: "昇格する" }).click();
    await expectSuccessToast(page, "商談に昇格しました");

    await page.waitForURL(/\/leads\/[0-9a-f-]{36}$/);
    // 商談が作られ、リードから辿れる
    const promotedLink = page.getByRole("link", { name: "商談昇格済み" });
    await expect(promotedLink).toBeVisible();
    const dealId = (await promotedLink.getAttribute("href"))!.split("/").pop()!;
    // ステータスが消えていない
    await expect(page.getByText("商談化").first()).toBeVisible();

    // ---- 4. 商談はあるが契約が無いので「取引先」へはまだ進めない（LD-23）----
    await page.goto(`/leads/${leadId}/edit`);
    await fieldByLabel(page, "ステージ *").selectOption({ label: "取引先" });
    await selectFirstRealOption(fieldByLabel(page, "ステータス *"));
    await page.getByRole("button", { name: "保存" }).first().click();
    await expectErrorToastAndClose(page, "契約が必要です");

    // ---- 後片付け（リード → 商談 → 事業者情報・連絡先の順。理由は §24.3）----
    await page.goto(`/leads/${leadId}/edit`);
    await page.getByRole("button", { name: "削除", exact: true }).click();
    await page.getByRole("button", { name: "削除する" }).click();
    await expectSuccessToast(page, "リードを削除しました");

    await page.goto(`/deals/${dealId}/edit`);
    await page.getByRole("button", { name: "削除", exact: true }).click();
    await page.getByRole("button", { name: "削除する" }).click();
    await expectSuccessToast(page, "商談を削除しました");
  });
});
