import fs from "node:fs";
import { chromium, type FullConfig } from "@playwright/test";
import { AUTH_DIR, TEST_USERS, authFile, type Role } from "./roles";

/**
 * admin / manager / member の 3 ロール分の storageState を作る。
 *
 * 実際のログインフォームを通す（API を直接叩かない）。ログイン画面の破壊的な
 * 変更もここで早期に検知できる副次効果がある。
 */
async function loginAndSave(baseURL: string, role: Role): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ baseURL });
    const user = TEST_USERS[role];

    await page.goto("/login");
    await page.getByLabel("メールアドレス").fill(user.email);
    await page.getByLabel("パスワード").fill(user.password);
    await page.getByRole("button", { name: "ログイン" }).click();
    await page.waitForURL("**/dashboard", { timeout: 15_000 });

    await page.context().storageState({ path: authFile(role) });
  } finally {
    await browser.close();
  }
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const baseURL = config.projects[0]?.use.baseURL ?? "http://localhost:2000";

  // ログインは直列に行う（同時に複数ブラウザを立ち上げるほどの規模ではない上、
  // 失敗時にどのロールで落ちたか分かりやすくする）
  for (const role of Object.keys(TEST_USERS) as Role[]) {
    await loginAndSave(baseURL, role);
  }
}
