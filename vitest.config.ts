import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * 単体テスト設定（仕様: docs/test-cases/01-unit.md）。
 *
 * 既定の include（`**\/*.{test,spec}.*`）のままだと、Claude Code が作る
 * git worktree（`.claude/worktrees/<branch>/`）配下の作業コピーまで対象に入り、
 * 別ブランチのテストが同時に走ってしまう（2026-08-04 に Gate 1 で
 * 28 ファイル → 56 ファイルに倍増していて判明した）。
 * E2E の spec は `*.e2e.ts` なので既定の include には元から掛からない。
 *
 * `@/` は tsconfig の paths と同じものをここでも解決させる。設定が無いと、
 * テスト対象が `@/` で実体（モックしていないモジュール）を import した時点で
 * `Cannot find package '@/...'` になる。
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "src"),
    },
  },
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      ".claude/**",
      "e2e/**",
    ],
  },
});
