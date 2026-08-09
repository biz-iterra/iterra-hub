/**
 * docs/test-cases/02-integration-db.md §3.1 正規化・判定系（純粋関数）
 * IT-01 〜 IT-08
 */
export function register(test) {
  test("IT-01", "expand_corporate_abbreviations — 基本略記の展開", async (ctx) => {
    const row = await ctx.one(
      `SELECT expand_corporate_abbreviations('㈱ワンエイト') a,
              expand_corporate_abbreviations('（株）ワンエイト') b,
              expand_corporate_abbreviations('ワンエイト(株)') c,
              expand_corporate_abbreviations('㈲テスト') d,
              expand_corporate_abbreviations('  テスト　商事  ') e,
              expand_corporate_abbreviations(NULL) f`
    );
    ctx.assertEqual(row.a, "株式会社ワンエイト");
    ctx.assertEqual(row.b, "株式会社ワンエイト");
    ctx.assertEqual(row.c, "ワンエイト株式会社");
    ctx.assertEqual(row.d, "有限会社テスト");
    ctx.assertEqual(row.e, "テスト 商事");
    ctx.assertEqual(row.f, null);
  });

  test("IT-02", "expand_corporate_abbreviations — 複合略記が単独より先に当たる", async (ctx) => {
    const row = await ctx.one(
      `SELECT expand_corporate_abbreviations('(一般㈶)秋田県建設・工業技術センター') a,
              expand_corporate_abbreviations('㈶やまがた産業支援機構') b,
              expand_corporate_abbreviations('（社）小石川医師会') c`
    );
    ctx.assertEqual(row.a, "一般財団法人秋田県建設・工業技術センター");
    ctx.assertEqual(row.b, "財団法人やまがた産業支援機構");
    ctx.assertEqual(row.c, "社団法人小石川医師会");
  });

  test(
    "IT-03",
    "normalize_company_name — 前株・後株・略記・全角英数が同一キーになる",
    async (ctx) => {
      const row = await ctx.one(
        `SELECT normalize_company_name('株式会社フロンティア') a,
                normalize_company_name('フロンティア株式会社') b,
                normalize_company_name('㈱フロンティア')       c,
                normalize_company_name('ＡＢＣ商事株式会社')   d,
                normalize_company_name('株式会社')             e`
      );
      ctx.assertEqual(row.a, "フロンティア");
      ctx.assertEqual(row.b, "フロンティア");
      ctx.assertEqual(row.c, "フロンティア");
      ctx.assertEqual(row.d, "abc商事");
      ctx.assertEqual(row.e, null);
    }
  );

  test("IT-04", "normalize_domain / is_free_email_domain", async (ctx) => {
    const row = await ctx.one(
      `SELECT normalize_domain('Tanaka@Example.Co.Jp') a,
              normalize_domain('https://www.example.co.jp/about?q=1') b,
              normalize_domain('WWW.EXAMPLE.CO.JP') c,
              normalize_domain('') d,
              is_free_email_domain('gmail.com') e,
              is_free_email_domain('example.co.jp') f`
    );
    ctx.assertEqual(row.a, "example.co.jp");
    ctx.assertEqual(row.b, "example.co.jp");
    ctx.assertEqual(row.c, "example.co.jp");
    ctx.assertEqual(row.d, null);
    ctx.assertEqual(row.e, true);
    ctx.assertEqual(row.f, false);
  });

  test("IT-05", "normalize_address_key — 丁目番地号とハイフンと全角の同一視", async (ctx) => {
    const row = await ctx.one(
      `SELECT normalize_address_key('103-0007','東京都','中央区','日本橋浜町2丁目35番4号') a,
              normalize_address_key('1030007',NULL,NULL,'日本橋浜町2-35-4日本橋浜町パークビル') b,
              normalize_address_key(NULL,'東京都','中央区','日本橋浜町２−３５−４') c,
              normalize_address_key('103-0007','東京都','中央区','日本橋浜町') d`
    );
    ctx.assertEqual(row.a, "1030007/2-35-4");
    ctx.assertEqual(row.b, "1030007/2-35-4");
    ctx.assertEqual(row.c, "東京都中央区/2-35-4");
    ctx.assertEqual(row.d, null);
  });

  test("IT-06", "phone_line_type / is_mobile_phone / default_phone_label", async (ctx) => {
    const row = await ctx.one(
      `SELECT phone_line_type('090-1234-5678') a, phone_line_type('05012345678') b,
              phone_line_type('0120-000-000')  c, phone_line_type('03-1234-5678') d,
              phone_line_type('02012345678')   e, phone_line_type('') f,
              is_mobile_phone('050-1234-5678') g,
              default_phone_label('090-1234-5678') h,
              default_phone_label('050-1234-5678') i,
              default_phone_label('03-1234-5678') j`
    );
    ctx.assertEqual(row.a, "mobile");
    ctx.assertEqual(row.b, "ip");
    ctx.assertEqual(row.c, "toll_free");
    ctx.assertEqual(row.d, "landline");
    ctx.assertEqual(row.e, "other_non_landline");
    ctx.assertEqual(row.f, "unknown");
    ctx.assertEqual(row.g, false, "050 は共有されうるため同定キーにしない");
    ctx.assertEqual(row.h, "mobile");
    ctx.assertEqual(row.i, "other");
    ctx.assertEqual(row.j, "work");
  });

  test("IT-07", "company_sort_key — 法人格除去・フリガナ優先・先頭記号除去", async (ctx) => {
    const row = await ctx.one(
      `SELECT company_sort_key('株式会社フロンティア', NULL)   a,
              company_sort_key('フロンティア株式会社', NULL)   b,
              company_sort_key('株式会社青空', 'アオゾラ')     c,
              company_sort_key('「あしたのいえ」秋田福祉会', NULL) d,
              company_sort_key('㈶やまがた産業支援機構', NULL) e`
    );
    ctx.assertEqual(row.a, "フロンティア");
    ctx.assertEqual(row.b, "フロンティア");
    ctx.assertEqual(row.c, "アオゾラ", "フリガナ優先");
    ctx.assertEqual(row.d, "あしたのいえ」秋田福祉会", "先頭の記号だけ落ちる。閉じ括弧は残る");
    ctx.assertEqual(row.e, "やまがた産業支援機構", "旧制度の財団法人も落ちる");

    const statusId = await ctx.val(
      `SELECT id FROM company_statuses WHERE code = 'unverified' AND deleted_at IS NULL`
    );
    const inserted = await ctx.one(
      `INSERT INTO companies (name, owner_user_id, company_status_id)
       VALUES ('株式会社ソートキー確認', $1, $2)
       RETURNING sort_key`,
      ["a0000000-0000-0000-0000-000000000001", statusId]
    );
    ctx.assertEqual(inserted.sort_key, "ソートキー確認", "生成列 company_sort_key(name, name_kana)");
  });

  test("IT-08", "resolve_corporate_type_id — 最長一致", async (ctx) => {
    const a = await ctx.val(
      `SELECT ct.name FROM corporate_types ct
        WHERE ct.id = resolve_corporate_type_id('一般社団法人テスト協会')`
    );
    ctx.assertEqual(a, "一般社団法人", "短い『社団法人』に先に当たらない");

    const b = await ctx.val(
      `SELECT ct.name FROM corporate_types ct
        WHERE ct.id = resolve_corporate_type_id('社団法人テスト会')`
    );
    ctx.assertEqual(b, "社団法人");

    const c = await ctx.val(`SELECT resolve_corporate_type_id('屋号だけの店')`);
    ctx.assertEqual(c, null);
  });
}
