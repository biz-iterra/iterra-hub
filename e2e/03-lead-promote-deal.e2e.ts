import { test, expect } from "@playwright/test";
import { authFile } from "./roles";
import {
  e2eName,
  expectSuccessToast,
  extractIdFromHref,
  fieldByLabel,
  searchInList,
  selectFirstRealOption,
} from "./helpers";

const UUID_RE = "[0-9a-f-]{36}";

/**
 * E2E-03 [S] リード → Deal 昇格 → Company / Contact 自動生成
 * 仕様: docs/test-cases/08-e2e-scenarios.md §3
 *
 * 取引先（Account）は契約成立時まで作らない仕様（docs/database-design.md §16）。
 * 相手先表示は取引先 → 事業者情報 → 連絡先の順にフォールバックする
 * （src/lib/deal-counterparty.ts）。
 */
test.describe("E2E-03", () => {
  test.use({ storageState: authFile("admin") });

  test("リードを Opportunity へ昇格すると Company / Contact / Deal が生成される @smoke", async ({ page }) => {
    const leadName = e2eName("03");
    const companyName = `${leadName}株式会社`;

    // ---- 1. 昇格対象のリードを作る ----
    await page.goto("/leads/new");
    await fieldByLabel(page, "リード名 *").fill(leadName);
    await fieldByLabel(page, "ステージ *").selectOption({ label: "獲得" });
    await selectFirstRealOption(fieldByLabel(page, "ステータス *"));
    await fieldByLabel(page, "会社名").fill(companyName);
    await fieldByLabel(page, "事業者種別 *").selectOption({ label: "法人" });

    await page.getByRole("button", { name: "作成" }).click();
    await expectSuccessToast(page, "リードを作成しました");
    // 作成直後の自動遷移は待たず、一覧の検索から辿る（e2e/helpers.ts 冒頭の既知の問題を参照）
    await page.goto("/leads");
    await searchInList(page, "リード名・電話番号で検索...", leadName);
    const createdLeadLink = page.getByRole("link", { name: leadName, exact: true });
    await expect(createdLeadLink).toBeVisible();
    await createdLeadLink.click();
    await page.waitForURL(new RegExp(`/leads/${UUID_RE}$`));
    const leadId = extractIdFromHref(new URL(page.url()).pathname);

    // ---- 2. 編集ページでステージを Opportunity に変更して保存 → 昇格確認モーダル ----
    await page.getByRole("link", { name: "編集" }).click();
    await page.waitForURL(new RegExp(`/leads/${UUID_RE}/edit$`));

    await fieldByLabel(page, "ステージ").selectOption({ label: "Opportunity" });
    await expect(page.getByText("このステージでは商談が自動生成されます")).toBeVisible();

    await page.getByRole("button", { name: "保存" }).first().click();
    const promoteModalHeading = page.getByRole("heading", { name: "Opportunity に昇格します" });
    await expect(promoteModalHeading).toBeVisible();
    // 事業者種別=法人 なので事業者情報・連絡先・取引先・商談が生成される旨の案内が出る。
    // モーダルの <ul> は Tailwind preflight で list-style:none のため Chromium が
    // list/listitem の暗黙ロールを外す（HTML-AAM の仕様どおり）。role では拾えないため
    // モーダルの祖先要素にスコープしたテキスト一致で見る（サイドバーの同名リンクを避ける）。
    // 見出しの直接の親 div がモーダル本体（`:has()` だと祖先の div も拾ってしまい、
    // サイドバーまで含む外側の div が先に一致するため使えない）
    const promoteModal = promoteModalHeading.locator("xpath=..");
    await expect(promoteModal.getByText("事業者情報", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "昇格する" }).click();
    // 昇格に成功したことがトースト文言で分かること。
    // updateLead() は promoteLeadToDeal の後にリードを取り直して返すので、
    // クライアントの justPromoted 判定が成立する（2026-08-03 修正）。
    // 通常の「保存しました」に戻っていたら、その取り直しが失われた合図
    await expectSuccessToast(page, "商談に昇格しました");
    await page.waitForURL(new RegExp(`/leads/${UUID_RE}$`));

    // ---- 3. Deal が作成され、company_id 経由で事業者情報が紐づく（account はまだ無い）----
    const promotedLink = page.getByRole("link", { name: "商談昇格済み" });
    await expect(promotedLink).toBeVisible();
    const dealHref = await promotedLink.getAttribute("href");
    expect(dealHref).toMatch(new RegExp(`^/deals/${UUID_RE}$`));
    const dealId = extractIdFromHref(dealHref!);

    await page.goto(`/deals/${dealId}`);
    await expect(page.getByRole("heading", { name: `${leadName} 案件`, level: 1 })).toBeVisible();

    const companyLink = page.getByRole("link", { name: companyName });
    await expect(companyLink).toBeVisible();
    await expect(page.getByText("取引先は契約時に作成")).toBeVisible();
    const companyHref = await companyLink.getAttribute("href");
    expect(companyHref).toMatch(new RegExp(`^/companies/${UUID_RE}$`));
    const companyId = extractIdFromHref(companyHref!);

    // ---- 4. /deals のテーブルビューにも新規 Deal が現れ、取引先列は事業者情報名を表示する ----
    await page.goto("/deals");
    await page.getByRole("button", { name: "テーブル" }).click();
    // 表示モードも URL の条件に含まれる。切り替わり切ってから検索する
    await page.waitForURL(/[?&]view=table/);
    await searchInList(page, "商談名で検索...", leadName);
    const dealRow = page.getByRole("row").filter({ hasText: `${leadName} 案件` });
    await expect(dealRow).toBeVisible();
    await expect(dealRow.getByText(companyName)).toBeVisible();

    // ---- 5. 事業者情報の詳細に連絡先（担当者情報未入力のため lead_name から生成）が紐づく ----
    await page.goto(`/companies/${companyId}`);
    await expect(page.getByRole("heading", { name: companyName, level: 1 })).toBeVisible();
    // 新規作成した連絡先は「担当者」欄と「連絡先一覧」の両方に同じリンクが出るため .first() で絞る
    const contactLink = page.getByRole("link", { name: new RegExp(leadName) }).first();
    await expect(contactLink).toBeVisible();
    const contactHref = await contactLink.getAttribute("href");
    expect(contactHref).toMatch(new RegExp(`^/contacts/${UUID_RE}$`));
    const contactId = extractIdFromHref(contactHref!);

    // ---- 後片付け（論理削除。リード → Deal → 連絡先 → 事業者情報 の順）----
    // **リードを先に消す。** リードが Opportunity のまま商談を参照していると、
    // ステージ要件のトリガーが商談の削除を拒否する（docs/database-design.md §24.3）。
    // 業務では「リードのステージを下げてから商談を消す」が正規の手順だが、
    // ここは後片付けなのでリードごと消す
    await page.goto(`/leads/${leadId}/edit`);
    await page.getByRole("button", { name: "削除", exact: true }).click();
    await page.getByRole("button", { name: "削除する" }).click();
    await expectSuccessToast(page, "リードを削除しました");

    await page.goto(`/deals/${dealId}/edit`);
    await page.getByRole("button", { name: "削除", exact: true }).click();
    await page.getByRole("button", { name: "削除する" }).click();
    await expectSuccessToast(page, "商談を削除しました");

    await page.goto(`/contacts/${contactId}/edit`);
    await page.getByRole("button", { name: "削除", exact: true }).click();
    await page.getByRole("button", { name: "削除する" }).click();
    await expectSuccessToast(page, "連絡先を削除しました");

    await page.goto(`/companies/${companyId}/edit`);
    await page.getByRole("button", { name: "削除", exact: true }).click();
    await page.getByRole("button", { name: "削除する" }).click();
    await expectSuccessToast(page, "事業者情報を削除しました");
  });
});
