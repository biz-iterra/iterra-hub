import { USERS } from "../lib/constants.mjs";

/**
 * docs/test-cases/02-integration-db.md §3.6 その他の関数
 * IT-31, IT-32
 */
export function register(test) {
  test(
    "IT-31",
    "upsert_company_domain — 正規化・他社重複・フリーメール・主切替",
    async (ctx) => {
      const statusId = await ctx.val(
        `SELECT id FROM company_statuses WHERE code = 'unverified' AND deleted_at IS NULL`
      );
      const compA = await ctx.val(
        `INSERT INTO companies (name, owner_user_id, company_status_id) VALUES ('IT31-アルファ', $1, $2) RETURNING id`,
        [USERS.admin, statusId]
      );
      const compB = await ctx.val(
        `INSERT INTO companies (name, owner_user_id, company_status_id) VALUES ('IT31-ベータ', $1, $2) RETURNING id`,
        [USERS.admin, statusId]
      );

      // upsert_company_domain は SECURITY INVOKER なので RLS が効く。admin で実行する
      await ctx.setRole(USERS.admin);

      const r1 = await ctx.one(
        `SELECT * FROM upsert_company_domain($1, 'https://www.Example.co.jp/about', TRUE)`,
        [compA]
      );
      ctx.assertEqual(r1.domain, "example.co.jp");
      ctx.assertEqual(r1.is_primary, true);

      await ctx.expectError(
        () => ctx.query(`SELECT upsert_company_domain($1, 'example.co.jp', FALSE)`, [compB]),
        "[domain] example.co.jp は既に別の法人に登録されています"
      );

      await ctx.expectError(
        () => ctx.query(`SELECT upsert_company_domain($1, 'x@gmail.com', FALSE)`, [compA]),
        "[domain] gmail.com はフリーメールのため"
      );

      const r4 = await ctx.one(
        `SELECT * FROM upsert_company_domain($1, 'second.example.jp', TRUE)`,
        [compA]
      );
      ctx.assertEqual(r4.domain, "second.example.jp");
      ctx.assertEqual(r4.is_primary, true);

      const oldPrimary = await ctx.val(
        `SELECT is_primary FROM company_domains WHERE company_id = $1 AND domain = 'example.co.jp'`,
        [compA]
      );
      ctx.assertEqual(oldPrimary, false, "新ドメインが primary になったら旧ドメインは落ちる");
    }
  );

  test(
    "IT-32",
    "resolve_lead_company_size — 資本金優先・従業員数フォールバック",
    async (ctx) => {
      // 判定は lead_company_sizes 全体を見るため、seed の既定区分（小〜エンタープライズが
      // 全レンジをカバーしている）を一時退避してから自前の 2 行だけにする
      await ctx.query(`UPDATE lead_company_sizes SET deleted_at = now() WHERE deleted_at IS NULL`);

      await ctx.query(
        `INSERT INTO lead_company_sizes (code, name, min_capital, max_capital, min_employees, max_employees, sort_order)
         VALUES ('it32_small', 'IT32-小', NULL, 9999999, NULL, 49, 1)`
      );
      const large = await ctx.val(
        `INSERT INTO lead_company_sizes (code, name, min_capital, max_capital, min_employees, max_employees, sort_order)
         VALUES ('it32_large', 'IT32-大', 10000000, NULL, 50, NULL, 2) RETURNING id`
      );

      const row = await ctx.one(
        `SELECT resolve_lead_company_size(50000000, 10) a,
                resolve_lead_company_size(NULL, 100)    b,
                resolve_lead_company_size(NULL, NULL)   c`
      );
      ctx.assertEqual(row.a, large, "資本金優先。従業員数(10=小相当)は見ない");
      ctx.assertEqual(row.b, large, "従業員数フォールバック");
      ctx.assertEqual(row.c, null);
    }
  );
}
