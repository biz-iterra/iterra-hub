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
 * E2E-02 [S] リード管理の基本線: 検索 → 詳細 → 社内対応の記録 → スコア再計算
 * 仕様: docs/test-cases/08-e2e-scenarios.md §3
 *
 * seed の 3,008 件から検索するだけでは記録前後のスコア差分を決定的に検証できないため、
 * 検証用のリードは本シナリオ内で作成し（E2E- 接頭辞）、末尾で論理削除する。
 * 一覧のページネーション表示自体は seed データで確認する。
 */
test.describe("E2E-02", () => {
  test.use({ storageState: authFile("admin") });

  test("リード検索→詳細→社内対応の記録→スコア再計算 @smoke", async ({ page }) => {
    const leadName = e2eName("02");

    // 1. admin で /leads を開く（seed 3,008 件・ページネーション表示を確認）
    await page.goto("/leads");
    await expect(page.getByRole("heading", { name: "リード" })).toBeVisible();

    const paginationText = page.getByText(/\/\s*[\d,]+\s*件/);
    await expect(paginationText).toBeVisible();
    const match = (await paginationText.innerText()).match(/\/\s*([\d,]+)\s*件/);
    expect(match).not.toBeNull();
    expect(Number(match![1].replace(/,/g, ""))).toBeGreaterThan(3000);

    // 検証用リードを作成（検索対象を決定的にするため）
    await page.getByRole("link", { name: "新規作成" }).click();
    await page.waitForURL("**/leads/new");

    await fieldByLabel(page, "リード名 *").fill(leadName);
    await fieldByLabel(page, "ステージ *").selectOption({ label: "リード獲得" });
    await selectFirstRealOption(fieldByLabel(page, "ステータス *"));
    await fieldByLabel(page, "事業者種別 *").selectOption({ label: "法人" });

    await page.getByRole("button", { name: "作成" }).click();
    await expectSuccessToast(page, "リードを作成しました");
    // 作成後の自動遷移（router.push + router.refresh）を待たず、この後の検索経由の
    // 遷移で詳細へ辿る（下記コメント参照）。仕様どおり検索→詳細の経路を通ることにもなる。

    // 2. 検索でリードを 1 件特定 → 詳細へ遷移
    await page.goto("/leads");
    await searchInList(page, "リード名・電話番号で検索...", leadName);
    const resultLink = page.getByRole("link", { name: leadName, exact: true });
    await expect(resultLink).toBeVisible();
    await resultLink.click();
    await page.waitForURL(/\/leads\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: leadName, level: 1 })).toBeVisible();

    // 記録前のスコアを確認（新規作成直後は 0 のはず）
    await page.getByRole("button", { name: "スコア" }).click();
    const scoreSection = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "スコアサマリ", level: 2 }) });
    const scoreBefore = (await scoreSection.locator("span").first().innerText()).trim();
    expect(scoreBefore).toBe("0");

    // 3. 社内対応（架電記録）を追加 → 一覧に反映・トースト表示
    await page.getByRole("button", { name: "社内対応" }).click();
    // lead_call_statuses.code='appointment' の表示名は「アポ」（score_rule の説明文「アポ獲得」とは別）
    await page.getByLabel("対応ステータス *").selectOption({ label: "アポ" });
    await selectFirstRealOption(page.getByLabel("対応者 *"));
    await page.getByLabel("メモ").fill(`${leadName} の架電記録`);
    await page.getByRole("button", { name: "追加する" }).click();
    await expectSuccessToast(page, "社内対応を追加しました");

    await expect(page.getByText("アポ", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(`${leadName} の架電記録`).first()).not.toBeVisible(); // 折りたたみ状態ではメモは非表示

    // 4. スコアが再計算されること（記録前後で値を比較）
    // 一覧側 state は更新されるが lead 自体（score）はサーバーコンポーネントの初期値のため再読み込みで確認する
    await page.reload();
    await page.getByRole("button", { name: "スコア" }).click();
    const scoreAfter = (await scoreSection.locator("span").first().innerText()).trim();
    expect(scoreAfter).toBe("40"); // 「アポ」(code:appointment) = lead_score_rules で +40（他条件は未設定のため加点なし）
    expect(scoreAfter).not.toBe(scoreBefore);

    // ---- 後片付け（論理削除）----
    await page.getByRole("link", { name: "編集" }).click();
    await page.waitForURL(/\/leads\/[0-9a-f-]{36}\/edit$/);
    await page.getByRole("button", { name: "削除", exact: true }).click();
    await page.getByRole("button", { name: "削除する" }).click();
    await expectSuccessToast(page, "リードを削除しました");
    // 一覧の条件（検索語）は URL のクエリに載るため、削除後の戻り先は
    // `/leads?search=...` になる（2026-08-04 の一覧 UX 変更）。
    // グロブの `**/leads` はクエリ付きにマッチしないので正規表現で受ける。
    await page.waitForURL(/\/leads(\?.*)?$/);
  });
});
