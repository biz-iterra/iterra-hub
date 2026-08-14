/**
 * docs/test-cases/02-integration-db.md
 * 「住所の更新は 1 トランザクション」IT-ADDRUPD-01 〜 04。
 *
 * 対象は `update_entity_address`（マイグレーション 20260814100006、T-0104 / T-0096）。
 *
 * 住所は本体（`addresses`）と紐付け（`entity_addresses`）の 2 表に分かれている。
 * 追加は元から DB 関数だったのに、**更新だけアプリが 2 文に分けて UPDATE** して
 * いた。片方だけ通ると「住所は変わったのにラベル・電話が古いまま」という
 * 食い違いが残る。併せて楽観ロックもこの関数で見る。
 */
export function register(test) {
  /** seed の連絡先に住所を 1 件足して、その紐付けを返す */
  async function makeAddress(ctx) {
    const contactId = await ctx.val(
      `SELECT id FROM contacts WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1`
    );
    const actor = await ctx.val(`SELECT id FROM crm_users ORDER BY created_at LIMIT 1`);
    const linkId = await ctx.val(
      `SELECT add_entity_address('contact', $1, '1000001', '東京都', '千代田区', '1-1', NULL,
                                 'main', '03-0000-0000', NULL, NULL, $2)`,
      [contactId, actor]
    );
    return { contactId, actor, linkId };
  }

  const call = (ctx, o, extra = {}) =>
    ctx.query(
      `SELECT update_entity_address('contact', $1, $2, $3, $4, $5, $6, NULL, $7, $8, NULL, NULL, $9, $10)`,
      [
        o.contactId,
        o.linkId,
        extra.postal_code ?? "5000001",
        extra.prefecture ?? "岐阜県",
        extra.city ?? "岐阜市",
        extra.address_line1 ?? "2-2",
        extra.label ?? "billing",
        extra.phone ?? "058-000-0000",
        o.actor,
        extra.expected ?? null,
      ]
    );

  test(
    "IT-ADDRUPD-01",
    "住所本体と紐付けが同時に更新される",
    async (ctx) => {
      const o = await makeAddress(ctx);
      await call(ctx, o);

      const row = await ctx.one(
        `SELECT ea.label, ea.phone, a.prefecture, a.city, a.postal_code
           FROM entity_addresses ea JOIN addresses a ON a.id = ea.address_id
          WHERE ea.id = $1`,
        [o.linkId]
      );
      ctx.assertEqual(row.label, "billing", "紐付け側のラベルが変わる");
      ctx.assertEqual(row.phone, "058-000-0000", "紐付け側の電話が変わる");
      ctx.assertEqual(row.prefecture, "岐阜県", "住所本体の都道府県が変わる");
      ctx.assertEqual(row.city, "岐阜市", "住所本体の市区町村が変わる");
      ctx.assertEqual(row.postal_code, "5000001", "住所本体の郵便番号が変わる");
    }
  );

  test(
    "IT-ADDRUPD-02",
    "空文字は NULL に落とす（追加側と同じ規則）",
    async (ctx) => {
      const o = await makeAddress(ctx);
      await call(ctx, o, { address_line1: "   ", phone: "" });

      const row = await ctx.one(
        `SELECT ea.phone, a.address_line1
           FROM entity_addresses ea JOIN addresses a ON a.id = ea.address_id
          WHERE ea.id = $1`,
        [o.linkId]
      );
      ctx.assertEqual(row.phone, null, "空文字の電話は NULL");
      ctx.assertEqual(row.address_line1, null, "空白だけの番地は NULL");
    }
  );

  test(
    "IT-ADDRUPD-03",
    "楽観ロック: updated_at が食い違えば競合として弾く",
    async (ctx) => {
      const o = await makeAddress(ctx);
      const stale = "2000-01-01T00:00:00Z";

      const err = await ctx.expectError(
        () => call(ctx, o, { expected: stale }),
        /CONFLICT/,
        "IT-ADDRUPD-03"
      );
      ctx.assertEqual(Boolean(err), true, "例外になる");

      // **巻き戻ること。** 紐付けだけ変わって住所本体が古いまま、を作らない
      const row = await ctx.one(
        `SELECT ea.label, a.prefecture
           FROM entity_addresses ea JOIN addresses a ON a.id = ea.address_id
          WHERE ea.id = $1`,
        [o.linkId]
      );
      ctx.assertEqual(row.label, "main", "紐付けは元のまま");
      ctx.assertEqual(row.prefecture, "東京都", "住所本体も元のまま");
    }
  );

  test(
    "IT-ADDRUPD-04",
    "持ち主が違う紐付けは更新できない",
    async (ctx) => {
      const o = await makeAddress(ctx);
      const other = await ctx.val(
        `SELECT id FROM contacts WHERE deleted_at IS NULL AND id <> $1 ORDER BY created_at LIMIT 1`,
        [o.contactId]
      );

      await ctx.expectError(
        () =>
          ctx.query(
            `SELECT update_entity_address('contact', $1, $2, '9990000', '沖縄県', '那覇市', '3-3', NULL,
                                          'main', NULL, NULL, NULL, $3, NULL)`,
            [other, o.linkId, o.actor]
          ),
        /住所が見つかりません/,
        "IT-ADDRUPD-04"
      );
    }
  );
}
