import path from "node:path";

/**
 * ロール別テストユーザー（ローカル seed の開発専用ユーザー。本番では使われない値）。
 * 参照: supabase/seeds/02-dev-users.sql
 */
export const TEST_USERS = {
  admin: { email: "admin@iterra.jp", password: "password123", fullName: "管理者テスト" },
  manager: { email: "manager@iterra.jp", password: "password123", fullName: "マネージャーテスト" },
  member: { email: "member@iterra.jp", password: "password123", fullName: "メンバーテスト" },
} as const;

export type Role = keyof typeof TEST_USERS;

export const AUTH_DIR = path.join(__dirname, ".auth");

/** グローバルセットアップで作った storageState の保存先 */
export function authFile(role: Role): string {
  return path.join(AUTH_DIR, `${role}.json`);
}
