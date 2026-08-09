/**
 * 結合テスト（SQL ケース）の実行基盤。
 *
 * 各ケースは BEGIN〜ROLLBACK で囲んで実行する（docs/test-cases/02-integration-db.md §1.3）。
 * seed データを汚さないため、ケースが失敗しても必ずロールバックする。
 * ロール偽装（SET LOCAL ROLE / request.jwt.claims）もトランザクション境界で自動的に消える。
 */

function makeCtx(client) {
  const ctx = {
    client,

    async query(sql, params) {
      return client.query(sql, params);
    },

    /** 厳密に 1 行を期待する SELECT */
    async one(sql, params) {
      const r = await client.query(sql, params);
      if (r.rows.length !== 1) {
        throw new Error(`expected exactly 1 row, got ${r.rows.length}: ${sql}`);
      }
      return r.rows[0];
    },

    /** 1 行 1 列のスカラーを期待する SELECT */
    async val(sql, params) {
      const row = await ctx.one(sql, params);
      const keys = Object.keys(row);
      return row[keys[0]];
    },

    /** SELECT の行数、または UPDATE/DELETE の影響行数 */
    async rowCount(sql, params) {
      const r = await client.query(sql, params);
      return r.rowCount;
    },

    /**
     * member/manager/admin の JWT を偽装する。
     * postgres（superuser）に戻すときは resetRole() を呼ぶ。
     */
    async setRole(sub) {
      await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub, role: "authenticated" }),
      ]);
      await client.query("SET LOCAL ROLE authenticated");
    },

    /** 未認証（anon）を偽装する。claims は不要（§1.3） */
    async setAnon() {
      await client.query("SET LOCAL ROLE anon");
    },

    /** postgres（superuser・RLS 素通し）に戻す */
    async resetRole() {
      await client.query("RESET ROLE");
    },

    /**
     * fn() が指定パターンを含む例外で reject することを期待する。
     * matcher は文字列（部分一致）または正規表現。
     *
     * **必ず SAVEPOINT で囲む。** pg はエラーが起きたトランザクションを
     * 「abort 状態」にし、ROLLBACK まで以降のクエリを一切受け付けない。
     * 1 ケースで複数回エラーを期待する（IT-31 など）ときに、この保護が無いと
     * 2 つ目以降のアサーションがすべて無関係なエラーで落ちる。
     */
    async expectError(fn, matcher, label) {
      const sp = `sp_${Math.random().toString(36).slice(2)}`;
      await client.query(`SAVEPOINT ${sp}`);
      try {
        await fn();
      } catch (err) {
        await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
        await client.query(`RELEASE SAVEPOINT ${sp}`);
        const msg = err && err.message ? err.message : String(err);
        const ok = matcher instanceof RegExp ? matcher.test(msg) : msg.includes(matcher);
        if (!ok) {
          throw new Error(
            `${label ? label + ": " : ""}expected error matching ${matcher}, got: ${msg}`
          );
        }
        return err;
      }
      await client.query(`RELEASE SAVEPOINT ${sp}`);
      throw new Error(`${label ? label + ": " : ""}expected an error matching ${matcher}, but none was thrown`);
    },

    assertEqual(actual, expected, msg) {
      // JSON 比較（Date/BigInt を含まない単純値のみを想定）
      const a = JSON.stringify(actual);
      const b = JSON.stringify(expected);
      if (a !== b) {
        throw new Error(`${msg || "assertEqual failed"}: expected ${b}, got ${a}`);
      }
    },

    assertTrue(cond, msg) {
      if (!cond) throw new Error(msg || "assertTrue failed");
    },

    assertMatch(actual, re, msg) {
      if (typeof actual !== "string" || !re.test(actual)) {
        throw new Error(`${msg || "assertMatch failed"}: ${JSON.stringify(actual)} does not match ${re}`);
      }
    },
  };
  return ctx;
}

export function createHarness() {
  /** @type {{ id: string, description: string, fn: (ctx: ReturnType<typeof makeCtx>) => Promise<void>, skip?: string }[]} */
  const cases = [];

  function test(id, description, fn) {
    cases.push({ id, description, fn });
  }

  async function runAll(client, { only, onResult } = {}) {
    const results = [];
    const targets = only ? cases.filter((c) => only.includes(c.id)) : cases;

    for (const c of targets) {
      const startedAt = Date.now();
      await client.query("BEGIN");
      let result;
      try {
        await c.fn(makeCtx(client));
        result = { id: c.id, description: c.description, status: "PASS", ms: Date.now() - startedAt };
        results.push(result);
      } catch (err) {
        result = {
          id: c.id,
          description: c.description,
          status: "FAIL",
          ms: Date.now() - startedAt,
          error: err && err.message ? err.message : String(err),
        };
        results.push(result);
      } finally {
        // ケースが SET LOCAL ROLE で権限を落としていると ROLLBACK 自体が
        // 権限エラーになることは無い（ROLLBACK は常に許可される）が、
        // 念のため postgres へ戻してから片付ける
        try {
          await client.query("ROLLBACK");
        } catch (rollbackErr) {
          // ROLLBACK 自体が失敗した場合は接続がおかしいので次のケースのために立て直す
          result.status = "FAIL";
          result.error = (result.error ? result.error + " / " : "") + `ROLLBACK failed: ${rollbackErr.message}`;
        }
      }
      if (onResult) onResult(result);
    }
    return results;
  }

  return { test, cases, runAll };
}
