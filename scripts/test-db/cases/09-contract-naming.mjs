import { USERS, PIPELINE_TYPES } from "../lib/constants.mjs";

/**
 * docs/test-cases/02-integration-db.md
 * 「ディールと契約の紐づけ・契約名の自動生成（2026-08-08 追加）」
 * IT-CONTRACT-01 〜 08
 */
export function register(test) {
  test("IT-CONTRACT-01", "契約名の組み立て規則", async (ctx) => {
    const type2Id = await ctx.val(`SELECT id FROM contract_types WHERE name = 'サービス利用契約' AND deleted_at IS NULL`);

    const full = await ctx.val(
      `SELECT build_contract_display_name('2026-08-07'::date, 'サービス利用契約', $1, 1200000, 'CTR-000123')`,
      [type2Id]
    );
    ctx.assertEqual(full, "20260807_サービス利用契約_サービス利用契約_1200000_CTR-000123");

    const nameOnly = await ctx.val(
      `SELECT build_contract_display_name(NULL, '秘密保持契約書', NULL, NULL, 'CTR-000124')`
    );
    ctx.assertEqual(nameOnly, "秘密保持契約書_CTR-000124", "__ が並ばない");

    const allMissing = await ctx.val(`SELECT build_contract_display_name(NULL, NULL, NULL, NULL, 'CTR-000125')`);
    ctx.assertEqual(allMissing, "CTR-000125", "契約コードは必ず入るので空にならない");

    const underscore = await ctx.val(
      `SELECT build_contract_display_name(NULL, 'A_B_C', NULL, NULL, 'CTR-000126')`
    );
    ctx.assertEqual(underscore, "A-B-C_CTR-000126", "部品内の _ は - に置換される");
  });

  test(
    "IT-CONTRACT-02",
    "採番より後に組み立てる（トリガー名の昇順依存）",
    async (ctx) => {
      const row = await ctx.one(`INSERT INTO contracts DEFAULT VALUES RETURNING contract_code, contract_display_name`);
      ctx.assertTrue(
        row.contract_display_name.endsWith(row.contract_code),
        "契約名の末尾に採番されたばかりの契約コードが入っている"
      );
    }
  );

  test("IT-CONTRACT-03", "材料を直すと契約名が追随する", async (ctx) => {
    const typeId = await ctx.val(`SELECT id FROM contract_types WHERE name = '売買契約' AND deleted_at IS NULL`);
    const contract = await ctx.one(
      `INSERT INTO contracts DEFAULT VALUES RETURNING id, contract_display_name, contract_code`
    );
    ctx.assertEqual(contract.contract_display_name, contract.contract_code);

    const updated = await ctx.val(
      `UPDATE contracts SET amount = 500000, contract_type_id = $1, contract_name = 'IT-CONTRACT-03書名'
        WHERE id = $2 RETURNING contract_display_name`,
      [typeId, contract.id]
    );
    ctx.assertTrue(updated.includes("IT-CONTRACT-03書名"));
    ctx.assertTrue(updated.includes("売買契約"));
    ctx.assertTrue(updated.includes("500000"));
    ctx.assertTrue(updated.endsWith(contract.contract_code));
  });

  test(
    "IT-CONTRACT-04",
    "契約種別マスタの改名に追随する（変更履歴は増えない）",
    async (ctx) => {
      const typeId = await ctx.val(
        `INSERT INTO contract_types (name) VALUES ('IT-CONTRACT-04種別') RETURNING id`
      );
      const contract = await ctx.one(
        `INSERT INTO contracts (contract_type_id) VALUES ($1) RETURNING id, contract_display_name`,
        [typeId]
      );
      ctx.assertTrue(contract.contract_display_name.includes("IT-CONTRACT-04種別"));

      const before = await ctx.val(
        `SELECT count(*) FROM entity_change_logs WHERE table_name = 'contracts' AND record_id = $1`,
        [contract.id]
      );
      await ctx.query(`UPDATE contract_types SET name = 'IT-CONTRACT-04種別改' WHERE id = $1`, [typeId]);
      const after = await ctx.val(
        `SELECT count(*) FROM entity_change_logs WHERE table_name = 'contracts' AND record_id = $1`,
        [contract.id]
      );
      ctx.assertEqual(Number(after), Number(before), "契約名の再構築だけでは変更履歴が増えない");

      const displayName = await ctx.val(`SELECT contract_display_name FROM contracts WHERE id = $1`, [contract.id]);
      ctx.assertTrue(displayName.includes("IT-CONTRACT-04種別改"), "旧名は残らず新しい種別名に追随する");
    }
  );

  test(
    "IT-CONTRACT-05",
    "契約名は変更履歴の差分に出ない（金額だけ変えても amount と _name のみ）",
    async (ctx) => {
      const contract = await ctx.one(`INSERT INTO contracts (amount) VALUES (100) RETURNING id`);
      await ctx.query(`UPDATE contracts SET amount = 200 WHERE id = $1`, [contract.id]);
      const log = await ctx.one(
        `SELECT changed_fields FROM entity_change_logs
          WHERE table_name = 'contracts' AND record_id = $1 AND operation = 'UPDATE'
          ORDER BY changed_at DESC LIMIT 1`,
        [contract.id]
      );
      const keys = Object.keys(log.changed_fields).sort();
      ctx.assertEqual(keys, ["_name", "amount"].sort());
      ctx.assertTrue(!("contract_display_name" in log.changed_fields));
    }
  );

  test("IT-CONTRACT-06", "ディールに紐づかない契約を作れる", async (ctx) => {
    const row = await ctx.one(`INSERT INTO contracts (contract_name) VALUES ('IT-CONTRACT-06') RETURNING deal_id`);
    ctx.assertEqual(row.deal_id, null);
  });

  test(
    "IT-CONTRACT-07",
    "後から紐づけると取引先が作られる（AFTER UPDATE OF deal_id）",
    async (ctx) => {
      const companyStatus = await ctx.val(
        `SELECT id FROM company_statuses WHERE code = 'unverified' AND deleted_at IS NULL`
      );
      const compId = await ctx.val(
        `INSERT INTO companies (name, owner_user_id, company_status_id) VALUES ('IT-CONTRACT-07会社', $1, $2) RETURNING id`,
        [USERS.admin, companyStatus]
      );
      const dealStage = await ctx.val(`SELECT id FROM deal_stages WHERE deleted_at IS NULL ORDER BY sort_order LIMIT 1`);
      const dealStatus = await ctx.val(`SELECT id FROM deal_statuses WHERE deleted_at IS NULL ORDER BY sort_order LIMIT 1`);
      // 取引先の自動作成トリガーの確認が目的でリードとは無関係なため、
      // リード必須でないパイプライン（仕入れ）を使う
      const dealId = await ctx.val(
        `INSERT INTO deals (name, pipeline_type_id, deal_stage_id, deal_status_id, company_id, owner_user_id)
         VALUES ('IT-CONTRACT-07ディール', $1, $2, $3, $4, $5) RETURNING id`,
        [PIPELINE_TYPES.procurement, dealStage, dealStatus, compId, USERS.admin]
      );
      const contractId = await ctx.val(
        `INSERT INTO contracts (contract_name) VALUES ('IT-CONTRACT-07未紐づけ') RETURNING id`
      );

      const before = await ctx.val(`SELECT account_id FROM deals WHERE id = $1`, [dealId]);
      ctx.assertEqual(before, null);

      await ctx.setRole(USERS.manager);
      await ctx.query(`UPDATE contracts SET deal_id = $1 WHERE id = $2`, [dealId, contractId]);
      await ctx.resetRole();

      const after = await ctx.val(`SELECT account_id FROM deals WHERE id = $1`, [dealId]);
      ctx.assertTrue(after !== null, "紐づけ後に取引先が自動作成される");
    }
  );

  test(
    "IT-CONTRACT-08",
    "紐づけ解除でもリードのステージ要件を守る",
    async (ctx) => {
      const companyStatus = await ctx.val(
        `SELECT id FROM company_statuses WHERE code = 'unverified' AND deleted_at IS NULL`
      );
      const compId = await ctx.val(
        `INSERT INTO companies (name, owner_user_id, company_status_id) VALUES ('IT-CONTRACT-08会社', $1, $2) RETURNING id`,
        [USERS.admin, companyStatus]
      );
      const dealStage = await ctx.val(`SELECT id FROM deal_stages WHERE deleted_at IS NULL ORDER BY sort_order LIMIT 1`);
      const dealStatus = await ctx.val(`SELECT id FROM deal_statuses WHERE deleted_at IS NULL ORDER BY sort_order LIMIT 1`);
      const genStage = await ctx.val(`SELECT id FROM lead_stages WHERE slug = 'generation'`);
      const leadId = await ctx.val(
        `INSERT INTO leads (lead_name, stage_id, owner_user_id) VALUES ('IT-CONTRACT-08リード', $1, $2) RETURNING id`,
        [genStage, USERS.admin]
      );
      // deals.lead_id が「取引先」ステージの判定対象になる（requires_deal は deals.lead_id 経由）。
      // このケースの主題はリードではないためパイプラインは仕入れで足りる
      const dealId = await ctx.val(
        `INSERT INTO deals (name, pipeline_type_id, deal_stage_id, deal_status_id, company_id, owner_user_id, lead_id)
         VALUES ('IT-CONTRACT-08ディール', $1, $2, $3, $4, $5, $6) RETURNING id`,
        [PIPELINE_TYPES.procurement, dealStage, dealStatus, compId, USERS.admin, leadId]
      );
      const contractId = await ctx.val(
        `INSERT INTO contracts (deal_id, registered_by, created_by) VALUES ($1, $2, $2) RETURNING id`,
        [dealId, USERS.admin]
      );

      const customerStage = await ctx.val(`SELECT id FROM lead_stages WHERE slug = 'customer'`);
      await ctx.query(`UPDATE leads SET stage_id = $1 WHERE id = $2`, [customerStage, leadId]);

      await ctx.expectError(
        () => ctx.query(`UPDATE contracts SET deal_id = NULL WHERE id = $1`, [contractId]),
        /先にリードのステージを下げてから紐づけを解除してください/
      );
    }
  );
}
