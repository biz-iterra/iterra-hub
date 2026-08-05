import { test, expect, type Page } from "@playwright/test";
import { authFile } from "./roles";
import {
  e2eName,
  expectErrorToastAndClose,
  expectSuccessToast,
  fieldByLabel,
  selectFirstRealOption,
} from "./helpers";

/**
 * E2E-07 [A] 連絡先の作成 → 編集 → 楽観ロック競合
 * 仕様: docs/test-cases/08-e2e-scenarios.md §E2E-07
 *
 * 更新系の Server Action は編集開始時点の `updated_at` を
 * WHERE 条件に含める（CLAUDE.md のデータ整合性規約）。
 * **後から保存したほうが黙って上書きするのでは駄目**で、
 * 0 行更新を競合として返さなければならない。
 *
 * 同じ連絡先の編集ページを 2 つ開き、片方で保存してから
 * もう片方を保存する。片方が古い `updated_at` を持っている状態を作る。
 */

/** 編集ページを開いて、姓の欄が値を持つまで待つ（初期値の流し込みを待たずに打つと消える） */
async function openEdit(page: Page, contactId: string, expected: string) {
  await page.goto(`/contacts/${contactId}/edit`);
  await expect(fieldByLabel(page, "姓 *")).toHaveValue(expected);
}

test.describe("E2E-07", () => {
  test.use({ storageState: authFile("admin") });

  test("後から保存した編集が競合として弾かれる", async ({ page, context }) => {
    const lastName = e2eName("07");

    // ---- 1. 連絡先を作る（連絡手段つき）----
    await page.goto("/contacts/new");
    await fieldByLabel(page, "姓 *").fill(lastName);
    await fieldByLabel(page, "名 *").fill("太郎");
    await selectFirstRealOption(fieldByLabel(page, "ステータス *"));

    await page.getByRole("button", { name: "メールアドレスを追加" }).click();
    await page.getByLabel("メールアドレス 1", { exact: true }).fill("e2e07@example.com");
    await page.getByRole("button", { name: "電話番号を追加" }).click();
    await page.getByLabel("電話番号 1", { exact: true }).fill("03-0000-0007");

    await page.getByRole("button", { name: "作成" }).click();
    await expectSuccessToast(page, "連絡先を作成しました");
    await page.waitForURL(/\/contacts\/[0-9a-f-]{36}$/);
    const contactId = page.url().split("/").pop()!;

    // ---- 2. 同じ連絡先の編集ページを 2 つ開く ----
    // **どちらも同じ updated_at を持った状態**にしてから、片方だけ保存する
    const second = await context.newPage();
    await openEdit(page, contactId, lastName);
    await openEdit(second, contactId, lastName);

    // ---- 3. 先に開いたほうで保存する（updated_at が進む）----
    await fieldByLabel(page, "名").fill("一郎");
    await page.getByRole("button", { name: "保存" }).click();
    await expectSuccessToast(page, "保存しました");

    // ---- 4. もう片方の保存は競合になる ----
    await fieldByLabel(second, "名").fill("二郎");
    await second.getByRole("button", { name: "保存" }).click();

    const conflict = "他のユーザーによって更新されています";
    const toast = await expectErrorToastAndClose(second, conflict);
    await expect(toast).toContainText("画面を再読み込みしてから保存してください");

    // ---- 5. エラートーストは閉じるボタンで消せる ----
    // 自動消滅（約 10 秒）は待たない。**読む時間を確保するために長くしてある**ので、
    // ここで待つとテストがその分遅くなる。
    // 数ではなく文言で見る（横断検索が空の `role="status"` を常設しており、
    // 消え際の要素も一時的に DOM に残るため）
    await toast.getByLabel("通知を閉じる").click();
    await expect(second.getByRole("alert").filter({ hasText: conflict })).toHaveCount(0);

    // **上書きされていないこと。** 競合を出しておいて値が変わっていては意味がない
    await page.goto(`/contacts/${contactId}`);
    await expect(page.getByText("一郎").first()).toBeVisible();
    await expect(page.getByText("二郎")).toHaveCount(0);

    // ---- 6. 読み込み直せば保存できること（競合の出口があること）----
    await openEdit(second, contactId, lastName);
    await fieldByLabel(second, "名").fill("三郎");
    await second.getByRole("button", { name: "保存" }).click();
    await expectSuccessToast(second, "保存しました");

    await second.close();

    // ---- 後片付け ----
    await page.goto(`/contacts/${contactId}/edit`);
    await page.getByRole("button", { name: "削除", exact: true }).click();
    await page.getByRole("button", { name: "削除する" }).click();
    await expectSuccessToast(page, "連絡先を削除しました");
  });
});
