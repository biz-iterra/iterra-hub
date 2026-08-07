import { test, expect } from "@playwright/test";
import { authFile } from "./roles";
import {
  e2eName,
  expectSuccessToast,
  fieldByLabel,
  selectFirstRealOption,
} from "./helpers";

/**
 * E2E-17 [A] 商談の相手先を複数紐づける / 契約の紐づけ・解除・自動命名
 * 仕様: docs/test-cases/08-e2e-scenarios.md §E2E-17
 *
 * T-0064: 商談の相手は「Ａ社のＢさん」であることが普通。2026-08-07 まで画面が
 * ラジオで 1 つしか選ばせておらず、DB 制約（いずれか 1 つ以上）より狭かった。
 *
 * T-0065: 契約は `deal_id` が NOT NULL だったため、「紐づける」が必ず
 * **他の商談から奪う付け替え**になっていた。NULL 許容にして、
 * **どの商談にも紐づいていない契約だけ**を候補にする。
 *
 * T-0067: 紐づけを解除できる（契約そのものは残る）。
 *
 * T-0068: 契約名を `締結日_契約書名_契約種別_金額_契約ID` で自動生成する。
 */

const UUID_RE = /[0-9a-f-]{36}/;

test.describe("E2E-17", () => {
  test.use({ storageState: authFile("admin") });

  test("相手先を同時に紐づけ、契約を紐づけ・解除し、契約名が自動生成される", async ({
    page,
  }) => {
    const companyName = e2eName("17-company");
    const lastName = e2eName("17-contact");
    const dealName = e2eName("17-deal");
    const otherDealName = e2eName("17-other");
    const contractName = e2eName("17-contract");
    const otherContractName = e2eName("17-taken");

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

      // 契約名の入力欄は無いこと（contracts へ一本化した。T-0063）
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

    // ---- 1. 事業者情報と連絡先を同時に紐づけた商談（T-0064）----
    const dealId = await createDeal(dealName, true);

    // 詳細で**両方**リンクが出ること（1 件だけ返す実装だと連絡先が隠れる）
    await expect(page.getByRole("link", { name: companyName }).first()).toBeVisible();
    await expect(
      page.getByRole("link", { name: new RegExp(lastName) }).first()
    ).toBeVisible();
    await expect(page.getByText("取引先は契約時に作成")).toBeVisible();

    // ---- 2. 商談を選ばずに契約を作れること（T-0065）----
    await page.goto("/contracts/new");
    // 商談に必須マークが無いこと
    const dealLabel = page.locator("label", { hasText: "商談" }).first();
    await expect(dealLabel.getByText("（必須）")).toHaveCount(0);

    await fieldByLabel(page, "契約書名").fill(contractName);
    await fieldByLabel(page, "金額").fill("1200000");
    await fieldByLabel(page, "契約締結日").fill("2026-08-07");
    await selectFirstRealOption(fieldByLabel(page, "契約種別"));
    await page.getByRole("button", { name: "作成" }).click();
    await expectSuccessToast(page, "契約を作成しました");
    await page.waitForURL(new RegExp(`/contracts/${UUID_RE.source}$`));
    const contractId = page.url().split("/").pop()!;

    // ---- 3. 契約名が自動生成されること（T-0068）----
    // 締結日_契約書名_契約種別_金額_契約ID の順。契約コードは必ず末尾に入る
    const expectedPrefix = new RegExp(`20260807_${contractName}_.+_1200000_CTR-`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(expectedPrefix);

    // 金額を直すと契約名が追随すること（「保存のタイミングで更新される」）
    await page.goto(`/contracts/${contractId}/edit`);
    await fieldByLabel(page, "金額").fill("2000000");
    await page.getByRole("button", { name: "保存" }).click();
    await expectSuccessToast(page, "保存しました");
    await page.goto(`/contracts/${contractId}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      new RegExp(`20260807_${contractName}_.+_2000000_CTR-`)
    );

    // ---- 4. すでに別の商談に紐づいている契約は候補に出ないこと（T-0065）----
    const otherDealId = await createDeal(otherDealName, false);
    await page.goto(`/contracts/new?deal_id=${otherDealId}`);
    await fieldByLabel(page, "契約書名").fill(otherContractName);
    await page.getByRole("button", { name: "作成" }).click();
    await expectSuccessToast(page, "契約を作成しました");
    await page.waitForURL(new RegExp(`/contracts/${UUID_RE.source}$`));
    const otherContractId = page.url().split("/").pop()!;

    // ---- 5. 契約セクションの配置（T-0066）----
    await page.goto(`/deals/${dealId}/edit`);
    await expect(page.getByLabel("契約名")).toHaveCount(0);
    // **フォームの中にあり、保存ボタンより前**にあること
    const form = page.locator("form");
    await expect(form.getByRole("heading", { name: "契約" })).toBeVisible();
    // バッジ（「すぐ反映」）と説明文（「…すぐ反映されます」）の両方を確かめる
    await expect(page.getByText("すぐ反映", { exact: true })).toBeVisible();
    await expect(page.getByText("すぐ反映されます")).toBeVisible();
    await expect(page.getByText("この商談に紐づく契約はまだありません。")).toBeVisible();

    // ---- 6. 未紐づけの契約だけが候補に出ること ----
    await page.getByRole("button", { name: "既存の契約を紐づける" }).click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.getByText(new RegExp(contractName))).toBeVisible();
    // 他の商談に紐づいている契約は出ない
    await expect(modal.getByText(new RegExp(otherContractName))).toHaveCount(0);

    await modal
      .getByRole("row")
      .filter({ hasText: contractName })
      .getByRole("button", { name: "紐づける" })
      .click();
    await expectSuccessToast(page, "契約をこの商談に紐づけました");

    // ---- 7. 紐づいた契約が表に出ること ----
    await page.goto(`/deals/${dealId}/edit`);
    await expect(
      page.getByRole("link", { name: new RegExp(`${contractName}_.+_CTR-`) })
    ).toBeVisible();

    // ---- 8. 紐づけを解除できること（T-0067）----
    await page.getByRole("button", { name: "紐づけ解除" }).first().click();
    const confirmDialog = page.getByRole("dialog");
    await expect(confirmDialog.getByText("契約そのものは残り")).toBeVisible();
    await confirmDialog.getByRole("button", { name: "解除する" }).click();
    await expectSuccessToast(page, "契約の紐づけを解除しました");

    await page.goto(`/deals/${dealId}/edit`);
    await expect(page.getByText("この商談に紐づく契約はまだありません。")).toBeVisible();

    // ---- 9. 解除した契約が候補に戻っていること ----
    await page.getByRole("button", { name: "既存の契約を紐づける" }).click();
    await expect(
      page.getByRole("dialog").getByText(new RegExp(contractName))
    ).toBeVisible();
    await page.getByRole("button", { name: "閉じる" }).click();

    // ---- 後片付け ----
    // 契約が残っていると商談を消せず、取引先が残っていると事業者情報を消せない。
    // 取引先は契約作成のトリガーが作ったもので、契約を消しても残る
    const removeVia = async (url: string, toast: string) => {
      await page.goto(url);
      await page.getByRole("button", { name: "削除", exact: true }).click();
      await page.getByRole("button", { name: "削除する" }).click();
      await expectSuccessToast(page, toast);
    };

    // **両方の商談から取引先を集める。** 契約を後から紐づけたときにも
    // ensure_account_on_contract が走るので（T-0065）、解除済みの商談にも残る
    const accountIds = new Set<string>();
    for (const id of [dealId, otherDealId]) {
      await page.goto(`/deals/${id}`);
      const href = await page
        .getByRole("link", { name: companyName })
        .first()
        .getAttribute("href");
      if (href?.startsWith("/accounts/")) accountIds.add(href.split("/").pop()!);
    }

    await removeVia(`/contracts/${contractId}/edit`, "契約を削除しました");
    await removeVia(`/contracts/${otherContractId}/edit`, "契約を削除しました");
    await removeVia(`/deals/${dealId}/edit`, "商談を削除しました");
    await removeVia(`/deals/${otherDealId}/edit`, "商談を削除しました");
    for (const accountId of accountIds) {
      await removeVia(`/accounts/${accountId}/edit`, "取引先を削除しました");
    }
    await removeVia(`/contacts/${contactId}/edit`, "連絡先を削除しました");
    await removeVia(`/companies/${companyId}/edit`, "事業者情報を削除しました");
  });
});
