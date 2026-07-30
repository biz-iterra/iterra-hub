import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // supabase gen types の生成物。手で直さないため対象外にする
    "src/types/database.generated.ts",
  ]),
  {
    rules: {
      // `_` 始まりは「意図的に使わない」ことを示す慣例として扱う。
      // 分割代入で不要なキーを除去する用途が多い（例: const { _sub, ...rest } = x）。
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      // JOIN 込みの戻り値型は src/types/relations.ts に集約済み。
      // 新しい SELECT を書いたらそこに型を足すこと。any で逃げない。
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    // マスタ管理画面はクライアント側でマスタを取得・再取得する設計のため、
    // useEffect からのデータ取得（内部で setState）が構造的に発生する。
    // Server Component へ寄せる改修は影響範囲が大きいため別課題とする。
    files: ["src/app/(app)/admin/admin-view.tsx"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
