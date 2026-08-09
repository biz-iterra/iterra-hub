/**
 * docs/test-cases/02-integration-db.md IT-PERF-01
 * 一括処理の関数に実行時間の制限が設定されていること（20260804000001）
 */
export function register(test) {
  test(
    "IT-PERF-01",
    "一括処理の関数に statement_timeout が設定されている／ロール側は変えていない",
    async (ctx) => {
      const roles = await ctx.query(
        `SELECT rolname, rolconfig FROM pg_roles WHERE rolname IN ('authenticated','anon','service_role','authenticator')`
      );
      const byRole = Object.fromEntries(roles.rows.map((r) => [r.rolname, (r.rolconfig || []).join(",")]));
      ctx.assertTrue((byRole.authenticated || "").includes("statement_timeout=8s"), "authenticated は 8s のまま");
      ctx.assertTrue((byRole.anon || "").includes("statement_timeout=3s"), "anon は 3s のまま");
      ctx.assertTrue((byRole.authenticator || "").includes("statement_timeout=8s"), "authenticator は 8s のまま");

      const funcs = await ctx.query(
        `SELECT proname, array_to_string(proconfig, ',') cfg
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND array_to_string(proconfig, ',') LIKE '%statement_timeout%'`
      );
      const byFunc = Object.fromEntries(funcs.rows.map((r) => [r.proname, r.cfg]));

      // doc に列挙された 5 関数は最低限含まれること（以後の追加分があっても壊れない）
      for (const name of [
        "detect_all_contact_merge_candidates",
        "import_eight_leads",
        "import_inquiry_leads",
        "recalculate_all_lead_scores",
        "recalculate_lead_scores_for_batch",
      ]) {
        ctx.assertTrue(name in byFunc, `${name} に statement_timeout が設定されていない`);
        // search_path が失われていないこと（ALTER FUNCTION ... SET の書き方を誤ると消える）
        ctx.assertTrue(byFunc[name].includes("search_path="), `${name} の search_path が失われている`);
      }
    }
  );
}
