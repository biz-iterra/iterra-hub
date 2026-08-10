import { USERS } from "../lib/constants.mjs";

/**
 * docs/test-cases/02-integration-db.md
 * 「SNS・チャットの一意制約（workspace が NULL でも効く）」IT-SOCIAL-UNIQUE-01 〜 04。
 *
 * 対象は `uq_contact_social_account`（マイグレーション 20260810100001、T-0084）。
 * 元の制約は既定の NULLS DISTINCT だったため、workspace を持たないサービス
 * （Chatwork・LINE 等）では同じ ID を何度でも登録できていた。
 */
export function register(test) {
  /** サービスは code から引く（マスタの id を直書きしない） */
  const services = async (ctx) => ({
    chatwork: await ctx.val(`SELECT id FROM social_services WHERE code = 'chatwork'`),
    slack: await ctx.val(`SELECT id FROM social_services WHERE code = 'slack'`),
  });

  /** 連絡先は seed の先頭を借りる（ケースは ROLLBACK されるので汚れない） */
  const anyContactId = (ctx) =>
    ctx.val(`SELECT id FROM contacts WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1`);

  const insertAccount = (ctx, contactId, serviceId, accountId, workspace) =>
    ctx.query(
      `INSERT INTO contact_social_accounts (contact_id, service_id, account_id, workspace)
       VALUES ($1, $2, $3, $4)`,
      [contactId, serviceId, accountId, workspace]
    );

  test(
    "IT-SOCIAL-UNIQUE-01",
    "workspace が NULL 同士でも同じ ID の二重登録を弾く（T-0084 の本体）",
    async (ctx) => {
      const { chatwork } = await services(ctx);
      const contactId = await anyContactId(ctx);

      await insertAccount(ctx, contactId, chatwork, "1234567", null);

      const err = await ctx.expectError(
        () => insertAccount(ctx, contactId, chatwork, "1234567", null),
        /uq_contact_social_account/,
        "IT-SOCIAL-UNIQUE-01"
      );
      ctx.assertEqual(err.code, "23505", "一意制約違反として返る（画面の 23505 判定が効く）");

      const count = await ctx.val(
        `SELECT count(*) FROM contact_social_accounts
          WHERE contact_id = $1 AND service_id = $2 AND account_id = '1234567'`,
        [contactId, chatwork]
      );
      ctx.assertEqual(Number(count), 1, "残るのは 1 行だけ");
    }
  );

  test(
    "IT-SOCIAL-UNIQUE-02",
    "Slack はワークスペースが違えば共存し、同じワークスペースなら弾く",
    async (ctx) => {
      const { slack } = await services(ctx);
      const contactId = await anyContactId(ctx);

      await insertAccount(ctx, contactId, slack, "U0AAAAAAA", "T0AAAAAAA");
      // 別ワークスペースの同じメンバー ID は別物として通る（制約の目的を壊さないこと）
      await insertAccount(ctx, contactId, slack, "U0AAAAAAA", "T0BBBBBBB");

      const both = await ctx.val(
        `SELECT count(*) FROM contact_social_accounts
          WHERE contact_id = $1 AND service_id = $2 AND account_id = 'U0AAAAAAA'`,
        [contactId, slack]
      );
      ctx.assertEqual(Number(both), 2, "ワークスペース違いは 2 行とも残る");

      await ctx.expectError(
        () => insertAccount(ctx, contactId, slack, "U0AAAAAAA", "T0AAAAAAA"),
        /uq_contact_social_account/,
        "IT-SOCIAL-UNIQUE-02"
      );
    }
  );

  test(
    "IT-SOCIAL-UNIQUE-03",
    "新規作成（create_contact_with_details）でも重複は全体ロールバックになる（CNT-41 手順 3）",
    async (ctx) => {
      const { chatwork } = await services(ctx);
      const statusId = await ctx.val(
        `SELECT id FROM contact_statuses WHERE is_new_default AND deleted_at IS NULL LIMIT 1`
      );

      const before = await ctx.val(
        `SELECT count(*) FROM contacts WHERE last_name = 'IT-SOCIAL-UNIQUE-03'`
      );

      await ctx.setRole(USERS.admin);
      const err = await ctx.expectError(
        () =>
          ctx.val(
            `SELECT create_contact_with_details(
               p_contact         => $1::jsonb,
               p_social_accounts => $2::jsonb
             )`,
            [
              JSON.stringify({
                last_name: "IT-SOCIAL-UNIQUE-03",
                contact_type: "individual",
                contact_status_id: statusId,
              }),
              // workspace を持たないサービスを 2 行。以前はこれが両方通っていた
              JSON.stringify([
                { service_id: chatwork, account_id: "9999999" },
                { service_id: chatwork, account_id: "9999999" },
              ]),
            ]
          ),
        /uq_contact_social_account/,
        "IT-SOCIAL-UNIQUE-03"
      );
      await ctx.resetRole();

      ctx.assertEqual(err.code, "23505", "createContact の 23505 判定に乗る");

      const after = await ctx.val(
        `SELECT count(*) FROM contacts WHERE last_name = 'IT-SOCIAL-UNIQUE-03'`
      );
      ctx.assertEqual(Number(after), Number(before), "孤児の連絡先が残らない");
    }
  );

  test(
    "IT-SOCIAL-UNIQUE-04",
    "重複掃除は各グループの最古 1 行を残す（マイグレーションの掃除と同じ式）",
    async (ctx) => {
      const { chatwork } = await services(ctx);
      const contactId = await anyContactId(ctx);

      // 張り替え前の状態を再現する（DDL もトランザクションで巻き戻る）
      await ctx.query(
        `ALTER TABLE contact_social_accounts DROP CONSTRAINT uq_contact_social_account`
      );
      await ctx.query(
        `ALTER TABLE contact_social_accounts
           ADD CONSTRAINT uq_contact_social_account
             UNIQUE (contact_id, service_id, account_id, workspace)`
      );

      const oldest = await ctx.val(
        `INSERT INTO contact_social_accounts
           (contact_id, service_id, account_id, workspace, display_name, created_at)
         VALUES ($1, $2, '5555555', NULL, '最古', now() - interval '3 days')
         RETURNING id`,
        [contactId, chatwork]
      );
      await ctx.query(
        `INSERT INTO contact_social_accounts
           (contact_id, service_id, account_id, workspace, display_name, created_at)
         VALUES ($1, $2, '5555555', NULL, '中', now() - interval '2 days'),
                ($1, $2, '5555555', NULL, '新', now() - interval '1 day')`,
        [contactId, chatwork]
      );

      const dupes = await ctx.val(
        `SELECT count(*) FROM contact_social_accounts
          WHERE contact_id = $1 AND service_id = $2 AND account_id = '5555555'`,
        [contactId, chatwork]
      );
      ctx.assertEqual(Number(dupes), 3, "旧制約では重複が入ってしまう（不具合の再現）");

      const deleted = await ctx.rowCount(
        `WITH ranked AS (
           SELECT id,
                  row_number() OVER (
                    PARTITION BY contact_id, service_id, account_id, workspace
                    ORDER BY created_at, id
                  ) AS rn
             FROM contact_social_accounts
         )
         DELETE FROM contact_social_accounts t
          USING ranked r
          WHERE t.id = r.id AND r.rn > 1`
      );
      ctx.assertEqual(deleted, 2, "残す 1 行を除いて消える");

      const survivor = await ctx.one(
        `SELECT id, display_name FROM contact_social_accounts
          WHERE contact_id = $1 AND service_id = $2 AND account_id = '5555555'`,
        [contactId, chatwork]
      );
      ctx.assertEqual(survivor.id, oldest, "残るのは created_at が最も古い行");
      ctx.assertEqual(survivor.display_name, "最古");

      // 掃除のあとなら NULLS NOT DISTINCT を張り直せること（本番での順序どおり）
      await ctx.query(
        `ALTER TABLE contact_social_accounts DROP CONSTRAINT uq_contact_social_account`
      );
      await ctx.query(
        `ALTER TABLE contact_social_accounts
           ADD CONSTRAINT uq_contact_social_account
             UNIQUE NULLS NOT DISTINCT (contact_id, service_id, account_id, workspace)`
      );
    }
  );
}
