import { test, expect } from "@playwright/test";
import { authFile } from "./roles";
import {
  e2eName,
  expectSuccessToast,
  fieldByLabel,
  selectFirstRealOption,
} from "./helpers";

/**
 * E2E-13 [S] 連絡先の新規作成に連絡手段・住所が入ること／親から子を追加できること
 * 仕様: docs/test-cases/04-system-contacts-talents.md CON-30、03 の COM-30
 *
 * 2026-08-04 の指摘（新規作成でメール・電話を入力できない／リレーションのある
 * 画面から追加できない）に対する回帰テスト。
 * 「作成と同時に子テーブルへ書けているか」は画面から確認する
 * （DB 関数 create_contact_with_details の単体は 02 の SQL 検証で見る）。
 */
test.describe("E2E-13", () => {
  test.use({ storageState: authFile("admin") });

  test("事業者情報から連絡先を追加し、メール・電話・住所ごと作成できる @smoke", async ({
    page,
  }) => {
    const companyName = e2eName("13-company");
    const lastName = e2eName("13");

    // ---- 1. 事業者情報を用意 ----
    await page.goto("/companies/new");
    await fieldByLabel(page, "事業者名 *").fill(companyName);
    await selectFirstRealOption(fieldByLabel(page, "ステータス *"));
    await page.getByRole("button", { name: "作成" }).click();
    await expectSuccessToast(page, "事業者情報を作成しました");
    await page.waitForURL(/\/companies\/[0-9a-f-]{36}$/);
    const companyId = page.url().split("/").pop()!;

    // freee 連携の状態がアイコンで分かること（admin のみ）。
    // ここで作った事業者はまだ紐づいていないのでグレー＝未連携になる
    await expect(page.getByRole("img", { name: "freee と未連携" }).first()).toBeVisible();

    // ---- 2. 詳細から「連絡先を追加」で、事業者が初期選択された作成画面へ ----
    const addContact = page.getByRole("link", { name: "連絡先を追加" });
    await expect(addContact).toBeVisible();
    await addContact.click();
    await page.waitForURL(new RegExp(`/contacts/new\\?company_id=${companyId}`));

    // ---- 3. 連絡手段・住所の欄が新規作成にあること（旧実装には無かった）----
    await expect(page.getByRole("heading", { name: "連絡手段" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "住所" })).toBeVisible();

    await fieldByLabel(page, "姓 *").fill(lastName);
    await fieldByLabel(page, "名 *").fill("太郎");
    await selectFirstRealOption(fieldByLabel(page, "ステータス *"));

    // メール・電話を 1 件ずつ足す
    await page.getByRole("button", { name: "メールアドレスを追加" }).click();
    await page.getByLabel("メールアドレス 1", { exact: true }).fill("e2e13@example.com");
    await page.getByRole("button", { name: "電話番号を追加" }).click();
    await page.getByLabel("電話番号 1", { exact: true }).fill("03-1234-5678");

    // 住所
    await page.getByLabel("郵便番号").fill("100-0001");
    await page.getByLabel("都道府県").fill("東京都");
    await page.getByLabel("市区町村").fill("千代田区");
    await page.getByLabel("町名・番地").fill("丸の内1-1-1");

    await page.getByRole("button", { name: "作成" }).click();
    await expectSuccessToast(page, "連絡先を作成しました");
    await page.waitForURL(/\/contacts\/[0-9a-f-]{36}$/);
    const contactId = page.url().split("/").pop()!;

    // ---- 4. 作成と同時に子まで入っていること ----
    await expect(page.getByText("e2e13@example.com").first()).toBeVisible();
    await expect(page.getByText("03-1234-5678").first()).toBeVisible();
    await expect(page.getByText("千代田区").first()).toBeVisible();
    // 事業者情報にも紐づいている
    await expect(page.getByRole("link", { name: companyName }).first()).toBeVisible();

    // ---- 5. 連絡先詳細から商談を追加できる（相手先が連絡先で初期選択される）----
    const addDeal = page.getByRole("link", { name: "商談を追加" });
    await expect(addDeal).toBeVisible();
    await addDeal.click();
    await page.waitForURL(new RegExp(`/deals/new\\?contact_id=${contactId}`));
    // 取引先が無くても商談を作れること（契約成立まで取引先は存在しないため）
    await expect(page.getByRole("heading", { name: "商談を新規作成" })).toBeVisible();
    // 相手先は排他ではなく、連絡先だけが埋まった状態で始まること（T-0064）。
    // 事業者情報の欄は空で、ここで併せて選べる
    await expect(
      page.getByRole("combobox", { name: "連絡先（先方の担当者）" })
    ).toHaveValue(new RegExp(lastName));
    await expect(page.getByRole("combobox", { name: "事業者情報" })).toHaveValue("");
    // **取引先の欄は無い**（契約成立時に自動で作られるもの。T-0070）
    await expect(page.getByRole("combobox", { name: "取引先" })).toHaveCount(0);
    // **商談はリードから始まる**（T-0070）。リードの欄が最上部にあること
    await expect(
      page.getByRole("radio", { name: "既存のリードから選ぶ" })
    ).toBeChecked();
    await expect(
      page.getByRole("radio", { name: "リードを新規作成する" })
    ).toBeVisible();

    // ---- 6. 事業者情報の住所を登録できること（2026-08-04 の回帰）----
    // 住所エディタは <form> の中にあり、Enter でフォームが送信されると
    // 入力途中の住所が消える。IME の変換確定でも起きていた
    await page.goto(`/companies/${companyId}/edit`);
    await page.getByRole("button", { name: "住所を追加" }).click();

    await page.getByLabel("郵便番号").fill("100-0001");
    await page.getByLabel("都道府県").selectOption("東京都");
    await page.getByLabel("市区町村").fill("千代田区");
    await page.getByLabel("町名・番地").fill("丸の内1-1-1");
    // **Enter を押してもフォームが飛ばないこと**（飛ぶと入力が消える）
    await page.getByLabel("町名・番地").press("Enter");
    await expect(page.getByLabel("町名・番地")).toHaveValue("丸の内1-1-1");

    await page.getByRole("button", { name: "追加する" }).click();
    await expectSuccessToast(page, "住所を追加しました");

    // 保存されて一覧に出ること
    await page.goto(`/companies/${companyId}`);
    await expect(page.getByText("千代田区").first()).toBeVisible();

    // ---- 後片付け ----
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
