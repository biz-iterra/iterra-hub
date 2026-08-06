import { test, expect } from "@playwright/test";
import { authFile } from "./roles";
import {
  e2eName,
  expectSuccessToast,
  fieldByLabel,
  selectFirstRealOption,
} from "./helpers";

/**
 * E2E-16 [A] 連携プロファイル（事業者情報 × 連携先）
 * 仕様: docs/test-cases/08-e2e-scenarios.md §E2E-16
 *
 * freee へ渡す担当者メールは「主担当の主メール」で決まる。**主メールは連絡先に
 * 1 つしか立たない**ため、同じ人が 2 社の主担当だと両社に同じメールが渡り、
 * 会社ごとに使い分けている場合は片方が永久に差分として残る（T-0060）。
 *
 * プロファイルで「どのレコードを使うか」を事業者ごとに選べることを見る。
 * **値を持たせるのではなく選ぶ**ので、CRM 側を直せば連携値も追随する。
 */

test.describe("E2E-16", () => {
  test.use({ storageState: authFile("admin") });

  test("事業者ごとに担当者メールを選び分けられる", async ({ page }) => {
    const mainCompany = e2eName("16A");
    const sideCompany = e2eName("16B");
    const lastName = e2eName("16C");
    const mainMail = `e2e16-main-${Date.now().toString(36)}@example.com`;
    const sideMail = `e2e16-side-${Date.now().toString(36)}@example.com`;

    const createCompany = async (name: string) => {
      await page.goto("/companies/new");
      await fieldByLabel(page, "事業者名 *").fill(name);
      await selectFirstRealOption(fieldByLabel(page, "ステータス *"));
      await page.getByRole("button", { name: "作成" }).click();
      await expectSuccessToast(page, "事業者情報を作成しました");
      await page.waitForURL(/\/companies\/[0-9a-f-]{36}$/);
      return page.url().split("/").pop()!;
    };

    const mainId = await createCompany(mainCompany);
    const sideId = await createCompany(sideCompany);

    // ---- 1. メールを 2 つ持つ連絡先を作る（主たる所属は A）----
    await page.goto(`/contacts/new?company_id=${mainId}`);
    await fieldByLabel(page, "姓 *").fill(lastName);
    await fieldByLabel(page, "名 *").fill("太郎");
    await selectFirstRealOption(fieldByLabel(page, "ステータス *"));
    await page.getByRole("button", { name: "メールアドレスを追加" }).click();
    await page.getByLabel("メールアドレス 1", { exact: true }).fill(mainMail);
    await page.getByRole("button", { name: "メールアドレスを追加" }).click();
    await page.getByLabel("メールアドレス 2", { exact: true }).fill(sideMail);
    await page.getByRole("button", { name: "作成" }).click();
    await expectSuccessToast(page, "連絡先を作成しました");
    await page.waitForURL(/\/contacts\/[0-9a-f-]{36}$/);
    const contactId = page.url().split("/").pop()!;

    // ---- 2. B の兼務にする ----
    await page.getByRole("button", { name: "兼務先を追加" }).click();
    await page.getByLabel("兼務先の事業者情報").fill(sideCompany);
    await page.getByRole("option", { name: new RegExp(sideCompany) }).first().click();
    await page.getByRole("button", { name: "追加する" }).click();
    await expectSuccessToast(page, "兼務先を追加しました");

    // ---- 3. 両社の主担当にする ----
    for (const id of [mainId, sideId]) {
      await page.goto(`/companies/${id}`);
      await page.getByRole("button", { name: "担当者を変更", exact: true }).click();
      await page.getByRole("option", { name: new RegExp(lastName) }).first().click();
      // RelationField は選んだあと保存ボタンを押して確定する
      await page.getByRole("button", { name: "保存", exact: true }).first().click();
      await expectSuccessToast(page, "保存しました");
    }

    // ---- 4. 既定ではどちらも同じ（主）メールが渡ること ----
    // **これが今回直したい状態**。主メールは連絡先に 1 つしか立たない
    for (const id of [mainId, sideId]) {
      await page.goto(`/companies/${id}`);
      await expect(page.getByRole("heading", { name: "連携プロファイル（freee）" })).toBeVisible();
      await expect(page.getByText(`いま渡る値: ${mainMail}`)).toBeVisible();
    }

    // ---- 5. B だけ 2 つ目のメールを選ぶ ----
    await page.goto(`/companies/${sideId}`);
    await page.getByLabel("連携プロファイルの担当者メール").selectOption({ label: sideMail });
    await page.getByRole("button", { name: "連携プロファイルを保存" }).click();
    await expectSuccessToast(page, "連携プロファイルを保存しました");
    await expect(page.getByText(`いま渡る値: ${sideMail}`)).toBeVisible();

    // ---- 5b. 担当者を選び直すとメールの選択が外れること ----
    // **前の人のメールを持ったまま保存すると DB のトリガーに弾かれる。**
    // 押せてからエラーになるより、選び直させる方が分かりやすい
    await page.goto(`/companies/${sideId}`);
    await page.getByLabel("連携プロファイルの担当者メール").selectOption({ label: sideMail });
    await page.getByLabel("連携プロファイルの担当者", { exact: true }).selectOption({ index: 1 });
    await expect(
      page.getByLabel("連携プロファイルの担当者メール"),
      "担当者を変えたのにメールの選択が残っている"
    ).toHaveValue("");

    // ---- 6. A は影響を受けないこと ----
    // 同じ連絡先だが、A へ渡るメールは主メールのまま
    await page.goto(`/companies/${mainId}`);
    await expect(page.getByText(`いま渡る値: ${mainMail}`)).toBeVisible();

    // ---- 7. 既定に戻せること ----
    await page.goto(`/companies/${sideId}`);
    await page.getByLabel("連携プロファイルの担当者メール").selectOption("");
    await page.getByRole("button", { name: "連携プロファイルを保存" }).click();
    await expectSuccessToast(page, "連携プロファイルを保存しました");
    await expect(page.getByText(`いま渡る値: ${mainMail}`)).toBeVisible();

    // ---- 後片付け ----
    await page.goto(`/contacts/${contactId}/edit`);
    await page.getByRole("button", { name: "削除", exact: true }).click();
    await page.getByRole("button", { name: "削除する" }).click();
    await expectSuccessToast(page, "連絡先を削除しました");

    for (const id of [sideId, mainId]) {
      await page.goto(`/companies/${id}/edit`);
      await page.getByRole("button", { name: "削除", exact: true }).click();
      await page.getByRole("button", { name: "削除する" }).click();
      await expectSuccessToast(page, "事業者情報を削除しました");
    }
  });
});
