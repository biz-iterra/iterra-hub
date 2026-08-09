import pg from "pg";
import { USERS, PIPELINE_TYPES } from "../lib/constants.mjs";

const { Client } = pg;

/**
 * docs/test-cases/02-integration-db.md §4 トリガーテストケース
 * IT-33 〜 IT-45
 */
export function register(test, { dbUrl }) {
  test(
    "IT-33",
    "update_updated_at — BEFORE UPDATE で updated_at が進む（別トランザクション）＋同一トランザクション内では進まない",
    async (ctx) => {
      const statusId = await ctx.val(
        `SELECT id FROM company_statuses WHERE code = 'unverified' AND deleted_at IS NULL`
      );

      // NOW() はトランザクション開始時刻で固定されるため、進むことの確認は
      // 本物の別トランザクション（別コネクション・別 BEGIN/COMMIT）が要る。
      // このケースだけ harness の外側で自前の接続を持ち、後始末も自分でやる。
      //
      // **先にこちらをやる。** メインの harness トランザクション側で companies へ
      // 未コミットの INSERT があると、採番トリガー（MAX+1 方式・§7 懸念 2）が
      // 同じ company_code を計算し、side 側の一意制約チェックがメインの
      // コミット/ロールバックを待ってブロックする（実際に statement_timeout で再現した）。
      const side = new Client({ connectionString: dbUrl });
      await side.connect();
      await side.query("SET statement_timeout = '20s'");
      let sideId;
      try {
        await side.query("BEGIN");
        const ins = await side.query(
          `INSERT INTO companies (name, owner_user_id, company_status_id) VALUES ('IT33-別TX', $1, $2) RETURNING id, updated_at`,
          [USERS.admin, statusId]
        );
        await side.query("COMMIT");
        sideId = ins.rows[0].id;
        const t1 = ins.rows[0].updated_at;

        await side.query("BEGIN");
        const upd = await side.query(
          `UPDATE companies SET name = 'IT33-別TX-改' WHERE id = $1 RETURNING updated_at`,
          [sideId]
        );
        await side.query("COMMIT");
        const t2 = upd.rows[0].updated_at;

        if (!(t2.getTime() > t1.getTime())) {
          throw new Error(
            `別トランザクションでは updated_at が進むはずが進んでいない: ${t1.toISOString()} -> ${t2.toISOString()}`
          );
        }
      } finally {
        // 後始末（このケースだけ ROLLBACK の外で実データを作っているため、
        // アサーション失敗時も必ず削除する）
        try {
          if (sideId) await side.query("DELETE FROM companies WHERE id = $1", [sideId]);
        } finally {
          await side.end();
        }
      }

      // 同一トランザクション内の連続 UPDATE では NOW() が同値のため updated_at は進まない
      const comp = await ctx.val(
        `INSERT INTO companies (name, owner_user_id, company_status_id) VALUES ('IT33-同一TX', $1, $2) RETURNING id`,
        [USERS.admin, statusId]
      );
      const before = await ctx.val(`SELECT updated_at FROM companies WHERE id = $1`, [comp]);
      await ctx.query(`UPDATE companies SET name = 'IT33-同一TX-改' WHERE id = $1`, [comp]);
      const after = await ctx.val(`SELECT updated_at FROM companies WHERE id = $1`, [comp]);
      ctx.assertEqual(
        before.getTime(),
        after.getTime(),
        "同一トランザクション内の連続 UPDATE では NOW() が同値のため updated_at は進まない"
      );
    }
  );

  test(
    "IT-34",
    "自動採番 — 形式・連番・クライアント指定値の上書き",
    async (ctx) => {
      const statusId = await ctx.val(
        `SELECT id FROM company_statuses WHERE code = 'unverified' AND deleted_at IS NULL`
      );
      const r1 = await ctx.one(
        `INSERT INTO companies (name, company_code, owner_user_id, company_status_id)
         VALUES ('IT34-採番1', 'CMP-999999', $1, $2) RETURNING company_code`,
        [USERS.admin, statusId]
      );
      ctx.assertTrue(r1.company_code !== "CMP-999999", "クライアント指定値は無条件に上書きされる");
      ctx.assertMatch(r1.company_code, /^CMP-\d{6}$/);

      const r2 = await ctx.one(
        `INSERT INTO companies (name, owner_user_id, company_status_id)
         VALUES ('IT34-採番2', $1, $2) RETURNING id, company_code`,
        [USERS.admin, statusId]
      );
      ctx.assertMatch(r2.company_code, /^CMP-\d{6}$/);
      ctx.assertTrue(
        Number(r2.company_code.slice(4)) === Number(r1.company_code.slice(4)) + 1,
        "連番が 1 ずつ進む"
      );

      // 他テーブルも同じ接頭辞形式であること（accounts/contacts/deals/contracts/projects）
      const accStatus = await ctx.val(
        `SELECT id FROM account_statuses WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1`
      );
      const acc = await ctx.val(
        `INSERT INTO accounts (name, account_status_id, owner_user_id) VALUES ('IT34-取引先', $1, $2) RETURNING account_code`,
        [accStatus, USERS.admin]
      );
      ctx.assertMatch(acc, /^ACC-\d{6}$/);

      const contactStatus = await ctx.val(
        `SELECT id FROM contact_statuses WHERE name = 'アクティブ' AND deleted_at IS NULL`
      );
      const cnt = await ctx.val(
        `INSERT INTO contacts (last_name, contact_status_id, owner_user_id) VALUES ('IT34採番', $1, $2) RETURNING contact_code`,
        [contactStatus, USERS.admin]
      );
      ctx.assertMatch(cnt, /^CNT-\d{6}$/);

      const dealStage = await ctx.val(`SELECT id FROM deal_stages WHERE deleted_at IS NULL ORDER BY sort_order LIMIT 1`);
      const dealStatus = await ctx.val(`SELECT id FROM deal_statuses WHERE deleted_at IS NULL ORDER BY sort_order LIMIT 1`);
      // 採番の形式確認が目的なので、リードが必須でないパイプライン（仕入れ）を使う
      const dl = await ctx.val(
        `INSERT INTO deals (name, pipeline_type_id, deal_stage_id, deal_status_id, company_id, owner_user_id)
         VALUES ('IT34-ディール', $1, $2, $3, $4, $5)
         RETURNING deal_code`,
        [PIPELINE_TYPES.procurement, dealStage, dealStatus, r2.id, USERS.admin]
      );
      ctx.assertMatch(dl, /^DL-\d{6}$/, "deals のみ 3 文字接頭辞");

      const ctr = await ctx.val(`INSERT INTO contracts DEFAULT VALUES RETURNING contract_code`);
      ctx.assertMatch(ctr, /^CTR-\d{6}$/);

      const projStatus = await ctx.val(`SELECT id FROM project_statuses WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1`);
      const prj = await ctx.val(
        `INSERT INTO projects (name, project_status_id) VALUES ('IT34-プロジェクト', $1) RETURNING project_code`,
        [projStatus]
      );
      ctx.assertMatch(prj, /^PRJ-\d{6}$/);
    }
  );

  test("IT-35", "自動採番 — 論理削除は欠番にならない", async (ctx) => {
    const statusId = await ctx.val(
      `SELECT id FROM company_statuses WHERE code = 'unverified' AND deleted_at IS NULL`
    );
    const c1 = await ctx.one(
      `INSERT INTO companies (name, owner_user_id, company_status_id) VALUES ('IT35-欠番なし1', $1, $2) RETURNING id, company_code`,
      [USERS.admin, statusId]
    );
    await ctx.query(`UPDATE companies SET deleted_at = now() WHERE id = $1`, [c1.id]);
    const c2 = await ctx.one(
      `INSERT INTO companies (name, owner_user_id, company_status_id) VALUES ('IT35-欠番なし2', $1, $2) RETURNING company_code`,
      [USERS.admin, statusId]
    );
    ctx.assertTrue(
      Number(c2.company_code.slice(4)) === Number(c1.company_code.slice(4)) + 1,
      "論理削除行も MAX 計算に含まれ番号は再利用されない"
    );
  });

  // ------------------------------------------------------------
  // trg_contracts_ensure_account（IT-36 〜 IT-39）
  // ------------------------------------------------------------
  async function makeCompanyContactDeal(ctx, { companyName, contactLastName, contactFirstName, pipeline }) {
    const companyStatus = await ctx.val(
      `SELECT id FROM company_statuses WHERE code = 'unverified' AND deleted_at IS NULL`
    );
    const contactStatus = await ctx.val(
      `SELECT id FROM contact_statuses WHERE name = 'アクティブ' AND deleted_at IS NULL`
    );
    const dealStage = await ctx.val(`SELECT id FROM deal_stages WHERE deleted_at IS NULL ORDER BY sort_order LIMIT 1`);
    const dealStatus = await ctx.val(`SELECT id FROM deal_statuses WHERE deleted_at IS NULL ORDER BY sort_order LIMIT 1`);

    let compId = null;
    if (companyName) {
      compId = await ctx.val(
        `INSERT INTO companies (name, owner_user_id, company_status_id) VALUES ($1, $2, $3) RETURNING id`,
        [companyName, USERS.admin, companyStatus]
      );
    }
    const contId = await ctx.val(
      `INSERT INTO contacts (last_name, first_name, contact_type, company_id, contact_status_id, owner_user_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        contactLastName,
        contactFirstName ?? null,
        compId ? "employee" : "other",
        compId,
        contactStatus,
        USERS.admin,
      ]
    );

    // 20260808000005（T-0069）以降、pipeline_types.requires_lead な区分（営業）は
    // deals.lead_id が必須。元になるリードを先に用意する
    let leadId = null;
    if (pipeline === PIPELINE_TYPES.sales) {
      const leadStage = await ctx.val(`SELECT id FROM lead_stages WHERE deleted_at IS NULL ORDER BY sort_order LIMIT 1`);
      leadId = await ctx.val(
        `INSERT INTO leads (lead_name, stage_id, owner_user_id) VALUES ($1, $2, $3) RETURNING id`,
        [`${companyName ?? contactLastName}向けリード`, leadStage, USERS.manager]
      );
    }

    const dealId = await ctx.val(
      `INSERT INTO deals (name, pipeline_type_id, deal_stage_id, deal_status_id, company_id, contact_id, owner_user_id, lead_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [`${companyName ?? contactLastName}向けディール`, pipeline, dealStage, dealStatus, compId, contId, USERS.manager, leadId]
    );
    return { compId, contId, dealId, leadId };
  }

  test(
    "IT-36",
    "trg_contracts_ensure_account — 法人 Account の自動作成",
    async (ctx) => {
      const { compId, contId, dealId, leadId } = await makeCompanyContactDeal(ctx, {
        companyName: "IT36-昇格テスト株式会社",
        contactLastName: "昇格",
        pipeline: PIPELINE_TYPES.sales,
      });
      // makeCompanyContactDeal が営業パイプライン用に作ったリードが deals.lead_id 経由で
      // 元になったリードになっている（sync_lead_promoted_deal が promoted_deal_id を同期する）

      await ctx.setRole(USERS.manager);
      const contract = await ctx.one(
        `INSERT INTO contracts (deal_id, registered_by, created_by) VALUES ($1, $2, $2) RETURNING id, contract_code`,
        [dealId, USERS.manager]
      );
      ctx.assertMatch(contract.contract_code, /^CTR-\d{6}$/);
      await ctx.resetRole();

      const account = await ctx.one(
        `SELECT a.*, at.slug account_type_slug FROM accounts a
           JOIN account_types at ON at.id = a.account_type_id
          WHERE a.company_id = $1`,
        [compId]
      );
      ctx.assertEqual(account.name, "IT36-昇格テスト株式会社");
      ctx.assertEqual(account.account_type_slug, "corporate");
      ctx.assertEqual(account.owner_user_id, USERS.manager, "deal の owner をそのまま使う");
      ctx.assertMatch(account.account_code, /^ACC-\d{6}$/);

      const activeStatusCode = await ctx.val(`SELECT code FROM account_statuses WHERE id = $1`, [account.account_status_id]);
      ctx.assertEqual(activeStatusCode, "active");

      const acCount = await ctx.val(
        `SELECT count(*) FROM account_contacts WHERE account_id = $1 AND contact_id = $2 AND role = 'primary'`,
        [account.id, contId]
      );
      ctx.assertEqual(Number(acCount), 1);

      const dealAccountId = await ctx.val(`SELECT account_id FROM deals WHERE id = $1`, [dealId]);
      ctx.assertEqual(dealAccountId, account.id);

      const leadPromotedAccount = await ctx.val(`SELECT promoted_account_id FROM leads WHERE id = $1`, [leadId]);
      ctx.assertEqual(leadPromotedAccount, account.id);

      const roleCount = await ctx.val(
        `SELECT count(*) FROM account_roles ar
           JOIN account_role_types rt ON rt.id = ar.role_type_id
          WHERE ar.account_id = $1 AND rt.pipeline_type_id = $2 AND ar.assigned_by_contract = TRUE`,
        [account.id, PIPELINE_TYPES.sales]
      );
      ctx.assertEqual(Number(roleCount), 1);
    }
  );

  test("IT-37", "trg_contracts_ensure_account — 個人 Account（company なし）", async (ctx) => {
    const { dealId } = await makeCompanyContactDeal(ctx, {
      companyName: null,
      contactLastName: "個人",
      contactFirstName: "太郎",
      pipeline: PIPELINE_TYPES.sales,
    });

    await ctx.setRole(USERS.manager);
    await ctx.query(
      `INSERT INTO contracts (deal_id, registered_by, created_by) VALUES ($1, $2, $2)`,
      [dealId, USERS.manager]
    );
    await ctx.resetRole();

    const account = await ctx.one(
      `SELECT a.*, at.slug account_type_slug FROM accounts a
         JOIN account_types at ON at.id = a.account_type_id
        WHERE a.id = (SELECT account_id FROM deals WHERE id = $1)`,
      [dealId]
    );
    ctx.assertEqual(account.name, "個人 太郎");
    ctx.assertEqual(account.company_id, null);
    ctx.assertEqual(account.account_type_slug, "sole_proprietor");
  });

  test(
    "IT-38",
    "trg_contracts_ensure_account — 既に Account がある場合は重複作成しない",
    async (ctx) => {
      const companyStatus = await ctx.val(
        `SELECT id FROM company_statuses WHERE code = 'unverified' AND deleted_at IS NULL`
      );
      const accStatus = await ctx.val(
        `SELECT id FROM account_statuses WHERE code = 'active' AND deleted_at IS NULL`
      );
      const compId = await ctx.val(
        `INSERT INTO companies (name, owner_user_id, company_status_id) VALUES ('IT38-既存Account会社', $1, $2) RETURNING id`,
        [USERS.admin, companyStatus]
      );
      const accId = await ctx.val(
        `INSERT INTO accounts (name, company_id, account_status_id, owner_user_id) VALUES ('IT38-既存Account会社', $1, $2, $3) RETURNING id`,
        [compId, accStatus, USERS.manager]
      );
      const dealStage = await ctx.val(`SELECT id FROM deal_stages WHERE deleted_at IS NULL ORDER BY sort_order LIMIT 1`);
      const dealStatus = await ctx.val(`SELECT id FROM deal_statuses WHERE deleted_at IS NULL ORDER BY sort_order LIMIT 1`);
      // このケースは「重複作成されないこと」の確認が目的でリードとは無関係なため、
      // リード必須でないパイプライン（仕入れ）を使う
      const dealId = await ctx.val(
        `INSERT INTO deals (name, pipeline_type_id, deal_stage_id, deal_status_id, account_id, company_id, owner_user_id)
         VALUES ('IT38-ディール', $1, $2, $3, $4, $5, $6) RETURNING id`,
        [PIPELINE_TYPES.procurement, dealStage, dealStatus, accId, compId, USERS.manager]
      );

      const before = await ctx.val(`SELECT count(*) FROM accounts WHERE company_id = $1`, [compId]);

      await ctx.setRole(USERS.manager);
      await ctx.query(`INSERT INTO contracts (deal_id, registered_by, created_by) VALUES ($1, $2, $2)`, [dealId, USERS.manager]);
      await ctx.query(`INSERT INTO contracts (deal_id, registered_by, created_by) VALUES ($1, $2, $2)`, [dealId, USERS.manager]);
      await ctx.resetRole();

      const after = await ctx.val(`SELECT count(*) FROM accounts WHERE company_id = $1`, [compId]);
      ctx.assertEqual(Number(after), Number(before), "accounts は増えない");

      const roleCount = await ctx.val(
        `SELECT count(*) FROM account_roles ar JOIN account_role_types rt ON rt.id = ar.role_type_id
          WHERE ar.account_id = $1 AND rt.pipeline_type_id = $2`,
        [accId, PIPELINE_TYPES.procurement]
      );
      ctx.assertEqual(Number(roleCount), 1, "同区分は ON CONFLICT DO NOTHING で増えない");
    }
  );

  test(
    "IT-39",
    "trg_contracts_ensure_account — 別パイプラインの契約で区分が積み増される",
    async (ctx) => {
      const companyStatus = await ctx.val(
        `SELECT id FROM company_statuses WHERE code = 'unverified' AND deleted_at IS NULL`
      );
      const accStatus = await ctx.val(`SELECT id FROM account_statuses WHERE code = 'active' AND deleted_at IS NULL`);
      const compId = await ctx.val(
        `INSERT INTO companies (name, owner_user_id, company_status_id) VALUES ('IT39-複数区分会社', $1, $2) RETURNING id`,
        [USERS.admin, companyStatus]
      );
      const accId = await ctx.val(
        `INSERT INTO accounts (name, company_id, account_status_id, owner_user_id) VALUES ('IT39-複数区分会社', $1, $2, $3) RETURNING id`,
        [compId, accStatus, USERS.manager]
      );
      // 既に「顧客」を持っている状態を直接作る（トリガーを通さず前提を用意するだけ）
      const customerRoleType = await ctx.val(
        `SELECT id FROM account_role_types WHERE pipeline_type_id = $1 AND deleted_at IS NULL`,
        [PIPELINE_TYPES.sales]
      );
      await ctx.query(
        `INSERT INTO account_roles (account_id, role_type_id, assigned_by_contract, created_by) VALUES ($1, $2, TRUE, $3)`,
        [accId, customerRoleType, USERS.admin]
      );

      const dealStage = await ctx.val(`SELECT id FROM deal_stages WHERE deleted_at IS NULL ORDER BY sort_order LIMIT 1`);
      const dealStatus = await ctx.val(`SELECT id FROM deal_statuses WHERE deleted_at IS NULL ORDER BY sort_order LIMIT 1`);
      const dealId = await ctx.val(
        `INSERT INTO deals (name, pipeline_type_id, deal_stage_id, deal_status_id, account_id, company_id, owner_user_id)
         VALUES ('IT39-仕入れディール', $1, $2, $3, $4, $5, $6) RETURNING id`,
        [PIPELINE_TYPES.procurement, dealStage, dealStatus, accId, compId, USERS.manager]
      );

      await ctx.setRole(USERS.manager);
      await ctx.query(`INSERT INTO contracts (deal_id, registered_by, created_by) VALUES ($1, $2, $2)`, [dealId, USERS.manager]);
      await ctx.resetRole();

      const roles = await ctx.query(
        `SELECT rt.pipeline_type_id FROM account_roles ar JOIN account_role_types rt ON rt.id = ar.role_type_id
          WHERE ar.account_id = $1 ORDER BY rt.pipeline_type_id`,
        [accId]
      );
      ctx.assertEqual(roles.rows.length, 2, "顧客 + 仕入れ先の同時保持");
      const pipelineIds = roles.rows.map((r) => r.pipeline_type_id).sort();
      ctx.assertEqual(pipelineIds, [PIPELINE_TYPES.procurement, PIPELINE_TYPES.sales].sort());
    }
  );

  // ------------------------------------------------------------
  // log_entity_change（IT-40 〜 IT-43）
  // ------------------------------------------------------------
  test("IT-40", "log_entity_change — INSERT の記録（_row 全体 + changed_by）", async (ctx) => {
    const statusId = await ctx.val(
      `SELECT id FROM company_statuses WHERE code = 'unverified' AND deleted_at IS NULL`
    );
    await ctx.setRole(USERS.admin);
    const compId = await ctx.val(
      `INSERT INTO companies (name, owner_user_id, company_status_id) VALUES ('IT40-履歴テスト', $1, $2) RETURNING id`,
      [USERS.admin, statusId]
    );
    await ctx.resetRole();

    const log = await ctx.one(
      `SELECT * FROM entity_change_logs WHERE table_name = 'companies' AND record_id = $1 AND operation = 'INSERT'`,
      [compId]
    );
    ctx.assertTrue(log.changed_fields && "_row" in log.changed_fields, "行全体の JSON を持つ");
    ctx.assertEqual(log.changed_by, USERS.admin);
  });

  test(
    "IT-41",
    "log_entity_change — UPDATE は変化した列だけ・監査列除外・空打ちは記録なし",
    async (ctx) => {
      const statusId = await ctx.val(
        `SELECT id FROM company_statuses WHERE code = 'unverified' AND deleted_at IS NULL`
      );
      await ctx.setRole(USERS.admin);
      const compId = await ctx.val(
        `INSERT INTO companies (name, owner_user_id, company_status_id) VALUES ('IT41-履歴テスト', $1, $2) RETURNING id`,
        [USERS.admin, statusId]
      );

      await ctx.query(
        `UPDATE companies SET name = 'IT41-履歴テスト2', phone = '03-1111-2222' WHERE id = $1`,
        [compId]
      );
      const log = await ctx.one(
        `SELECT * FROM entity_change_logs WHERE table_name = 'companies' AND record_id = $1 AND operation = 'UPDATE'`,
        [compId]
      );
      const keys = Object.keys(log.changed_fields).filter((k) => !k.startsWith("_"));
      // sort_key は company_sort_key(name, name_kana) の STORED 生成列。
      // name の変更に追随して値が変わるため、素直な差分としてここに現れる
      ctx.assertEqual(keys.sort(), ["name", "phone", "sort_key"].sort());
      ctx.assertTrue(!("updated_at" in log.changed_fields));
      ctx.assertTrue(!("last_updated_by" in log.changed_fields));

      const before = await ctx.val(
        `SELECT count(*) FROM entity_change_logs WHERE table_name = 'companies' AND record_id = $1`,
        [compId]
      );
      await ctx.query(`UPDATE companies SET name = name WHERE id = $1`, [compId]);
      const after = await ctx.val(
        `SELECT count(*) FROM entity_change_logs WHERE table_name = 'companies' AND record_id = $1`,
        [compId]
      );
      ctx.assertEqual(Number(after), Number(before), "実質変更なしは記録されない");
      await ctx.resetRole();
    }
  );

  test(
    "IT-42",
    "log_entity_change — スコア派生値のみの UPDATE は記録されない（20260728000003）",
    async (ctx) => {
      const stageId = await ctx.val(`SELECT id FROM lead_stages WHERE deleted_at IS NULL ORDER BY sort_order LIMIT 1`);
      const leadId = await ctx.val(
        `INSERT INTO leads (lead_name, stage_id, owner_user_id) VALUES ('IT42-スコア専用', $1, $2) RETURNING id`,
        [stageId, USERS.admin]
      );

      const before = await ctx.val(
        `SELECT count(*) FROM entity_change_logs WHERE table_name = 'leads' AND record_id = $1`,
        [leadId]
      );
      await ctx.query(`SELECT recalculate_lead_score($1)`, [leadId]);
      const afterScore = await ctx.val(
        `SELECT count(*) FROM entity_change_logs WHERE table_name = 'leads' AND record_id = $1`,
        [leadId]
      );
      ctx.assertEqual(Number(afterScore), Number(before), "score/temperature_id/score_updated_at のみの変化は記録されない");

      await ctx.query(`UPDATE leads SET lead_name = 'IT42-スコア専用-改' WHERE id = $1`, [leadId]);
      const afterNormal = await ctx.val(
        `SELECT count(*) FROM entity_change_logs WHERE table_name = 'leads' AND record_id = $1`,
        [leadId]
      );
      ctx.assertTrue(Number(afterNormal) > Number(afterScore), "通常カラムの変更は記録される");
    }
  );

  test(
    "IT-43",
    "log_entity_change — DELETE の記録と changed_by NULL（セッションなし経路）",
    async (ctx) => {
      const statusId = await ctx.val(
        `SELECT id FROM company_statuses WHERE code = 'unverified' AND deleted_at IS NULL`
      );
      const compId = await ctx.val(
        `INSERT INTO companies (name, owner_user_id, company_status_id) VALUES ('IT43-削除テスト', $1, $2) RETURNING id`,
        [USERS.admin, statusId]
      );
      // postgres のまま（JWT なし）で DELETE
      await ctx.query(`DELETE FROM companies WHERE id = $1`, [compId]);

      const log = await ctx.one(
        `SELECT * FROM entity_change_logs WHERE table_name = 'companies' AND record_id = $1 AND operation = 'DELETE'`,
        [compId]
      );
      ctx.assertTrue("_row" in log.changed_fields);
      ctx.assertEqual(log.changed_by, null);
    }
  );

  test(
    "IT-44",
    "trg_leads_set_company_size — 手動入力を無視して自動判定",
    async (ctx) => {
      await ctx.query(`UPDATE lead_company_sizes SET deleted_at = now() WHERE deleted_at IS NULL`);
      const smallId = await ctx.val(
        `INSERT INTO lead_company_sizes (code, name, min_capital, max_capital, min_employees, max_employees, sort_order)
         VALUES ('it44_small', 'IT44-小', NULL, 9999999, NULL, 49, 1) RETURNING id`
      );
      const largeId = await ctx.val(
        `INSERT INTO lead_company_sizes (code, name, min_capital, max_capital, min_employees, max_employees, sort_order)
         VALUES ('it44_large', 'IT44-大', 10000000, NULL, 50, NULL, 2) RETURNING id`
      );
      const stageId = await ctx.val(`SELECT id FROM lead_stages WHERE deleted_at IS NULL ORDER BY sort_order LIMIT 1`);

      const insSize = await ctx.val(
        `INSERT INTO leads (lead_name, stage_id, capital, employee_count, owner_user_id)
         VALUES ('IT44-規模テスト', $1, 50000000, NULL, $2) RETURNING company_size_id`,
        [stageId, USERS.admin]
      );
      ctx.assertEqual(insSize, largeId, "INSERT 時に資本金から『大』と判定");

      const updSize = await ctx.val(
        `UPDATE leads SET capital = 1000000 WHERE lead_name = 'IT44-規模テスト' RETURNING company_size_id`
      );
      ctx.assertEqual(updSize, smallId, "capital 変更で『小』へ再判定");

      // 手動で『大』へ書き換えようとしても、company_size_id の変化自体が WHEN 句を満たし
      // resolve_lead_company_size(capital, employee_count) の結果へ強制的に上書きされる
      const manualOverride = await ctx.val(
        `UPDATE leads SET company_size_id = $1 WHERE lead_name = 'IT44-規模テスト' RETURNING company_size_id`,
        [largeId]
      );
      ctx.assertEqual(manualOverride, smallId, "手動指定は無視され、現在の capital から再計算された値になる");
    }
  );

  test(
    "IT-45",
    "promote_next_contact_email / phone — 主連絡先の繰り上げと一意保証",
    async (ctx) => {
      const contactStatus = await ctx.val(
        `SELECT id FROM contact_statuses WHERE name = 'アクティブ' AND deleted_at IS NULL`
      );
      const contId = await ctx.val(
        `INSERT INTO contacts (last_name, contact_type, contact_status_id, owner_user_id) VALUES ('IT45-主連絡', 'other', $1, $2) RETURNING id`,
        [contactStatus, USERS.admin]
      );
      await ctx.query(
        `INSERT INTO contact_emails (contact_id, email, is_primary, created_at) VALUES
           ($1, 'it45-first@x.jp', TRUE,  now() - interval '2 min'),
           ($1, 'it45-second@x.jp',FALSE, now() - interval '1 min')`,
        [contId]
      );

      await ctx.expectError(
        () =>
          ctx.query(`INSERT INTO contact_emails (contact_id, email, is_primary) VALUES ($1, 'it45-third@x.jp', TRUE)`, [
            contId,
          ]),
        /uq_contact_emails_primary|duplicate key/i,
        "主は同時に 2 つ持てない"
      );

      const secondId = await ctx.val(`SELECT id FROM contact_emails WHERE email = 'it45-second@x.jp'`);
      await ctx.query(`SELECT set_primary_contact_email($1, $2)`, [secondId, USERS.admin]);
      const primaries = await ctx.query(
        `SELECT email, is_primary FROM contact_emails WHERE contact_id = $1 ORDER BY email`,
        [contId]
      );
      const map = Object.fromEntries(primaries.rows.map((r) => [r.email, r.is_primary]));
      ctx.assertEqual(map["it45-first@x.jp"], false);
      ctx.assertEqual(map["it45-second@x.jp"], true);

      await ctx.query(`DELETE FROM contact_emails WHERE email = 'it45-second@x.jp'`);
      const promoted = await ctx.val(
        `SELECT is_primary FROM contact_emails WHERE contact_id = $1 AND email = 'it45-first@x.jp'`,
        [contId]
      );
      ctx.assertEqual(promoted, true, "created_at 最古が主に繰り上がる");

      // 電話でも同じ 3 手順が成立する
      await ctx.query(
        `INSERT INTO contact_phones (contact_id, phone, is_primary, created_at) VALUES
           ($1, '090-0000-0001', TRUE,  now() - interval '2 min'),
           ($1, '090-0000-0002', FALSE, now() - interval '1 min')`,
        [contId]
      );
      await ctx.expectError(
        () =>
          ctx.query(`INSERT INTO contact_phones (contact_id, phone, is_primary) VALUES ($1, '090-0000-0003', TRUE)`, [
            contId,
          ]),
        /uq_contact_phones_primary|duplicate key/i
      );
      const secondPhoneId = await ctx.val(`SELECT id FROM contact_phones WHERE phone = '090-0000-0002'`);
      await ctx.query(`SELECT set_primary_contact_phone($1, $2)`, [secondPhoneId, USERS.admin]);
      await ctx.query(`DELETE FROM contact_phones WHERE phone = '090-0000-0002'`);
      const promotedPhone = await ctx.val(
        `SELECT is_primary FROM contact_phones WHERE contact_id = $1 AND phone = '090-0000-0001'`,
        [contId]
      );
      ctx.assertEqual(promotedPhone, true);
    }
  );
}
