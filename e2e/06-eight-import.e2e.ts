import { test, expect } from "@playwright/test";
import { authFile } from "./roles";
import { searchInList } from "./helpers";

/**
 * E2E-06 [A] Eight 名刺 CSV 取込 → 名寄せ確認
 * 仕様: docs/test-cases/08-e2e-scenarios.md §E2E-06
 *
 * 取込は**ジョブ方式**（`lead_import_jobs` に積み、pg_cron の
 * `process_lead_import_jobs` が 1 分ごとに処理する）。画面はポーリングする。
 * そのため実行時間が長い。テストの制限時間を伸ばしてある。
 *
 * 見たいのは 3 つ:
 *   - 事前確認（dry-run）の件数が合うこと。**取り込めない行を数え落とさない**
 *   - `㈱` が `株式会社` へ展開されて保存されること
 *     （規則は TS 側と DB 関数の対で持つ。片方だけ直すと食い違う）
 *   - **同じ CSV を再度取り込んでも増えないこと**（メールアドレスでまとめる）
 */

const LEAD_SEARCH = "リード名・電話番号で検索...";

/** Eight の書き出しに合わせた列。位置ではなく列名で対応付けている */
const HEADER = [
  "会社名", "部署名", "役職", "姓", "名", "e-mail", "郵便番号", "住所",
  "TEL会社", "TEL部門", "TEL直通", "Fax", "携帯電話", "URL", "名刺交換日",
  "Eightでつながっている人", "再データ化中の名刺", "'?'を含んだデータ",
];

function row(values: Record<string, string>): string {
  return HEADER.map((h) => values[h] ?? "").join(",");
}

/**
 * 取込の完了を待つ。
 *
 * ワーカー（pg_cron）は **1 分ごと**にしか動かず、画面のポーリングは 3 秒ごと。
 * 待ち時間は「ワーカーの起動待ち + 実行時間」なので、既定の 10 秒では足りない。
 */
async function waitForImportDone(page: import("@playwright/test").Page) {
  await expect(
    page.getByRole("status").filter({ hasText: "名刺の取込が完了しました" }).first()
  ).toBeVisible({ timeout: 150_000 });
}

test.describe("E2E-06", () => {
  test.use({ storageState: authFile("admin") });
  // ワーカーが 1 分ごとなので、取込 2 回分の待ちを見込む
  test.setTimeout(300_000);

  test("名刺 CSV を取り込み、略記の展開と重複しないことを確かめる", async ({ page }) => {
    const stamp = Date.now().toString(36);
    const shortName = `㈱E2E06${stamp}`;
    const expandedName = `株式会社E2E06${stamp}`;

    const csv = [
      HEADER.join(","),
      // 同じ会社の 2 人。**リード名は会社名から決まる**ので、どちらも展開後の名前になる
      row({ 会社名: shortName, 姓: "試験", 名: "一郎", "e-mail": `e2e06a${stamp}@example.com`, 名刺交換日: "2026-01-10" }),
      row({ 会社名: shortName, 姓: "試験", 名: "二郎", "e-mail": `e2e06b${stamp}@example.com`, 名刺交換日: "2026-01-11" }),
      // 会社名・氏名・メールがすべて空の行。**リード名を決められないので取り込めない**
      row({ 名刺交換日: "2026-01-12" }),
    ].join("\r\n");

    const file = {
      name: `e2e06-${stamp}.csv`,
      mimeType: "text/csv",
      buffer: Buffer.from(csv, "utf-8"),
    };

    // ---- 1. 事前確認（dry-run）----
    await page.goto("/admin/leads/import");
    await expect(page.getByRole("heading", { name: "Eight 名刺データ取込" })).toBeVisible();

    await page.locator("#eight-csv").setInputFiles(file);
    await page.getByRole("button", { name: "内容を確認" }).click();

    // 件数が期待どおりであること。**取り込めない 1 行を数え落とさない**
    const stat = (label: string) =>
      page.locator("div").filter({ hasText: new RegExp(`^${label}$`) }).first()
        .locator("xpath=following-sibling::div[1]");
    await expect(stat("CSV の行数")).toHaveText("3");
    await expect(stat("登録するリード")).toHaveText("2");
    await expect(stat("新規")).toHaveText("2");
    await expect(stat("取込できない行")).toHaveText("1");

    // ---- 2. 取り込む ----
    await page.getByRole("button", { name: "2 件を取り込む" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "取り込む" }).click();
    await waitForImportDone(page);

    // ---- 3. 略記が展開されて保存されていること ----
    await page.goto("/leads");
    await searchInList(page, LEAD_SEARCH, expandedName);
    await expect(page.getByRole("link", { name: expandedName })).toHaveCount(2);
    // 元の `㈱` 表記では引けない（展開して保存しているため）
    await searchInList(page, LEAD_SEARCH, shortName);
    await expect(page.getByRole("link", { name: shortName })).toHaveCount(0);

    // ---- 4. 同じ CSV をもう一度取り込んでも増えないこと ----
    await page.goto("/admin/leads/import");
    await page.locator("#eight-csv").setInputFiles(file);
    await page.getByRole("button", { name: "内容を確認" }).click();
    // 2 回目は「新規」ではなく「既存に追記」になる
    await expect(stat("新規")).toHaveText("0");
    await expect(stat("既存に追記")).toHaveText("2");

    await page.getByRole("button", { name: "2 件を取り込む" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "取り込む" }).click();
    await waitForImportDone(page);

    await page.goto("/leads");
    await searchInList(page, LEAD_SEARCH, expandedName);
    await expect(page.getByRole("link", { name: expandedName })).toHaveCount(2);
  });
});
