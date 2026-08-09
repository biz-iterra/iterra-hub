#!/usr/bin/env node
/**
 * 結合テスト（DB 関数・トリガー・RLS）のランナー。
 *
 * 正本は docs/test-cases/02-integration-db.md。ここに移植したケースは
 * 同ケース ID をコメント・出力の両方に残し、そこから追跡できるようにする。
 *
 * 実行方法:
 *   npm run test:db
 *
 * 前提: ローカル Supabase が起動していること（npx supabase start）。
 * 接続先は既定で 127.0.0.1:54332（supabase/config.toml の [db].port）。
 * 別環境で動かす場合は TEST_DB_URL を渡す:
 *   TEST_DB_URL=postgresql://... npm run test:db
 *
 * 各ケースは BEGIN〜ROLLBACK で実行するため、seed データを汚さない
 * （docs/test-cases/02-integration-db.md §1.3）。
 */
import pg from "pg";
import { resolveDbUrl } from "./lib/env.mjs";
import { createHarness } from "./lib/harness.mjs";

import { register as registerNormalizeFunctions } from "./cases/01-functions-normalize.mjs";
import { register as registerMiscFunctions } from "./cases/02-functions-misc.mjs";
import { register as registerTriggers } from "./cases/03-triggers.mjs";
import { register as registerIntegrityQueries } from "./cases/04-integrity-queries.mjs";
import { register as registerRlsInvoker } from "./cases/05-rls-invoker.mjs";
import { register as registerPerfTimeout } from "./cases/06-perf-timeout.mjs";
import { register as registerMasterIntegrity } from "./cases/07-master-integrity.mjs";
import { register as registerLeadStageRules } from "./cases/08-lead-stage-rules.mjs";
import { register as registerContractNaming } from "./cases/09-contract-naming.mjs";

const { Client } = pg;

async function main() {
  const dbUrl = resolveDbUrl();
  const harness = createHarness();

  registerNormalizeFunctions(harness.test);
  registerMiscFunctions(harness.test);
  registerTriggers(harness.test, { dbUrl });
  registerIntegrityQueries(harness.test);
  registerRlsInvoker(harness.test);
  registerPerfTimeout(harness.test);
  registerMasterIntegrity(harness.test);
  registerLeadStageRules(harness.test);
  registerContractNaming(harness.test);

  console.log(`[test:db] connecting to ${dbUrl.replace(/:[^:@/]+@/, ":***@")}`);
  console.log(`[test:db] ${harness.cases.length} cases registered`);

  const client = new Client({ connectionString: dbUrl });
  try {
    await client.connect();
  } catch (err) {
    console.error("[test:db] DB へ接続できませんでした。ローカル Supabase が起動しているか確認してください");
    console.error("          npx supabase start / npx supabase status");
    console.error(String(err && err.message ? err.message : err));
    process.exitCode = 1;
    return;
  }

  // postgres（superuser）接続には既定の statement_timeout が無い。
  // ケースの不具合でクエリが返ってこないと開発中の実行がハングし続けるため、
  // 開発時の安全弁として上限を設ける（本番相当のロール別 timeout とは別物）
  await client.query("SET statement_timeout = '20s'");

  const only = process.env.TEST_DB_ONLY ? process.env.TEST_DB_ONLY.split(",").map((s) => s.trim()) : undefined;

  console.log("");
  let results;
  try {
    results = await harness.runAll(client, {
      only,
      onResult: (r) => {
        const mark = r.status === "PASS" ? "PASS" : "FAIL";
        console.log(`[${mark}] ${r.id.padEnd(14)} ${r.description} (${r.ms}ms)`);
        if (r.status === "FAIL") {
          console.log(`       -> ${r.error}`);
        }
      },
    });
  } finally {
    await client.end();
  }

  const pass = results.filter((r) => r.status === "PASS");
  const fail = results.filter((r) => r.status === "FAIL");

  console.log("");
  console.log(`[test:db] ${pass.length} passed, ${fail.length} failed, ${results.length} total`);

  if (fail.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[test:db] unexpected error");
  console.error(err);
  process.exitCode = 1;
});
