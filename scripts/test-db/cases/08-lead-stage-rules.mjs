import { USERS, PIPELINE_TYPES } from "../lib/constants.mjs";

/**
 * docs/test-cases/02-integration-db.md IT-LEADSTAGE-01
 * ステージが要求する実体を欠く遷移を拒否する（20260805000002）
 */
export function register(test) {
  test(
    "IT-LEADSTAGE-01",
    "ステージが要求する実体を欠く遷移を拒否する",
    async (ctx) => {
      const stages = await ctx.query(
        `SELECT slug, id, requires_deal, requires_contract, name FROM lead_stages WHERE deleted_at IS NULL`
      );
      const byslug = Object.fromEntries(stages.rows.map((r) => [r.slug, r]));
      ctx.assertEqual(byslug.sales.requires_deal, true);
      ctx.assertEqual(byslug.opportunity.requires_deal, true);
      ctx.assertEqual(byslug.customer.requires_deal, true);
      ctx.assertEqual(byslug.customer.requires_contract, true);
      ctx.assertEqual(byslug.customer.name, "取引先");

      const genStage = byslug.generation.id;
      const leadId = await ctx.val(
        `INSERT INTO leads (lead_name, stage_id, owner_user_id) VALUES ('IT-LEADSTAGE-対象', $1, $2) RETURNING id`,
        [genStage, USERS.admin]
      );

      // 2. ディールなしで「ディール」へ → 拒否
      await ctx.expectError(
        () => ctx.query(`UPDATE leads SET stage_id = $1 WHERE id = $2`, [byslug.sales.id, leadId]),
        /「ディール」へ進めるにはディールが必要です/
      );

      // 3. ディールなしで「取引先」へ（オポチュニティを飛ばした直行）→ 拒否
      await ctx.expectError(
        () => ctx.query(`UPDATE leads SET stage_id = $1 WHERE id = $2`, [byslug.customer.id, leadId]),
        /「取引先」へ進めるにはディールが必要です/
      );

      // ディールを用意する（20260808000005 以降、判定は deals.lead_id 経由）。
      // 営業パイプラインは lead_id が必須なので、このリードを元に作る
      const dealStage = await ctx.val(`SELECT id FROM deal_stages WHERE deleted_at IS NULL ORDER BY sort_order LIMIT 1`);
      const dealStatusRow = await ctx.one(
        `SELECT id, name FROM deal_statuses WHERE deleted_at IS NULL ORDER BY sort_order LIMIT 1`
      );
      const companyStatus = await ctx.val(
        `SELECT id FROM company_statuses WHERE code = 'unverified' AND deleted_at IS NULL`
      );
      const compId = await ctx.val(
        `INSERT INTO companies (name, owner_user_id, company_status_id) VALUES ('IT-LEADSTAGE-会社', $1, $2) RETURNING id`,
        [USERS.admin, companyStatus]
      );
      const dealId = await ctx.val(
        `INSERT INTO deals (name, pipeline_type_id, deal_stage_id, deal_status_id, company_id, owner_user_id, lead_id)
         VALUES ('IT-LEADSTAGE-ディール', $1, $2, $3, $4, $5, $6) RETURNING id`,
        [PIPELINE_TYPES.sales, dealStage, dealStatusRow.id, compId, USERS.admin, leadId]
      );
      // leads.promoted_deal_id は派生値。deals.lead_id を張った時点で
      // sync_lead_promoted_deal（AFTER INSERT）が自動的に同期する
      const syncedPromotedDeal = await ctx.val(`SELECT promoted_deal_id FROM leads WHERE id = $1`, [leadId]);
      ctx.assertEqual(syncedPromotedDeal, dealId);

      // 4. ディールありで「ディール」へ → 通る。リードのステータス（商談化）が消えないこと
      //    auto_promote_to_deal の旧実装が status を NULL にしていた名残が無いかの確認
      const negotiationStatus = await ctx.val(
        `SELECT id FROM lead_statuses WHERE code = 'negotiation' AND deleted_at IS NULL`
      );
      await ctx.query(`UPDATE leads SET status_id = $1 WHERE id = $2`, [negotiationStatus, leadId]);
      await ctx.query(`UPDATE leads SET stage_id = $1 WHERE id = $2`, [byslug.sales.id, leadId]);
      const statusAfter = await ctx.val(`SELECT status_id FROM leads WHERE id = $1`, [leadId]);
      ctx.assertEqual(statusAfter, negotiationStatus, "ステージ遷移でリードのステータスが勝手に消えない");

      // 5. 契約なしで「取引先」へ → 拒否
      await ctx.expectError(
        () => ctx.query(`UPDATE leads SET stage_id = $1 WHERE id = $2`, [byslug.customer.id, leadId]),
        /「取引先」へ進めるには契約が必要です/
      );

      // 6. 契約を作ってから「取引先」へ → 通る
      const contractId = await ctx.val(
        `INSERT INTO contracts (deal_id, registered_by, created_by) VALUES ($1, $2, $2) RETURNING id`,
        [dealId, USERS.admin]
      );
      await ctx.query(`UPDATE leads SET stage_id = $1 WHERE id = $2`, [byslug.customer.id, leadId]);
      const finalStage = await ctx.val(`SELECT stage_id FROM leads WHERE id = $1`, [leadId]);
      ctx.assertEqual(finalStage, byslug.customer.id);

      // 7. 逆向き: 参照中の商談・唯一の契約の論理削除は拒否される
      await ctx.expectError(
        () => ctx.query(`UPDATE contracts SET deleted_at = now() WHERE id = $1`, [contractId]),
        /先にリードのステージを下げてから削除してください/
      );
      await ctx.expectError(
        () => ctx.query(`UPDATE deals SET deleted_at = now() WHERE id = $1`, [dealId]),
        /先にリードのステージを下げてから削除してください/
      );

      // 8. ステージを下げてからなら削除できる
      await ctx.query(`UPDATE leads SET stage_id = $1 WHERE id = $2`, [genStage, leadId]);
      const rc = await ctx.rowCount(`UPDATE contracts SET deleted_at = now() WHERE id = $1`, [contractId]);
      ctx.assertEqual(rc, 1);

      // 検出ビュー v_lead_stage_violations の存在確認（security_invoker）
      const viewOpts = await ctx.val(
        `SELECT reloptions FROM pg_class WHERE relname = 'v_lead_stage_violations'`
      );
      ctx.assertTrue((viewOpts || []).includes("security_invoker=true"));
    }
  );
}
