import { test, expect } from "@playwright/test";
import { authFile } from "./roles";
import {
  e2eName,
  expectSuccessToast,
  fieldByLabel,
  selectFirstRealOption,
} from "./helpers";

/**
 * E2E-17 [A] 商談の相手先を複数紐づける / 契約を商談へ紐づける
 * 仕様: docs/test-cases/08-e2e-scenarios.md §E2E-17
 *
 * T-0064: 商談の相手は「Ａ社のＢさん」であることが普通。2026-08-07 まで画面が
 * ラジオで 1 つしか選ばせておらず、DB 制約（いずれか 1 つ以上）より狭かった。
 *
 * T-0063: 商談フォームの「契約名」は `deals.contract_name` というテキスト列で、
 * `contracts` と二重管理になっていた。契約テーブルへ一本化し、編集画面から
 * 「新規作成」「既存の紐づけ」を行う形にした。
 *
 * **`contracts.deal_id` は NOT NULL**。契約は必ずどれかの商談に属しているので、
 * 「紐づける」は「元の商談から外す」でもある。そこまで確認する。
 */

const UUID_RE = /[0-9a-f-]{36}/;

test.describe("E2E-17", () => {
  test.use({ storageState: authFile("admin") });

  test("事業者情報と連絡先を同時に紐づけ、契約を商談へ付け替えられる", async ({
    page,
  }) => {
    const companyName = e2eName("17-company");
    const lastName = e2eName("17-contact");
    const dealName = e2eName("17-deal");
    const otherDealName = e2eName("17-other");
    const contractName = e2eName("17-contract");

    // ---- 準備: 事業者情報と連絡先 ----
    await page.goto("/companies/new");
    await fieldByLabel(page, "事業者名 *").fill(companyName);
    await selectFirstRealOption(fieldByLabel(page, "ステータス *"));
    await page.getByRole("button", { name: "作成" }).click();
    await expectSuccessToast(page, "事業者情報を作成しました");
    await page.waitForURL(new RegExp(`/companies/${UUID_RE.source}$`));
    const companyId = page.url().split("/").pop()!;

    await page.goto(`/contacts/new?company_id=${companyId}`);
    await fieldByLabel(page, "姓 *").fill(lastName);
    await fieldByLabel(page, "名 *").fill("花子");
    await selectFirstRealOption(fieldByLabel(page, "ステータス *"));
    await page.getByRole("button", { name: "作成" }).click();
    await expectSuccessToast(page, "連絡先を作成しました");
    await page.waitForURL(new RegExp(`/contacts/${UUID_RE.source}$`));
    const contactId = page.url().split("/").pop()!;

    /** 商談を作る。相手先は引数で渡したものだけ埋める */
    const createDeal = async (name: string, withContact: boolean) => {
      await page.goto("/deals/new");

      // **契約名の入力欄は無いこと**（contracts へ一本化した。T-0063）
      await expect(page.getByLabel("契約名")).toHaveCount(0);
      await expect(
        page.getByText("契約は商談を作成したあとに登録できます", { exact: false })
      ).toBeVisible();

      await fieldByLabel(page, "取引名 *").fill(name);

      // 相手先はラジオではなく、それぞれの選択欄になっている（T-0064）
      const companySelect = page.getByRole("combobox", { name: "事業者情報" });
      await companySelect.fill(companyName);
      await page.getByRole("option", { name: new RegExp(companyName) }).first().click();

      if (withContact) {
        const contactSelect = page.getByRole("combobox", {
          name: "連絡先（先方の担当者）",
        });
        await contactSelect.fill(lastName);
        await page.getByRole("option", { name: new RegExp(lastName) }).first().click();
        // **事業者情報の選択が外れていないこと**（排他だった頃の回帰）
        await expect(companySelect).toHaveValue(new RegExp(companyName));
      }

      await selectFirstRealOption(fieldByLabel(page, "パイプライン *"));
      await selectFirstRealOption(fieldByLabel(page, "ステージ *"));
      await selectFirstRealOption(fieldByLabel(page, "ステータス *"));

      await page.getByRole("button", { name: "作成" }).click();
      await expectSuccessToast(page, "商談を作成しました");
      await page.waitForURL(new RegExp(`/deals/${UUID_RE.source}$`));
      return page.url().split("/").pop()!;
    };

    // ---- 1. 事業者情報と連絡先を同時に紐づけた商談 ----
    const dealId = await createDeal(dealName, true);

    // 詳細で**両方**リンクが出ること（1 件だけ返す実装では連絡先が隠れる）
    await expect(
      page.getByRole("link", { name: companyName }).first()
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: new RegExp(lastName) }).first()
    ).toBeVisible();
    await expect(page.getByText("取引先は契約時に作成")).toBeVisible();

    // ---- 2. 付け替え元になる別の商談と、その契約 ----
    const otherDealId = await createDeal(otherDealName, false);

    await page.goto(`/contracts/new?deal_id=${otherDealId}`);
    await fieldByLabel(page, "契約書名").fill(contractName);
    await page.getByRole("button", { name: "作成" }).click();
    await expectSuccessToast(page, "契約を作成しました");
    await page.waitForURL(new RegExp(`/contracts/${UUID_RE.source}$`));
    const contractId = page.url().split("/").pop()!;

    // 契約の AFTER INSERT で取引先が作られる（ensure_account_on_contract）。
    // 後片付けで消す必要があるので、ここで ID を拾っておく
    await page.goto(`/deals/${otherDealId}`);
    const accountHref = await page
      .getByRole("link", { name: companyName })
      .first()
      .getAttribute("href");
    expect(accountHref).toMatch(new RegExp(`^/accounts/${UUID_RE.source}$`));
    const accountId = accountHref!.split("/").pop()!;

    // ---- 3. 商談の編集画面から既存の契約を紐づける ----
    await page.goto(`/deals/${dealId}/edit`);
    // 契約名の入力欄は編集画面にも無い
    await expect(page.getByLabel("契約名")).toHaveCount(0);
    await expect(page.getByText("この商談に紐づく契約はまだありません。")).toBeVisible();

    await page.getByRole("button", { name: "既存の契約を紐づける" }).click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    // **移動元の商談を必ず見せる**（紐づけると元から外れるため）
    await expect(modal.getByText(otherDealName)).toBeVisible();

    await modal.getByRole("button", { name: "紐づける" }).first().click();
    await expectSuccessToast(page, "契約をこの商談に紐づけました");

    // ---- 4. 移動先に出て、移動元からは消えること ----
    await page.goto(`/deals/${dealId}/edit`);
    await expect(page.getByRole("link", { name: /^CTR-/ })).toBeVisible();
    await expect(page.getByText(contractName)).toBeVisible();

    await page.goto(`/deals/${otherDealId}/edit`);
    await expect(page.getByText("この商談に紐づく契約はまだありません。")).toBeVisible();

    // ---- 後片付け ----
    // 契約が残っていると商談を消せず、**取引先が残っていると事業者情報を消せない**。
    // 取引先は契約作成のトリガーが作ったもので、契約を消しても残る
    const removeVia = async (url: string, toast: string) => {
      await page.goto(url);
      await page.getByRole("button", { name: "削除", exact: true }).click();
      await page.getByRole("button", { name: "削除する" }).click();
      await expectSuccessToast(page, toast);
    };

    await removeVia(`/contracts/${contractId}/edit`, "契約を削除しました");
    await removeVia(`/deals/${dealId}/edit`, "商談を削除しました");
    await removeVia(`/deals/${otherDealId}/edit`, "商談を削除しました");
    await removeVia(`/accounts/${accountId}/edit`, "取引先を削除しました");
    await removeVia(`/contacts/${contactId}/edit`, "連絡先を削除しました");
    await removeVia(`/companies/${companyId}/edit`, "事業者情報を削除しました");
  });
});
