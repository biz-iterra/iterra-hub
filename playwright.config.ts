import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

/**
 * E2E テスト設定（仕様: docs/test-cases/08-e2e-scenarios.md）。
 *
 * 前提:
 *   - `npx supabase start` 済み + `npx supabase db reset` 直後の状態
 *   - `npm run dev`（ポート 2000）が別途起動済み
 *
 * webServer は設定しない。dev サーバーは Turbopack のファイルシステムキャッシュ
 * ウォームアップに時間がかかり、CI 以外（ローカル運用）では毎回起動待ちするより
 * 開発者が使い回している dev サーバーにそのまま繋ぐ方が速い。将来 CI（nightly）に
 * 組み込む際は `supabase start` が必要なため、その時点で webServer 化を検討する
 * （08 §4 参照）。
 *
 * テストファイルの拡張子は `*.e2e.ts` にしている。Vitest のデフォルト include は
 * `**\/*.{test,spec}.*` なので、`.spec.ts` を使うと `npm test`（vitest run）が
 * このディレクトリまで拾って誤実行してしまう。拡張子を分けることで
 * vitest.config.ts 側に手を入れずに棲み分ける。
 */

const E2E_BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:2000";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  globalSetup: path.join(__dirname, "e2e", "global-setup.ts"),
  // Turbopack dev サーバーは初回ヒットするルートのコンパイルが数十秒かかることがあるため、
  // 通常の UI 操作より長めに取る
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  use: {
    baseURL: E2E_BASE_URL,
    viewport: { width: 1440, height: 900 },
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
