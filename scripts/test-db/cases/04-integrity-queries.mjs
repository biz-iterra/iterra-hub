/**
 * docs/test-cases/02-integration-db.md §6 整合性チェッククエリ集
 * Q1 〜 Q15。すべて 0 行が正常（Q11 と Q14 を除く。doc の注記どおり
 * Q11 は参考値、Q14 は 2 行あることが正常）。
 *
 * db reset 直後の seed（リード 3,008 件含む）に対して実行する。
 * 他のケースが BEGIN〜ROLLBACK で後始末しているため、ここで作ったデータの影響は残らない。
 */
export function register(test) {
  const zero = async (ctx, id, label, sql) => {
    const r = await ctx.query(sql);
    if (r.rows.length !== 0) {
      throw new Error(`${label}: expected 0 rows, got ${r.rows.length} (first: ${JSON.stringify(r.rows[0])})`);
    }
  };

  test("Q1", "採番コードの重複", (ctx) =>
    zero(
      ctx,
      "Q1",
      "採番コード重複",
      `SELECT 'companies' t, company_code code, count(*) FROM companies GROUP BY 1,2 HAVING count(*) > 1
       UNION ALL SELECT 'accounts', account_code, count(*) FROM accounts GROUP BY 1,2 HAVING count(*) > 1
       UNION ALL SELECT 'contacts', contact_code, count(*) FROM contacts GROUP BY 1,2 HAVING count(*) > 1
       UNION ALL SELECT 'deals', deal_code, count(*) FROM deals GROUP BY 1,2 HAVING count(*) > 1
       UNION ALL SELECT 'contracts', contract_code, count(*) FROM contracts GROUP BY 1,2 HAVING count(*) > 1`
    )
  );

  test("Q2", "採番コードの形式不正", (ctx) =>
    zero(
      ctx,
      "Q2",
      "採番コード形式",
      `SELECT id, company_code FROM companies WHERE company_code !~ '^CMP-[0-9]{6}$'
       UNION ALL SELECT id, account_code FROM accounts WHERE account_code !~ '^ACC-[0-9]{6}$'
       UNION ALL SELECT id, contact_code FROM contacts WHERE contact_code !~ '^CNT-[0-9]{6}$'
       UNION ALL SELECT id, deal_code FROM deals WHERE deal_code !~ '^DL-[0-9]{6}$'
       UNION ALL SELECT id, contract_code FROM contracts WHERE contract_code !~ '^CTR-[0-9]{6}$'`
    )
  );

  test("Q3", "ディールの相手先欠落（deals_counterparty_check の実効確認）", (ctx) =>
    zero(
      ctx,
      "Q3",
      "相手先欠落",
      `SELECT id, deal_code FROM deals
        WHERE account_id IS NULL AND company_id IS NULL AND contact_id IS NULL`
    )
  );

  test("Q4", "employee なのに会社が無い連絡先", (ctx) =>
    zero(
      ctx,
      "Q4",
      "employee かつ会社なし",
      `SELECT id, contact_code, last_name FROM contacts
        WHERE contact_type = 'employee' AND company_id IS NULL AND deleted_at IS NULL`
    )
  );

  test("Q5", "生きている子が論理削除済みの親を参照している", (ctx) =>
    zero(
      ctx,
      "Q5",
      "親が削除済み",
      `SELECT c.id, c.contact_code FROM contacts c JOIN companies p ON p.id = c.company_id
        WHERE c.deleted_at IS NULL AND p.deleted_at IS NOT NULL
       UNION ALL
       SELECT d.id, d.deal_code FROM deals d JOIN companies p ON p.id = d.company_id
        WHERE p.deleted_at IS NOT NULL`
    )
  );

  test("Q6a", "主連絡先の重複（部分ユニーク索引の実効確認）", (ctx) =>
    zero(
      ctx,
      "Q6a",
      "主連絡先重複",
      `SELECT contact_id, count(*) FROM contact_emails WHERE is_primary GROUP BY 1 HAVING count(*) > 1
       UNION ALL
       SELECT contact_id, count(*) FROM contact_phones WHERE is_primary GROUP BY 1 HAVING count(*) > 1`
    )
  );

  test("Q6b", "メールを持つのに主が 1 つも無い連絡先", (ctx) =>
    zero(
      ctx,
      "Q6b",
      "主メール不在",
      `SELECT e.contact_id FROM contact_emails e
        GROUP BY e.contact_id HAVING bool_and(NOT e.is_primary)`
    )
  );

  test("Q7a", "company_domains の規約違反（フリーメール / 大文字）", (ctx) =>
    zero(
      ctx,
      "Q7a",
      "domain 規約違反",
      `SELECT id, domain FROM company_domains
        WHERE is_free_email_domain(domain) OR domain <> lower(domain)`
    )
  );

  test("Q7b", "company_domains の主重複", (ctx) =>
    zero(
      ctx,
      "Q7b",
      "domain 主重複",
      `SELECT company_id, count(*) FROM company_domains WHERE is_primary GROUP BY 1 HAVING count(*) > 1`
    )
  );

  test("Q8", "生存法人間の法人番号重複（名寄せの前提）", (ctx) =>
    zero(
      ctx,
      "Q8",
      "法人番号重複",
      `SELECT corporate_number, count(*) FROM companies
        WHERE corporate_number IS NOT NULL AND deleted_at IS NULL
        GROUP BY 1 HAVING count(*) > 1`
    )
  );

  test("Q9a", "リードスコアの範囲（0-100）", (ctx) =>
    zero(ctx, "Q9a", "スコア範囲外", `SELECT id, score FROM leads WHERE score < 0 OR score > 100`)
  );

  test("Q9b", "リードスコアと温度の整合", (ctx) =>
    zero(
      ctx,
      "Q9b",
      "スコアと温度の不整合",
      `SELECT l.id, l.score, l.temperature_id FROM leads l
        WHERE l.deleted_at IS NULL AND l.temperature_id IS DISTINCT FROM (
          SELECT t.temperature_id FROM lead_score_thresholds t
           WHERE t.deleted_at IS NULL AND t.min_score <= l.score
             AND (t.max_score IS NULL OR l.score <= t.max_score)
           ORDER BY t.min_score DESC LIMIT 1)`
    )
  );

  test("Q10a", "昇格整合 — 参照先の消えた昇格", (ctx) =>
    zero(
      ctx,
      "Q10a",
      "promoted_deal_id の参照切れ",
      `SELECT l.id FROM leads l LEFT JOIN deals d ON d.id = l.promoted_deal_id
        WHERE l.promoted_deal_id IS NOT NULL AND d.id IS NULL`
    )
  );

  test("Q10b", "昇格整合 — 契約済みなのに Account 未作成", (ctx) =>
    zero(
      ctx,
      "Q10b",
      "契約済み Account 欠落",
      `SELECT d.id, d.deal_code FROM deals d
         JOIN contracts ct ON ct.deal_id = d.id
        WHERE d.account_id IS NULL
          AND (d.company_id IS NOT NULL OR d.contact_id IS NOT NULL)`
    )
  );

  test("Q10c", "昇格整合 — スコア内訳の孤児行", (ctx) =>
    zero(
      ctx,
      "Q10c",
      "score_breakdowns 孤児",
      `SELECT id FROM lead_score_breakdowns b
        WHERE NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = b.lead_id)
           OR NOT EXISTS (SELECT 1 FROM lead_score_rules r WHERE r.id = b.rule_id)`
    )
  );

  test(
    "Q11",
    "孤児住所（entity_addresses / leads いずれからも参照されない addresses）",
    async (ctx) => {
      // doc §6 冒頭注記のとおり「Q11 を除く」全件 0 行が前提。
      // 本ケースは失敗させず件数を記録するだけに留める（本番データの状態に依存するため）。
      const r = await ctx.query(
        `SELECT a.id FROM addresses a
          WHERE NOT EXISTS (SELECT 1 FROM entity_addresses ea WHERE ea.address_id = a.id)
            AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.address_id = a.id)`
      );
      // 極端な増加（=大量の掃除漏れ）だけを異常とみなす。しきい値は運用感覚での目安
      ctx.assertTrue(
        r.rows.length < 500,
        `孤児住所が ${r.rows.length} 件。cleanup トリガーの不具合を疑う規模`
      );
    }
  );

  test("Q12a", "変更履歴の不変条件 — 空差分の混入", (ctx) =>
    zero(ctx, "Q12a", "空差分", `SELECT id FROM entity_change_logs WHERE changed_fields = '{}'::jsonb`)
  );

  test("Q12b", "変更履歴の不変条件 — 除外列の混入", (ctx) =>
    zero(
      ctx,
      "Q12b",
      "除外列混入",
      `SELECT id FROM entity_change_logs
        WHERE operation = 'UPDATE' AND (changed_fields ? 'updated_at' OR changed_fields ? 'score')`
    )
  );

  test(
    "Q13",
    "account_roles の自動付与整合（契約があるのに対応区分が無い）",
    (ctx) =>
      zero(
        ctx,
        "Q13",
        "account_roles 欠落",
        `SELECT d.account_id, d.pipeline_type_id FROM deals d
           JOIN contracts ct ON ct.deal_id = d.id
           JOIN account_role_types rt ON rt.pipeline_type_id = d.pipeline_type_id AND rt.deleted_at IS NULL
          WHERE d.account_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM account_roles ar
                             WHERE ar.account_id = d.account_id AND ar.role_type_id = rt.id)`
      )
  );

  test("Q14", "cron ジョブの登録確認（0 行なら異常）", async (ctx) => {
    const r = await ctx.query(
      `SELECT jobname, schedule FROM cron.job
        WHERE jobname IN ('purge_soft_deleted_records_daily', 'recalculate_lead_scores_weekly')`
    );
    ctx.assertEqual(r.rows.length, 2, "2 ジョブとも登録されていること");
  });

  test("Q15", "連絡先ゼロの個人事業主（T-0086 の再発検出）", (ctx) =>
    zero(
      ctx,
      "Q15",
      "個人事業主に連絡先なし",
      // 事業種別の判定は **is_sole_proprietor フラグ**で行う。名称で判定すると
      // マスタの改名でこの検査が黙って空振りする（CLAUDE.md「マスタの役割フラグ」）
      `SELECT c.id, c.company_code, c.name FROM companies c
         JOIN corporate_types ct ON ct.id = c.corporate_type_id
        WHERE ct.is_sole_proprietor
          AND c.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM contacts co
             WHERE co.company_id = c.id AND co.deleted_at IS NULL)`
    )
  );
}
