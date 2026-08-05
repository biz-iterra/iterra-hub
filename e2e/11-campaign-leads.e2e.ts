import { test, expect } from "@playwright/test";
import { authFile } from "./roles";
import {
  e2eName,
  expectSuccessToast,
  fieldByLabel,
  selectFirstRealOption,
} from "./helpers";

/**
 * E2E-11 [B] キャンペーン → リード紐付け → 件数の一致
 * 仕様: docs/test-cases/08-e2e-scenarios.md §E2E-11
 *
 * 紐付けの追加・解除は**一覧を楽観更新**している（サーバーの応答を待たずに
 * 画面へ足す）。ずれると「追加したのに出ない・消したのに残る」になるので、
 * 画面の件数表示と再読み込み後の状態が一致することまで見る。
 *
 * 紐付けモーダルの検索欄は `useSearchField` を通している。
 * 日本語入力そのものは E2E-14 で見るので、ここでは検索が効くことだけを見る。
 */

test.describe("E2E-11", () => {
  test.use({ storageState: authFile("admin") });

  test("キャンペーンにリードを紐付けて解除できる", async ({ page }) => {
    const campaignName = e2eName("11");

    // ---- 1. 紐付ける相手のリードを 1 件用意する ----
    const leadName = e2eName("11L");
    await page.goto("/leads/new");
    await fieldByLabel(page, "リード名 *").fill(leadName);
    // ステータスはステージに連動して選べるようになる（先にステージを選ぶ）
    await selectFirstRealOption(fieldByLabel(page, "ステージ *"));
    await selectFirstRealOption(fieldByLabel(page, "ステータス *"));
    await selectFirstRealOption(fieldByLabel(page, "事業者種別 *"));
    await page.getByRole("button", { name: "作成" }).click();
    await expectSuccessToast(page, "リードを作成しました");
    await page.waitForURL(/\/leads\/[0-9a-f-]{36}$/);
    const leadId = page.url().split("/").pop()!;

    // ---- 2. キャンペーンを作る ----
    await page.goto("/campaigns/new");
    await fieldByLabel(page, "キャンペーン名 *").fill(campaignName);
    await selectFirstRealOption(fieldByLabel(page, "種別 *"));
    await page.getByRole("button", { name: "作成" }).click();
    await expectSuccessToast(page, "キャンペーンを作成しました");
    await page.waitForURL(/\/campaigns\/[0-9a-f-]{36}$/);
    const campaignId = page.url().split("/").pop()!;

    // リードは別タブにある
    await page.getByRole("button", { name: "リード", exact: true }).click();
    // 最初は 0 件
    await expect(page.getByText("紐付いているリードはありません")).toBeVisible();

    // ---- 3. リードを紐付ける ----
    await page.getByRole("button", { name: "リードを追加" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByPlaceholder("リード名・会社名で検索...").fill(leadName);
    // 候補は <ul><li><label><input type=checkbox> の並び（テーブルではない）
    const candidate = dialog.locator("li", { hasText: leadName }).first();
    await expect(candidate).toBeVisible();
    await candidate.getByRole("checkbox").check();

    await dialog.getByRole("button", { name: /選択したリードを紐付け（1件）/ }).click();
    await expectSuccessToast(page, "リードを1件紐付けました");

    // 件数表示に出ること（楽観更新）
    await expect(page.getByText("紐付きリード（1 件）")).toBeVisible();

    // **再読み込みしても残っていること。** 楽観更新だけで実際に保存されていない、
    // という壊れ方をここで捕まえる
    await page.goto(`/campaigns/${campaignId}`);
    await page.getByRole("button", { name: "リード", exact: true }).click();
    await expect(page.getByText("紐付きリード（1 件）")).toBeVisible();
    await expect(page.getByRole("link", { name: leadName })).toBeVisible();

    // ---- 4. 紐付けを解除する ----
    const linked = page.locator("tr", { hasText: leadName }).first();
    // 解除は確認ダイアログを挟まない（消えるのは紐付けだけで、リードは残るため）
    await linked.getByRole("button", { name: "解除" }).click();
    await expectSuccessToast(page, "リードの紐付けを解除しました");

    await page.goto(`/campaigns/${campaignId}`);
    await page.getByRole("button", { name: "リード", exact: true }).click();
    await expect(page.getByText("紐付いているリードはありません")).toBeVisible();

    // ---- 後片付け ----
    await page.goto(`/campaigns/${campaignId}/edit`);
    await page.getByRole("button", { name: "削除", exact: true }).click();
    await page.getByRole("button", { name: "削除する" }).click();
    await expectSuccessToast(page, "キャンペーンを削除しました");

    await page.goto(`/leads/${leadId}/edit`);
    await page.getByRole("button", { name: "削除", exact: true }).click();
    await page.getByRole("button", { name: "削除する" }).click();
    await expectSuccessToast(page, "リードを削除しました");
  });
});
