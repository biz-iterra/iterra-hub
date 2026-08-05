import { test, expect, type Page } from "@playwright/test";
import { authFile } from "./roles";

/**
 * E2E-14 [S] 日本語入力（IME）の変換中に検索が走らないこと
 * 仕様: docs/test-cases/08-e2e-scenarios.md §14
 *
 * **同じ指摘を何度も受けている不具合の回帰テスト**（2026-08-05）。
 * 「検索欄で変換していると入力が消える・確定できない」は、未確定の文字で
 * 検索が走り、結果の再描画が変換中の入力を壊すために起きる。
 *
 * キー入力の模倣では composition イベントが出ないため再現できない。
 * CDP の `Input.imeSetComposition` で**本物の変換**を起こす。
 *
 * 判断そのものの単体テストは `src/lib/search-field.test.ts`。
 * ここでは画面に正しく配線されていることを見る。
 */

/** 変換中の状態を作る（未確定） */
async function compose(page: Page, steps: string[]) {
  const cdp = await page.context().newCDPSession(page);
  for (const text of steps) {
    await cdp.send("Input.imeSetComposition", {
      text,
      selectionStart: text.length,
      selectionEnd: text.length,
    });
  }
  return cdp;
}

test.describe("E2E-14", () => {
  test.use({ storageState: authFile("admin") });

  test("一覧の検索欄は変換を確定してから検索する @smoke", async ({ page }) => {
    await page.goto("/companies");
    await expect(page.locator("h1")).toBeVisible();

    const input = page.getByPlaceholder("事業者名・カナ・事業者コードで検索...");
    await input.click();

    const cdp = await compose(page, ["か", "かい", "かいし", "かいしゃ"]);

    // 打った文字は見えている（変換が中断されていない）
    await expect(input).toHaveValue("かいしゃ");

    // **変換中は検索しない。** 待ち時間（300ms）を過ぎても URL は変わらない
    await page.waitForTimeout(1200);
    expect(page.url(), "変換中に検索が走っている").not.toContain("search=");

    // 確定する
    await cdp.send("Input.insertText", { text: "会社" });
    await expect(input).toHaveValue("会社");

    // **確定したら検索結果に反映される**
    await page.waitForURL(/search=/, { timeout: 5_000 });
    expect(decodeURIComponent(page.url())).toContain("search=会社");

    await cdp.detach();
  });

  test("横断検索も変換を確定してから検索する", async ({ page }) => {
    await page.goto("/dashboard");
    const input = page.getByPlaceholder("検索 (Ctrl+K)");
    await input.click();

    const cdp = await compose(page, ["か", "かいしゃ"]);
    await expect(input).toHaveValue("かいしゃ");

    // 変換中は候補を出さない（未確定の語で検索していない）
    await page.waitForTimeout(1000);
    await expect(page.getByRole("listbox")).toHaveCount(0);

    await cdp.send("Input.insertText", { text: "株式会社" });
    await expect(input).toHaveValue("株式会社");
    await cdp.detach();
  });

  test("変換を確定させた Enter で住所の入力が消えない", async ({ page }) => {
    // 住所エディタは <form> の中にあり、Enter で送信されると入力途中の住所が消える。
    // **確定していない Enter（変換確定）でも起きる**のがこの不具合。
    // E2E-13 は素の Enter しか見ていないので、ここは変換を伴う Enter を見る
    await page.goto("/contacts/new");
    await expect(page.getByRole("heading", { name: "住所" })).toBeVisible();

    const city = page.getByLabel("市区町村");
    await city.click();

    const cdp = await compose(page, ["ち", "ちよ", "ちよだ"]);
    await expect(city).toHaveValue("ちよだ");

    // 変換を確定させる Enter。**フォームが送信されてはいけない**
    await page.keyboard.press("Enter");

    // 打った文字が残っていること（送信されると再描画で消える）
    await expect(city).toHaveValue("ちよだ");
    // 送信されていれば作成へ進むか検証エラーで再描画される。URL は変わらない
    expect(page.url()).toContain("/contacts/new");
    await expect(page.getByRole("heading", { name: "住所" })).toBeVisible();
    await cdp.detach();
  });

  test("郵便番号の変換確定 Enter で住所検索が走らない", async ({ page }) => {
    // 郵便番号欄の Enter は住所検索を起こす。**変換確定の Enter で走ると、
    // 変換前のかなを郵便番号として引きに行き、エラーだけが出る**
    await page.goto("/contacts/new");
    const postal = page.getByLabel("郵便番号");
    await postal.click();

    const cdp = await compose(page, ["い", "いち"]);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1200);

    // 走っていれば、かなを郵便番号として引きに行って失敗し、エラーが出る
    await expect(page.getByText("住所を取得できませんでした")).toHaveCount(0);
    // 万一引けてしまった場合は都道府県が埋まる
    await expect(page.getByLabel("都道府県")).toHaveValue("");
    await expect(postal).toHaveValue("いち");

    await cdp.detach();
  });

  test("変換を確定させた Enter で選択欄の候補が確定しない", async ({ page }) => {
    // 事業者情報の新規作成にある検索付きの選択欄で確認する
    await page.goto("/companies/new");
    await expect(page.locator("h1")).toBeVisible();

    const select = page.getByRole("combobox").first();
    await select.click();

    const cdp = await compose(page, ["あ", "あい"]);
    // 変換を確定させる Enter。**候補が選ばれてはいけない**
    await page.keyboard.press("Enter");
    await cdp.detach();

    // 変換中に候補が確定していないこと（入力欄が候補の名前に置き換わらない）
    await expect(select).not.toHaveValue(/^[^あ]/);
  });
});
