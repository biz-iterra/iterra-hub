import { USERS } from "../lib/constants.mjs";

/**
 * docs/test-cases/02-integration-db.md
 * 「個人事業主の作成時に本人の連絡先を同時に作る（2026-08-09 追加、T-0087）」
 * IT-COMPANY-CONTACT-01 〜 05。
 *
 * 対象は create_company_with_contact（マイグレーション 20260809120001）。
 * 設計は docs/database-design.md § 22.2.4。
 */
export function register(test) {
  /** 事業種別・ステータスは code / 役割フラグから引く（マスタの id を直書きしない） */
  const masters = async (ctx) => ({
    companyStatusId: await ctx.val(
      `SELECT id FROM company_statuses WHERE code = 'unverified' AND deleted_at IS NULL`
    ),
    soleProprietorId: await ctx.val(
      `SELECT id FROM corporate_types WHERE is_sole_proprietor AND deleted_at IS NULL LIMIT 1`
    ),
  });

  const callAsMember = (ctx, company, contact) =>
    ctx.val(`SELECT create_company_with_contact($1::jsonb, $2::jsonb)`, [
      JSON.stringify(company),
      contact === null ? null : JSON.stringify(contact),
    ]);

  test(
    "IT-COMPANY-CONTACT-01",
    "同時作成で事業者・連絡先・事業主/主担当の紐づけが揃う",
    async (ctx) => {
      const { companyStatusId, soleProprietorId } = await masters(ctx);

      await ctx.setRole(USERS.member);
      const result = await callAsMember(
        ctx,
        {
          name: "IT-COMPANY-CONTACT-01商店",
          company_status_id: companyStatusId,
          corporate_type_id: soleProprietorId,
        },
        { last_name: "佐川", first_name: "琴美", contact_type: "individual" }
      );
      await ctx.resetRole();

      ctx.assertTrue(!!result.company_id, "company_id が返る");
      ctx.assertTrue(!!result.contact_id, "contact_id が返る");

      const company = await ctx.one(
        `SELECT company_code, owner_user_id, representative_contact_id, primary_contact_id
           FROM companies WHERE id = $1`,
        [result.company_id]
      );
      ctx.assertMatch(company.company_code, /^CMP-\d{6}$/, "会社コードが採番されている");
      ctx.assertEqual(company.representative_contact_id, result.contact_id, "事業主に本人が入る");
      ctx.assertEqual(company.primary_contact_id, result.contact_id, "主担当に本人が入る");
      ctx.assertEqual(company.owner_user_id, USERS.member, "担当者の指定が無ければ実行者");

      const contact = await ctx.one(
        `SELECT contact_code, company_id, contact_type, owner_user_id, contact_status_id
           FROM contacts WHERE id = $1`,
        [result.contact_id]
      );
      ctx.assertMatch(contact.contact_code, /^CNT-\d{6}$/, "連絡先コードが採番されている");
      ctx.assertEqual(contact.company_id, result.company_id, "本人は事業者に紐づく");
      // 個人事業主の本人は法人代表ではないので individual のまま（§22.2.4 の例外）
      ctx.assertEqual(contact.contact_type, "individual");
      ctx.assertEqual(contact.owner_user_id, USERS.member, "担当者は会社と揃う");

      // 整合性検査 Q15（連絡先ゼロの個人事業主）に引っかからないこと
      const orphan = await ctx.val(
        `SELECT count(*) FROM companies c
           JOIN corporate_types ct ON ct.id = c.corporate_type_id
          WHERE c.id = $1 AND ct.is_sole_proprietor AND c.deleted_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM contacts co
                             WHERE co.company_id = c.id AND co.deleted_at IS NULL)`,
        [result.company_id]
      );
      ctx.assertEqual(Number(orphan), 0, "Q15 の検出対象にならない");
    }
  );

  test(
    "IT-COMPANY-CONTACT-02",
    "p_contact が NULL なら事業者だけを作る（同時作成のチェックを外した場合）",
    async (ctx) => {
      const { companyStatusId, soleProprietorId } = await masters(ctx);

      await ctx.setRole(USERS.member);
      const result = await callAsMember(
        ctx,
        {
          name: "IT-COMPANY-CONTACT-02商店",
          company_status_id: companyStatusId,
          corporate_type_id: soleProprietorId,
        },
        null
      );
      await ctx.resetRole();

      ctx.assertTrue(!!result.company_id, "company_id が返る");
      ctx.assertEqual(result.contact_id, null, "contact_id は null");

      const contacts = await ctx.val(`SELECT count(*) FROM contacts WHERE company_id = $1`, [
        result.company_id,
      ]);
      ctx.assertEqual(Number(contacts), 0, "連絡先は作られない");

      const company = await ctx.one(
        `SELECT representative_contact_id, primary_contact_id FROM companies WHERE id = $1`,
        [result.company_id]
      );
      ctx.assertEqual(company.representative_contact_id, null);
      ctx.assertEqual(company.primary_contact_id, null);
    }
  );

  test(
    "IT-COMPANY-CONTACT-03",
    "ステータス省略時は contact_statuses.is_new_default を引く",
    async (ctx) => {
      const { companyStatusId, soleProprietorId } = await masters(ctx);
      const expected = await ctx.val(
        `SELECT id FROM contact_statuses WHERE is_new_default AND deleted_at IS NULL LIMIT 1`
      );

      await ctx.setRole(USERS.member);
      const result = await callAsMember(
        ctx,
        {
          name: "IT-COMPANY-CONTACT-03商店",
          company_status_id: companyStatusId,
          corporate_type_id: soleProprietorId,
        },
        { last_name: "山田", first_name: "太郎", contact_type: "individual" }
      );
      await ctx.resetRole();

      const statusId = await ctx.val(`SELECT contact_status_id FROM contacts WHERE id = $1`, [
        result.contact_id,
      ]);
      ctx.assertEqual(statusId, expected, "役割フラグの立ったステータスが入る");
    }
  );

  test(
    "IT-COMPANY-CONTACT-04",
    "is_new_default が無ければ例外（事業者も残らない）",
    async (ctx) => {
      const { companyStatusId, soleProprietorId } = await masters(ctx);
      // 役割フラグを一時的に落とす（ケースは ROLLBACK されるので seed は汚れない）
      await ctx.query(`UPDATE contact_statuses SET is_new_default = FALSE WHERE is_new_default`);

      const before = await ctx.val(
        `SELECT count(*) FROM companies WHERE name = 'IT-COMPANY-CONTACT-04商店'`
      );

      await ctx.setRole(USERS.member);
      await ctx.expectError(
        () =>
          callAsMember(
            ctx,
            {
              name: "IT-COMPANY-CONTACT-04商店",
              company_status_id: companyStatusId,
              corporate_type_id: soleProprietorId,
            },
            { last_name: "鈴木", first_name: "一郎", contact_type: "individual" }
          ),
        /連絡先の初期ステータス（is_new_default）が見つかりません/,
        "IT-COMPANY-CONTACT-04"
      );
      await ctx.resetRole();

      const after = await ctx.val(
        `SELECT count(*) FROM companies WHERE name = 'IT-COMPANY-CONTACT-04商店'`
      );
      ctx.assertEqual(Number(after), Number(before), "単一トランザクションなので会社も残らない");
    }
  );

  test(
    "IT-COMPANY-CONTACT-05",
    "member が担当者を他人にすると紐づけ失敗を例外にする（0 行更新を黙殺しない）",
    async (ctx) => {
      const { companyStatusId, soleProprietorId } = await masters(ctx);

      const before = await ctx.val(
        `SELECT count(*) FROM companies WHERE name = 'IT-COMPANY-CONTACT-05商店'`
      );

      await ctx.setRole(USERS.member);
      await ctx.expectError(
        () =>
          callAsMember(
            ctx,
            {
              name: "IT-COMPANY-CONTACT-05商店",
              company_status_id: companyStatusId,
              corporate_type_id: soleProprietorId,
              // companies の UPDATE は owner / admin のみ。他人を担当者にすると
              // 事業主の紐づけ UPDATE が 0 行になる（T-0086 の再発形）
              owner_user_id: USERS.ogawa,
            },
            { last_name: "田中", first_name: "花子", contact_type: "individual" }
          ),
        /事業主の連絡先を紐づけられませんでした/,
        "IT-COMPANY-CONTACT-05"
      );
      await ctx.resetRole();

      const after = await ctx.val(
        `SELECT count(*) FROM companies WHERE name = 'IT-COMPANY-CONTACT-05商店'`
      );
      ctx.assertEqual(Number(after), Number(before), "会社も連絡先も残らない");
    }
  );
}
