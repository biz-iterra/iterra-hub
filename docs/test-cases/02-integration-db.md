# DB 結合テスト仕様（ローカル Supabase）

最終更新: 2026-08-04

対象: ローカル Supabase 上の **DB 関数・トリガー・RLS**。
マイグレーション（`supabase/migrations/` 118 本）の実定義から導出している。
Server Action 層のテストは対象外（システムテスト `03〜07-system-*.md` 側）。

---

## 1. 実行環境と実行方法

> **db reset 後にまず確認すること（2026-08-03 追加）**
> 画面が出ない・REST が 403（`permission denied for table ...`）になる場合、RLS ではなく
> **テーブルレベルの GRANT** を疑う。ローカルスタックの既定は `public` スキーマだけ
> DML 抜きで、マイグレーション `20260803000003_grant_api_roles_on_public.sql` が
> それを補っている。切り分けは次のクエリで、**87（テーブル総数）と一致すれば正常**:
> ```sql
> SELECT count(*) FROM pg_tables WHERE schemaname='public'
>   AND has_table_privilege('authenticated', schemaname||'.'||quote_ident(tablename),'SELECT');
> ```
> `anon` は 0 件が正しい（未ログインで public を読む経路が無いため意図的に付与していない）。

### 1.1 環境

| 項目 | 値 |
|---|---|
| API (REST) | `http://127.0.0.1:54331` |
| DB 直結 | `postgresql://postgres:postgres@127.0.0.1:54332/postgres` |
| Studio | `http://127.0.0.1:54333` |
| 初期化 | `npx supabase db reset`（全マイグレーション適用 + `config.toml` の `db.seed.sql_paths` に従い seed 投入） |

`db reset` 後の初期データ（テストの前提）:

- `01-masters.sql` … 業務マスタ（pipeline_types `b0…01`=営業 / `b0…02`=仕入れ / `b0…03`=業務委託、account_statuses `c0…01`=アクティブ、company_statuses `e1…01`=未確認(unverified)、contact_statuses アクティブ/休眠/退職、lead_score_thresholds hot80+/warm50-79/cold0-49 ほか）
- `02-dev-users.sql` … テストユーザー 6 名（下表）
- `03-dev-samples.sql` … サンプル取引データ
- `04-leads.sql` … リード実業務データ 3,008 件（**件数を数えるテストはこの母数に注意**）

| ロール | UUID | email |
|---|---|---|
| admin | `a0000000-0000-0000-0000-000000000001` | admin@iterra.jp |
| manager | `a0000000-0000-0000-0000-000000000002` | manager@iterra.jp |
| member | `a0000000-0000-0000-0000-000000000003` | member@iterra.jp |
| member（2人目） | `a0000000-0000-0000-0000-000000000010` | ogawa@iterra.jp |

**事前データを直接 INSERT するときの必須列**（2026-08-03 追加。以下を省くと NOT NULL / CHECK で落ちる）:

| テーブル | 省略できない列 | 値の引き方 |
|---|---|---|
| `companies` | `company_status_id` | `(SELECT id FROM company_statuses WHERE code='unverified' AND deleted_at IS NULL)` |
| `contacts` | `contact_status_id` | `(SELECT id FROM contact_statuses WHERE name='アクティブ' AND deleted_at IS NULL)` |
| `leads` | `stage_id` | `(SELECT id FROM lead_stages WHERE deleted_at IS NULL ORDER BY sort_order LIMIT 1)` |
| `deals` | `name` / `pipeline_type_id` / `deal_stage_id` / `deal_status_id` | 同上の要領で sort_order 最小を引く |
| `lead_activities` | `call_number` / `call_status_id` / `called_on` / `caller_user_id` | — |
| `lead_sources` | `slug`（`^[a-z][a-z0-9_]{0,31}$`） | ハイフン不可。`score_test` のように `_` を使う |
| `lead_company_sizes` / `lead_temperatures` / `lead_statuses` | `code`（同上の形式） | 同上 |
| `pipeline_types` | `slug` | 同上 |

**ステータス系マスタの id を UUID 直書きしない。** `company_statuses` はマイグレーションで
`gen_random_uuid()` により作られるため環境ごとに値が違う（実装も `code='unverified'` で引いている）。
`b0…01`（pipeline_types）のように seed で固定 UUID を与えているものだけ直書きしてよい。

### 1.2 SQL の実行方法

psql が入っていなければ Supabase CLI のコンテナ経由で実行する:

```bash
# 直接
psql "postgresql://postgres:postgres@127.0.0.1:54332/postgres" -f test.sql

# コンテナ経由（コンテナ名は docker ps で確認。supabase_db_iterra-hub）
docker exec -i supabase_db_iterra-hub psql -U postgres -d postgres < test.sql
```

### 1.3 ロール別実行の方法設計（RLS テスト）

RLS は「anon キー + ユーザー JWT」で REST を叩かなくても、**psql 上でロールと JWT クレームを偽装**すれば検証できる。`auth.uid()` は `request.jwt.claims` の `sub` を読むため、以下の形をテストの標準とする:

```sql
BEGIN;
-- ① 事前データは postgres（superuser・RLS 素通し）のまま作る
INSERT INTO ...;

-- ② ロールを偽装（member の例）
SELECT set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
SET LOCAL role authenticated;

-- ③ 検証クエリ
SELECT ...;

-- ④ 後片付け（SET LOCAL / set_config(…, true) はロールバックで消える）
ROLLBACK;
```

- 別ロールに切り替えるときは `RESET role;` してから `set_config` → `SET LOCAL role authenticated` をやり直す
- 未認証（anon）を試すときは `SET LOCAL role anon;`（claims 不要）
- `auth.uid()` が NULL の経路（service_role / SQL 直接操作）を試すときは claims を設定せず postgres のまま実行する
- **各テストは必ず BEGIN〜ROLLBACK で囲む**。seed（リード 3,008 件等）を汚さないため
- 期待値の「エラー」は SQLSTATE `42501`（RLS 違反）または「0 行」。SELECT/UPDATE/DELETE の不可視は **エラーにならず 0 行**になる点に注意（INSERT のみ 42501 で失敗する）

---

## 2. DB オブジェクト一覧

### 2.1 関数（同名関数は CREATE OR REPLACE で上書きされるため「最終定義」が正）

| 関数 | 最終定義マイグレーション | 概要 |
|---|---|---|
| `update_updated_at()` | 20260416040013 | BEFORE UPDATE で `updated_at = NOW()` |
| `generate_company_code()` ほか account/contact/deal/contract | 20260416040013 | MAX+1 で CMP-/ACC-/CNT-/DL-/CTR- 6桁採番 |
| `generate_project_code()` | 20260418000011 | PRJ- 採番 |
| `get_user_role()` / `is_admin()` / `is_manager_or_above()` | 20260416040013 | RLS ヘルパー（SECURITY DEFINER） |
| `purge_soft_deleted_records()` | 20260802000001 | 論理削除の物理パージ（日次 cron） |
| `is_deal_accessible(UUID)` | 20260418000008 | deal 拡張テーブルの RLS 判定 |
| `is_lead_accessible(UUID)` | 20260422000010 | lead 従属の RLS 判定（副担当 lead_owners 込み） |
| `resolve_lead_company_size(NUMERIC, INT)` | 20260422000003 | 資本金優先・従業員数フォールバック |
| `recalculate_lead_score(UUID)` | 20260422000006 | ルール全評価→0-100 クリップ→温度連動→breakdowns 全置換 |
| `recalculate_all_lead_scores()` | 20260422000007 | 週次 pg_cron の全件再計算 |
| `promote_lead_to_deal(...)` | 20260731000006 | Lead→Deal 昇格（Account は作らない） |
| `log_entity_change()` | 20260728000003 | 統一変更履歴トリガー関数（派生値除外） |
| `import_eight_leads(jsonb×4)` | 20260802000007 | Eight 名刺 CSV 取込（名寄せキーを渡す版） |
| `import_inquiry_leads(...)` | 20260802000011 | 問い合わせ取込 |
| `is_free_email_domain(TEXT)` / `normalize_domain(TEXT)` / `upsert_company_domain(...)` | 20260731000002 | ドメイン名寄せ基盤 |
| `expand_corporate_abbreviations(TEXT)` | 20260802000009 | ㈱等の略記展開（旧制度・括弧付き対応） |
| `resolve_corporate_type_id(TEXT)` | 20260802000003 | 名称から法人格を最長一致で決定 |
| `normalize_company_name(TEXT)` | 20260802000003 | 名寄せキー（開いてから法人格を落とす） |
| `normalize_address_key(TEXT×4)` | 20260802000006 | 郵便番号（無ければ都道府県+市区町村）+ 番地数字列 |
| `resolve_or_create_company(9 引数)` | 20260802000006 | 名寄せ: 法人番号 > ドメイン > 住所+名称 > 名称 |
| `resolve_or_create_contact(10 引数)` | 20260801000007 | 名寄せ: メール > 携帯+姓 > 会社×姓名 |
| `phone_line_type` / `is_mobile_phone` / `default_phone_label` | 20260801000007 | 電話番号種別（同定キーは携帯のみ） |
| `ensure_account_on_contract()` | 20260731000008 | 契約時の Account 自動作成 + 区分付与（トリガー関数） |
| `record_business_card` / `apply_business_card_as_current` | 20260801000002 / 20260801000001 | 名刺スナップショット |
| `merge_contacts` / `merge_contacts_preview` | 20260802000001 | 連絡先統合 |
| `contact_merge_candidate_pairs` ほか検出系 | 20260802000002 | 統合候補検出 |
| `set_primary_contact_email/phone` / `promote_next_contact_email/phone` | 20260801000008 | 主連絡先の一意維持 |
| `add_entity_address` / `set_primary_entity_address` / `promote_next_entity_address` / `cleanup_orphan_address` | 20260801000009 | 住所リンクの主一意・孤児掃除 |
| `company_sort_key(TEXT, TEXT)` | 20260802000009 | 一覧並び順（生成列 `companies.sort_key`） |
| `resolve_lead_category` / `set_lead_category` | 20260802000016 / 20260802000013 | デマンドファネルの自動判定（画面の呼び名は改称済み。関数名は据え置き） |
| `lead_kanban_cards` / `lead_progress_summary` | 20260802000018 | かんばん/集計ビュー関数 |
| `record_email_message` / `find_contact_by_email` / `approve_email_contact_candidate` | 20260731000015 / 20260731000012 / 20260731000013 | Gmail 連携 |

### 2.2 トリガー（主要）

| トリガー | テーブル | タイミング | 定義元 |
|---|---|---|---|
| `trg_*_updated_at` | 全マスタ + 主要エンティティ約 40 表 | BEFORE UPDATE | 20260416040013 ほか各テーブル作成時 |
| `trg_companies_generate_code` ほか ×6 | companies/accounts/contacts/deals/contracts/projects | BEFORE INSERT | 20260416040013 / 20260418000011 |
| `trg_contracts_ensure_account` | contracts | AFTER INSERT | 20260731000007（関数は 20260731000008 で差替え） |
| `trg_<table>_change_log` ×9 | companies, accounts, contacts, deals, contracts, talents, projects, leads, campaigns | AFTER INSERT/UPDATE/DELETE | 20260728000002 |
| `trg_leads_company_size_before_insert` / `_update` | leads | BEFORE INSERT / BEFORE UPDATE(WHEN 変化時) | 20260422000003 |
| `trg_leads_set_category` | leads | （カテゴリ自動判定） | 20260802000013 |
| `trg_contact_emails_promote_next` / `trg_contact_phones_promote_next` | contact_emails / contact_phones | AFTER DELETE | 20260801000008 |
| `trg_entity_addresses_cleanup` / `trg_entity_addresses_promote_next` | entity_addresses | AFTER DELETE | 20260801000009 |

pg_cron ジョブ:

| jobname | スケジュール | 実体 | 定義元 |
|---|---|---|---|
| `purge_soft_deleted_records_daily` | `0 3 * * *` (UTC) | `purge_soft_deleted_records()` | 20260417000002 |
| `recalculate_lead_scores_weekly` | `0 18 * * 6` (UTC = JST 日曜 03:00) | `recalculate_all_lead_scores()` | 20260422000007 |

### 2.3 主要 RLS ポリシー（グループ別サマリ）

| テーブル群 | SELECT | INSERT | UPDATE | DELETE | 定義元 |
|---|---|---|---|---|---|
| マスタ全般（pipeline_types 等） | 認証済み全員 | admin | admin | admin | 20260416040013 §3-3 ほか |
| companies / accounts / contacts | **認証済み全員**（2026-08-03 変更） | 認証済み全員 | admin or owner（**manager は他人の行を更新できない**） | admin | 20260803000008 |
| deals | manager以上 or owner | 認証済み全員 | admin or owner | admin | 20260416040013 §3-8 |
| contracts | manager以上 | manager以上 | manager以上 | admin | 20260416040013 §3-9 |
| talents | manager以上 or 親 contact の owner | 認証済み全員 | admin or 親 owner | ポリシーなし（CASCADE） | 20260416040013 §3-10 |
| financial_info | manager以上 | admin | admin | admin | 20260416040013 §3-12 |
| contact_emails / contact_phones / contact_social_accounts / account_contacts / business_cards / entity_addresses / company_domains | **認証済み全員**（2026-08-03 変更） | manager以上 or 親 owner | admin or 親 owner | admin or 親 owner | 20260803000008 |
| talent_skills / talent_careers / deal_services | manager以上 or 親 owner | manager以上 or 親 owner | admin or 親 owner | admin or 親 owner | **20260416040014**（040013 の全許可を差替え） |
| account_roles | 親テーブル準拠 | 親準拠(admin or owner) | UPDATE ポリシーなし | 同左 | 20260731000008 |
| leads | manager以上 or 主担当 or 副担当(lead_owners) | 主担当 or manager以上 | 主担当/副担当/manager以上 | 主担当 or manager以上（**副担当は不可**） | 20260422000010 |
| lead_activities | is_lead_accessible | is_lead_accessible | caller 本人 or manager以上 | admin | 20260419000007 / 20260426000001 |
| entity_change_logs | manager以上 or 自分が changed_by | **ポリシーなし**（トリガーのみが書く） | なし | なし | 20260728000002 |
| 履歴テーブル（deal_stage_histories 等） | 認証済み全員 | 認証済み全員 | なし | なし | 20260416040013 §3-18 |
| crm_users | 認証済み全員 | ポリシーなし | 自分 or admin | admin | 20260416040013 §3-4 |

---

## 3. DB 関数テストケース

すべて `BEGIN; … ROLLBACK;` で実行する。事前データの INSERT は postgres のまま行う。

### 3.1 正規化・判定系（純粋関数）

### IT-01: expand_corporate_abbreviations — 基本略記の展開

- 事前データ: 不要
- 実行:
  ```sql
  SELECT expand_corporate_abbreviations('㈱ワンエイト'),
         expand_corporate_abbreviations('（株）ワンエイト'),
         expand_corporate_abbreviations('ワンエイト(株)'),
         expand_corporate_abbreviations('㈲テスト'),
         expand_corporate_abbreviations('  テスト　商事  '),
         expand_corporate_abbreviations(NULL);
  ```
- 期待結果: `株式会社ワンエイト` / `株式会社ワンエイト` / `ワンエイト株式会社` / `有限会社テスト` / `テスト 商事`（全角空白→半角 1 つ・前後 trim）/ `NULL`

### IT-02: expand_corporate_abbreviations — 複合略記が単独より先に当たる

- 事前データ: 不要
- 実行:
  ```sql
  SELECT expand_corporate_abbreviations('(一般㈶)秋田県建設・工業技術センター'),
         expand_corporate_abbreviations('㈶やまがた産業支援機構'),
         expand_corporate_abbreviations('（社）小石川医師会');
  ```
- 期待結果: `一般財団法人秋田県建設・工業技術センター`（`(一般財団法人)` にならないこと）/ `財団法人やまがた産業支援機構` / `社団法人小石川医師会`

### IT-03: normalize_company_name — 前株・後株・略記・全角英数が同一キーになる

- 事前データ: 不要
- 実行:
  ```sql
  SELECT normalize_company_name('株式会社フロンティア') AS a,
         normalize_company_name('フロンティア株式会社') AS b,
         normalize_company_name('㈱フロンティア')       AS c,
         normalize_company_name('ＡＢＣ商事株式会社')   AS d,
         normalize_company_name('株式会社')             AS e;
  ```
- 期待結果: a = b = c = `フロンティア`。d = `abc商事`（全角→半角 + 小文字化）。e = `NULL`（法人格を落とすと空になるため）

### IT-04: normalize_domain / is_free_email_domain

- 事前データ: 不要
- 実行:
  ```sql
  SELECT normalize_domain('Tanaka@Example.Co.Jp'),
         normalize_domain('https://www.example.co.jp/about?q=1'),
         normalize_domain('WWW.EXAMPLE.CO.JP'),
         normalize_domain(''),
         is_free_email_domain('gmail.com'),
         is_free_email_domain('example.co.jp');
  ```
- 期待結果: 前 3 つはすべて `example.co.jp`、空文字は `NULL`、`gmail.com` → `true`、`example.co.jp` → `false`

### IT-05: normalize_address_key — 丁目番地号とハイフンと全角の同一視

- 事前データ: 不要
- 実行:
  ```sql
  SELECT normalize_address_key('103-0007','東京都','中央区','日本橋浜町2丁目35番4号') AS a,
         normalize_address_key('1030007',NULL,NULL,'日本橋浜町2-35-4日本橋浜町パークビル') AS b,
         normalize_address_key(NULL,'東京都','中央区','日本橋浜町２−３５−４') AS c,
         normalize_address_key('103-0007','東京都','中央区','日本橋浜町') AS d;
  ```
- 期待結果: a = b = `1030007/2-35-4`（郵便番号があれば都道府県・市区町村は含めない）、c = `東京都中央区/2-35-4`、d = `NULL`（番地数字が取れない住所はキーを作らない）

### IT-06: phone_line_type / is_mobile_phone / default_phone_label

- 事前データ: 不要
- 実行:
  ```sql
  SELECT phone_line_type('090-1234-5678'), phone_line_type('05012345678'),
         phone_line_type('0120-000-000'),  phone_line_type('03-1234-5678'),
         phone_line_type('02012345678'),   phone_line_type(''),
         is_mobile_phone('050-1234-5678'),
         default_phone_label('090-1234-5678'),
         default_phone_label('050-1234-5678'),
         default_phone_label('03-1234-5678');
  ```
- 期待結果: `mobile` / `ip` / `toll_free` / `landline` / `other_non_landline` / `unknown`。`is_mobile_phone('050…')` は **false**（050 は共有されうるため同定キーにしない）。ラベルは `mobile` / `other` / `work`

### IT-07: company_sort_key — 法人格除去・フリガナ優先・先頭記号除去

- 事前データ: 不要
- 実行:
  ```sql
  SELECT company_sort_key('株式会社フロンティア', NULL)   AS a,
         company_sort_key('フロンティア株式会社', NULL)   AS b,
         company_sort_key('株式会社青空', 'アオゾラ')     AS c,
         company_sort_key('「あしたのいえ」秋田福祉会', NULL) AS d,
         company_sort_key('㈶やまがた産業支援機構', NULL) AS e;
  ```
- 期待結果: a = b = `フロンティア`（前株・後株が同じ位置に並ぶ）、c = `アオゾラ`（フリガナ優先）、d は先頭の `「` が落ちて `あしたのいえ` から始まる、e = `やまがた産業支援機構`（旧制度の財団法人も落ちる）
- 併せて生成列を確認:
  ```sql
  INSERT INTO companies (name, owner_user_id, company_status_id)
  VALUES ('株式会社ソートキー確認','a0000000-0000-0000-0000-000000000001',
          (SELECT id FROM company_statuses WHERE code='unverified' AND deleted_at IS NULL))
  RETURNING sort_key;   -- → 'ソートキー確認'（company_sort_key(name, name_kana) の STORED 生成列）
  ```
- なお `company_sort_key('「あしたのいえ」秋田福祉会', NULL)` は `あしたのいえ」秋田福祉会` になる。
  落とすのは**先頭**の記号だけで、閉じ括弧は残る（並び順の起点を決めるのが目的のため）

### IT-08: resolve_corporate_type_id — 最長一致

- 事前データ: seed の corporate_types（一般社団法人 / 社団法人 の両方が存在）
- 実行:
  ```sql
  SELECT ct.name FROM corporate_types ct
   WHERE ct.id = resolve_corporate_type_id('一般社団法人テスト協会');
  SELECT ct.name FROM corporate_types ct
   WHERE ct.id = resolve_corporate_type_id('社団法人テスト会');
  SELECT resolve_corporate_type_id('屋号だけの店');
  ```
- 期待結果: 1 本目 `一般社団法人`（短い `社団法人` に先に当たらない）、2 本目 `社団法人`、3 本目 `NULL`

### 3.2 事業者の名寄せ resolve_or_create_company

共通の呼び出し形（引数は 9 個。末尾 2 つが法人番号と住所）:

```sql
SELECT resolve_or_create_company(
  p_company_name, p_email, p_phone, p_url,
  'a0000000-0000-0000-0000-000000000001'::uuid,  -- owner
  NULL,                                           -- lead_source_id
  'a0000000-0000-0000-0000-000000000001'::uuid,  -- actor
  p_corporate_number, p_address_id);
```

### IT-09: resolve_or_create_company — 法人番号一致は名称不一致でも確定する

- 事前データ:
  ```sql
  INSERT INTO companies (name, corporate_number, owner_user_id)
  VALUES ('株式会社アルファ', '1234567890123', 'a0000000-0000-0000-0000-000000000001')
  RETURNING id;  -- :existing
  ```
- 実行: `p_company_name = 'ベータ商事株式会社'`, `p_corporate_number = '1234567890123'`, 他 NULL
- 期待結果: 戻り値 = `:existing`。companies の行数は増えない。既存行の `name` は `株式会社アルファ` のまま（上書きしない）

### IT-10: resolve_or_create_company — 13 桁でない法人番号は無視される

- 事前データ: IT-09 と同じ既存 1 社
- 実行: `p_company_name = '株式会社ガンマ'`, `p_corporate_number = '123'`（3 桁）
- 期待結果: 番号照合はスキップされ、名称でも一致しないため**新規作成**。新規行の `corporate_number IS NULL`（不正な桁は保存もしない）

### IT-11: resolve_or_create_company — ドメイン一致（名称が違っても寄る）

- 事前データ:
  ```sql
  INSERT INTO companies (name, owner_user_id) VALUES ('株式会社アルファ', 'a0000000-0000-0000-0000-000000000001') RETURNING id; -- :existing
  INSERT INTO company_domains (company_id, domain, is_primary) VALUES (:existing, 'alpha.co.jp', TRUE);
  ```
- 実行: `p_company_name = 'アルファ株式会社 東京支店'`, `p_email = 'tanaka@ALPHA.co.jp'`
- 期待結果: 戻り値 = `:existing`（正規化済みドメインで一致）。新規行なし

### IT-12: resolve_or_create_company — フリーメールは名寄せに使わない

- 事前データ: `株式会社デルタ` 1 社 + その company_domains は無し
- 実行: `p_company_name = '株式会社イプシロン'`, `p_email = 'personal@gmail.com'`
- 期待結果: 別名なので**新規作成**（gmail で寄らない）。`company_domains` に `gmail.com` の行が**作られない**（CHECK `company_domains_not_free_email_check` 以前にコードで除外）

### IT-13: resolve_or_create_company — 住所 + 名称一致（境界: 同名同住所は寄る）

- 事前データ:
  ```sql
  INSERT INTO addresses (postal_code, prefecture, city, address_line1)
  VALUES ('103-0007','東京都','中央区','日本橋浜町2-35-4日本橋浜町パークビル') RETURNING id; -- :addr1
  INSERT INTO companies (name, owner_user_id) VALUES ('株式会社ゼータ', 'a0000000-…01') RETURNING id; -- :existing
  INSERT INTO entity_addresses (address_id, company_id, label, is_primary) VALUES (:addr1, :existing, 'main', TRUE);
  -- 同一地点の別表記
  INSERT INTO addresses (postal_code, prefecture, city, address_line1)
  VALUES ('1030007','東京都','中央区','日本橋浜町２丁目３５番４号') RETURNING id; -- :addr2
  ```
- 実行: `p_company_name = '㈱ゼータ'`（表記ゆれ）, `p_address_id = :addr2`, email/番号 NULL
  ※ 名称一致（IT-15）でも同じ結果になるため、住所段の単独検証には一時的に同名 2 社を作り、住所が新しい方でなく**住所一致の側**を返すことを確認する
- 期待結果: 戻り値 = `:existing`。住所キー `1030007/2-35-4` 同士で一致

### IT-14: resolve_or_create_company — 同住所・別名称は寄せない（雑居ビル）

- 事前データ: IT-13 の `:existing`（株式会社ゼータ + 住所）
- 実行: `p_company_name = '株式会社イータ'`, `p_address_id = :addr2`（同住所）
- 期待結果: **新規作成**（住所だけでは決めない）。戻り値 ≠ `:existing`

### IT-15: resolve_or_create_company — 名称一致（㈱表記ゆれ・最古優先）

- 事前データ:
  ```sql
  INSERT INTO companies (name, owner_user_id, created_at)
  VALUES ('株式会社ワンエイト', 'a0000000-…01', now() - interval '2 day') RETURNING id; -- :older
  INSERT INTO companies (name, owner_user_id) VALUES ('株式会社 ワンエイト', 'a0000000-…01'); -- 空白ゆれの後発
  ```
- 実行: `p_company_name = '㈱ワンエイト'`、他 NULL
- 期待結果: 戻り値 = `:older`（normalize_company_name の同一キーのうち created_at 最古）

### IT-16: resolve_or_create_company — 新規作成時の初期値一式

- 事前データ: なし（既存に一致しない名称で呼ぶ）
- 実行: `p_company_name = '㈱シータ'`, `p_email = 'info@theta.co.jp'`, `p_phone = ' 03-0000-0000 '`, `p_corporate_number = '9876543210123'`, `p_address_id = :addr`（任意の addresses 行）
- 期待結果: 新規 companies 行が 1 件でき、
  - `name = '株式会社シータ'`（略記が開かれて保存される）
  - `corporate_type_id` = corporate_types「株式会社」の id（`resolve_corporate_type_id`）
  - `company_status_id` = `company_statuses` の `code = 'unverified'`（未確認）の id
  - `corporate_number = '9876543210123'`、`phone = '03-0000-0000'`（trim 済み）
  - `company_code ~ '^CMP-[0-9]{6}$'`（採番トリガー）
  - `company_domains` に `(company_id, 'theta.co.jp', is_primary=TRUE)` が 1 件
  - `entity_addresses` に `(address_id=:addr, company_id, label='main', is_primary=TRUE)` が 1 件

### IT-17: resolve_or_create_company — 会社名なしは NULL（作らない）

- 実行: `p_company_name = NULL`（または `'株式会社'` のみ）, `p_email = 'x@somewhere.co.jp'`
- 期待結果: 戻り値 `NULL`。companies / company_domains とも行が増えない

### IT-18: resolve_or_create_company — 論理削除済みと法人番号が衝突したら番号なしで作る

- 事前データ:
  ```sql
  INSERT INTO companies (name, corporate_number, owner_user_id, deleted_at)
  VALUES ('株式会社旧社', '1111111111111', 'a0000000-…01', now());
  ```
- 実行: `p_company_name = '株式会社新社'`, `p_corporate_number = '1111111111111'`
- 期待結果: 名寄せは deleted 行を見ないため新規作成に進み、UNIQUE 衝突を避けて **`corporate_number IS NULL`** で作成される（例外にならないこと）

### 3.3 連絡先の名寄せ resolve_or_create_contact

共通の呼び出し形（10 引数）:

```sql
SELECT resolve_or_create_contact(
  p_company_id, p_last_name, p_first_name, p_department, p_job_title,
  p_email, p_phone,
  'a0000000-…01'::uuid, NULL, 'a0000000-…01'::uuid);
```

### IT-19: resolve_or_create_contact — メール一致（会社が違っても同一人物）

- 事前データ:
  ```sql
  INSERT INTO contacts (last_name, first_name, contact_type, owner_user_id)
  VALUES ('佐藤','太郎','other','a0000000-…01') RETURNING id; -- :c1
  INSERT INTO contact_emails (contact_id, email, is_primary) VALUES (:c1, 'Sato@Example.co.jp', TRUE);
  ```
- 実行: `p_company_id = :別会社`, `p_last_name='佐藤'`, `p_email='sato@example.co.jp'`, `p_phone='03-9999-0000'`
- 期待結果: 戻り値 = `:c1`（大文字小文字を無視して一致）。contacts は増えない。メールは重複追加されない。電話 `03-9999-0000` は**追加**される（既存 phone が無ければ `is_primary=TRUE`, label は `default_phone_label` = `work`）

### IT-20: resolve_or_create_contact — 携帯 + 姓一致（転職を跨ぐ）

- 事前データ: `:c1`（佐藤 / 会社 A 所属）+ `contact_phones (:c1, '090-1111-2222', is_primary TRUE)`
- 実行: `p_company_id = :会社B`, `p_last_name='佐藤'`, `p_first_name='太郎'`, `p_email=NULL`, `p_phone='09011112222'`（ハイフンなし表記）
- 期待結果: 戻り値 = `:c1`（数字列で比較するため表記ゆれを跨いで一致）。`company_id` は**書き換えられない**（会社 A のまま）

### IT-21: resolve_or_create_contact — 050 / 固定電話は同定キーにならない

- 事前データ: `:c1`（佐藤）+ `contact_phones (:c1, '050-1111-2222')`
- 実行: `p_company_id = NULL`, `p_last_name='佐藤'`, `p_phone='050-1111-2222'`, `p_email=NULL`
- 期待結果: **新規 contact が作られる**（050 一致では寄せない）。戻り値 ≠ `:c1`

### IT-22: resolve_or_create_contact — 会社 × 姓名一致

- 事前データ: 会社 `:comp` と `contacts(last_name='鈴木', first_name='一', company_id=:comp, contact_type='employee')` = `:c2`
- 実行: `p_company_id=:comp`, `p_last_name='鈴木'`, `p_first_name='一'`, email/phone NULL
- 期待結果: 戻り値 = `:c2`。同姓同名でも**会社が違えば**新規（`p_company_id=:別会社` で呼び直すと新規 id が返ること）

### IT-23: resolve_or_create_contact — 新規作成時の初期値

- 実行①: `p_company_id = :comp`, `p_last_name='高橋'`, `p_first_name='次郎'`, `p_email='takahashi@x.co.jp'`, `p_phone='090-2222-3333'`
- 実行②: `p_company_id = NULL`, `p_last_name='単独'`
- 期待結果:
  - ①: 新規行 `contact_type='employee'`、`contact_code ~ '^CNT-[0-9]{6}$'`、contact_emails/contact_phones に各 1 件（`is_primary=TRUE`、電話 label = `mobile`）
  - ②: 新規行 `contact_type='other'`（法人に紐付かない名刺は所属不明）
  - `contact_status_id`: `contact_statuses` の **「アクティブ」**（20260803000001 で修正済み）。
    名刺交換した相手は連絡先としては有効で、営業上の進度は lead_statuses が持つという分担のため
- 追加ケース: `contact_statuses` の「アクティブ」を一時的に論理削除して実行すると
  `RAISE EXCEPTION` で失敗すること（非決定的な別ステータスで作られないことの確認。検証後は ROLLBACK する）

### IT-24: resolve_or_create_contact — 姓なしは NULL

- 実行: `p_last_name = '  '`（空白のみ）
- 期待結果: 戻り値 `NULL`。contacts は増えない

### 3.4 Lead → Deal 昇格 promote_lead_to_deal

### IT-25: promote_lead_to_deal — 正常系（取込済み Company/Contact を引き継ぐ・Account は作らない）

- 事前データ（postgres で作成）:
  ```sql
  -- 会社・連絡先・リード
  INSERT INTO companies (name, owner_user_id) VALUES ('株式会社昇格テスト','a0000000-…01') RETURNING id; -- :comp
  INSERT INTO contacts (last_name, contact_type, company_id, owner_user_id)
  VALUES ('昇格','employee',:comp,'a0000000-…01') RETURNING id; -- :cont
  INSERT INTO leads (lead_name, company_id, contact_id, owner_user_id)
  VALUES ('昇格テストリード', :comp, :cont, 'a0000000-…01') RETURNING id; -- :lead
  ```
- 実行（admin の JWT を偽装してから）:
  ```sql
  SELECT set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  SELECT promote_lead_to_deal(
    :lead, NULL, NULL, NULL, NULL, NULL,
    jsonb_build_object(
      'name','昇格テストディール',
      'pipeline_type_id','b0000000-0000-0000-0000-000000000001',
      'deal_stage_id',(SELECT id FROM deal_stages  WHERE deleted_at IS NULL ORDER BY sort_order LIMIT 1),
      'deal_status_id',(SELECT id FROM deal_statuses WHERE deleted_at IS NULL ORDER BY sort_order LIMIT 1),
      'owner_user_id','a0000000-0000-0000-0000-000000000001',
      'created_by','a0000000-0000-0000-0000-000000000001',
      'last_updated_by','a0000000-0000-0000-0000-000000000001'));
  ```
- 期待結果:
  - 戻り値 JSONB: `deal_id` あり、`company_id = :comp`、`contact_id = :cont`、**`account_id = null`**
  - deals 新規行: `account_id IS NULL`、`company_id=:comp`、`contact_id=:cont`、`deal_code ~ '^DL-[0-9]{6}$'`
  - leads: `promoted_deal_id` / `promoted_company_id` / `promoted_contact_id` が設定、`promoted_account_id IS NULL`
  - `deal_stage_histories` 1 件（from NULL → 初期 stage）、`deal_status_histories` 1 件（from NULL → 初期 status）
  - companies: `primary_contact_id` が NULL だった場合 `:cont` が立つ

### IT-26: promote_lead_to_deal — 二重昇格の拒否

- 事前データ: IT-25 実行済みの `:lead`
- 実行: IT-25 と同じ呼び出しをもう一度
- 期待結果: 例外 `このリードはすでに Deal に昇格済みです`。deals は増えない

### IT-27: promote_lead_to_deal — 未認証の拒否

- 実行: JWT claims を設定せず（postgres のまま `auth.uid()` = NULL）呼び出す
- 期待結果: 例外 `認証が必要です`

### 3.5 リードスコアリング

### IT-28: recalculate_lead_score — 加点合算・0-100 クリップ・温度連動・breakdowns 全置換

- 事前データ:
  ```sql
  INSERT INTO lead_sources (name) VALUES ('スコアテスト媒体') RETURNING id; -- :src
  INSERT INTO leads (lead_name, lead_source_id, owner_user_id)
  VALUES ('スコアテスト', :src, 'a0000000-…01') RETURNING id;              -- :lead
  -- lead_score_rules に name 列は無い。ラベルは description に入れる
  INSERT INTO lead_score_rules (category, condition_type, condition_value_id, score_delta, sort_order, description)
  VALUES ('attribute','lead_source',:src, 60, 1, '媒体+60'),
         ('attribute','lead_source',:src, 50, 2, '媒体+50');
  ```
  ※ seed の既定ルールが混ざると合計が変わるので、先に `UPDATE lead_score_rules SET deleted_at = now() WHERE deleted_at IS NULL;` で退避してから入れる
- 実行: `SELECT recalculate_lead_score(:lead);`
- 期待結果:
  - 戻り値 = **100**（60+50=110 をクリップ）
  - `leads.score = 100`、`leads.temperature_id` = hot（threshold 80+）
  - `lead_score_breakdowns` は当該リードで 2 件、`score_delta` は 60 と 50（クリップ前の生値）
  - 続けてルールを 1 本（`score_delta = 5`）に差し替えて再実行 → 戻り値 **5**、temperature = cold、
    breakdowns は**全置換**されて 1 件のみ
- **下方クリップは DB 上到達不能**（2026-08-03 訂正）: `chk_lead_score_rules_score_delta` が
  `score_delta BETWEEN 0 AND 100` を課すため、負の加点ルールはそもそも登録できない。
  `score_delta = -10` を INSERT すると CHECK 違反になることを確認する。
  `recalculate_lead_score` 側の 0 クリップは防御的な実装として残っている

### IT-29: recalculate_lead_score — 参照切れルールはスキップ

- 事前データ: IT-28 の構成 + `UPDATE lead_sources SET deleted_at = now() WHERE id = :src;`
- 実行: `SELECT recalculate_lead_score(:lead);`
- 期待結果: WARNING（`…が参照するマスタが見つかりません`）が出てルールはスキップされ、戻り値 = 0、breakdowns 0 件（例外にならない）

### IT-30: recalculate_all_lead_scores — 全件再計算と cron 登録

- 事前データ: seed 投入済みの状態
- 実行:
  ```sql
  SELECT recalculate_all_lead_scores();
  SELECT jobname, schedule FROM cron.job ORDER BY jobname;
  ```
- 期待結果: 戻り値 = `leads WHERE deleted_at IS NULL` の件数（seed 直後なら 3,008 + テストで増やした分）。cron.job に `purge_soft_deleted_records_daily`(`0 3 * * *`) と `recalculate_lead_scores_weekly`(`0 18 * * 6`) の 2 行

### 3.6 その他の関数

### IT-31: upsert_company_domain — 正規化・他社重複・フリーメール・主切替

- 事前データ: 会社 2 社 `:compA`, `:compB`（owner = admin）。admin の JWT を偽装して実行（SECURITY INVOKER のため RLS が効く）
- 実行と期待結果:
  1. `SELECT upsert_company_domain(:compA, 'https://www.Example.co.jp/about', TRUE);` → `domain='example.co.jp'`, `is_primary=TRUE` の行が返る
  2. `SELECT upsert_company_domain(:compB, 'example.co.jp', FALSE);` → 例外 `[domain] example.co.jp は既に別の法人に登録されています`
  3. `SELECT upsert_company_domain(:compA, 'x@gmail.com', FALSE);` → 例外 `[domain] gmail.com はフリーメールのため…`
  4. `SELECT upsert_company_domain(:compA, 'second.example.jp', TRUE);` → 新ドメインが primary になり、`example.co.jp` の `is_primary` が FALSE に落ちる。部分ユニーク索引 `company_domains_primary_key` に違反しない

### IT-32: resolve_lead_company_size — 資本金優先・従業員数フォールバック

- 事前データ:
  ```sql
  INSERT INTO lead_company_sizes (name, min_capital, max_capital, min_employees, max_employees, sort_order)
  VALUES ('小', NULL, 9999999, NULL, 49, 1),
         ('大', 10000000, NULL, 50, NULL, 2);
  ```
- 実行:
  ```sql
  SELECT resolve_lead_company_size(50000000, 10),  -- 資本金は大・従業員は小
         resolve_lead_company_size(NULL, 100),     -- 従業員フォールバック
         resolve_lead_company_size(NULL, NULL);
  ```
- 期待結果: 1 本目 =「大」の id（**資本金優先**、従業員数は見ない）、2 本目 =「大」の id、3 本目 = NULL

---

## 4. トリガーテストケース

### IT-33: update_updated_at — BEFORE UPDATE で updated_at が進む

- 事前データ: 任意の companies 1 行（`:comp`、`updated_at` を控える）
- 実行: **別トランザクションで**（`NOW()` はトランザクション開始時刻で固定されるため）`UPDATE companies SET name = name || '改' WHERE id = :comp;`
- 期待結果: `updated_at` が更新前より大きい。※楽観ロック（Server Action の `expected_updated_at`）はこの値を WHERE に使うため、**同一トランザクション内の連続 UPDATE では updated_at が進まない**ことも確認しておく（NOW() が同値）

### IT-34: 自動採番 — 形式・連番・クライアント指定値の上書き

- 事前データ: 現在の最大値 `SELECT MAX(company_code) FROM companies;` を控える（= CMP-*N*）
- 実行:
  ```sql
  INSERT INTO companies (name, company_code, owner_user_id)
  VALUES ('採番テスト1', 'CMP-999999', 'a0000000-…01') RETURNING company_code;
  INSERT INTO companies (name, owner_user_id) VALUES ('採番テスト2', 'a0000000-…01') RETURNING company_code;
  ```
- 期待結果: 1 件目は `CMP-999999` **ではなく** CMP-*N+1*（BEFORE INSERT トリガーが無条件に上書き）、2 件目は CMP-*N+2*。accounts(ACC-)/contacts(CNT-)/contracts(CTR-)/projects(PRJ-) も同形式、deals のみ `DL-`（プレフィックス 3 文字）
- 備考: MAX+1 方式のため**並列 INSERT では一意制約違反が起こりうる**（§7 懸念 2）。単一接続の順次 INSERT で検証する

### IT-35: 自動採番 — 論理削除は欠番にならない

- 実行: companies を 1 件 INSERT（CMP-*M*）→ `UPDATE companies SET deleted_at = now()` で論理削除 → さらに 1 件 INSERT
- 期待結果: 新しい行は CMP-*M+1*（論理削除行も MAX 計算に含まれ、番号は再利用されない）

### IT-36: trg_contracts_ensure_account — 法人 Account の自動作成

- 事前データ（postgres）: IT-25 の要領で `:comp`（法人）・`:cont`・deals 行（`account_id NULL`, `company_id=:comp`, `contact_id=:cont`, `pipeline_type_id = b0…01 営業`, `owner_user_id = manager`）= `:deal`
- 実行（manager の JWT を偽装。contracts は manager 以上のみ INSERT 可）:
  ```sql
  INSERT INTO contracts (deal_id, registered_by, created_by)
  VALUES (:deal, 'a0000000-…02', 'a0000000-…02') RETURNING id, contract_code;
  ```
- 期待結果（AFTER INSERT・同一トランザクション内で）:
  - accounts に 1 行: `name = '株式会社昇格テスト'`（法人名優先）、`company_id = :comp`、`account_type_id` = slug `corporate`、`account_status_id = c0000000-…01`（アクティブ）、`owner_user_id` = deal の owner、`account_code ~ '^ACC-[0-9]{6}$'`
  - `account_contacts` に `(account, :cont, role='primary')` 1 行
  - `deals.account_id` が新 Account に更新される
  - 昇格元リードがあれば `leads.promoted_account_id` も埋まる
  - `account_roles` に `(account, role_type=customer, assigned_by_contract=TRUE)` 1 行（営業パイプライン → 顧客）
  - `contract_code ~ '^CTR-[0-9]{6}$'`

### IT-37: trg_contracts_ensure_account — 個人 Account（company なし）

- 事前データ: contacts のみ（`last_name='個人', first_name='太郎'`）に紐づく deals（`company_id NULL`, `contact_id=:cont`）
- 実行: IT-36 と同様に contracts INSERT
- 期待結果: accounts の `name = '個人 太郎'`（姓 + 半角空白 + 名）、`company_id IS NULL`、`account_type_id` = slug `sole_proprietor`。account_contacts に primary 行

### IT-38: trg_contracts_ensure_account — 既に Account がある場合は重複作成しない

- 事前データ: IT-36 実行後の `:deal`（account_id 設定済み）
- 実行: 同じ `:deal` にもう 1 本 contracts を INSERT
- 期待結果: accounts の行数が**増えない**。`account_roles` も同区分は `ON CONFLICT DO NOTHING` で増えない（1 行のまま）

### IT-39: trg_contracts_ensure_account — 別パイプラインの契約で区分が積み増される

- 事前データ: IT-36 の Account を持つ会社に対し、`pipeline_type_id = b0…02（仕入れ）`・`account_id = :account` の deals をもう 1 本作る
- 実行: その deal に contracts を INSERT
- 期待結果: `account_roles` が 2 行になる（`customer` + `supplier`、いずれも `assigned_by_contract=TRUE`）。「顧客 + 仕入れ先」の同時保持

### IT-40: log_entity_change — INSERT の記録（_row 全体 + changed_by）

- 実行（admin JWT を偽装して companies を INSERT）:
  ```sql
  SELECT set_config('request.jwt.claims','{"sub":"a0000000-…01","role":"authenticated"}', true);
  SET LOCAL role authenticated;
  INSERT INTO companies (name, owner_user_id) VALUES ('履歴テスト','a0000000-…01') RETURNING id; -- :comp
  ```
- 期待結果: `entity_change_logs` に `table_name='companies'`, `record_id=:comp`, `operation='INSERT'`, `changed_fields ? '_row'`（行全体の JSON）, `changed_by = 'a0000000-…01'` の 1 行

### IT-41: log_entity_change — UPDATE は変化した列だけ・監査列除外・空打ちは記録なし

- 事前データ: IT-40 の `:comp`
- 実行:
  1. `UPDATE companies SET name = '履歴テスト2', phone = '03-1111-2222' WHERE id = :comp;`
  2. `UPDATE companies SET name = name WHERE id = :comp;`（実質変更なし）
- 期待結果:
  1. `operation='UPDATE'` 1 行。`changed_fields` のキーは `name` と `phone` のみ（各 `{"old":…,"new":…}`）。**`updated_at` / `last_updated_by` は含まれない**
  2. 追加の記録なし（updated_at はトリガーで変わるが ignored のため「実質変更なし」と判定）

### IT-42: log_entity_change — スコア派生値のみの UPDATE は記録されない（20260728000003）

- 事前データ: leads 1 件 `:lead` と現在の `entity_change_logs` 件数
- 実行: `SELECT recalculate_lead_score(:lead);`（score / temperature_id / score_updated_at のみ変わる）
- 期待結果: `entity_change_logs` の件数が**増えない**。`UPDATE leads SET memo = …`（通常カラム）では増えることも対で確認

### IT-43: log_entity_change — DELETE の記録と changed_by NULL（セッションなし経路）

- 実行: postgres のまま（JWT なし）`DELETE FROM companies WHERE id = :comp;`
- 期待結果: `operation='DELETE'`、`changed_fields->'_row'` に削除前の行、**`changed_by IS NULL`**（SQL 直接操作・service_role 経由を示す）

### IT-44: trg_leads_set_company_size — 手動入力を無視して自動判定

- 事前データ: IT-32 の lead_company_sizes（小/大）
- 実行:
  ```sql
  INSERT INTO leads (lead_name, capital, employee_count, company_size_id, owner_user_id)
  VALUES ('規模テスト', 50000000, NULL, NULL, 'a0000000-…01') RETURNING company_size_id; -- 「大」になる
  UPDATE leads SET capital = 1000000 WHERE lead_name = '規模テスト' RETURNING company_size_id; -- 「小」に変わる
  UPDATE leads SET company_size_id = (小のid) WHERE lead_name = '規模テスト' RETURNING company_size_id;
  ```
- 期待結果: INSERT 時に「大」。capital 変更で「小」へ再判定。3 本目のように company_size_id を直接書いても WHEN 句でトリガーが発火し `resolve_lead_company_size(capital, employee_count)` の結果に**上書きされる**（手動入力不可）

### IT-45: promote_next_contact_email / phone — 主連絡先の繰り上げと一意保証

- 事前データ:
  ```sql
  INSERT INTO contacts (last_name, contact_type, owner_user_id) VALUES ('主連絡','other','a0000000-…01') RETURNING id; -- :c
  INSERT INTO contact_emails (contact_id, email, is_primary, created_at) VALUES
    (:c,'first@x.jp', TRUE,  now() - interval '2 min'),
    (:c,'second@x.jp',FALSE, now() - interval '1 min');
  ```
- 実行と期待結果:
  1. `INSERT INTO contact_emails (contact_id, email, is_primary) VALUES (:c,'third@x.jp',TRUE);` → 一意索引 `uq_contact_emails_primary` 違反（主は同時に 2 つ持てない）
  2. `SELECT set_primary_contact_email((second の id));` → first が FALSE、second が TRUE（落としてから立てるため違反しない）
  3. `DELETE FROM contact_emails WHERE email='second@x.jp';`（主を削除）→ AFTER DELETE トリガーで **created_at 最古の first が `is_primary=TRUE` に繰り上がる**
  4. contact_phones でも同じ 3 手順が成立する

---

## 5. RLS テストケース

前提: §1.3 の偽装手順。特記なき場合、事前データは postgres で `RLS-` プレフィックスの名前を付けて作成し、検証クエリは `WHERE name LIKE 'RLS-%'` 等で seed データと分離する。

共通の事前データ（各ケースで再利用）:

```sql
INSERT INTO companies (name, owner_user_id) VALUES
  ('RLS-C1', 'a0000000-0000-0000-0000-000000000003'),  -- member 所有
  ('RLS-C2', 'a0000000-0000-0000-0000-000000000002');  -- manager 所有
```

### IT-RLS-01: companies × member — SELECT は全件（2026-08-03 変更）

- 実行ロール: member（a0…03）
- 対象データ: RLS-C1（自分）/ RLS-C2（他人）
- 期待: `SELECT name FROM companies WHERE name LIKE 'RLS-%'` → **2 行とも見える**
- 背景: 他の担当者の取引先にディールを起こせないと業務が回らないため、
  20260803000008 で参照だけを認証済み全員に広げた。**書き込みの範囲は変えていない**
  （他人の行の UPDATE / DELETE が 0 行であることは IT-RLS-04 で担保する）

### IT-RLS-02: companies × manager — SELECT は全件・UPDATE は他人の行に効かない

- 実行ロール: manager（a0…02）
- 期待: SELECT は RLS-C1 / RLS-C2 の 2 行とも可視。`UPDATE companies SET phone='1' WHERE name='RLS-C1'` は **0 行**（update ポリシーは `is_admin() OR owner` であり、manager は閲覧できても他人の行を更新できない）。RLS-C2（自分の行）は 1 行更新できる

### IT-RLS-03: companies × admin — UPDATE / DELETE 全件可

- 実行ロール: admin（a0…01）
- 期待: RLS-C1 への UPDATE = 1 行。DELETE も 1 行（物理 DELETE は運用では禁止だがポリシー上は admin 可。entity_change_logs に DELETE が記録される）

### IT-RLS-04: companies × member — 他人の行は UPDATE 0 行・INSERT は全員可

- 実行ロール: member
- 期待: `UPDATE … WHERE name='RLS-C2'` → 0 行（エラーにならない点に注意）。`INSERT INTO companies (name, owner_user_id) VALUES ('RLS-C3','a0000000-…03')` → 成功（INSERT ポリシーは `WITH CHECK (true)`）。DELETE → 0 行（admin のみ）

### IT-RLS-05: accounts / contacts / deals × 各ロール

- 事前データ: owner を member にした accounts / contacts / deals（deals は `deals_counterparty_check` を満たすため `company_id` に RLS-C1 を設定）各 1 行 + owner を manager にした各 1 行
- 期待（2026-08-03 更新）:
  - **accounts / contacts**: member SELECT = **2 行とも**（companies と同じく参照は全員可）
  - **deals**: member SELECT = **自分の 1 行のみ**（営業の担当分離のため広げていない）
  - manager SELECT = 3 テーブルとも全件。他人行 UPDATE は 0 行 / admin は UPDATE・DELETE 可

### IT-RLS-06: contracts × member — 全操作不可

- 事前データ: manager で作成した契約 1 件（IT-36 相当）
- 実行ロール: member
- 期待: SELECT → **0 行**（存在しても不可視）。INSERT → **SQLSTATE 42501**。UPDATE / DELETE → 0 行

### IT-RLS-07: contracts × manager — SELECT/INSERT/UPDATE 可・DELETE 不可

- 実行ロール: manager
- 期待: SELECT 可視、INSERT 成功（IT-36 のトリガーも発火する）、UPDATE 1 行、DELETE → **0 行**（admin のみ）

### IT-RLS-08: financial_info × 各ロール

- 事前データ（postgres）: `INSERT INTO financial_info (company_id, bank_name) VALUES (:RLS-C1のid, 'テスト銀行');`
- 期待:
  - member: SELECT → 0 行（自分が owner の会社の口座でも**見えない**。SELECT は manager 以上のみ）
  - manager: SELECT → 1 行。INSERT → 42501（CUD は admin のみ）
  - admin: SELECT / INSERT / UPDATE / DELETE すべて可

### IT-RLS-09: マスタ（pipeline_types）× member / admin

- 実行ロール・期待:
  - member: `SELECT count(*) FROM pipeline_types` ≥ 3（閲覧可）。`INSERT INTO pipeline_types (name) VALUES ('RLS-PT')` → **42501**。UPDATE / DELETE → 0 行
  - admin: INSERT / UPDATE / DELETE すべて可

### IT-RLS-10: contact_emails（従属テーブル）× member / manager

- 事前データ: member 所有の contact `:cm`（email 1 件付き）と manager 所有の contact `:cg`（email 1 件付き）
- 期待（2026-08-03 更新）:
  - member: `:cm` の email は SELECT / INSERT / UPDATE / DELETE 可。
    `:cg` の email は **SELECT 可**（参照は全員に広げた）だが **INSERT は 42501**
  - manager: 両方 SELECT 可・INSERT 可（insert は `is_manager_or_above()` で許可）。ただし `:cm` の email への **UPDATE / DELETE は 0 行**（update/delete は `is_admin() OR 親owner`）

### IT-RLS-11: leads × member — 主担当・副担当の可視性

- 事前データ: owner = manager のリード `:ld`
- 実行ロール: member
- 期待: SELECT → 0 行。postgres で `INSERT INTO lead_owners (lead_id, user_id) VALUES (:ld, 'a0000000-…03');` 後に再実行 → **1 行可視**になり UPDATE も 1 行通る（副担当は select/update 可）

### IT-RLS-12: leads × 副担当 — DELETE は不可

- 事前データ: IT-RLS-11 の状態（member は副担当）
- 期待: member の `DELETE FROM leads WHERE id = :ld` → **0 行**（delete ポリシーは主担当 or manager 以上のみ。副担当は含まれない）

### IT-RLS-13: lead_activities × member — UPDATE は caller 本人のみ / DELETE は admin のみ

- 事前データ: `:ld`（owner = member a0…03、副担当に a0…10 を追加）に `lead_activities (lead_id, caller_user_id = a0…03, …)` 1 件
- 期待:
  - a0…03（caller 本人）: UPDATE 1 行
  - a0…10（副担当だが caller でない）: SELECT は可視（`is_lead_accessible`）だが UPDATE → 0 行
  - manager: UPDATE 1 行 / member の DELETE → 0 行、admin の DELETE → 1 行

### IT-RLS-14: entity_change_logs × member / manager — 自分の変更のみ・直接 INSERT 不可

- 事前データ: member の JWT で companies を 1 件 INSERT（→ changed_by = a0…03 のログ）、admin の JWT で 1 件 INSERT（→ changed_by = a0…01）
- 期待:
  - member: `SELECT count(*) FROM entity_change_logs WHERE changed_by = 'a0000000-…01'` → 0（他人の分は不可視）、自分の分は可視
  - member / manager とも `INSERT INTO entity_change_logs …` → **42501**（INSERT ポリシー自体が無い。記録は SECURITY DEFINER トリガーのみ）
  - manager: 全件可視
  - UPDATE / DELETE はどのロールでも 0 行（改ざん不可）

### IT-RLS-15: 履歴テーブル（deal_stage_histories）— INSERT ONLY

- 事前データ: IT-25 で作られた履歴行
- 実行ロール: admin（最強ロールでも不可であることを見る）
- 期待: SELECT / INSERT 可。**UPDATE → 0 行、DELETE → 0 行**（ポリシーが存在しない）

### IT-RLS-16: company_domains × member — 親 companies 準拠

- 事前データ: RLS-C1（member 所有・domain 1 件）、RLS-C2（manager 所有・domain 1 件）
- 実行ロール: member
- 期待（2026-08-03 更新）: RLS-C1 の domain は SELECT / INSERT / UPDATE / DELETE 可。
  RLS-C2 の domain は **SELECT 可**（参照は全員）だが **INSERT は 42501**

### IT-RLS-17: crm_users — 全員閲覧・自分のみ更新・INSERT 不可

- 実行ロール: member
- 期待: `SELECT count(*) FROM crm_users` = 全ユーザー数（6+）。自分の行の UPDATE（full_name 変更）→ 1 行。他人の行 → 0 行。`INSERT INTO crm_users …` → **42501**（INSERT ポリシーなし。ユーザー作成は auth 連携で行う）。admin は他人の行も UPDATE 可

### IT-RLS-18: account_roles — 親 accounts 準拠・UPDATE ポリシーなし

- 事前データ: member 所有の account + account_roles 1 行
- 期待: member は SELECT / INSERT / DELETE 可（自分の account）。**UPDATE はどのロールでも 0 行**（区分の付け替えは削除 + 追加で行う設計）。他人の account の role は member から不可視

### IT-RLS-19: talents × member — 親 contact の owner に従う

- 事前データ: member 所有 contact に talents 1 行、manager 所有 contact に talents 1 行
- 実行ロール: member
- 期待: 自分の contact の talent のみ SELECT / UPDATE 可。他方は SELECT 0 行

### IT-RLS-21: ビュー経由でも RLS が効く（2026-08-03 追加）

- 背景: `v_leads_with_category` に `security_invoker` が付いておらず、**ビュー越しでは RLS が
  完全にバイパスされていた**（member から基底テーブルは 0 件なのにビューは 3,008 件）。
  `/leads` 一覧はこのビューを読むため、member が担当外リードを全件閲覧できていた
- 実行ロール: member（a0…03。leads の主担当でも副担当でもない）
- 実行:
  ```sql
  SELECT count(*) FROM leads;                  -- 基底テーブル
  SELECT count(*) FROM v_leads_with_category;  -- ビュー
  ```
- 期待: **両者が一致する**（この構成では 0 件）。小川（a0…10、2,758 件担当）で 2,758、
  manager で全件になることも併せて見る
- 併せて確認: RLS のあるテーブルを読むビューすべてに `security_invoker=true` が付いていること
  ```sql
  SELECT c.relname, c.reloptions FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind='v';
  ```
  → 全ビューの `reloptions` に `security_invoker=true` が含まれること

### IT-RLS-20: 未認証（anon）— 全テーブル不可視

- 実行ロール: `SET LOCAL role anon;`（claims なし）
- 期待: `SELECT count(*) FROM companies / leads / pipeline_types / crm_users` すべて
  **SQLSTATE 42501（permission denied）**。0 行ではない（2026-08-03 訂正）。
  anon には `public` スキーマのテーブル GRANT を与えていないため、RLS 以前に権限で弾かれる（§1 冒頭）。
  ポリシーが `TO authenticated` であることに加えた二重の防御になっている

### IT-RLS-22: 述語の InitPlan 化で可視範囲が変わらない

（`feat/list-ux` 側では IT-RLS-21 として起票されていたが、
`v_leads_with_category` の検証と番号が衝突したため 22 に振り直した。2026-08-04）

- 対象: マイグレーション `20260803000021`（`auth.uid()` / `is_admin()` /
  `is_manager_or_above()` をスカラーサブクエリで包む変更）
- 背景: 裸で書くと行ごとに関数が呼ばれ、leads 3,008 件の一覧に 154ms かかっていた。
  包むと InitPlan になりクエリ全体で 1 回になる（実測 1.76ms）。**結果は変わらない前提**
  なので、可視範囲が 1 件も変わらないことを毎回確かめる
- 手順:
  1. 全 `crm_users` × 主要テーブル（leads / contacts / companies / accounts / deals /
     contracts / projects / campaigns / talents / financial_info / lead_activities）で
     `SELECT count(*)` を取り、ロール・ユーザー・テーブル・件数の一覧を作る
  2. マイグレーションを適用する
  3. 同じ一覧を取り直して差分を取る
- 期待結果:
  - 差分ゼロ。特に member は自分が担当するリードだけ（`lead_owners` の副担当分を含む）
  - `pg_policies` に裸の `auth.uid()` / `is_admin()` / `is_manager_or_above()` が
    1 件も残らない（マイグレーション内の検証が失敗すれば適用ごと失敗する）
- 自動化区分: 自動(API)（psql スクリプト）

---

### IT-PERF-01: 一括処理の関数に実行時間の制限が設定されている（2026-08-04 追加）

- 対象: マイグレーション `20260804000001`
- 背景: **PostgREST は `authenticator` ロールで接続してから `SET ROLE service_role` する。**
  そのため service_role で呼んでも `authenticator` の `statement_timeout = 8s` が効き、
  RLS 回避のために `createAdminClient()` へ切り替えても 8 秒の壁は消えない。
  本番の名刺取込が `canceling statement due to statement timeout` で失敗した（2026-08-04）
- 手順・期待:

```sql
-- 1. ロール側の設定は変えていないこと（通常のクエリは 8 秒で止まってほしい）
SELECT rolname, rolconfig FROM pg_roles
 WHERE rolname IN ('authenticated','anon','service_role','authenticator');
--   authenticated = 8s / anon = 3s / authenticator = 8s のまま

-- 2. 一括処理の関数にだけ制限が入っていること
SELECT proname, array_to_string(proconfig, ', ')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND array_to_string(proconfig, ',') LIKE '%statement_timeout%'
 ORDER BY 1;
--   detect_all_contact_merge_candidates  600s
--   import_eight_leads                   240s
--   import_inquiry_leads                 120s
--   recalculate_all_lead_scores          600s
--   recalculate_lead_scores_for_batch    120s
```

- **`search_path` が消えていないこと**もあわせて見る（`ALTER FUNCTION ... SET` は
  既存の設定に追加する形だが、書き方を誤ると失われる）
- 注意: Supabase の HTTP 層（Kong / PostgREST）には別のタイムアウトがあり、
  ここでの引き上げは「8 秒の壁」を外すもの。1 リクエストが極端に長くなる規模には
  取込側の分割が要る
- 自動化区分: SQL 検証

### IT-JOB-01: 名刺取込がジョブ方式で完了する（2026-08-04 追加）

- 対象: マイグレーション `20260804000002`（`lead_import_jobs` / `process_lead_import_jobs`）
- 背景: 取込を HTTP リクエストの外へ出した経緯は `docs/lead-import-eight.md` §6
- 手順・期待:

```sql
-- 1. cron に登録されていること
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'process_lead_import_jobs';
--   '* * * * *' / active = t

-- 2. 投入直後は queued（画面から取り込むか、payload を直接入れる）
SELECT status, attempts, started_at FROM lead_import_jobs ORDER BY requested_at DESC LIMIT 1;
--   queued / 0 / NULL

-- 3. ワーカーを手で 1 回動かす（cron を待たずに検証する）
SELECT process_lead_import_jobs();   --> 1（処理した件数）

-- 4. 完了していること
SELECT status, attempts, created_count, card_count, error_message
  FROM lead_import_jobs ORDER BY requested_at DESC LIMIT 1;
--   succeeded / 1 / 取込件数 / 名刺枚数 / NULL

-- 5. 待ちが無ければ 0 を返すこと（空振りしても落ちない）
SELECT process_lead_import_jobs();   --> 0
```

- **失敗時に中途半端な取込を残さないこと**: `payload` を壊した状態で実行し、
  `status = 'failed'` かつ `error_message` が入り、**leads が増えていない**ことを確認する
  （ワーカーの EXCEPTION ブロックが取込分を巻き戻す）
- **多重起動しても二重処理しないこと**: 2 つのセッションで同時に
  `process_lead_import_jobs()` を呼び、片方が 0 を返す（`FOR UPDATE SKIP LOCKED`）
- RLS: member / manager から `lead_import_jobs` が 0 件に見えること。
  **UPDATE ポリシーが無い**ため admin でも状態を書き換えられないこと
- 自動化区分: SQL 検証

### IT-JOB-02: 統合候補の一括検出と全 Lead スコア再計算がジョブ方式で完了する（2026-08-09 追加、T-0020）

- 対象: マイグレーション `20260809100001`（`admin_bulk_jobs` / `process_admin_bulk_jobs`）
- 背景: `lead_import_jobs` と同じ理由（`docs/database-design.md` §27）。この 2 つは
  入力を持たない「全件を洗い直すだけ」の操作なので 1 つの表を `job_type` で共有する
- 手順・期待:

```sql
-- 1. cron に登録されていること
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'process_admin_bulk_jobs';
--   '* * * * *' / active = t

-- 2. 統合候補の検出（manager が投入したことにする）
INSERT INTO admin_bulk_jobs (job_type, requested_by)
VALUES ('contact_merge_detection', '<manager の crm_users.id>')
RETURNING id, status, attempts;
--   queued / 0

SELECT process_admin_bulk_jobs();   --> 1（処理した件数）

SELECT status, attempts, result_count, error_message
  FROM admin_bulk_jobs WHERE job_type = 'contact_merge_detection'
 ORDER BY requested_at DESC LIMIT 1;
--   succeeded / 1 / 新規候補件数 / NULL

-- 3. 全 Lead スコア再計算（admin が投入したことにする）
INSERT INTO admin_bulk_jobs (job_type, requested_by)
VALUES ('lead_score_recalc', '<admin の crm_users.id>')
RETURNING id;

SELECT process_admin_bulk_jobs();   --> 1

SELECT status, result_count FROM admin_bulk_jobs
 WHERE job_type = 'lead_score_recalc' ORDER BY requested_at DESC LIMIT 1;
--   succeeded / Lead の総件数

-- 4. 待ちが無ければ 0 を返すこと（空振りしても落ちない）
SELECT process_admin_bulk_jobs();   --> 0
```

- **ワーカーは判定を持たない内側の関数を直接呼ぶこと**: `record_contact_merge_candidates(NULL)` /
  `recalculate_all_lead_scores()`。`detect_all_contact_merge_candidates()` を経由すると
  cron 実行には `auth.uid()` が無く `is_manager_or_above()` の判定が意図通りに働かないため、
  ワーカーからは呼ばない（§27.3）
- 失敗時は `status = 'failed'` かつ `error_message` に原文が入ること（`record_contact_merge_candidates`
  を一時的に壊すなどして確認）
- **多重起動しても二重処理しないこと**: 2 つのセッションで同時に `process_admin_bulk_jobs()` を呼び、
  片方が 0 を返す（`FOR UPDATE SKIP LOCKED`）
- RLS: `contact_merge_detection` は member から 0 件に見え、`lead_score_recalc` は
  manager からも 0 件に見えること（admin のみ）。**UPDATE ポリシーが無い**ため
  admin でも状態を書き換えられないこと
- 自動化区分: SQL 検証

### IT-FREEE-01: freee 取引先の取込と自動紐付け（2026-08-04 追加）

- 対象: マイグレーション `20260805000001`（`upsert_freee_partners`）
- 背景: 自動で紐付けてよいのは**インボイス登録番号の一致だけ**という設計判断
  （`docs/database-design.md` §23.2）。名称一致で自動化すると同名の別会社に付く
- 手順・期待:

```sql
-- 1. 法人（インボイス番号が CRM と一致）/ 名称だけ一致 / ドメインだけ一致 /
--    個人事業主（T 番号あり）の 4 件を JSONB で渡す
SELECT upsert_freee_partners(99999, '[...]'::JSONB, TRUE);
--   {"upserted": 4, "auto_linked": 1, "marked_deleted": 0}
--   自動で紐付くのはインボイス一致の 1 件だけ

-- 2. 法人番号は法人のときだけ導出されること
SELECT freee_partner_id, org_code, invoice_registration_number, corporate_number, link_status
  FROM freee_partners WHERE freee_company_id = 99999 ORDER BY 1;
--   org_code=1 かつ T+13桁 → corporate_number が入る / org_code=2 → NULL

-- 3. 再同期しても増えず、確定済みの紐付けを壊さないこと（差分同期）
SELECT upsert_freee_partners(99999, '[{...同じ partner_id で名称と available を変更...}]'::JSONB, FALSE);
SELECT count(*) FROM freee_partners WHERE freee_company_id = 99999;   --> 4 のまま
--   ミラー列（name / available）は更新され、link_status と company_id は保持される

-- 4. 全件同期のときだけ freee 側の削除を検出すること
SELECT upsert_freee_partners(99999, '[{...1 件だけ...}]'::JSONB, TRUE);
--   {"marked_deleted": 3}。行と紐付けは残り、freee_deleted_at に時刻が入る
```

- **差分同期（`p_full = FALSE`）では `freee_deleted_at` が付かないこと**もあわせて見る。
  差分は更新日での絞り込みなので、消えた取引先は結果に出てこない
- 自動化区分: SQL 検証

### IT-FREEE-02: 紐付け操作の権限と副作用（2026-08-04 追加）

- 対象: `confirm_freee_partner_link` / `register_freee_partner_company` /
  `detect_freee_partner_candidates`
- 背景: 確定系は `SECURITY DEFINER` で RLS が効かない。**関数内の権限確認だけが防御**
- 手順・期待:

```sql
-- 1. crm_users に行の無い認証ユーザーでは拒否されること
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ff"}', TRUE);
SELECT confirm_freee_partner_link('<partner_id>', '<company_id>');
--   ERROR: 紐付けの確定は admin だけが行えます
SELECT register_freee_partner_company('<partner_id>');
--   ERROR: 事業者情報の作成は admin だけが行えます

-- 2. 候補は 1 社 1 行で、最も強い理由（名称 > ドメイン > 電話）だけを返すこと
SELECT company_name, reason FROM detect_freee_partner_candidates('<partner_id>');
--   名称も電話も一致する会社が 2 行に割れないこと

-- 3. 事業者情報の新規作成では Account を作らないこと
SELECT register_freee_partner_company('<partner_id>', '<admin_id>');
SELECT count(*) FROM accounts WHERE company_id = '<返った company_id>';   --> 0
--   住所（freee の都道府県コード → 和名）と法人番号は移り、
--   フリーメールのドメインは company_domains に登録されない

-- 4. 紐付け済みには新規作成できないこと
SELECT register_freee_partner_company('<紐付け済みの partner_id>');
--   ERROR: 既に紐付け済みです。先に紐付けを解除してください
```

- **1 の拒否が「権限の文言」で起きること**を必ず確認する。`is_admin()` は
  `crm_users` に行が無いと NULL を返し、`IF NOT is_admin()` では分岐しないため
  素の書き方だとチェックをすり抜ける（2026-08-04 の検証で検出し `COALESCE` を追加）。
  外部キー違反など**別の理由での失敗を「拒否された」と読み違えないこと**
- RLS: member / manager から `freee_partners` / `freee_connections` が 0 件に見えること
- 自動化区分: SQL 検証

### IT-LEADSTAGE-01: ステージが要求する実体を欠く遷移を拒否する（2026-08-04 追加）

- 対象: マイグレーション `20260805000002`（`check_lead_stage_requirements` / `trg_lead_stage_requirements`）
- 背景: ステージが ディール / オポチュニティ / 取引先なのにディールも契約も無いリードを作れていた。
  規則と根拠は `docs/database-design.md` §24
- 手順・期待:

```sql
-- 1. 規則がマスタに入っていること
SELECT slug, name, auto_promote_to_deal, requires_deal, requires_contract
  FROM lead_stages WHERE deleted_at IS NULL ORDER BY sort_order;
--   sales / opportunity / customer が requires_deal = t
--   customer だけ requires_contract = t、name は「取引先」

-- 2. ディールなしで ディール へ → 拒否
UPDATE leads SET stage_id = (SELECT id FROM lead_stages WHERE slug='sales') WHERE id = '<ディールなしの lead>';
--   ERROR: 「ディール」へ進めるにはディールが必要です。…

-- 3. ディールなしで 取引先 へ → 拒否（オポチュニティ を飛ばした直行も塞がれる）
--   ERROR: 「取引先」へ進めるにはディールが必要です。…

-- 4. ディールありで ディール へ → 通る。**ステータス（商談化）が消えないこと**
--   auto_promote_to_deal で status を NULL にしていた旧実装の名残がないか確認する

-- 5. 契約なしで 取引先 へ → 拒否
--   ERROR: 「取引先」へ進めるには契約が必要です。…

-- 6. 契約を作ってから 取引先 へ → 通る

-- 7. 逆向き: 参照中のディール / 唯一の契約の論理削除 → 拒否
UPDATE deals     SET deleted_at = now() WHERE id = '<参照中のディール>';
UPDATE contracts SET deleted_at = now() WHERE id = '<唯一の契約>';
--   ERROR: …先にリードのステージを下げてから削除してください

-- 8. ステージを下げてからなら削除できる
```

- **`promoted_deal_id` だけの更新でトリガーが走らないこと**を確認する。
  トリガーは `UPDATE OF stage_id` なので、昇格処理自身が自分に弾かれない
- **既存の不整合行の是正手段を塞いでいないこと**（重要）:
  トリガーを一時的に外して不整合行を作り、
  ① ステージ以外の項目を更新できる ② ステージを下げられる ことを確認する。
  常時検査にすると、規則の導入前から不整合だった行が凍結して直せなくなる
- 検出ビュー: `SELECT * FROM v_lead_stage_violations;` が
  `no_deal` / `deal_deleted` / `no_contract` を区別して返すこと。
  `security_invoker` なので member には自分の見える範囲だけが出ること
- 自動化区分: SQL 検証

---

## 6. 整合性チェッククエリ集

`db reset` 直後・大量取込後・本番デプロイ後に流す。**すべて 0 行が正常**（Q11 を除く。
Q14 だけは 2 行あることが正常）。

```sql
-- Q1. 採番コードの重複（UNIQUE 制約があるため通常 0。制約を外した経路の検出用）
SELECT 'companies' t, company_code code, count(*) FROM companies GROUP BY 1,2 HAVING count(*) > 1
UNION ALL SELECT 'accounts', account_code, count(*) FROM accounts GROUP BY 1,2 HAVING count(*) > 1
UNION ALL SELECT 'contacts', contact_code, count(*) FROM contacts GROUP BY 1,2 HAVING count(*) > 1
UNION ALL SELECT 'deals', deal_code, count(*) FROM deals GROUP BY 1,2 HAVING count(*) > 1
UNION ALL SELECT 'contracts', contract_code, count(*) FROM contracts GROUP BY 1,2 HAVING count(*) > 1;

-- Q2. 採番コードの形式不正
SELECT id, company_code FROM companies WHERE company_code !~ '^CMP-[0-9]{6}$'
UNION ALL SELECT id, account_code FROM accounts WHERE account_code !~ '^ACC-[0-9]{6}$'
UNION ALL SELECT id, contact_code FROM contacts WHERE contact_code !~ '^CNT-[0-9]{6}$'
UNION ALL SELECT id, deal_code FROM deals WHERE deal_code !~ '^DL-[0-9]{6}$'
UNION ALL SELECT id, contract_code FROM contracts WHERE contract_code !~ '^CTR-[0-9]{6}$';

-- Q3. ディールの相手先欠落（CHECK deals_counterparty_check の実効確認）
SELECT id, deal_code FROM deals
 WHERE account_id IS NULL AND company_id IS NULL AND contact_id IS NULL;

-- Q4. employee なのに会社が無い連絡先（resolve_or_create_contact の規約違反）
SELECT id, contact_code, last_name FROM contacts
 WHERE contact_type = 'employee' AND company_id IS NULL AND deleted_at IS NULL;

-- Q5. 生きている子が論理削除済みの親を参照している
SELECT c.id, c.contact_code FROM contacts c JOIN companies p ON p.id = c.company_id
 WHERE c.deleted_at IS NULL AND p.deleted_at IS NOT NULL
UNION ALL
SELECT d.id, d.deal_code FROM deals d JOIN companies p ON p.id = d.company_id
 WHERE p.deleted_at IS NOT NULL;

-- Q6. 主連絡先の重複／不在（部分ユニーク索引 + AFTER DELETE 繰り上げの実効確認）
SELECT contact_id, count(*) FROM contact_emails WHERE is_primary GROUP BY 1 HAVING count(*) > 1
UNION ALL
SELECT contact_id, count(*) FROM contact_phones WHERE is_primary GROUP BY 1 HAVING count(*) > 1;
-- 「メールを持つのに主が 1 つも無い」連絡先
SELECT e.contact_id FROM contact_emails e
 GROUP BY e.contact_id HAVING bool_and(NOT e.is_primary);

-- Q7. company_domains の規約違反（フリーメール / 大文字 / 代表重複）
SELECT id, domain FROM company_domains
 WHERE is_free_email_domain(domain) OR domain <> lower(domain);
SELECT company_id, count(*) FROM company_domains WHERE is_primary GROUP BY 1 HAVING count(*) > 1;

-- Q8. 生存法人間の法人番号重複（名寄せの前提）
SELECT corporate_number, count(*) FROM companies
 WHERE corporate_number IS NOT NULL AND deleted_at IS NULL
 GROUP BY 1 HAVING count(*) > 1;

-- Q9. リードスコアの不変条件（0-100 と温度整合）
SELECT id, score FROM leads WHERE score < 0 OR score > 100;
SELECT l.id, l.score, l.temperature_id FROM leads l
 WHERE l.deleted_at IS NULL AND l.temperature_id IS DISTINCT FROM (
   SELECT t.temperature_id FROM lead_score_thresholds t
    WHERE t.deleted_at IS NULL AND t.min_score <= l.score
      AND (t.max_score IS NULL OR l.score <= t.max_score)
    ORDER BY t.min_score DESC LIMIT 1);

-- Q10. 昇格整合（promote_lead_to_deal / ensure_account_on_contract の後片付け漏れ）
SELECT l.id FROM leads l LEFT JOIN deals d ON d.id = l.promoted_deal_id
 WHERE l.promoted_deal_id IS NOT NULL AND d.id IS NULL;              -- 参照先の消えた昇格
SELECT d.id, d.deal_code FROM deals d
 JOIN contracts ct ON ct.deal_id = d.id
 WHERE d.account_id IS NULL
   AND (d.company_id IS NOT NULL OR d.contact_id IS NOT NULL);       -- 契約済みなのに Account 未作成
SELECT id FROM lead_score_breakdowns b
 WHERE NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = b.lead_id)
    OR NOT EXISTS (SELECT 1 FROM lead_score_rules r WHERE r.id = b.rule_id);

-- Q11. 孤児住所（entity_addresses から参照されない addresses。cleanup トリガーの実効確認）
--      リード取込直後は leads 側から参照される住所があるため、判定は entity_addresses と leads の両方を見る
SELECT a.id FROM addresses a
 WHERE NOT EXISTS (SELECT 1 FROM entity_addresses ea WHERE ea.address_id = a.id)
   AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.address_id = a.id);

-- Q12. 変更履歴の不変条件
SELECT id FROM entity_change_logs WHERE changed_fields = '{}'::jsonb;             -- 空差分の混入
SELECT id FROM entity_change_logs
 WHERE operation = 'UPDATE' AND (changed_fields ? 'updated_at' OR changed_fields ? 'score');  -- 除外列の混入

-- Q13. account_roles の自動付与整合（契約があるのに対応区分が無い）
SELECT d.account_id, d.pipeline_type_id FROM deals d
 JOIN contracts ct ON ct.deal_id = d.id
 JOIN account_role_types rt ON rt.pipeline_type_id = d.pipeline_type_id AND rt.deleted_at IS NULL
 WHERE d.account_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM account_roles ar
                    WHERE ar.account_id = d.account_id AND ar.role_type_id = rt.id);

-- Q14. cron ジョブの登録確認（0 行なら異常）
SELECT jobname, schedule FROM cron.job
 WHERE jobname IN ('purge_soft_deleted_records_daily', 'recalculate_lead_scores_weekly');

-- Q15. 連絡先ゼロの個人事業主（T-0086 の再発検出。2026-08-09 追加）
--      個人事業主は定義上本人が必ずいる。事業者だけあって連絡先が 1 件も無い状態は
--      「事業主欄が空のまま運用される」形（docs/database-design.md § 22.2.4）。
--      判定は **corporate_types.is_sole_proprietor フラグ**で行い、名称では判定しない
--      （マスタを改名するとこの検査が黙って空振りする）。
SELECT c.id, c.company_code, c.name FROM companies c
 JOIN corporate_types ct ON ct.id = c.corporate_type_id
 WHERE ct.is_sole_proprietor
   AND c.deleted_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM contacts co
                    WHERE co.company_id = c.id AND co.deleted_at IS NULL);
```

---

## 7. テストで確認された/しにくい設計上の懸念（申し送り）

0. **自動化状況（2026-08-09）**: `npm run test:db`（`scripts/test-db/`）で IT-01〜IT-08 / IT-31・IT-32 /
   IT-33〜IT-45 / Q1〜Q15 / IT-RLS-20・IT-RLS-21 / IT-PERF-01 / IT-MASTER-01〜06 / IT-LEADSTAGE-01 /
   IT-CONTRACT-01〜08 / IT-COMPANY-CONTACT-01〜05（計 67 ケース）を自動化済み。
   詳細は `docs/test-strategy.md` §7。
   T-0069（`deals.lead_id` 正本化）以降、上記のうち IT-36〜IT-39・IT-LEADSTAGE-01・IT-CONTRACT-07/08 は
   本文記載の手順・エラー文言と実装が乖離しており、自動化側は現行 DB の挙動に合わせている。

1. ~~**resolve_or_create_contact の既定ステータス探索が「見込み」に退行している。**~~
   **→ 2026-08-03 に修正済み（`20260803000001_fix_contact_default_status_regression.sql`）。**
   20260731000009 で既定を「アクティブ」に変えたが、その後の差し替え（20260801000002 → 20260801000007）が
   旧版をベースにしており `WHERE name = '見込み'` に戻っていた。「見込み」は論理削除済みのため常に
   フォールバック（`ORDER BY created_at LIMIT 1`）に落ち、seed はマスタを単一 INSERT で入れるため
   `created_at` が同値で、新規連絡先の既定ステータスが非決定的になっていた。
   修正では「アクティブ」を引く形に戻したうえで、**非決定的なフォールバックを廃止し
   マスタが無ければ `RAISE EXCEPTION` で失敗させる**（`resolve_or_create_company` の既存判断に合わせた）。
   IT-23 は「新規連絡先が『アクティブ』であること」を固定値で検証してよい。
2. **自動採番（MAX+1 方式）は並列 INSERT で一意制約違反を起こしうる。**
   `generate_company_code` 等はテーブル全体の MAX を読むだけでロックを取らないため、同時 INSERT の再現テストは不安定（advisory lock もシーケンスも無い）。IT-34/35 は単一接続前提。
   なお **RLS 起因の確定的な採番衝突は 2026-08-03 に修正済み**
   （`20260803000006_number_generators_bypass_rls.sql`）。それ以前は採番関数が
   SECURITY INVOKER で、member が新規作成すると自分が owner の行しか MAX の対象にならず、
   既存コードと必ず衝突していた（member は INSERT ポリシー上は作成できるのに実際は作れない状態）。
   **採番のような「誰が実行しても同じであるべき値」を RLS のかかる SELECT で作らないこと。**
3. **updated_at はトランザクション時刻で固定される。**
   同一トランザクション内で 2 回 UPDATE しても `updated_at` が進まないため、楽観ロック（`expected_updated_at`）の衝突検知は「別トランザクションからの更新」でのみテスト可能（IT-33 備考）。
4. **pg_cron の実発火はローカルで待てない。**
   週次再計算・日次パージは関数の直接呼び出し（IT-30）と `cron.job` の登録確認で代替する。スケジュール実行そのものの検証は本番監視側の責務。
5. **entity_change_logs の `changed_by` は service_role 経由で常に NULL になる**（設計どおりだが、バルク取込を service_role で行うと「誰の操作か」がログから消える。取込関数が `imported_by` を別途持つのはこのため）。
6. **契約トリガーの Account ステータス解決が `name = 'アクティブ'` の文字列一致**（`ensure_account_on_contract`）。マスタの名称を変更すると「最古のステータス」フォールバックに落ちる。名称変更時はこのトリガーの確認が必要。
7. **マイグレーションから seed のマスタを参照してはいけない**（2026-08-03、IT-36 が検出）。
   `db reset` は「マイグレーション → seed」の順に流れるため、マイグレーション内の
   `(SELECT id FROM <seed で入るマスタ> WHERE …)` は必ず NULL になる。
   `20260731000008` はこれで `account_role_types.pipeline_type_id` を 5 件とも NULL にしており、
   **契約が成立しても取引先に区分（顧客 / 仕入れ先 / 外注先）が一度も付いていなかった**。
   `INSERT … ON CONFLICT DO NOTHING` なので seed 投入後も自然回復しない。
   `lead_score_rules`（08-e2e-scenarios.md §6.2）と同じ構造の欠陥で、これで 2 件目。
   - 対処: 紐付けは **seed 側**（`01-masters.sql` 末尾）で行い、既存環境向けに
     backfill マイグレーション（`20260803000005`）を併せて置く
   - **この形の欠落は Q13 で検出できる。** マスタ間の参照を足したら整合性クエリも足すこと
8. **`score_delta` は CHECK で 0〜100**。負の加点ルールは登録できないため、
   `recalculate_lead_score` の下方 0 クリップは到達不能な防御コードになっている（IT-28）。
9. **ビューは既定で RLS をバイパスする**（2026-08-03、Gate 4 のブラウザ確認が検出）。
   PostgreSQL のビューはビュー所有者（ここでは postgres = superuser）の権限で基底テーブルを読むため、
   **`WITH (security_invoker = true)` を付けない限りポリシーを書いていても無効**になる。
   `v_leads_with_category` がこれで、member が担当外リードを全件閲覧できていた
   （`20260803000007` で修正。検証は IT-RLS-21）。
   - **RLS のあるテーブルを読むビューを追加・再作成するときは必ず `security_invoker` を付ける。**
     ビューを `CREATE OR REPLACE` すると reloptions が引き継がれないことがあるため、
     再作成のたびに確認する
   - Server Action 側は「認証チェックのみ、可視範囲は RLS に委ねる」設計のものが多く、
     ビューの設定漏れがそのままアクセス制御の穴になる（多層防御の 2 層目が効かない）

## リード系マスタの整合（2026-08-05 追加）

### IT-MASTER-01: カテゴリ判定がスラッグに依存しない
- 手順: ステージと流入元の `slug` をランダムな値へ書き換えてから
  `resolve_lead_category` を呼ぶ
- 期待値: **判定が変わらない**（選定なら TQL、ディールを伴うなら SQL、
  相手からの流入なら Inquiry、それ以外は MQL）
- 理由: スラッグは自動採番になった。判定に使うと**新しいステージが必ず MQL に落ちる**
  （例外は出ないので気づけない）

### IT-MASTER-02: システム必須行を削除できない
- 手順: カテゴリ（4 行）・規則を持つステージ・自動生成に使う取引先種別・
  既定パイプラインに対して `deleted_at` を入れる
- 期待値: 例外「この行はシステムが使うため削除できません（名前）。…」。
  **必須でない行（育成など）は削除できる**（過剰に縛らない）

### IT-MASTER-03: 使用中のステータスを削除できない
- 手順: リードが参照しているステータスに `deleted_at` を入れる
- 期待値: 例外「このステータス（名前）は n 件のリードが使っています。…」。
  **件数を文言に含める**（何件動かせばよいか分かるように）

### IT-MASTER-04: 「既定」は 2 行にできない
- 手順: `is_inquiry_default` / `is_default` / `is_company_default` などを
  2 行目にも立てる
- 期待値: 部分 UNIQUE 違反で拒否される
- 理由: 2 行 true だと**どちらが使われるか不定**になる

### IT-MASTER-05: マスタを改名しても自動判定が壊れない
- 手順: 取引先ステータス・連絡先ステータス・事業者ステータス・事業種別の
  `name` を書き換えてから `resolve_account_status` などを呼ぶ
- 期待値: **改名しても正しく引ける**（役割はフラグが持つ）
- 理由: 以前は `name = 'アクティブ'` で引いており、**改名しただけで壊れた**

### IT-MASTER-06: 削除済みのマスタを新たに参照できない
- 手順: 論理削除済みの `company_statuses` を `companies.company_status_id` に入れる
- 期待値: 例外「削除済みの事業者ステータスを指定しています。…」
- 理由: **論理削除は外部キーで防げない**。実際にこれで事業者情報 27 件が
  削除済みステータスを指したまま無症状で運用されていた（2026-08-05 に発覚）

### IT-MASTER-07: マスタ名指しの全廃を保つ
- 手順: `database-design.md §23.8.2` の検査 SQL と grep を回す
- 期待値: DB 関数側の該当は**採番トリガーの接頭辞（`'CMP-'` など）だけ**。
  アプリ側に `.eq("code"/"name"/"slug", "…")` と UUID 直書きが無い
- 理由: **新しい機能を足すたびに増える。** アプリの grep だけでは
  DB 関数の中を見落とす（実際に 2 回見落とした）

## ディールと契約の紐づけ・契約名の自動生成（2026-08-08 追加）

`docs/database-design.md` §16.6.1 / §16.6.2 の規則を DB 側で固定する。
**契約名の組み立ては TS 側に実装が無い**（規則の正本は DB 関数だけ）ので、
ここが唯一の検証箇所になる。

### IT-CONTRACT-01: 契約名の組み立て規則
- 手順: `build_contract_display_name()` を材料の有無を変えて呼ぶ
- 期待値:
  - 全部そろう → `20260807_業務委託基本契約書_サービス利用契約_1200000_CTR-000123`
  - 契約書名だけ → `秘密保持契約書_CTR-000124`（**`__` が並ばない**）
  - 全部欠損 → `CTR-000125`（契約コードは必ず入るので空にならない）
  - 部品に `_` を含む → `-` に置換される（`A_B_C` → `A-B-C`）
- 理由: 締結日・種別・金額はどれも未設定がありうる。素直に連結すると読めなくなる

### IT-CONTRACT-02: 採番より後に組み立てる（トリガー名の昇順依存）
- 手順: `INSERT INTO contracts (...) RETURNING contract_code, contract_display_name`
- 期待値: 契約名の末尾に**採番されたばかりの契約コード**が入っている
- 理由: BEFORE トリガーは名前の昇順に走る（`trg_contracts_generate_code`(g)
  → `trg_contracts_set_display_name`(s)）。**この並びを崩すと契約名から
  契約コードが落ちる。** トリガー名を変えたら必ずここで気づく

### IT-CONTRACT-03: 材料を直すと契約名が追随する
- 手順: 契約の金額・締結日・契約書名・契約種別を UPDATE する
- 期待値: `contract_display_name` が組み立て直される
- 理由: 「保存のタイミングで更新される」が依頼の要件そのもの

### IT-CONTRACT-04: 契約種別マスタの改名に追随する
- 手順: `UPDATE contract_types SET name = '…'`
- 期待値: その種別を使う契約の `contract_display_name` が変わり、
  **`entity_change_logs` は 1 件も増えない**
- 理由: 種別名を焼き込んでいるので追随が要る。一方これは派生値なので
  履歴に出すと材料を直すたび 2 行に見える

### IT-CONTRACT-05: 契約名は変更履歴の差分に出ない
- 手順: 金額だけを UPDATE し、`entity_change_logs.changed_fields` のキーを見る
- 期待値: `amount` と `_name` のみ。`contract_display_name` は**含まれない**
- 理由: 同上（`log_entity_change` の `v_ignored`）

### IT-CONTRACT-06: ディールに紐づかない契約を作れる
- 手順: `INSERT INTO contracts (contract_name) VALUES ('…')`（`deal_id` なし）
- 期待値: 通る。`deal_id IS NULL`
- 理由: 2026-08-08 に NOT NULL を外した（T-0065）。紐づけ候補はこれだけ

### IT-CONTRACT-07: 後から紐づけると取引先が作られる
- 手順: 取引先未作成のディール（相手先は事業者情報）へ `UPDATE contracts SET deal_id = …`
- 期待値: `deals.account_id` が埋まる
- 理由: `ensure_account_on_contract` は AFTER **INSERT** だけだったため、
  後から紐づけても取引先ができない穴があった。`AFTER UPDATE OF deal_id` を足した

### IT-CONTRACT-08: 紐づけ解除でもリードのステージ要件を守る
- 手順: `requires_contract` のステージにいるリードの、唯一の契約を
  `UPDATE contracts SET deal_id = NULL`
- 期待値: 例外「この契約はリード「…」が参照している唯一の契約です。
  先にリードのステージを下げてから**紐づけを解除**してください」
- 理由: 旧 `check_contract_deletion_against_leads` は `BEFORE UPDATE OF deleted_at`
  にしか張られておらず、**契約を消さずに剥がすと検査を素通り**した。
  `deal_id` を動かせるようにした時点で開く穴なので、同じマイグレーションで塞いだ

## 個人事業主の作成時に本人の連絡先を同時に作る（2026-08-09 追加、T-0087）

`create_company_with_contact`（マイグレーション `20260809120001`）の検証。
設計は `docs/database-design.md` §22.2.4。**事業者と連絡先の 2 テーブルへ書くので、
部分成功が残らないこと**が主題。自動化は `scripts/test-db/cases/10-company-with-contact.mjs`。

### IT-COMPANY-CONTACT-01: 同時作成で事業者・連絡先・紐づけが揃う
- 手順: member として `create_company_with_contact(p_company, p_contact)` を呼ぶ
- 期待値: `{ company_id, contact_id }` が返り、
  `companies.representative_contact_id` / `primary_contact_id` の両方に本人が入る。
  連絡先は `company_id` がその事業者、`contact_type = 'individual'`、担当者は会社と同じ。
  採番（`CMP-` / `CNT-`）も済んでいる
- 理由: T-0086 は「事業者はあるが事業主も連絡先も無い」状態だった。**紐づけまで
  揃って初めて再発防止になる**ので、作成の成功だけでは足りない

### IT-COMPANY-CONTACT-02: `p_contact` が NULL なら事業者だけを作る
- 手順: 同時作成のチェックを外した場合と同じく `p_contact` に NULL を渡す
- 期待値: `contact_id` は null。連絡先は 0 件、事業主・主担当は NULL のまま
- 理由: 同時作成は**必須にしない**（氏名不明時に仮名を入れて通す運用に化けるため）。
  外した分は Q15 が検出する

### IT-COMPANY-CONTACT-03: ステータス省略時は `is_new_default` を引く
- 手順: `p_contact` に `contact_status_id` を入れずに呼ぶ
- 期待値: 役割フラグ `contact_statuses.is_new_default` の立った行が入る
- 理由: マスタの id をコードに焼き込まないため（CLAUDE.md「マスタの役割フラグ」）

### IT-COMPANY-CONTACT-04: `is_new_default` が無ければ例外（事業者も残らない）
- 手順: `UPDATE contact_statuses SET is_new_default = FALSE` してから呼ぶ
- 期待値: 例外「連絡先の初期ステータス（is_new_default）が見つかりません。
  マスタを確認してください」。**事業者も作られていない**
- 理由: 非決定的な別ステータスへフォールバックすると、誤ったステータスの連絡先を
  作り続けることになり気づきにくい（`resolve_or_create_contact` と同じ思想）

### IT-COMPANY-CONTACT-05: 担当者が他人だと紐づけ失敗を例外にする
- 手順: member が `p_company.owner_user_id` に別の利用者を入れて呼ぶ
- 期待値: 例外「事業主の連絡先を紐づけられませんでした。担当者を自分にするか、
  管理者に依頼してください」。事業者も連絡先も残らない
- 理由: `companies` の UPDATE ポリシーは `is_admin() OR owner_user_id = auth.uid()`。
  **RLS で弾かれた UPDATE はエラーにならず 0 行になる**ため、`GET DIAGNOSTICS ROW_COUNT`
  を見ないと「連絡先はあるのに事業主が空」という T-0086 と同じ形が黙って再発する
