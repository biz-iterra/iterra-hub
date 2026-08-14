import { test, expect, type Page } from "@playwright/test";
import { authFile } from "./roles";

/**
 * E2E-19 [S] スクロールしても画面の外枠がずれないこと
 * 仕様: docs/test-cases/08-e2e-scenarios.md §19
 *
 * **本番で起きた不具合の回帰テスト**（2026-08-14、T-0089）。
 * 縦にスクロールするのは `<main>` だけで、サイドバーとヘッダーは動かない。
 * ところが `<main>` が非配置だと、Tailwind の `.sr-only` のような
 * `position: absolute` の要素の包含ブロックが `<html>` になり、
 * `overflow-y: auto` にクリップされずに**文書のスクロール領域を押し広げる**。
 * すると外枠ごと画面が上へ流れ、サイドバーとヘッダーが画面外へ出る。
 * 本番のアクティビティ一覧で 782px ずれていた。
 *
 * 見た目の崩れは目で見ないと分からないが、原因である
 * 「**文書がスクロールできてしまう**」は数値で押さえられる。ここではそれを見る。
 *
 * `.sr-only` はアクティビティの種別アイコン（`ActivitySourceIcon`）と
 * 入力必須の印（`RequiredMark`）にあり、**表示領域より下に出たときだけ**
 * 症状が出る。長い一覧と長いフォームを対象に選んでいる。
 */

/** 文書（`<html>`）がスクロールできる量。0 でなければ外枠がずれる */
async function documentOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const de = document.documentElement;
    return de.scrollHeight - de.clientHeight;
  });
}

test.describe("E2E-19", () => {
  test.use({ storageState: authFile("admin") });

  test("本文をスクロールしても文書自体はスクロールしない @smoke", async ({ page }) => {
    // 縦に長くなる画面を選ぶ。sr-only が表示領域より下に来るのが条件
    const paths = ["/dashboard", "/activities", "/leads", "/contacts/new"];

    for (const path of paths) {
      await page.goto(path);
      await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });

      expect(
        await documentOverflow(page),
        `${path}: 文書がスクロールできる。<main> の position が外れていないか`
      ).toBeLessThanOrEqual(1);

      // 本文を最後までスクロールしても、外枠は動かないままであること
      await page.evaluate(() => {
        const main = document.querySelector("main");
        if (main) main.scrollTop = main.scrollHeight;
      });
      await page.waitForTimeout(200);

      expect(
        await page.evaluate(() => window.scrollY),
        `${path}: 本文のスクロールで文書まで動いている`
      ).toBe(0);
      expect(
        await documentOverflow(page),
        `${path}: スクロール後に文書がスクロールできるようになった`
      ).toBeLessThanOrEqual(1);

      // ヘッダー（横断検索）が見えたままであること
      await expect(page.getByPlaceholder(/検索/).first()).toBeInViewport();
    }
  });

  test("モーダルを開いている間は背面がスクロールしない", async ({ page }) => {
    // マスタ管理の追加モーダルで見る（どのモーダルも同じ useScrollLock を通る）
    await page.goto("/admin");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });

    const before = await page.evaluate(() => {
      const main = document.querySelector("main");
      if (main) main.scrollTop = 120;
      return main?.scrollTop ?? 0;
    });

    await page.getByRole("button", { name: /追加/ }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // オーバーレイの上でホイールを回しても背面は動かない
    await page.mouse.move(600, 400);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(200);

    expect(
      await page.evaluate(() => document.querySelector("main")?.scrollTop ?? 0),
      "モーダルを開いている間に背面が動いた"
    ).toBe(before);
  });
});
