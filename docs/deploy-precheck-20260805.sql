-- ============================================================
-- 2026-08-05 リリースの事前確認（本番で db push の「前」に実行する）
--
-- 今回のマイグレーションは、マスタの行を **code / name / slug で見つけて**
-- 役割フラグを立てる。**本番でその値が変わっていると 0 行更新になり、
-- フラグが 1 つも立たない**。エラーは出ないが、以後こうなる:
--
--   - 問い合わせ取込・名刺取込が「既定が設定されていません」で止まる
--   - リード昇格が「既定のステータスが設定されていません」で止まる
--   - 契約時の取引先自動生成で種別が入らない
--   - リードのカテゴリが付かない（進捗画面が空になる）
--
-- **すべて「想定どおり 1」でなければ、db push の前に手当てする**
-- （該当行の code / name / slug を合わせるか、マイグレーションの条件を直す）。
--
-- 実行方法（読み取りのみ。データは変えない）:
--   Supabase ダッシュボード → SQL Editor に貼り付けて実行
-- ============================================================

-- ------------------------------------------------------------
-- ① 役割フラグを立てる対象が本番に存在するか
-- ------------------------------------------------------------
SELECT '① 役割フラグの対象' AS 区分, * FROM (
  SELECT 'lead_stages.slug=generation（取込の既定ステージ）' AS 対象,
         count(*) AS 件数, '1' AS 想定
    FROM lead_stages WHERE slug = 'generation' AND deleted_at IS NULL
  UNION ALL
  SELECT 'lead_stages.slug=qualification（選定段階）',
         count(*), '1' FROM lead_stages WHERE slug = 'qualification' AND deleted_at IS NULL
  UNION ALL
  SELECT 'lead_sources.slug=web_form（問い合わせ）',
         count(*), '1' FROM lead_sources WHERE slug = 'web_form' AND deleted_at IS NULL
  UNION ALL
  SELECT 'lead_sources.slug=eight（名刺取込）',
         count(*), '1' FROM lead_sources WHERE slug = 'eight' AND deleted_at IS NULL
  UNION ALL
  SELECT 'account_types.slug=corporate（法人）',
         count(*), '1' FROM account_types WHERE slug = 'corporate' AND deleted_at IS NULL
  UNION ALL
  SELECT 'account_types.slug=sole_proprietor（個人事業主）',
         count(*), '1' FROM account_types WHERE slug = 'sole_proprietor' AND deleted_at IS NULL
  UNION ALL
  SELECT 'account_types.slug=government（官公庁）',
         count(*), '1' FROM account_types WHERE slug = 'government' AND deleted_at IS NULL
  UNION ALL
  SELECT 'pipeline_types.slug=sales（商談化の既定）',
         count(*), '1' FROM pipeline_types WHERE slug = 'sales' AND deleted_at IS NULL
  UNION ALL
  SELECT 'account_statuses.code=active',
         count(*), '1' FROM account_statuses WHERE code = 'active' AND deleted_at IS NULL
  UNION ALL
  SELECT 'account_statuses.code=churned',
         count(*), '1' FROM account_statuses WHERE code = 'churned' AND deleted_at IS NULL
  UNION ALL
  SELECT 'account_statuses.code=prospect',
         count(*), '1' FROM account_statuses WHERE code = 'prospect' AND deleted_at IS NULL
  UNION ALL
  SELECT 'company_statuses.code=unverified',
         count(*), '1' FROM company_statuses WHERE code = 'unverified' AND deleted_at IS NULL
  UNION ALL
  SELECT 'contact_statuses.name=アクティブ',
         count(*), '1' FROM contact_statuses WHERE name = 'アクティブ' AND deleted_at IS NULL
  UNION ALL
  SELECT 'corporate_types.name=個人事業主',
         count(*), '1' FROM corporate_types WHERE name = '個人事業主' AND deleted_at IS NULL
  UNION ALL
  SELECT 'lead_categories.code=sql',
         count(*), '1' FROM lead_categories WHERE code = 'sql' AND deleted_at IS NULL
  UNION ALL
  SELECT 'lead_categories.code=inquiry',
         count(*), '1' FROM lead_categories WHERE code = 'inquiry' AND deleted_at IS NULL
  UNION ALL
  SELECT 'lead_categories.code=mql',
         count(*), '1' FROM lead_categories WHERE code = 'mql' AND deleted_at IS NULL
  UNION ALL
  SELECT 'lead_categories.code=tql',
         count(*), '1' FROM lead_categories WHERE code = 'tql' AND deleted_at IS NULL
  UNION ALL
  SELECT 'lead_statuses.code=not_started（問い合わせの初期）',
         count(*), '1' FROM lead_statuses WHERE code = 'not_started' AND deleted_at IS NULL
  UNION ALL
  SELECT 'lead_statuses.code=card_exchanged（名刺の初期）',
         count(*), '1' FROM lead_statuses WHERE code = 'card_exchanged' AND deleted_at IS NULL
  UNION ALL
  SELECT 'lead_activity_types.code=card_exchange',
         count(*), '1' FROM lead_activity_types WHERE code = 'card_exchange' AND deleted_at IS NULL
  UNION ALL
  SELECT 'lead_call_statuses.code=card_exchange',
         count(*), '1' FROM lead_call_statuses WHERE code = 'card_exchange' AND deleted_at IS NULL
  UNION ALL
  SELECT 'lead_customer_activity_types.code=form_submit',
         count(*), '1' FROM lead_customer_activity_types WHERE code = 'form_submit' AND deleted_at IS NULL
) t
ORDER BY (件数::TEXT <> 想定) DESC, 対象;

-- ------------------------------------------------------------
-- ② 既に壊れているデータ（削除済みマスタを参照）
--
-- 0 でなければ、その分だけデータ破損がある。
-- `20260805000023` が companies / contacts / accounts は自動で直す。
-- **leads は直さない**（ステージを勝手に変えるのは業務データの改変になるため）。
-- leads に該当があれば、反映後に画面から正しいステージへ移すこと。
-- ------------------------------------------------------------
SELECT '② 破損データ' AS 区分, * FROM (
  SELECT 'companies.company_status_id' AS 参照, count(*) AS 件数
    FROM companies c JOIN company_statuses m ON m.id = c.company_status_id
   WHERE m.deleted_at IS NOT NULL AND c.deleted_at IS NULL
  UNION ALL
  SELECT 'contacts.contact_status_id', count(*)
    FROM contacts c JOIN contact_statuses m ON m.id = c.contact_status_id
   WHERE m.deleted_at IS NOT NULL AND c.deleted_at IS NULL
  UNION ALL
  SELECT 'accounts.account_status_id', count(*)
    FROM accounts a JOIN account_statuses m ON m.id = a.account_status_id
   WHERE m.deleted_at IS NOT NULL AND a.deleted_at IS NULL
  UNION ALL
  SELECT 'leads.stage_id（★自動修復しない）', count(*)
    FROM leads l JOIN lead_stages m ON m.id = l.stage_id
   WHERE m.deleted_at IS NOT NULL AND l.deleted_at IS NULL
  UNION ALL
  SELECT 'leads.status_id（★自動修復しない）', count(*)
    FROM leads l JOIN lead_statuses m ON m.id = l.status_id
   WHERE m.deleted_at IS NOT NULL AND l.deleted_at IS NULL
) t ORDER BY 件数 DESC;

-- ------------------------------------------------------------
-- ③ 部分 UNIQUE に引っかかる重複が無いか
--
-- 「既定」は 1 行だけという制約を張る。**同じ code / slug が 2 行あると
-- マイグレーションが途中で止まる**（トランザクションごと巻き戻る）。
-- ------------------------------------------------------------
SELECT '③ 重複' AS 区分, * FROM (
  SELECT 'lead_stages.slug' AS 対象, slug AS 値, count(*) AS 件数
    FROM lead_stages WHERE deleted_at IS NULL AND slug IN ('generation','qualification')
   GROUP BY slug HAVING count(*) > 1
  UNION ALL
  SELECT 'lead_sources.slug', slug, count(*)
    FROM lead_sources WHERE deleted_at IS NULL AND slug IN ('web_form','eight')
   GROUP BY slug HAVING count(*) > 1
  UNION ALL
  SELECT 'account_statuses.code', code, count(*)
    FROM account_statuses WHERE deleted_at IS NULL AND code IN ('active','churned','prospect')
   GROUP BY code HAVING count(*) > 1
  UNION ALL
  SELECT 'lead_statuses.code', code, count(*)
    FROM lead_statuses WHERE deleted_at IS NULL AND code IN ('not_started','card_exchanged')
   GROUP BY code HAVING count(*) > 1
) t;
-- 0 行なら問題なし

-- ------------------------------------------------------------
-- ④ 反映にかかる時間の目安
--
-- `20260805000026` が変更履歴の全件を UPDATE する（対象名の埋め込み）。
-- ローカルは 4,424 件で数秒だった。**桁が違う場合は実行時間に注意**。
-- ------------------------------------------------------------
SELECT '④ 規模' AS 区分, 'entity_change_logs' AS 対象, count(*) AS 件数
  FROM entity_change_logs
UNION ALL
SELECT '④ 規模', 'leads', count(*) FROM leads
UNION ALL
SELECT '④ 規模', 'companies', count(*) FROM companies;

-- ------------------------------------------------------------
-- ⑤ 反映「後」の確認（db push が終わってから実行する）
--
-- 役割フラグが実際に立ったかを見る。**すべて 1 でなければならない。**
-- 0 があれば、その行の code / slug / name が本番で違っている。
-- その場合は該当行の値を直したうえで、下の復旧を実行する:
--
--   SELECT apply_master_role_flags();
--
-- 冪等なので何度でも流せる。戻り値が「すべて設定済み」になれば完了。
-- ------------------------------------------------------------
SELECT '⑤ 反映後の役割フラグ' AS 区分, * FROM (
  SELECT 'account_statuses.is_active_default' AS フラグ,
         count(*) FILTER (WHERE is_active_default AND deleted_at IS NULL) AS 件数
    FROM account_statuses
  UNION ALL SELECT 'account_statuses.is_churned_default',
         count(*) FILTER (WHERE is_churned_default AND deleted_at IS NULL) FROM account_statuses
  UNION ALL SELECT 'account_statuses.is_prospect_default',
         count(*) FILTER (WHERE is_prospect_default AND deleted_at IS NULL) FROM account_statuses
  UNION ALL SELECT 'company_statuses.is_new_default',
         count(*) FILTER (WHERE is_new_default AND deleted_at IS NULL) FROM company_statuses
  UNION ALL SELECT 'contact_statuses.is_new_default',
         count(*) FILTER (WHERE is_new_default AND deleted_at IS NULL) FROM contact_statuses
  UNION ALL SELECT 'corporate_types.is_sole_proprietor',
         count(*) FILTER (WHERE is_sole_proprietor AND deleted_at IS NULL) FROM corporate_types
  UNION ALL SELECT 'lead_stages.is_inquiry_default',
         count(*) FILTER (WHERE is_inquiry_default AND deleted_at IS NULL) FROM lead_stages
  UNION ALL SELECT 'lead_stages.is_qualification',
         count(*) FILTER (WHERE is_qualification AND deleted_at IS NULL) FROM lead_stages
  UNION ALL SELECT 'lead_statuses.is_inquiry_initial',
         count(*) FILTER (WHERE is_inquiry_initial AND deleted_at IS NULL) FROM lead_statuses
  UNION ALL SELECT 'lead_statuses.is_card_import_initial',
         count(*) FILTER (WHERE is_card_import_initial AND deleted_at IS NULL) FROM lead_statuses
  UNION ALL SELECT 'lead_sources.is_inquiry_default',
         count(*) FILTER (WHERE is_inquiry_default AND deleted_at IS NULL) FROM lead_sources
  UNION ALL SELECT 'lead_sources.is_card_import_default',
         count(*) FILTER (WHERE is_card_import_default AND deleted_at IS NULL) FROM lead_sources
  UNION ALL SELECT 'lead_categories.is_sales_qualified',
         count(*) FILTER (WHERE is_sales_qualified AND deleted_at IS NULL) FROM lead_categories
  UNION ALL SELECT 'lead_activity_types.is_card_exchange',
         count(*) FILTER (WHERE is_card_exchange AND deleted_at IS NULL) FROM lead_activity_types
  UNION ALL SELECT 'lead_call_statuses.is_card_exchange',
         count(*) FILTER (WHERE is_card_exchange AND deleted_at IS NULL) FROM lead_call_statuses
  UNION ALL SELECT 'lead_customer_activity_types.is_form_submit',
         count(*) FILTER (WHERE is_form_submit AND deleted_at IS NULL) FROM lead_customer_activity_types
  UNION ALL SELECT 'account_types.is_company_default',
         count(*) FILTER (WHERE is_company_default AND deleted_at IS NULL) FROM account_types
  UNION ALL SELECT 'account_types.is_sole_proprietor_default',
         count(*) FILTER (WHERE is_sole_proprietor_default AND deleted_at IS NULL) FROM account_types
  UNION ALL SELECT 'pipeline_types.is_default',
         count(*) FILTER (WHERE is_default AND deleted_at IS NULL) FROM pipeline_types
) t ORDER BY (件数 <> 1) DESC, フラグ;

-- ------------------------------------------------------------
-- ⑥ 連絡先ゼロの個人事業主（整合性検査 Q15 / 2026-08-09 追加、T-0087）
--
-- 個人事業主は定義上本人が必ずいるのに、手入力での事業者作成が連絡先を
-- 1 件も作らず、事業主欄が空のまま運用されていた（T-0086）。
-- 20260809120001 以降は作成時に本人の連絡先を同時に作るが、
-- 同時作成のチェックを外した分と過去分はここに出る。
--
-- **2026-08-09 時点で本番に既知 1 件（CMP-003597・修復予定）。修復後 0 行が正常。**
-- 事業種別の判定は corporate_types.is_sole_proprietor フラグで行う
-- （名称で判定するとマスタの改名でこの検査が黙って空振りする）。
-- 詳細: docs/database-design.md § 22.2.4
-- ------------------------------------------------------------
SELECT '⑥ 連絡先ゼロの個人事業主' AS 区分,
       c.company_code AS 事業者コード, c.name AS 事業者名,
       c.representative_contact_id AS 事業主, c.created_at AS 作成日時
  FROM companies c
  JOIN corporate_types ct ON ct.id = c.corporate_type_id
 WHERE ct.is_sole_proprietor
   AND c.deleted_at IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM contacts co
      WHERE co.company_id = c.id AND co.deleted_at IS NULL)
 ORDER BY c.created_at;
