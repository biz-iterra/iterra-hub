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

  test("低い画面でもモーダルの上端が切れない", async ({ page }) => {
    // オーバーレイは中央寄せなので、上へはみ出した分は親のスクロールでも救えない。
    // maxHeight が無いと見出しに永久に到達できなくなる（T-0092）
    await page.setViewportSize({ width: 1280, height: 560 });
    await page.goto("/admin");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: /追加/ }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const box = await dialog.boundingBox();
    expect(box, "モーダルの位置が取れない").not.toBeNull();
    expect(box!.y, "モーダルの上端が画面の外にある").toBeGreaterThanOrEqual(0);
    expect(
      box!.y + box!.height,
      "モーダルの下端が画面の外にある"
    ).toBeLessThanOrEqual(560);
  });

  test("貼り付いた右カラムでも下端の操作に届く", async ({ page }) => {
    /*
     * リード詳細の「社内対応を追加」は `position: sticky` で貼り付く。
     * 高さの上限が無いと、フォームが表示領域より高い画面では
     * 下端（追加ボタン）まで永久にスクロールできない（T-0093）
     */
    await page.setViewportSize({ width: 1440, height: 620 });
    await page.goto("/leads");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
    await page.locator("table tbody tr").first().locator("td").first().click();
    await page.waitForURL(/\/leads\/[0-9a-f-]{36}$/, { timeout: 20_000 });

    await page.getByRole("button", { name: "社内対応" }).click();
    const addButton = page.getByRole("button", { name: /追加する/ });
    await expect(addButton).toBeAttached({ timeout: 20_000 });

    // 貼り付いた側を最後まで送れば、ボタンが画面の中に入る
    await addButton.scrollIntoViewIfNeeded();
    await expect(addButton).toBeInViewport();
  });

  test("入力エラーを出したら本文が先頭まで戻る", async ({ page }) => {
    // window.scrollTo() は効かない。scrollAppToTop が <main> を動かす（T-0090）
    await page.goto("/contacts");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
    // **氏名のセルを押す。** 行のどこでもよいわけではなく、所属のセルには
    // 事業者情報へのリンクが入っていて、そちらへ飛んでしまう
    await page.locator("table tbody tr").first().locator("td").first().click();
    await page.waitForURL(/\/contacts\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    await page.goto(`${page.url()}/edit`);
    await expect(page.getByRole("button", { name: "保存" })).toBeVisible({
      timeout: 20_000,
    });

    // 本文を下まで送ってから、フォーム末尾の保存を押せる状態にする
    await page.evaluate(() => {
      const main = document.querySelector("main");
      if (main) main.scrollTop = main.scrollHeight;
    });
    const scrolled = await page.evaluate(
      () => document.querySelector("main")?.scrollTop ?? 0
    );
    expect(scrolled, "本文がスクロールできていない（前提が崩れている）").toBeGreaterThan(0);

    /*
     * **必須の空欄を先に埋める。** どの連絡先が 1 行目に来るかは seed 次第で、
     * 必須項目が空のまま保存すると**ブラウザの標準検証で止まって
     * Server Action まで行かない**（トーストも出ないので原因が分からない）
     */
    for (const input of await page.locator("input[required]").all()) {
      if ((await input.inputValue()) === "") await input.fill("検証");
    }
    for (const select of await page.locator("select[required]").all()) {
      if ((await select.inputValue()) === "") {
        const values = await select.locator("option").evaluateAll((os) =>
          os.map((o) => (o as HTMLOptionElement).value).filter(Boolean)
        );
        if (values.length > 0) await select.selectOption(values[0]);
      }
    }

    /*
     * **サーバーまで届く入力エラーを選ぶ。** 姓や名を空にしても
     * `required` が付いているのでブラウザの標準検証で止まり、
     * Server Action へ行かない（＝先頭へ戻す処理も走らない）。
     * フリガナは任意で `max(50)` だけなので、51 文字以上が Zod で弾かれる
     */
    const kana = page
      .locator("label")
      .filter({ hasText: "フリガナ（姓）" })
      .first()
      .locator("xpath=following-sibling::input[1]");
    await kana.fill("ア".repeat(60));
    expect(await kana.inputValue(), "maxlength で切られている").toHaveLength(60);
    await page.getByRole("button", { name: "保存" }).click();

    // エラーは画面の上に出る。そこまで戻っていないと何も起きていないように見える
    await expect
      .poll(
        async () => page.evaluate(() => document.querySelector("main")?.scrollTop ?? 0),
        { timeout: 10_000, message: "入力エラーを出しても本文が先頭に戻らない" }
      )
      .toBeLessThanOrEqual(1);
  });
});
