import { USERS, PIPELINE_TYPES } from "../lib/constants.mjs";

/**
 * docs/test-cases/02-integration-db.md「リード系マスタの整合（2026-08-05 追加）」
 * IT-MASTER-01 〜 06（07 は grep ベースの静的検査で別ジャンルのため未移植）
 */
export function register(test) {
  test(
    "IT-MASTER-01",
    "カテゴリ判定がスラッグに依存しない",
    async (ctx) => {
      const randomSlug = () => `rnd_${Math.random().toString(36).slice(2, 10)}`;

      // SQL: requires_deal なステージ（sales）のスラッグをランダム化しても SQL のまま
      const salesStage = await ctx.val(`SELECT id FROM lead_stages WHERE slug = 'sales'`);
      await ctx.query(`UPDATE lead_stages SET slug = $1 WHERE id = $2`, [randomSlug(), salesStage]);
      const sqlCategory = await ctx.val(`SELECT resolve_lead_category(NULL, $1)`, [salesStage]);
      const sqlIsSalesQualified = await ctx.val(
        `SELECT is_sales_qualified FROM lead_categories WHERE id = $1`,
        [sqlCategory]
      );
      ctx.assertEqual(sqlIsSalesQualified, true, "商談を伴うステージは SQL に落ちる（スラッグ無関係）");

      // TQL: is_qualification なステージ
      const qualStage = await ctx.val(`SELECT id FROM lead_stages WHERE slug = 'qualification'`);
      await ctx.query(`UPDATE lead_stages SET slug = $1 WHERE id = $2`, [randomSlug(), qualStage]);
      const tqlCategory = await ctx.val(`SELECT resolve_lead_category(NULL, $1)`, [qualStage]);
      const tqlView = await ctx.val(`SELECT progress_view FROM lead_categories WHERE id = $1`, [tqlCategory]);
      ctx.assertEqual(tqlView, "outbound", "選定段階は TQL");

      // Inquiry: is_inbound_inquiry な流入元 + どちらの旗も立たないステージ
      const neutralStage = await ctx.val(`SELECT id FROM lead_stages WHERE slug = 'nurturing'`);
      const inboundSource = await ctx.val(`SELECT id FROM lead_sources WHERE slug = 'web_form'`);
      await ctx.query(`UPDATE lead_sources SET slug = $1 WHERE id = $2`, [randomSlug(), inboundSource]);
      const inquiryCategory = await ctx.val(`SELECT resolve_lead_category($1, $2)`, [inboundSource, neutralStage]);
      const inquiryView = await ctx.val(`SELECT progress_view FROM lead_categories WHERE id = $1`, [inquiryCategory]);
      ctx.assertEqual(inquiryView, "inquiry", "相手からの流入は Inquiry");

      // MQL: どちらの旗も立たない
      const otherSource = await ctx.val(`SELECT id FROM lead_sources WHERE slug = 'referral'`);
      const mqlCategory = await ctx.val(`SELECT resolve_lead_category($1, $2)`, [otherSource, neutralStage]);
      const mqlView = await ctx.val(`SELECT progress_view FROM lead_categories WHERE id = $1`, [mqlCategory]);
      ctx.assertEqual(mqlView, "inbound", "それ以外は MQL");
    }
  );

  test("IT-MASTER-02", "システム必須行を削除できない・必須でない行は削除できる", async (ctx) => {
    const category = await ctx.one(
      `SELECT id, name FROM lead_categories WHERE is_system_required AND deleted_at IS NULL LIMIT 1`
    );
    await ctx.expectError(
      () => ctx.query(`UPDATE lead_categories SET deleted_at = now() WHERE id = $1`, [category.id]),
      /この行はシステムが使うため削除できません/
    );

    const salesStage = await ctx.one(
      `SELECT id, name FROM lead_stages WHERE slug = 'sales' AND is_system_required`
    );
    await ctx.expectError(
      () => ctx.query(`UPDATE lead_stages SET deleted_at = now() WHERE id = $1`, [salesStage.id]),
      /この行はシステムが使うため削除できません/
    );

    const corporateType = await ctx.val(
      `SELECT id FROM account_types WHERE is_company_default AND deleted_at IS NULL`
    );
    await ctx.expectError(
      () => ctx.query(`UPDATE account_types SET deleted_at = now() WHERE id = $1`, [corporateType]),
      /この行はシステムが使うため削除できません/
    );

    const defaultPipeline = await ctx.val(`SELECT id FROM pipeline_types WHERE is_default AND deleted_at IS NULL`);
    await ctx.expectError(
      () => ctx.query(`UPDATE pipeline_types SET deleted_at = now() WHERE id = $1`, [defaultPipeline]),
      /この行はシステムが使うため削除できません/
    );

    // 必須でない行（育成ステージ・仕入れパイプライン）は削除できる
    const nurturingStage = await ctx.val(
      `SELECT id FROM lead_stages WHERE slug = 'nurturing' AND NOT is_system_required`
    );
    const rowCount = await ctx.rowCount(`UPDATE lead_stages SET deleted_at = now() WHERE id = $1`, [
      nurturingStage,
    ]);
    ctx.assertEqual(rowCount, 1, "必須でない行は普通に削除できる");
  });

  test("IT-MASTER-03", "使用中のステータスを削除できない（件数を文言に含める）", async (ctx) => {
    const status = await ctx.one(
      `SELECT ls.id, ls.name, count(l.id)::int AS n
         FROM lead_statuses ls JOIN leads l ON l.status_id = ls.id AND l.deleted_at IS NULL
        WHERE ls.deleted_at IS NULL
        GROUP BY ls.id, ls.name
        ORDER BY n DESC LIMIT 1`
    );
    ctx.assertTrue(status.n > 0, "前提: 使用中のステータスが存在すること");
    const err = await ctx.expectError(
      () => ctx.query(`UPDATE lead_statuses SET deleted_at = now() WHERE id = $1`, [status.id]),
      new RegExp(`このステータス（${status.name}）は ${status.n} 件のリードが使っています`)
    );
    ctx.assertTrue(err !== undefined);
  });

  test("IT-MASTER-04", "「既定」は 2 行にできない（部分 UNIQUE 違反）", async (ctx) => {
    const otherSource = await ctx.val(`SELECT id FROM lead_sources WHERE slug = 'eight'`);
    await ctx.expectError(
      () => ctx.query(`UPDATE lead_sources SET is_inquiry_default = TRUE WHERE id = $1`, [otherSource]),
      /duplicate key|already exists|uq_lead_sources_inquiry_default/i
    );

    const government = await ctx.val(`SELECT id FROM account_types WHERE slug = 'government'`);
    await ctx.expectError(
      () => ctx.query(`UPDATE account_types SET is_company_default = TRUE WHERE id = $1`, [government]),
      /duplicate key|already exists|uq_account_types_company_default/i
    );
  });

  test(
    "IT-MASTER-05",
    "マスタを改名しても自動判定が壊れない（resolve_account_status は code で引く）",
    async (ctx) => {
      const companyStatus = await ctx.val(
        `SELECT id FROM company_statuses WHERE code = 'unverified' AND deleted_at IS NULL`
      );
      const accStatus = await ctx.val(`SELECT id FROM account_statuses WHERE code = 'prospect' AND deleted_at IS NULL`);
      const compId = await ctx.val(
        `INSERT INTO companies (name, owner_user_id, company_status_id) VALUES ('IT45-改名テスト', $1, $2) RETURNING id`,
        [USERS.admin, companyStatus]
      );
      const accId = await ctx.val(
        `INSERT INTO accounts (name, company_id, account_status_id, owner_user_id) VALUES ('IT45-改名テスト', $1, $2, $3) RETURNING id`,
        [compId, accStatus, USERS.admin]
      );
      const dealStage = await ctx.val(`SELECT id FROM deal_stages WHERE deleted_at IS NULL ORDER BY sort_order LIMIT 1`);
      const dealStatus = await ctx.val(`SELECT id FROM deal_statuses WHERE deleted_at IS NULL ORDER BY sort_order LIMIT 1`);
      // 判定はステータスの実態だけを見るためパイプラインは何でもよい。
      // リード必須でない区分（仕入れ）を使ってリードの用意を省く
      const dealId = await ctx.val(
        `INSERT INTO deals (name, pipeline_type_id, deal_stage_id, deal_status_id, account_id, company_id, owner_user_id)
         VALUES ('IT45-改名ディール', $1, $2, $3, $4, $5, $6) RETURNING id`,
        [PIPELINE_TYPES.procurement, dealStage, dealStatus, accId, compId, USERS.admin]
      );
      await ctx.query(
        `INSERT INTO contracts (deal_id, start_date, registered_by, created_by) VALUES ($1, CURRENT_DATE - 1, $2, $2)`,
        [dealId, USERS.admin]
      );

      // 「アクティブ」を改名 — 判定は code='active' を見ているので影響しないはず
      await ctx.query(`UPDATE account_statuses SET name = 'IT45-改名アクティブ' WHERE code = 'active'`);

      const resolved = await ctx.val(`SELECT resolve_account_status($1)`, [accId]);
      const resolvedCode = await ctx.val(`SELECT code FROM account_statuses WHERE id = $1`, [resolved]);
      ctx.assertEqual(resolvedCode, "active", "改名後も期間内契約があれば正しく active と判定される");

      const accountNow = await ctx.val(`SELECT account_status_id FROM accounts WHERE id = $1`, [accId]);
      ctx.assertEqual(accountNow, resolved);
    }
  );

  test(
    "IT-MASTER-06",
    "削除済みのマスタを新たに参照できない",
    async (ctx) => {
      const newStatus = await ctx.val(
        `INSERT INTO company_statuses (name, code) VALUES ('IT46-使い捨てステータス', 'it46_throwaway') RETURNING id`
      );
      await ctx.query(`UPDATE company_statuses SET deleted_at = now() WHERE id = $1`, [newStatus]);

      await ctx.expectError(
        () =>
          ctx.query(
            `INSERT INTO companies (name, owner_user_id, company_status_id) VALUES ('IT46-事業者', $1, $2)`,
            [USERS.admin, newStatus]
          ),
        /削除済みの事業者ステータスを指定しています/
      );
    }
  );
}
