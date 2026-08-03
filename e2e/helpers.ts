import type { Browser, BrowserContext, Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { authFile, type Role } from "./roles";

/**
 * 保存後の自動遷移について（2026-08-03 に修正済み）:
 *
 * かつて多くのフォームが保存成功時に `router.push(...); router.refresh();` を
 * 直後に連続で呼んでおり、refresh が現在ルートの再フェッチを始めることで
 * 進行中の遷移が打ち消され、トーストは出るのに URL が変わらないことがあった。
 * プロダクトオーナーの実操作（Gate 4）で「契約・商談・連絡先の保存後に
 * 画面が変わらない」として報告され、`router.refresh()` を除去して
 * キャッシュ更新を Server Action の `revalidatePath` に寄せることで解消した。
 *
 * したがって保存・削除後の自動遷移は `waitForURL` で待ってよい。
 * **回帰を検知できるよう、少なくとも 1 本は遷移を明示的に待つこと**
 * （E2E-05 の事業者情報作成がその役目を持つ）。
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
