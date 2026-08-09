import { test, expect } from "@playwright/test";
import { TEST_USERS } from "./roles";
import {
  e2eName,
  expectSuccessToast,
  extractIdFromHref,
  fieldByLabel,
  openAs,
  searchInList,
  selectFirstRealOption,
} from "./helpers";

const UUID_RE = "[0-9a-f-]{36}";

/**
 * E2E-04 [S] ディール進行 → 契約 → Account 自動作成
 * 仕様: docs/test-cases/08-e2e-scenarios.md §3
 *
 * ステージ移動・契約作成は manager が行う。deals の更新は「admin または owner」しか
 * 通らない実装（src/actions/deals.ts の updateDeal）のため、事前準備（リード作成・
 * Opportunity 昇格）は admin で行い、担当者（owner_user_id）をあらかじめ manager に
 * 設定しておく。
 */
test.describe("E2E-04", () => {
  test("ディールのステージ移動→契約作成→取引先自動作成 @smoke", async ({ browser }) => {
    const { context: adminCtx, page: adminPage } = await openAs(browser, "admin");
    const { context: managerCtx, page: managerPage } = await openAs(browser, "manager");

    try {
      const leadName = e2eName("04");
      const companyName = `${leadName}株式会社`;

      // ---- 準備（admin）: リード作成 → 担当者をマネージャーに設定 → Opportunity 昇格 ----
      await adminPage.goto("/leads/new");
      await fieldByLabel(adminPage, "リード名 *").fill(leadName);
      await fieldByLabel(adminPage, "ステージ *").selectOption({ label: "リード獲得" });
      await selectFirstRealOption(fieldByLabel(adminPage, "ステータス *"));
      await fieldByLabel(adminPage, "会社名").fill(companyName);
      await fieldByLabel(adminPage, "事業者種別 *").selectOption({ label: "法人" });
      await fieldByLabel(adminPage, "社内担当者（主）*").selectOption({
        label: TEST_USERS.manager.fullName,
      });

      await adminPage.getByRole("button", { name: "作成" }).click();
      await expectSuccessToast(adminPage, "リードを作成しました");
      // 作成直後の自動遷移は待たず、一覧の検索から辿る（e2e/helpers.ts 冒頭の既知の問題を参照）
      await adminPage.goto("/leads");
      await searchInList(adminPage, "リード名・電話番号で検索...", leadName);
      const createdLeadLink = adminPage.getByRole("link", { name: leadName, exact: true });
      await expect(createdLeadLink).toBeVisible();
      await createdLeadLink.click();
      await adminPage.waitForURL(new RegExp(`/leads/${UUID_RE}$`));
      const leadId = extractIdFromHref(new URL(adminPage.url()).pathname);

      await adminPage.getByRole("link", { name: "編集" }).click();
      await adminPage.waitForURL(new RegExp(`/leads/${UUID_RE}/edit$`));
      await fieldByLabel(adminPage, "ステージ").selectOption({ label: "オポチュニティ" });
      await adminPage.getByRole("button", { name: "保存" }).first().click();
      await adminPage.getByRole("button", { name: "昇格する" }).click();
      await expectSuccessToast(adminPage, "ディールに昇格しました");
      await adminPage.waitForURL(new RegExp(`/leads/${UUID_RE}$`));

      const dealHref = await adminPage
        .getByRole("link", { name: "ディール昇格済み" })
        .getAttribute("href");
      expect(dealHref).toMatch(new RegExp(`^/deals/${UUID_RE}$`));
      const dealId = extractIdFromHref(dealHref!);

      // ---- 1. manager: Deal をステージ移動（テーブル編集フォームのプルダウンから変更） ----
      await managerPage.goto(`/deals/${dealId}/edit`);
      const stageSelect = fieldByLabel(managerPage, "ステージ *");
      const stageOptions = await stageSelect
        .locator("option")
        .evaluateAll((opts) =>
          (opts as HTMLOptionElement[]).map((o) => ({ value: o.value, label: (o.textContent ?? "").trim() }))
        );
      const currentStageValue = await stageSelect.inputValue();
      const currentIndex = stageOptions.findIndex((o) => o.value === currentStageValue);
      const nextStage = stageOptions[currentIndex + 1];
      expect(nextStage, "次のステージ選択肢が見つかること（パイプライン末尾ではないこと）").toBeTruthy();
      await stageSelect.selectOption(nextStage.value);

      await managerPage.getByRole("button", { name: "保存" }).click();
      await expectSuccessToast(managerPage, "保存しました");
      // 保存後の自動遷移は待たず、ID が分かっているので直接開き直す
      // （e2e/helpers.ts 冒頭の既知の問題を参照）
      await managerPage.goto(`/deals/${dealId}`);

      // 2. ステージが更新されたことを画面で確認する
      //    （stage_updated_at / deal_stage_histories は DB 側で更新されるため、
      //    E2E では UI 表示の変化で代替確認する。DB 直接検証は 02-unit / 04-server-actions 側の領分）
      const attributeSection = managerPage
        .locator("section")
        .filter({ has: managerPage.getByRole("heading", { name: "属性情報", level: 2 } ) });
      await expect(attributeSection.getByText(nextStage.label, { exact: true })).toBeVisible();

      // ---- 3. manager: /contracts/new で当該 Deal に契約を作成 ----
      await managerPage.goto("/contracts/new");
      await managerPage.getByRole("combobox", { name: "ディール" }).fill(leadName);
      await managerPage
        .getByRole("option", { name: new RegExp(`${leadName} 案件`) })
        .click();
      const contractName = e2eName("04-contract");
      await fieldByLabel(managerPage, "契約書名").fill(contractName);

      await managerPage.getByRole("button", { name: "作成" }).click();
      await expectSuccessToast(managerPage, "契約を作成しました");
      // 作成直後の自動遷移は待たず、一覧の検索から辿る（e2e/helpers.ts 冒頭の既知の問題を参照）
      await managerPage.goto("/contracts");
      await searchInList(managerPage, "契約名・契約書名・契約コードで検索...", contractName);
      // 一覧の 1 列目は自動生成の契約名（契約書名_契約ID の形。T-0068）なので
      // 完全一致では掴めない
      const createdContractLink = managerPage.getByRole("link", {
        name: new RegExp(`${contractName}_CTR-`),
      });
      await expect(createdContractLink).toBeVisible();
      await createdContractLink.click();
      await managerPage.waitForURL(new RegExp(`/contracts/${UUID_RE}$`));
      const contractId = extractIdFromHref(new URL(managerPage.url()).pathname);

      // ---- 4/5. Deal 詳細の相手先表示が account 優先に切り替わり、/accounts に新規 Account が現れる ----
      await managerPage.goto(`/deals/${dealId}`);
      const accountLink = managerPage.getByRole("link", { name: companyName });
      await expect(accountLink).toBeVisible();
      await expect(managerPage.getByText("取引先は契約時に作成")).not.toBeVisible();
      const accountHref = await accountLink.getAttribute("href");
      expect(accountHref).toMatch(new RegExp(`^/accounts/${UUID_RE}$`));
      const accountId = extractIdFromHref(accountHref!);

      await managerPage.goto("/accounts");
      await searchInList(managerPage, "取引先名で検索...", companyName);
      await expect(managerPage.getByRole("link", { name: companyName }).first()).toBeVisible();

      // ---- 後片付け（admin。削除操作は admin 限定）----
      // **リードを先に消す。** リードがディール・契約を参照したままだと、
      // ステージ要件のトリガーが契約・ディールの削除を拒否する
      // （docs/database-design.md §24.3）
      await adminPage.goto(`/leads/${leadId}/edit`);
      await adminPage.getByRole("button", { name: "削除", exact: true }).click();
      await adminPage.getByRole("button", { name: "削除する" }).click();
      await expectSuccessToast(adminPage, "リードを削除しました");

      await adminPage.goto(`/contracts/${contractId}/edit`);
      await adminPage.getByRole("button", { name: "削除", exact: true }).click();
      await adminPage.getByRole("button", { name: "削除する" }).click();
      await expectSuccessToast(adminPage, "契約を削除しました");

      await adminPage.goto(`/deals/${dealId}/edit`);
      await adminPage.getByRole("button", { name: "削除", exact: true }).click();
      await adminPage.getByRole("button", { name: "削除する" }).click();
      await expectSuccessToast(adminPage, "ディールを削除しました");

      await adminPage.goto(`/accounts/${accountId}/edit`);
      await adminPage.getByRole("button", { name: "削除", exact: true }).click();
      await adminPage.getByRole("button", { name: "削除する" }).click();
      await expectSuccessToast(adminPage, "取引先を削除しました");

      // company/contact の ID はリード側には出ないため、事業者情報一覧から検索して辿る
      await adminPage.goto("/companies");
      await searchInList(adminPage, "事業者名・カナ・事業者コードで検索...", companyName);
      const companyRowLink = adminPage.getByRole("link", { name: companyName }).first();
      await expect(companyRowLink).toBeVisible();
      const companyHref = await companyRowLink.getAttribute("href");
      const companyId = extractIdFromHref(companyHref!);

      await adminPage.goto(`/companies/${companyId}`);
      // 新規作成した連絡先は「担当者」欄と「連絡先一覧」の両方に同じリンクが出るため .first() で絞る
      const contactLink = adminPage.getByRole("link", { name: new RegExp(leadName) }).first();
      const contactHref = await contactLink.getAttribute("href");
      const contactId = extractIdFromHref(contactHref!);

      await adminPage.goto(`/contacts/${contactId}/edit`);
      await adminPage.getByRole("button", { name: "削除", exact: true }).click();
      await adminPage.getByRole("button", { name: "削除する" }).click();
      await expectSuccessToast(adminPage, "連絡先を削除しました");

      await adminPage.goto(`/companies/${companyId}/edit`);
      await adminPage.getByRole("button", { name: "削除", exact: true }).click();
      await adminPage.getByRole("button", { name: "削除する" }).click();
      await expectSuccessToast(adminPage, "事業者情報を削除しました");

    } finally {
      await adminCtx.close();
      await managerCtx.close();
    }
  });
});
