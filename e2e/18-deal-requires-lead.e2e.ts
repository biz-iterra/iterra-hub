import { test, expect } from "@playwright/test";
import { authFile } from "./roles";
import {
  e2eName,
  expectSuccessToast,
  fieldByLabel,
  selectFirstRealOption,
} from "./helpers";

/**
 * E2E-18 [A] 商談はリードから始まる / 事業者情報 1 : リード N
 * 仕様: docs/test-cases/08-e2e-scenarios.md §E2E-18
 *
 * T-0070: 商談の新規作成に**取引先の欄があった**（契約成立まで存在しないのに）。
 * 取引先を外し、代わりに**リードを起点**にする。既存のリードを選ぶか、
 * その場で作る。TQL 未満のリードは同意のうえ「選定」へ上げてから商談を作る。
 *
 * T-0069: `deals.lead_id` が紐づけの正本。**1 リードに商談 N 本**。
 *
 * T-0072: 事業者情報の詳細からリードを辿れる（これまで手段が無かった）。
 */

const UUID_RE = /[0-9a-f-]{36}/;

test.describe("E2E-18", () => {
  test.use({ storageState: authFile("admin") });

  test("リードを起点に商談を作れる / 1 リードに商談を複数ぶら下げられる", async ({
    page,
  }) => {
    const companyName = e2eName("18-company");
    const readyLead = e2eName("18-ready");
    const youngLead = e2eName("18-young");
    const dealName = e2eName("18-deal");

    // ---- 準備: 事業者情報 ----
    await page.goto("/companies/new");
    await fieldByLabel(page, "事業者名 *").fill(companyName);
    await selectFirstRealOption(fieldByLabel(page, "ステータス *"));
    await page.getByRole("button", { name: "作成" }).click();
    await expectSuccessToast(page, "事業者情報を作成しました");
    await page.waitForURL(new RegExp(`/companies/${UUID_RE.source}$`));
    const companyId = page.url().split("/").pop()!;

    /** リードを作る。ステージ名を指定して段階を分ける */
    const createLead = async (name: string, stageLabel: string) => {
      await page.goto(`/leads/new?company_id=${companyId}`);
      await fieldByLabel(page, "リード名 *").fill(name);
      await fieldByLabel(page, "ステージ *").selectOption({ label: stageLabel });
      await selectFirstRealOption(fieldByLabel(page, "ステータス *"));
      await fieldByLabel(page, "事業者種別 *").selectOption({ label: "法人" });
      await page.getByRole("button", { name: "作成" }).click();
      await expectSuccessToast(page, "リードを作成しました");
      await page.goto("/leads");
    };

    // 商談を作れる段階（選定 = TQL）と、まだの段階（育成）を 1 件ずつ
    await createLead(readyLead, "選定");
    await createLead(youngLead, "育成");

    // ---- 1. 新規作成の作り（T-0070）----
    await page.goto("/deals/new");
    // **取引先の欄は無い**（契約成立時に自動で作られる）
    await expect(page.getByRole("combobox", { name: "取引先" })).toHaveCount(0);
    // **リードが最上部にある**
    await expect(page.getByRole("radio", { name: "既存のリードから選ぶ" })).toBeChecked();
    await expect(page.getByRole("radio", { name: "リードを新規作成する" })).toBeVisible();

    // ---- 2. リードを選ばずに作ろうとすると弾かれる ----
    await fieldByLabel(page, "取引名 *").fill(dealName);
    await selectFirstRealOption(fieldByLabel(page, "パイプライン *"));
    await selectFirstRealOption(fieldByLabel(page, "ステージ *"));
    await selectFirstRealOption(fieldByLabel(page, "ステータス *"));
    await page.getByRole("button", { name: "作成" }).click();
    await expect(page.getByText("リードを選んでください")).toBeVisible();

    // ---- 3. 育成のリードを選ぶと警告が出る（TQL 未満）----
    const leadSelect = page.getByRole("combobox", { name: "リード" });
    await leadSelect.fill(youngLead);
    await page.getByRole("option", { name: new RegExp(youngLead) }).first().click();
    await expect(
      page.getByText("このリードはまだ商談を作れる段階ではありません")
    ).toBeVisible();
    // **同意しないと作れない**（黙って上げない）
    await page.getByRole("button", { name: "作成" }).click();
    await expect(page.getByText("チェックを入れてください")).toBeVisible();

    // ---- 4. 選定のリードに切り替えると、相手先が自動で埋まる ----
    await leadSelect.fill(readyLead);
    await page.getByRole("option", { name: new RegExp(readyLead) }).first().click();
    await expect(
      page.getByText("このリードはまだ商談を作れる段階ではありません")
    ).toHaveCount(0);
    // リードに紐づく事業者情報が相手先に入ること
    await expect(
      page.getByRole("combobox", { name: "事業者情報" })
    ).toHaveValue(new RegExp(companyName));

    await page.getByRole("button", { name: "作成" }).click();
    await expectSuccessToast(page, "商談を作成しました");
    await page.waitForURL(new RegExp(`/deals/${UUID_RE.source}$`));
    const firstDealId = page.url().split("/").pop()!;

    // ---- 5. 商談詳細に元リードが出る（T-0069）----
    await expect(page.getByRole("link", { name: readyLead })).toBeVisible();

    // ---- 6. 同じリードに 2 本目の商談を作れる（1 リード N 商談）----
    await page.goto("/leads");
    await page.getByRole("link", { name: readyLead }).first().click();
    await page.waitForURL(new RegExp(`/leads/${UUID_RE.source}$`));
    const leadId = page.url().split("/").pop()!;
    // リード詳細に商談一覧が出ること
    await expect(page.getByRole("heading", { name: "商談" })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(dealName) })).toBeVisible();

    await page.getByRole("link", { name: "商談を追加" }).click();
    await page.waitForURL(new RegExp(`/deals/new\\?lead_id=${leadId}`));
    const secondDealName = `${dealName}-2`;
    await fieldByLabel(page, "取引名 *").fill(secondDealName);
    await selectFirstRealOption(fieldByLabel(page, "パイプライン *"));
    await selectFirstRealOption(fieldByLabel(page, "ステージ *"));
    await selectFirstRealOption(fieldByLabel(page, "ステータス *"));
    await page.getByRole("button", { name: "作成" }).click();
    await expectSuccessToast(page, "商談を作成しました");
    await page.waitForURL(new RegExp(`/deals/${UUID_RE.source}$`));
    const secondDealId = page.url().split("/").pop()!;

    await page.goto(`/leads/${leadId}`);
    await expect(page.getByRole("link", { name: new RegExp(dealName) })).toHaveCount(2);

    // ---- 7. 事業者情報の詳細からリードを辿れる（T-0072）----
    await page.goto(`/companies/${companyId}`);
    await expect(page.getByRole("heading", { name: "リード" })).toBeVisible();
    for (const name of [readyLead, youngLead]) {
      await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
    }

    // ---- 後片付け ----
    const removeVia = async (url: string, toast: string) => {
      await page.goto(url);
      await page.getByRole("button", { name: "削除", exact: true }).click();
      await page.getByRole("button", { name: "削除する" }).click();
      await expectSuccessToast(page, toast);
    };

    // リードが商談を参照していないので、商談から先に消せる
    await removeVia(`/deals/${firstDealId}/edit`, "商談を削除しました");
    await removeVia(`/deals/${secondDealId}/edit`, "商談を削除しました");
    await page.goto("/leads");
    for (const name of [readyLead, youngLead]) {
      await page.getByRole("link", { name }).first().click();
      await page.waitForURL(new RegExp(`/leads/${UUID_RE.source}$`));
      const id = page.url().split("/").pop()!;
      await removeVia(`/leads/${id}/edit`, "リードを削除しました");
      await page.goto("/leads");
    }
    await removeVia(`/companies/${companyId}/edit`, "事業者情報を削除しました");
  });
});
