import { USERS } from "../lib/constants.mjs";

/**
 * docs/test-cases/02-integration-db.md §5 RLS テストケース（一部）
 *
 * ここでは「から始める」対象として明示されている security_invoker 検査（IT-RLS-21）と
 * anon の不可視性（IT-RLS-20）のみを移植する。ロール別の可視範囲マトリクス
 * （IT-RLS-01〜19, 22）は §1.3 の setRole()/setAnon() で同じやり方で再現できるが、
 * 件数が多いため今回は未移植（理由は npm run test:db の起動ログと報告を参照）。
 */
export function register(test) {
  test(
    "IT-RLS-20",
    "未認証（anon）— 全テーブル不可視（GRANT レベルで弾かれる）",
    async (ctx) => {
      await ctx.setAnon();
      for (const table of ["companies", "leads", "pipeline_types", "crm_users"]) {
        await ctx.expectError(
          () => ctx.query(`SELECT count(*) FROM ${table}`),
          /permission denied/i,
          `anon SELECT ${table}`
        );
      }
      await ctx.resetRole();
    }
  );

  test(
    "IT-RLS-21",
    "ビュー経由でも RLS が効く（security_invoker）",
    async (ctx) => {
      // 1) RLS のあるテーブルを読む全ビューに security_invoker=true が付いていること
      const views = await ctx.query(
        `SELECT c.relname, c.reloptions FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname='public' AND c.relkind='v' ORDER BY 1`
      );
      ctx.assertTrue(views.rows.length > 0, "対象ビューが 1 件も無いのは想定外");
      for (const v of views.rows) {
        const opts = v.reloptions || [];
        ctx.assertTrue(
          opts.includes("security_invoker=true"),
          `${v.relname} に security_invoker=true が無い`
        );
      }

      // 2) v_leads_with_category は基底テーブルと可視件数が一致すること（member）
      await ctx.setRole(USERS.member);
      const baseMember = await ctx.val(`SELECT count(*) FROM leads`);
      const viewMember = await ctx.val(`SELECT count(*) FROM v_leads_with_category`);
      ctx.assertEqual(Number(baseMember), Number(viewMember), "member: 基底テーブルとビューの件数が一致");
      await ctx.resetRole();

      await ctx.setRole(USERS.manager);
      const baseManager = await ctx.val(`SELECT count(*) FROM leads`);
      const viewManager = await ctx.val(`SELECT count(*) FROM v_leads_with_category`);
      ctx.assertEqual(Number(baseManager), Number(viewManager), "manager: 基底テーブルとビューの件数が一致（全件）");
      ctx.assertTrue(Number(baseManager) >= Number(baseMember), "manager は member 以上の件数が見える");
      await ctx.resetRole();
    }
  );
}
