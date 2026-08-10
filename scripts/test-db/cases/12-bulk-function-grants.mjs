import { USERS } from "../lib/constants.mjs";

/**
 * docs/test-cases/02-integration-db.md
 * 「バルク系 DB 関数の直接呼び出しを塞ぐ」IT-BULK-GRANT-01 〜 03。
 *
 * 対象はマイグレーション 20260810100002（T-0085）。
 * 正規の入口はジョブ方式（docs/database-design.md § 27）で、関数を直接叩く経路は
 * pg_cron のワーカーと service_role のスクリプトだけ。
 */
export function register(test) {
  /** REVOKE の対象。呼び出し例は 42501 を出すためだけのもの（中身は走らない） */
  const TARGETS = [
    { name: "record_contact_merge_candidates", call: "SELECT record_contact_merge_candidates(NULL)" },
    { name: "recalculate_all_lead_scores", call: "SELECT recalculate_all_lead_scores()" },
    {
      name: "import_eight_leads",
      call: "SELECT import_eight_leads('{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb)",
    },
  ];

  test(
    "IT-BULK-GRANT-01",
    "バルク系 DB 関数は authenticated から直接叩けない（42501）",
    async (ctx) => {
      await ctx.setRole(USERS.admin);
      for (const t of TARGETS) {
        const err = await ctx.expectError(() => ctx.query(t.call), /permission denied/, t.name);
        ctx.assertEqual(err.code, "42501", `${t.name} は権限エラーで止まる`);
      }
      await ctx.resetRole();
    }
  );

  test(
    "IT-BULK-GRANT-02",
    "EXECUTE は service_role だけに残す（PUBLIC / anon / authenticated には無い）",
    async (ctx) => {
      for (const t of TARGETS) {
        const row = await ctx.one(
          `SELECT
             has_function_privilege('public',        p.oid, 'EXECUTE') AS pub,
             has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth,
             has_function_privilege('service_role',  p.oid, 'EXECUTE') AS svc,
             has_function_privilege('postgres',      p.oid, 'EXECUTE') AS pg
           FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = $1`,
          [t.name]
        );
        ctx.assertEqual(row.pub, false, `${t.name}: PUBLIC に EXECUTE が残っている`);
        ctx.assertEqual(row.anon, false, `${t.name}: anon に EXECUTE が残っている`);
        ctx.assertEqual(row.auth, false, `${t.name}: authenticated に EXECUTE が残っている`);
        ctx.assertEqual(row.svc, true, `${t.name}: service_role から呼べない`);
        ctx.assertEqual(row.pg, true, `${t.name}: 所有者（cron の実行者）から呼べない`);
      }
    }
  );

  test(
    "IT-BULK-GRANT-03",
    "正規の経路は塞がない（manager の一括検出入口 / admin のジョブ投入 → ワーカー）",
    async (ctx) => {
      // 入口関数は SECURITY DEFINER なので、内側の REVOKE の影響を受けない
      await ctx.setRole(USERS.manager);
      const detected = await ctx.val(`SELECT detect_all_contact_merge_candidates()`);
      ctx.assertTrue(Number(detected) >= 0, "manager は統合候補の検出入口を通れる");

      // 画面からの正規経路: admin がジョブを投入する（RLS の INSERT は is_admin() 限定）
      await ctx.setRole(USERS.admin);
      const jobId = await ctx.val(
        `INSERT INTO admin_bulk_jobs (job_type, requested_by)
         VALUES ('contact_merge_detection', $1) RETURNING id`,
        [USERS.admin]
      );
      await ctx.resetRole();

      // pg_cron 相当（postgres ロール）でワーカーを回す
      const processed = await ctx.val(`SELECT process_admin_bulk_jobs()`);
      ctx.assertEqual(Number(processed), 1, "ワーカーがジョブを 1 件処理する");

      const job = await ctx.one(
        `SELECT status, result_count, error_message FROM admin_bulk_jobs WHERE id = $1`,
        [jobId]
      );
      ctx.assertEqual(job.error_message, null, "権限エラーで失敗していない");
      ctx.assertEqual(job.status, "succeeded", "ジョブは成功する");
      ctx.assertTrue(job.result_count !== null, "検出件数が入る");
    }
  );
}
