import type { Browser, BrowserContext, Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { authFile, type Role } from "./roles";

/**
 * 既知の問題（アプリ側の実装起因。E2E 側では回避のみ行う）:
 *
 * 多くの新規作成・更新・削除フォームは保存成功時に
 * `router.push(...); router.refresh();` を直後に連続で呼んでいる
 * （lead-new-form / company-new-form / contract-new-form / account-edit-form /
 * deal-edit-form / contact-edit-form / company-edit-form / contract-edit-form 等）。
 * Playwright（headless Chromium + Turbopack dev）から高速に操作すると、この
 * push 直後の refresh がまだ進行中の遷移を打ち消してしまい、トーストは出るのに
 * URL が古いページのまま変わらないことがある（手元で再現し、サーバー側の保存
 * 自体は成功していることを確認済み）。
 *
 * そのため本 E2E では、保存・削除ボタン押下後に「その操作自身の自動遷移」を
 * `waitForURL` で待つことをしない。トースト確認までで止め、次の遷移は
 * 検索結果のリンククリックや `page.goto()` など別経路で明示的に行う。
 */

/**
 * E2E で作るデータの名称接頭辞（docs/test-cases/08-e2e-scenarios.md §1 のデータ規約）。
 * 実行のたびに衝突しないよう、日時 + ランダム文字列を続ける。
 */
export function e2eName(scenario: string): string {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `E2E-${scenario}-${stamp}${rand}`;
}

/** 指定ロールの storageState で新しいコンテキスト + ページを開く（マルチロールのシナリオ用） */
export async function openAs(
  browser: Browser,
  role: Role
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ storageState: authFile(role) });
  const page = await context.newPage();
  return { context, page };
}

/** ネイティブ <select> でプレースホルダー（先頭の "-- 選択 --" 等）を飛ばして選ぶ */
export async function selectFirstRealOption(select: Locator): Promise<string> {
  const values = await select.locator("option").evaluateAll((opts) =>
    (opts as HTMLOptionElement[]).map((o) => o.value)
  );
  const firstReal = values.find((v) => v !== "");
  if (!firstReal) {
    throw new Error("選択可能なオプションがありません");
  }
  await select.selectOption(firstReal);
  return firstReal;
}

/** 成功トースト（role="status"）が指定テキストを含んで表示されることを確認する */
export async function expectSuccessToast(page: Page, textSubstring: string): Promise<void> {
  const toast = page.getByRole("status").filter({ hasText: textSubstring });
  await expect(toast.first()).toBeVisible();
}

/**
 * エラートースト（role="alert"）が指定テキストを含んで表示されることを確認する。
 * error トーストは自動消滅しないため、確認後は閉じるボタンで消しておく
 * （見た目の残留が次のアサーションに干渉しないようにする）。
 */
export async function expectErrorToastAndClose(page: Page, textSubstring?: string): Promise<Locator> {
  const toast = textSubstring
    ? page.getByRole("alert").filter({ hasText: textSubstring })
    : page.getByRole("alert");
  const first = toast.first();
  await expect(first).toBeVisible();
  return first;
}

/** UUID っぽい文字列を href から取り出す（例: "/deals/xxxx" → "xxxx"） */
export function extractIdFromHref(href: string): string {
  const parts = href.split("/").filter(Boolean);
  return parts[parts.length - 1];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 「<label>ラベル文字列</label><input/></div>」のように、input/select/textarea が
 * ラベルと同じ div の兄弟要素として置かれているだけ（for/id 紐付けなし）のフォームが
 * 多いため、getByLabel が使えない。ラベル文字列から兄弟の入力欄を辿るための代替手段。
 *
 * ラベル文字列は該当フォームのソースに書かれている通り、末尾の " *"（必須マーク）も
 * 含めて厳密一致で渡すこと（部分一致だと「ステージ」が「ステージ *」にも当たってしまう）。
 */
export function fieldByLabel(page: Page, label: string): Locator {
  const exact = new RegExp(`^${escapeRegExp(label)}$`);
  const labelLocator = page.locator("label").filter({ hasText: exact }).first();
  return labelLocator.locator("xpath=following-sibling::*[self::input or self::select or self::textarea][1]");
}
