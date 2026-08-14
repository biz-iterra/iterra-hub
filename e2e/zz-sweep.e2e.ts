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
 *   - 画面を跨ぐ約束（ディールの相手先 3 択、連絡先の連絡手段・住所 など）
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
      // ディールはパイプラインごとに画面が分かれている（T-0073）
      "/sales",
      "/procurement",
      "/partnership",
      "/contracts",
      "/talents",
      "/projects",
      "/leads",
      "/admin/freee",
      "/admin/freee/partners",
      "/admin/freee/sync",
      "/admin/freee/register",
      // 外部連携の接続（Gmail / Google コンタクト）を置いている
      "/profile",
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
        .filter({ hasText: /^事業者名/ })
        .first()
        .locator("xpath=following-sibling::input[1]")
        .fill("検証-個人事業主");
      // 法人格を個人事業主にする
      const typeSelect = page
        .locator("label")
        .filter({ hasText: "事業種別" })
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

      /*
       * **事業種別を個人事業主にすると「事業主（本人の連絡先）」が出て、
       * 姓と名が必須になる**（T-0087。同時作成のチェックは既定でオン）。
       * 埋めずに押すとブラウザの標準検証で送信が止まり、トーストも
       * JS エラーも出ないまま画面が変わらない。原因の分からない
       * タイムアウトになるので、ここで必ず埋める
       */
      for (const [label, value] of [
        ["姓", "検証"],
        ["名", "太郎"],
      ] as const) {
        await page
          .locator("label")
          .filter({ hasText: new RegExp(`^${label}`) })
          .first()
          .locator("xpath=following-sibling::input[1]")
          .fill(value);
      }

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
        expect(body, "事業者名が出ていない").toContain("事業者名");
        expect(body, "屋号名が出ていない").toContain("屋号名");
        // 個人事業主でも事業主（代表者）を紐づけられること
        expect(body, "事業主の欄が出ていない").toContain("事業主");
      });

      await check("個人事業主の編集に法人向けの項目が出ない", async () => {
        await page.goto(`/companies/${soleId}/edit`);
        const body = await page.locator("body").innerText();
        for (const ng of ["法人番号", "代表者名"]) {
          expect(body, `編集に「${ng}」が出ている`).not.toContain(ng);
        }
      });

      // **freee は口座種別に未設定を持てない**（未選択でも ordinary が返る）。
      // CRM だけ空を許すと突合のたびに「どちらも未設定」が差分として並ぶ
      await check("口座種別は「普通」で開き、未選択の選択肢が無い", async () => {
        await page.goto(`/companies/${soleId}/edit`);
        await page.getByRole("button", { name: "口座を追加" }).click();
        const select = page.locator("label", { hasText: /^口座種別$/ })
          .locator("xpath=following-sibling::select[1]");
        await expect(select, "口座種別が「普通」で開いていない").toHaveValue("ordinary");
        await expect(
          select.locator("option"),
          "未選択の選択肢が残っている"
        ).toHaveCount(3);
      });
    }

    // ---- 4. ディールはリード起点で、相手先は排他でないこと（T-0064 / T-0070）----
    await check("ディールの新規作成", async () => {
      await page.goto("/deals/new");

      // **リードが最上部にある**（ディールはリードから始まる）
      await expect(
        page.getByRole("radio", { name: "既存のリードから選ぶ" }),
        "リードの欄が無い"
      ).toBeVisible();

      for (const label of ["事業者情報", "連絡先（先方の担当者）"]) {
        await expect(
          page.getByRole("combobox", { name: label }),
          `相手先に「${label}」の選択欄が無い`
        ).toBeVisible();
      }
      // **取引先は選ばせない**（契約成立時に自動で作られる）
      await expect(
        page.getByRole("combobox", { name: "取引先" }),
        "ディールの新規作成に取引先の欄が残っている"
      ).toHaveCount(0);
      // ラジオに戻っていないこと（1 つしか選べないと「Ａ社のＢさん」を表せない）
      await expect(
        page.getByRole("radio", { name: "事業者情報" }),
        "相手先がラジオ（排他）に戻っている"
      ).toHaveCount(0);
      // 契約名の手入力欄は無いこと（contracts へ一本化した。T-0063）
      await expect(
        page.getByLabel("契約名"),
        "ディールの新規作成に契約名の入力欄が残っている"
      ).toHaveCount(0);
    });

    // ---- 4c. パイプラインごとに画面が分かれていること（T-0073 / T-0074）----
    await check("パイプライン別の画面", async () => {
      for (const [path, heading] of [
        ["/sales", "セールス"],
        ["/procurement", "プロキュアメント"],
        ["/partnership", "パートナーシップ"],
      ] as const) {
        await page.goto(path);
        await expect(
          page.getByRole("heading", { name: heading, level: 1 }),
          `${path} の見出しが「${heading}」でない`
        ).toBeVisible();
        // **カンバンの列が 0 個でない**。仕入れ・業務委託はステージが
        // 0 件で使えない状態だった（T-0074）
        await expect(
          page.locator("main").getByText("ディールなし").first(),
          `${path} のカンバンに列が無い（ステージ未投入の疑い）`
        ).toBeVisible({ timeout: 15_000 });
      }
    });

    // ---- 4d. /deals は分割後の画面へ逃がすこと ----
    await check("/deals のリダイレクト", async () => {
      await page.goto("/deals");
      await expect(page, "/deals が /sales へ飛ばない").toHaveURL(/\/sales/);
    });

    // ---- 4b. 契約はディールを選ばずに作れて、金額を持てること（T-0065 / T-0068）----
    await check("契約の新規作成", async () => {
      await page.goto("/contracts/new");
      // このフォームの label は htmlFor を持たないので getByLabel では掴めない。
      // 見出しの次に来る入力欄を辿る
      await expect(
        page
          .locator("label")
          .filter({ hasText: /^金額$/ })
          .first()
          .locator("xpath=following-sibling::input[1]"),
        "契約の新規作成に金額欄が無い"
      ).toBeVisible();
      // ディールは任意。必須マークが付いていたら紐づけの前提が崩れている
      const dealLabel = page.locator("label", { hasText: "ディール" }).first();
      await expect(
        dealLabel.getByText("（必須）"),
        "契約のディール欄に必須マークが残っている"
      ).toHaveCount(0);
    });

    // ---- 4e. デマンドファネルへの改称と、選ばせないこと（T-0077）----
    await check("デマンドファネル", async () => {
      await page.goto("/leads");
      await expect(
        page.getByText("デマンドファネル").first(),
        "リード一覧に「デマンドファネル」が出ていない"
      ).toBeVisible();
      await expect(
        page.getByText("リードカテゴリ"),
        "「リードカテゴリ」の呼び名が残っている"
      ).toHaveCount(0);

      // **導出値なので選ばせない。** トリガーが保存のたび上書きするため、
      // 選択欄があると「選べるのに反映されない」ことになる
      await page.goto("/leads/new");
      await expect(
        page.locator("label").filter({ hasText: /^デマンドファネル$/ })
          .locator("xpath=following-sibling::select[1]"),
        "リードの新規作成にデマンドファネルの選択欄が残っている"
      ).toHaveCount(0);
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

    // ---- 7. 外部連携の接続が両方とも出ること ----
    await check("プロフィールに 2 つの連携", async () => {
      await page.goto("/profile");
      await expect(page.getByRole("heading", { name: "Gmail 連携" })).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Google コンタクト連携" })
      ).toBeVisible();
      // 同期対象の境界（グループ名）を利用者に必ず見せる
      const body = await page.locator("body").innerText();
      expect(body, "同期対象のグループ名が出ていない").toContain("ITERRA CRM");
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
