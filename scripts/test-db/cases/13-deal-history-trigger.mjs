/**
 * docs/test-cases/02-integration-db.md
 * 「ディールのステージ・ステータス履歴はトリガーが記録する」IT-DEALHIST-01 〜 04。
 *
 * 対象は `trg_deals_stage_status_history` / `log_deal_stage_status_change()`
 * （マイグレーション 20260814100002、T-0095）。
 *
 * 直す前はアプリが deals を UPDATE したあと履歴を別文で INSERT していた。
 * supabase-js は複数文を単一トランザクションにできないので、**履歴の INSERT
 * だけ失敗すると更新は残って履歴が欠ける**。ステージの滞留日数はこの 2 表が
 * 正本なので、集計が実態とずれる。同じ書き込みが更新とカンバンの 2 箇所に
 * あり、片方だけ直す事故も起きやすかった。
 */
export function register(test) {
  /** seed の先頭のディール。ケースは ROLLBACK されるので汚れない */
  const anyDeal = (ctx) =>
    ctx.one(
      `SELECT id, pipeline_type_id, deal_stage_id, deal_status_id, last_updated_by
         FROM deals WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1`
    );

  /** 同じパイプラインの別ステージ */
  const otherStage = (ctx, deal) =>
    ctx.val(
      `SELECT id FROM deal_stages
        WHERE pipeline_type_id = $1 AND id <> $2 AND deleted_at IS NULL
        ORDER BY sort_order LIMIT 1`,
      [deal.pipeline_type_id, deal.deal_stage_id]
    );

  /** そのステージに属する別ステータス */
  const otherStatus = (ctx, deal) =>
    ctx.val(
      `SELECT id FROM deal_statuses
        WHERE deal_stage_id = $1 AND id IS DISTINCT FROM $2 AND deleted_at IS NULL
        ORDER BY sort_order LIMIT 1`,
      [deal.deal_stage_id, deal.deal_status_id]
    );

  const anyUser = (ctx) => ctx.val(`SELECT id FROM crm_users ORDER BY created_at LIMIT 1`);

  test(
    "IT-DEALHIST-01",
    "ステージを変えると deal_stage_histories に 1 行だけ増える",
    async (ctx) => {
      const deal = await anyDeal(ctx);
      const toStage = await otherStage(ctx, deal);
      const actor = await anyUser(ctx);

      const before = Number(
        await ctx.val(`SELECT count(*) FROM deal_stage_histories WHERE deal_id = $1`, [deal.id])
      );

      await ctx.query(
        `UPDATE deals SET deal_stage_id = $1, last_updated_by = $2 WHERE id = $3`,
        [toStage, actor, deal.id]
      );

      const after = Number(
        await ctx.val(`SELECT count(*) FROM deal_stage_histories WHERE deal_id = $1`, [deal.id])
      );
      // **2 行増えたらアプリ側の INSERT が残っている**（二重記録）
      ctx.assertEqual(after - before, 1, "履歴がちょうど 1 行増える");

      const row = await ctx.one(
        `SELECT from_stage_id, to_stage_id, changed_by FROM deal_stage_histories
          WHERE deal_id = $1 ORDER BY changed_at DESC LIMIT 1`,
        [deal.id]
      );
      ctx.assertEqual(row.from_stage_id, deal.deal_stage_id, "遷移前のステージが入る");
      ctx.assertEqual(row.to_stage_id, toStage, "遷移後のステージが入る");
      ctx.assertEqual(row.changed_by, actor, "実行者が入る");
    }
  );

  test(
    "IT-DEALHIST-02",
    "ステータスだけ変えたときは deal_status_histories に入り、stage_id は更新後のステージ",
    async (ctx) => {
      const deal = await anyDeal(ctx);
      const toStatus = await otherStatus(ctx, deal);
      // 同じステージに別ステータスが無い seed では確かめようがないので抜ける
      if (!toStatus) return;
      const actor = await anyUser(ctx);

      const before = Number(
        await ctx.val(`SELECT count(*) FROM deal_status_histories WHERE deal_id = $1`, [deal.id])
      );

      await ctx.query(
        `UPDATE deals SET deal_status_id = $1, last_updated_by = $2 WHERE id = $3`,
        [toStatus, actor, deal.id]
      );

      const row = await ctx.one(
        `SELECT stage_id, from_status_id, to_status_id, changed_by FROM deal_status_histories
          WHERE deal_id = $1 ORDER BY changed_at DESC LIMIT 1`,
        [deal.id]
      );
      const after = Number(
        await ctx.val(`SELECT count(*) FROM deal_status_histories WHERE deal_id = $1`, [deal.id])
      );

      ctx.assertEqual(after - before, 1, "履歴がちょうど 1 行増える");
      ctx.assertEqual(row.stage_id, deal.deal_stage_id, "stage_id は NOT NULL。更新後のステージが入る");
      ctx.assertEqual(row.to_status_id, toStatus, "遷移後のステータスが入る");
      ctx.assertEqual(row.changed_by, actor, "実行者が入る");
    }
  );

  test(
    "IT-DEALHIST-03",
    "ステージもステータスも変わらない更新では履歴が増えない",
    async (ctx) => {
      const deal = await anyDeal(ctx);
      const actor = await anyUser(ctx);

      const before = Number(
        await ctx.val(
          `SELECT (SELECT count(*) FROM deal_stage_histories WHERE deal_id = $1)
                + (SELECT count(*) FROM deal_status_histories WHERE deal_id = $1)`,
          [deal.id]
        )
      );

      await ctx.query(`UPDATE deals SET name = name || '（検証）', last_updated_by = $1 WHERE id = $2`, [
        actor,
        deal.id,
      ]);

      const after = Number(
        await ctx.val(
          `SELECT (SELECT count(*) FROM deal_stage_histories WHERE deal_id = $1)
                + (SELECT count(*) FROM deal_status_histories WHERE deal_id = $1)`,
          [deal.id]
        )
      );
      ctx.assertEqual(after, before, "関係ない列の更新で履歴を増やさない");
    }
  );

  test(
    "IT-DEALHIST-04",
    "実行者が分からない更新では履歴を書かない（作成者で代用しない）",
    async (ctx) => {
      const deal = await anyDeal(ctx);
      const toStage = await otherStage(ctx, deal);

      const before = Number(
        await ctx.val(`SELECT count(*) FROM deal_stage_histories WHERE deal_id = $1`, [deal.id])
      );

      // auth.uid() は NULL、last_updated_by も明示しない
      await ctx.query(`UPDATE deals SET deal_stage_id = $1, last_updated_by = NULL WHERE id = $2`, [
        toStage,
        deal.id,
      ]);

      const after = Number(
        await ctx.val(`SELECT count(*) FROM deal_stage_histories WHERE deal_id = $1`, [deal.id])
      );
      /*
       * `deals.created_by` は NOT NULL なので必ず値がある。**そこへ落とさないこと**が要点。
       * 作った人と直した人は別で、「誰が動かしたか」を作成者の名前で埋めると履歴が嘘になる。
       * 誰がやったか分からない行を残すより、書かない方がよい
       */
      ctx.assertEqual(after, before, "実行者不明なら履歴を残さず、更新自体は通す");
    }
  );

  test(
    "IT-DEALHIST-05",
    "ディールを作ると初回履歴が 1 組だけ入る（DB 関数と二重にならない）",
    async (ctx) => {
      const actor = await ctx.val(`SELECT id FROM crm_users ORDER BY created_at LIMIT 1`);
      const base = await anyDeal(ctx);
      const lead = await ctx.val(
        `SELECT id FROM leads WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1`
      );

      // 相手先は account / company / contact のいずれか 1 つが必須（deals_counterparty_check）
      const company = await ctx.val(
        `SELECT id FROM companies WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1`
      );

      const newId = await ctx.val(
        `INSERT INTO deals (name, pipeline_type_id, deal_stage_id, deal_status_id,
                            owner_user_id, created_by, last_updated_by, lead_id, company_id)
         VALUES ('検証-履歴', $1, $2, $3, $4, $4, $4, $5, $6)
         RETURNING id`,
        [base.pipeline_type_id, base.deal_stage_id, base.deal_status_id, actor, lead, company]
      );

      const stage = Number(
        await ctx.val(`SELECT count(*) FROM deal_stage_histories WHERE deal_id = $1`, [newId])
      );
      const status = Number(
        await ctx.val(`SELECT count(*) FROM deal_status_histories WHERE deal_id = $1`, [newId])
      );
      // **2 になったら DB 関数側の INSERT が残っている**（二重記録）
      ctx.assertEqual(stage, 1, "ステージ履歴は 1 行だけ");
      ctx.assertEqual(status, 1, "ステータス履歴は 1 行だけ");

      const row = await ctx.one(
        `SELECT from_stage_id, to_stage_id FROM deal_stage_histories WHERE deal_id = $1`,
        [newId]
      );
      ctx.assertEqual(row.from_stage_id, null, "初回なので遷移前は NULL");
      ctx.assertEqual(row.to_stage_id, base.deal_stage_id, "作成時のステージが入る");
    }
  );

  test(
    "IT-DEALHIST-06",
    "履歴を直接 INSERT できない（書き込み口はトリガーだけ）",
    async (ctx) => {
      const deal = await anyDeal(ctx);
      const actor = await ctx.val(`SELECT id FROM crm_users WHERE role = 'admin' LIMIT 1`);

      await ctx.setRole(actor);
      const err = await ctx.expectError(
        () =>
          ctx.query(
            `INSERT INTO deal_stage_histories (deal_id, from_stage_id, to_stage_id, changed_by)
             VALUES ($1, NULL, $2, $3)`,
            [deal.id, deal.deal_stage_id, actor]
          ),
        /row-level security|policy/i,
        "IT-DEALHIST-06"
      );
      ctx.assertEqual(err.code, "42501", "RLS で拒否される");
      await ctx.resetRole();
    }
  );
}
