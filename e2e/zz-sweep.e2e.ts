import { test, expect } from "@playwright/test";
import { authFile } from "./roles";

/**
 * 主要画面の総ざらい（@sweep）。
 *
 * **「自分が書いたテストが通る」ことと「画面が使える」ことは別**という反省から
 * 足した（2026-08-04）。住所が Enter で消える・個人事業主に法人向けの項目が出る
 * といった不具合は、いずれも画面を一度開けば気づけたのに、
 * 既存の E2E が通っていたので見落としていた。
 *
 * ここでやること:
 *   - 主要な一覧・新規作成が **開くこと**（500 や JS エラーを拾う）
 *   - 表示の出し分け（個人事業主に法人向けの項目を出さない）
 *   - 画面を跨ぐ約束（商談の相手先 3 択、連絡先の連絡手段・住所 など）
 *
 * 失敗しても途中で止めず、最後にまとめて出す。
 * **画面を変えたら、この一覧に足すこと。**
 *
 * スモークには入れない（30 秒ほどかかる）。実行は
 *   npx playwright test e2e/zz-sweep.e2e.ts
 */

const problems: string[] = [];

async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    problems.push(`${name}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
  }
}

test.describe("変更した画面の総ざらい", () => {
  test.use({ storageState: authFile("admin") });
  test.setTimeout(240_000);

  test("主要画面が開けて操作できる @sweep", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`[console] ${m.text().slice(0, 150)}`);
    });

    // ---- 1. 一覧が開くか ----
    for (const path of [
      "/companies",
      "/contacts",
      "/accounts",
      "/deals",
      "/contracts",
      "/talents",
      "/projects",
      "/leads",
      "/admin/freee",
      "/admin/freee/partners",
      "/admin/freee/sync",
    ]) {
      await check(`一覧 ${path}`, async () => {
        const res = await page.goto(path);
        expect(res?.status(), `${path} が ${res?.status()}`).toBeLessThan(400);
        await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
      });
    }

    // ---- 2. 新規作成が開くか ----
    for (const path of [
      "/companies/new",
      "/contacts/new",
      "/deals/new",
      "/contracts/new",
      "/talents/new",
      "/projects/new",
      "/leads/new",
    ]) {
      await check(`新規 ${path}`, async () => {
        const res = await page.goto(path);
        expect(res?.status(), `${path} が ${res?.status()}`).toBeLessThan(400);
        await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
      });
    }

    // ---- 3. 個人事業主の事業者を作って、法人向けの項目が出ないこと ----
    let soleId = "";
    await check("個人事業主の作成", async () => {
      await page.goto("/companies/new");
      await page
        .locator("label")
        .filter({ hasText: /^(会社名|屋号)/ })
        .first()
        .locator("xpath=following-sibling::input[1]")
        .fill("検証-個人事業主");
      // 法人格を個人事業主にする
      const typeSelect = page
        .locator("label")
        .filter({ hasText: "法人格" })
        .first()
        .locator("xpath=following-sibling::select[1]");
      await typeSelect.selectOption({ label: "個人事業主" });
      // ステータス（必須）
      const statusSelect = page
        .locator("label")
        .filter({ hasText: /^ステータス/ })
        .first()
        .locator("xpath=following-sibling::select[1]");
      await statusSelect.selectOption({ index: 1 });
      await page.getByRole("button", { name: "作成" }).click();
      await page.waitForURL(/\/companies\/[0-9a-f-]{36}$/, { timeout: 20_000 });
      soleId = page.url().split("/").pop()!;
    });

    if (soleId) {
      await check("個人事業主の詳細に法人向けの項目が出ない", async () => {
        await page.goto(`/companies/${soleId}`);
        const body = await page.locator("body").innerText();
        for (const ng of ["法人番号", "代表者", "登記事項証明書"]) {
          expect(body, `詳細に「${ng}」が出ている`).not.toContain(ng);
        }
        expect(body, "屋号になっていない").toContain("屋号");
      });

      await check("個人事業主の編集に法人向けの項目が出ない", async () => {
        await page.goto(`/companies/${soleId}/edit`);
        const body = await page.locator("body").innerText();
        for (const ng of ["法人番号", "代表者名"]) {
          expect(body, `編集に「${ng}」が出ている`).not.toContain(ng);
        }
      });
    }

    // ---- 4. 商談の相手先が 3 択で、事業者情報でも作れること ----
    await check("商談の相手先が 3 択", async () => {
      await page.goto("/deals/new");
      for (const label of ["事業者情報", "連絡先", "取引先"]) {
        await expect(
          page.getByRole("radio", { name: label }),
          `相手先に「${label}」が無い`
        ).toBeVisible();
      }
    });

    // ---- 5. 連絡先の新規作成に連絡手段・住所がある ----
    await check("連絡先の新規作成に連絡手段と住所", async () => {
      await page.goto("/contacts/new");
      await expect(page.getByRole("heading", { name: "連絡手段" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "住所" })).toBeVisible();
      await expect(page.getByRole("button", { name: "メールアドレスを追加" })).toBeVisible();
    });

    // ---- 6. 取引先の詳細に担当者情報・請求者情報 ----
    await check("取引先の 2 セクション", async () => {
      await page.goto("/accounts");
      const first = page.locator("table tbody tr a").first();
      if ((await first.count()) === 0) return; // 取引先が無ければ飛ばす
      await first.click();
      await page.waitForURL(/\/accounts\/[0-9a-f-]{36}$/, { timeout: 15_000 });
      await expect(page.getByRole("heading", { name: "担当者情報" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "請求者情報" })).toBeVisible();
    });

    // ---- 後片付け ----
    if (soleId) {
      await check("個人事業主の削除", async () => {
        await page.goto(`/companies/${soleId}/edit`);
        await page.getByRole("button", { name: "削除", exact: true }).click();
        await page.getByRole("button", { name: "削除する" }).click();
        await page.waitForURL(/\/companies$/, { timeout: 15_000 });
      });
    }

    if (errors.length > 0) {
      problems.push(...errors.slice(0, 10).map((e) => `JS エラー: ${e}`));
    }

    if (problems.length > 0) {
      throw new Error(`見つかった問題 ${problems.length} 件:\n- ${problems.join("\n- ")}`);
    }
  });
});
