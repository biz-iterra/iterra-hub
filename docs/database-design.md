# ITERRA CRM (iterra-hub) データベース設計書

## 1. Context

ITERRAの営業・取引管理CRMシステムを新規構築する。現在スプレッドシートで管理しているデータをSupabase（PostgreSQL）に移行し、Next.js（App Router）のWebアプリケーションとして提供する。

> 本書では過去の実装フェーズの記録も保持している。「Phase N」以下の記述は当時の作業内容であり、
> 現行の技術スタックは `README.md` を参照すること。

**確定事項:**
- シングルテナント（ITERRA社内のみ）
- 別Supabaseプロジェクト（work-talent-hubと独立）
- Company : Account = 1 : N
- Talentは物理テーブル（スキル、性格分析、適性、経歴・資格）

---

## 2. エンティティ分類

### 2.1 静的マスタ（コードマスタ / 区分値テーブル）
管理者のみ変更可能。アプリ起動時にキャッシュ可能。レコード数は少ない（数十件程度）。

| # | テーブル論理名 | テーブル物理名 | 用途 | データ性質 |
|---|-------------|-------------|------|----------|
| M01 | パイプライン種別 | `pipeline_types` | 取引の種類（営業、仕入れ等） | 静的マスタ |
| M02 | 契約種別 | `contract_types` | 契約の分類 | 静的マスタ |
| M03 | 法人格 | `corporate_types` | 株式会社・合同会社・個人事業主等 | 静的マスタ |
| M04 | サービス | `services` | ITERRAが提供するサービス | 静的マスタ |
| M05 | リードソース | `lead_sources` | 顧客獲得経路 | 静的マスタ |
| M06 | アカウント種別 | `account_types` | アカウントの分類 | 静的マスタ |
| M07 | アカウントステータス | `account_statuses` | アカウントの状態 | 静的マスタ |
| M08 | コンタクトステータス | `contact_statuses` | コンタクトの状態 | 静的マスタ |
| M09 | スキルカテゴリ | `skill_categories` | スキルの分類（技術/ビジネス等） | 静的マスタ |
| M10 | スキル | `skills` | 個別スキル定義 | 静的マスタ |
| M11 | カンパニーステータス | `company_statuses` | カンパニーの状態 | 静的マスタ |
| M12 | プロジェクトステータス | `project_statuses` | プロジェクトの状態 | 静的マスタ |
| M13 | ~~IS フェーズ~~ | ~~`inside_sales_phases`~~ | **廃止**（20260419000002。lead_temperatures に統合） | — |
| M14 | リード 大セグメント | `lead_large_segments` | リード 大セグメント（旧: inside_sales_large_segments） | リード共通マスタ |
| M15 | リード 小セグメント | `lead_small_segments` | リード 小セグメント（M14従属）（旧: inside_sales_small_segments） | リード共通マスタ |
| M16 | リード 架電ステータス | `lead_call_statuses` | 架電結果の分類（旧: inside_sales_call_statuses） | リード共通マスタ |
| M17 | ~~リード 架電担当者~~ | ~~`lead_callers`~~ | **Phase 10b-3 で廃止。crm_users に役割統合済み。** | ~~リード共通マスタ~~ |
| M18 | リードステージ | `lead_stages` | リード進捗ステージ（7段階）。`slug`/`is_terminal`/`auto_promote_to_deal` を持つ | リード共通マスタ |
| M19 | リードステータス | `lead_statuses` | ステージ内の状態（stage_id FK、UNIQUE(stage_id, code)） | リード共通マスタ |
| M20 | リード温度感 | `lead_temperatures` | 温度感マスタ（hot/warm/cold） | リード共通マスタ |
| M21 | リードスコアリングルール | `lead_score_thresholds` | スコア→温度感 変換ルール（旧: lead_scoring_rules） | リード共通マスタ |
| M22 | **デマンドファネル** | `lead_categories` | デマンドファネル（Inquiry/MQL/TQL/SQL）。Lead.category_id で参照。**完全な導出値**でステージと流入元から決まる。§16.6.6 | リード共通マスタ |
| M23 | キャンペーン | `campaigns` | マーケティングキャンペーン（generation/nurturing/qualification） | リード共通マスタ |
| M24 | リード 企業規模 | `lead_company_sizes` | 従業員数/資本金レンジによる企業規模 | リード共通マスタ |
| M25 | リード 顧客行動タイプ | `lead_customer_activity_types` | イベント参加/資料DL等 | リード共通マスタ |
| M26 | リード スコアルール | `lead_score_rules` | 属性/行動/ステージ/ステータス/活動から score_delta を導出 | リード共通マスタ |

### 2.2 構造化マスタ（階層・依存関係あり）
他マスタとの依存関係を持つ。参照整合性が重要。

| # | テーブル論理名 | テーブル物理名 | 用途 | 依存先 |
|---|-------------|-------------|------|--------|
| S01 | ディールステージ | `deal_stages` | パイプライン内の進捗フェーズ | M01 (pipeline_types) |
| S02 | ディールステータス | `deal_statuses` | ステージ内の状態 | M01 + S01 |
| S03 | 業種分類 | `industry_classifications` | 大中小3階層の業種 | なし（自己完結） |

### 2.3 参照マスタ（占い / 診断データ）
外部データソース由来。読み取り専用。レコード数固定。

| # | テーブル論理名 | テーブル物理名 | 用途 | レコード数 |
|---|-------------|-------------|------|----------|
| R01 | 星座占い | `constellation_fortune_telling` | 星座ベースの性質データ | 12件（固定） |
| R02 | ポテンシャルプロファイリング | `number_diagnosis` | 動物占いベースの性質データ | 60件（固定） |

### 2.4 トランザクションエンティティ（業務データ）
日常的にCRUD操作される。監査証跡が必要。

| # | テーブル論理名 | テーブル物理名 | 用途 |
|---|-------------|-------------|------|
| T01 | CRMユーザー | `crm_users` | システム利用者 |
| T02 | カンパニー | `companies` | 組織の法的・登記情報 |
| T03 | アカウント | `accounts` | 取引主体（Companyに紐づく） |
| T04 | コンタクト | `contacts` | 個人情報 |
| T05 | ディール | `deals` | 取引 |
| T06 | 契約 | `contracts` | 契約情報 |
| T07 | タレント | `talents` | コンタクトに紐づく人材特性情報 |
| T08 | プロジェクト | `projects` | 複数ディールをグルーピングする業務イニシアチブ |
| T09 | リード | `leads` | 見込み客（Lead）エンティティ。stage/status/temperature/score/segment/category を管理 |
| T10 | リード副担当 | `lead_owners` | リード副担当中間テーブル。主担当は leads.owner_user_id で保持、副担当のみ管理（Phase 10b-1） |

### 2.5 従属エンティティ（親に依存）
親エンティティのライフサイクルに従う。親削除時にCASCADE。

| # | テーブル論理名 | テーブル物理名 | 親 | 多重度 |
|---|-------------|-------------|---|--------|
| D01 | コンタクトメール | `contact_emails` | T04 contacts | Contact 1 : N Email |
| D02 | コンタクト電話 | `contact_phones` | T04 contacts | Contact 1 : N Phone |
| D03 | 金融機関情報 | `financial_info` | T02/T04 | Company/Contact 1 : N FI |
| D04 | 追加住所 | `other_addresses` | T02/T04 | Company/Contact 1 : N Addr |
| D05 | タレントスキル | `talent_skills` | T07 talents | Talent N : M Skills |
| D06 | タレント経歴 | `talent_careers` | T07 talents | Talent 1 : N Career |
| D07 | プロジェクトメンバー | `project_members` | T08 projects | Project 1 : N Member（crm_users参照） |
| D08 | リード架電記録 | `lead_activities` | T09 leads | Lead 1 : N 架電記録（call_number UNIQUE） |
| D09 | リード顧客行動ログ | `lead_customer_activities` | T09 leads | 顧客側の行動履歴（手動入力） |
| D10 | リードスコア内訳 | `lead_score_breakdowns` | T09 leads | recalculate_lead_score の算出内訳 |
| D11 | 名刺 | `business_cards` | T04 contacts | Contact 1 : N 名刺。所属を名刺の属性として持ち、メール・電話の行に紐づく（§21） |
| D12 | 連絡先統合候補 | `contact_merge_candidates` | T04 contacts | 姓名のみ一致した組。統合するかは人が判断（§21.7） |

### 2.5b パイプライン拡張（Deal 1:1 / 1:N）
パイプラインごとに固有カラムを保持する拡張テーブル。共通規約については §9 参照。

| # | テーブル論理名 | テーブル物理名 | 親 | 多重度 | 対応パイプライン |
|---|-------------|-------------|---|--------|----------------|
| ~~EX01~~ | ~~IS 拡張本体~~ | ~~`deal_ext_inside_sales`~~ | — | — | **Phase D で撤去済み（2026-04-19）** |
| ~~EX02~~ | ~~IS 架電記録~~ | ~~`deal_ext_inside_sales_calls`~~ | — | — | **Phase D で撤去済み（2026-04-19）** |

> **注意:** 現時点で有効なパイプライン拡張テーブルは存在しない。新規パイプライン追加時は §5.X の規約に従うこと。

### 2.6 中間テーブル（N:M関係）

| # | テーブル論理名 | テーブル物理名 | 関係 |
|---|-------------|-------------|------|
| J01 | ディール×サービス | `deal_services` | Deal N : M Service |
| J02 | アカウント×コンタクト | `account_contacts` | Account N : M Contact |
| J03 | ディール×プロジェクト | `deal_projects` | Deal N : M Project |
| J04 | リード×キャンペーン | `lead_campaigns` | Lead N : M Campaign |
| J05 | リード×副担当 | `lead_owners` | Lead N : M CrmUser（副担当専用） |

### 2.7 アクティビティ / ログ

| # | テーブル論理名 | テーブル物理名 | 用途 |
|---|-------------|-------------|------|
| A01 | アクティビティログ | `activity_logs` | 汎用監査ログ |
| A02 | ディール対応履歴 | `deal_activities` | ディールに紐づく営業活動記録（メール・電話・打合せ等） |
| A03 | ディール対応メール詳細 | `deal_activity_emails` | deal_activitiesのemail種別の詳細情報 |
| A04 | ディールステージ遷移履歴 | `deal_stage_histories` | ステージの変更履歴 |
| A05 | ディールステータス変更履歴 | `deal_status_histories` | ステージ内のステータス変更履歴 |
| A06 | カンパニー変更履歴 | `company_change_histories` | カンパニーのフィールド変更履歴 |
| A07 | アカウント変更履歴 | `account_change_histories` | アカウントのフィールド変更履歴 |
| A08 | コンタクト変更履歴 | `contact_change_histories` | コンタクトのフィールド変更履歴 |
| A09 | ディール変更履歴 | `deal_change_histories` | ディールのフィールド変更履歴 |
| A10 | タレント変更履歴 | `talent_change_histories` | タレントのフィールド変更履歴 |
| A11 | プロジェクト変更履歴 | `project_change_histories` | プロジェクトのフィールド変更履歴 |

---

## 3. ER図（テキスト表記）

### 3.1 コアリレーション

```
[pipeline_types] 1──N [deal_stages] 1──N [deal_statuses]
                                          │
[companies] 0..1──N [accounts] 1──N [deals] ─┘
     │                │          │
     │                │          N──1 [crm_users] (owner)
     │                │          │
     │                │          1──N [contracts] (deal_id任意)
     │                │          1──N [deal_activities] (対応履歴)
     │                │          1──N [deal_stage_histories] (ステージ遷移履歴)
     │                │          1──N [deal_status_histories] (ステータス変更履歴)
     │                │          N──M [services] via [deal_services]
     │                │          N──1 [leads] (lead_id。紐づけの正本。§16.6.3)
     │                │
     │              N──M [contacts] via [account_contacts]
     │                       │
     1──N [contacts]         │  ← contact_typeに応じて紐づけ先が分岐
                             │    corporate_rep/employee → company_id
                             │    individual → account_id（account_contacts経由）
                             │
                             1──0..1 [talents]
                             │         │
                             │         1──N [talent_skills] N──1 [skills] N──1 [skill_categories]
                             │         1──N [talent_careers]
                             │
                             1──N [contact_emails]
                             1──N [contact_phones]
                             N──0..1 [number_diagnosis]
                             N──0..1 [constellation_fortune_telling]

[companies] 1──N [financial_info]
[companies] 1──N [other_addresses]
[contacts]  1──N [financial_info]
[contacts]  1──N [other_addresses]

[projects] N──M [deals] via [deal_projects]
[projects] 1──N [project_members] N──1 [crm_users]
[projects] N──1 [project_statuses]
[projects] N──1 [crm_users] (owner)
```

**コンタクトの紐づけルール（contact_typeで制御）:**
```
パターンA: 法人所属コンタクト（corporate_rep / employee）
  Contact.company_id ──→ Company
  ※ ContactはCompanyに直接紐づく。Companyの代表者や従業員として管理

パターンB: 個人コンタクト（individual）
  Contact ──(account_contacts)──→ Account
  ※ 個人のContactはAccountに紐づく。company_id = NULL
  ※ 例外: 個人事業主の本人は company_id にその事業者を持つ（§22.2.4）

パターンC: その他（other）
  Contact.company_id / account_contacts のいずれかに紐づけ可能
```

**コンタクトとディールの関係（ディールには必ずAccountが必要）:**
```
  Contact ──(account_contacts)──→ Account ──→ Deal
  ※ ディール登録時にはAccountの紐づけが必須
  ※ 法人所属のContactも、ディールに関与する場合はaccount_contactsでAccountに紐づける

例: 田中太郎さん
  ├── Account: 株式会社ABC（Company紐づき） → 法人案件のDeal
  └── Account: 田中太郎事務所（Company無し） → 個人事業主案件のDeal
```

### 3.2 多重度一覧

| 親エンティティ | 子エンティティ | 多重度 | 必須/任意 | 説明 |
|-------------|-------------|--------|---------|------|
| pipeline_types | deal_stages | 1:N | 必須 | ステージは必ず1つのパイプラインに属する |
| pipeline_types | deal_statuses | 1:N | 必須 | ステータスは必ず1つのパイプラインに属する |
| deal_stages | deal_statuses | 1:N | 任意 | ステータスはステージに紐づく場合がある |
| companies | accounts | 1:N | 任意 | アカウントはCompany無しでも存在可能（個人取引） |
| companies | contacts | 1:N | 任意 | corporate_rep/employeeのコンタクトがcompany_idで紐づく |
| accounts | deals | 1:N | 任意 | 取引先は契約成立時に作られるため、契約前のディールは account_id が NULL（§16.6） |
| companies | leads | 1:N | 任意 | **同じ会社から複数のリードが来る。**事業者は 1 つに寄せる（§16.6.4） |
| contacts | leads | 1:N | 任意 | 取込時に名寄せした連絡先。手動作成のリードでも選べる（§16.6.4） |
| leads | deals | 1:N | 任意 | **紐づけの正本は deals.lead_id。**requires_lead なパイプラインでは必須（§16.6.3） |
| accounts | account_contacts | 1:N | 任意 | アカウントに複数コンタクト紐づけ可 |
| contacts | account_contacts | 1:N | 任意 | コンタクトは複数アカウントに属しうる（例: 法人Account + 個人事業主Account） |
| contacts | talents | 1:0..1 | 任意 | タレント情報は任意（持たないコンタクトもある） |
| contacts | contact_emails | 1:N | 任意 | メールは0件でも可 |
| contacts | contact_phones | 1:N | 任意 | 電話は0件でも可 |
| contacts | number_diagnosis | N:0..1 | 任意 | ポテンシャル番号が設定されていれば参照 |
| contacts | constellation_fortune_telling | N:0..1 | 任意 | 星座が設定されていれば参照 |
| talents | talent_skills | 1:N | 任意 | スキルは0件でも可 |
| talents | talent_careers | 1:N | 任意 | 経歴は0件でも可 |
| skill_categories | skills | 1:N | 必須 | スキルは必ずカテゴリに属する |
| deals | contracts | 1:N | 任意 | 契約はディールに紐づかない状態を持てる（20260808000001。§16.6.1） |
| deals | deal_services | 1:N | 任意 | サービス紐づけは任意 |
| deals | deal_activities | 1:N | 任意 | ディールへの対応履歴（メール・電話・打合せ等） |
| deal_activities | deal_activity_emails | 1:0..1 | 任意 | メール対応時の詳細情報 |
| deals | deal_stage_histories | 1:N | 任意 | ステージの遷移履歴 |
| deals | deal_status_histories | 1:N | 任意 | ステージ内のステータス変更履歴 |
| companies/contacts | financial_info | 1:N | 任意 | 排他的所有（どちらか一方のみ） |
| companies/contacts | other_addresses | 1:N | 任意 | 排他的所有（どちらか一方のみ） |
| companies | company_change_histories | 1:N | 任意 | カンパニーのフィールド変更履歴 |
| accounts | account_change_histories | 1:N | 任意 | アカウントのフィールド変更履歴 |
| contacts | contact_change_histories | 1:N | 任意 | コンタクトのフィールド変更履歴 |
| deals | deal_change_histories | 1:N | 任意 | ディールのフィールド変更履歴 |
| talents | talent_change_histories | 1:N | 任意 | タレントのフィールド変更履歴 |
| crm_users | deals (owner) | 1:N | 任意 | 担当者未割当のディールも存在可能 |
| crm_users | accounts (owner) | 1:N | 任意 | 担当者未割当のアカウントも存在可能 |
| project_statuses | projects | 1:N | 必須 | プロジェクトは必ず1つのステータスに属する |
| crm_users | projects (owner) | 1:N | 任意 | プロジェクト責任者未割当も可能 |
| projects | project_members | 1:N | 任意 | メンバー0件のプロジェクトも可（初期作成直後など） |
| crm_users | project_members | 1:N | 任意 | 1ユーザーが複数プロジェクトに所属可能 |
| deals | deal_projects | 1:N | 任意 | ディールは複数プロジェクトに紐づきうる（OEM契約等） |
| projects | deal_projects | 1:N | 任意 | プロジェクトは複数ディールを束ねる |
| projects | project_change_histories | 1:N | 任意 | プロジェクトのフィールド変更履歴 |

---

## 4. 論理設計（全テーブル詳細）

### 凡例
- **PK**: 主キー, **FK**: 外部キー, **UK**: ユニーク制約, **NN**: NOT NULL
- **型**: PostgreSQLデータ型
- **区分値**: CHECK制約で制限される値のリスト
- **デフォルト**: DEFAULT値
- **バリデーション**: アプリ層(Zod)での追加検証ルール

### 共通監査カラム（Phase E 以降、全テーブル共通）

以下の監査カラムは全エンティティ（マスタ・トランザクション・従属・中間）に適用される。個別の表では省略する場合がある（簡潔化のため）。

| 論理名 | 物理名 | 型 | NN | デフォルト | 用途 |
|---|---|---|---|---|---|
| 作成日時 | `created_at` | TIMESTAMPTZ | NN | NOW() | 作成時刻。更新不可。 |
| 更新日時 | `updated_at` | TIMESTAMPTZ | NN | NOW() | `update_updated_at()` トリガーで自動更新。中間テーブルのみ省略。 |
| **作成者** | `created_by` | UUID FK→T01.id | NN | admin UUID | Server Action で `auth.uid()` を設定。未指定時は admin にフォールバック。 |
| **最終更新者** | `last_updated_by` | UUID FK→T01.id | | | UPDATE 時に Server Action で設定。中間テーブルは保持しない。 |
| 削除日時 | `deleted_at` | TIMESTAMPTZ | | NULL | 論理削除日時。`is_active` は廃止し本カラムで代替。 |
| 削除実行者 | `deleted_by` | UUID FK→T01.id | | | 論理削除実行者。 |
| 削除理由 | `deletion_reason` | TEXT | | | 任意入力の削除理由。 |

**除外テーブル:**
- `crm_users` / `activity_logs` / `*_change_histories` / `R01 constellation_fortune_telling` / `R02 number_diagnosis`
- 理由: 既に相当カラム保有 / INSERT ONLY / 読み取り専用

**「いつ・誰が・何を・どのように」追跡の役割分担:**
| 操作 | 「いつ・誰が」の捕捉 | 「何を・どのように」の捕捉 |
|---|---|---|
| CREATE | `created_at` + `created_by` | INSERT レコード自体 |
| UPDATE | `updated_at` + `last_updated_by` | `*_change_histories`（フィールド単位の old/new） |
| DELETE（論理） | `deleted_at` + `deleted_by` | `deletion_reason` |

---

### M01: pipeline_types（パイプライン種別）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | パイプライン名 | `name` | TEXT | | | UK | NN | | | 1-100文字 |
| 3 | パイプライン説明 | `description` | TEXT | | | | | | | max 500文字 |
| 4 | 表示順 | `sort_order` | INTEGER | | | | NN | 0 | >= 0 | |
| 5 | 有効フラグ | `is_active` | BOOLEAN | | | | NN | TRUE | | |
| 6 | **識別子** | **`slug`** | **VARCHAR(32)** | | | **UK** | **NN** | | **`^[a-z][a-z0-9_]{0,31}$`** | **拡張テーブル・UI解決キー** |
| 7 | **クローズ予定日の既定月数** | **`default_close_months`** | **INTEGER** | | | | | | **NULL または 0〜120** | **NULL は自動設定しない** |
| 8 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |
| 9 | 更新日時 | `updated_at` | TIMESTAMPTZ | | | | NN | NOW() | | トリガー自動更新 |

**slug について:**
- パイプラインごとのUI拡張コンポーネント（`src/components/deals/pipelines/<slug>/`）および拡張テーブル（`deal_ext_<slug>` 等）を解決するプログラムキー
- 現在の値: `sales` / `procurement` / `outsourcing`
  （`inside_sales` は Phase D で撤去済み。2026-04-19）

**default_close_months について:**
- ディール（`deals`）を新規作成したとき、`deals.expected_close_date` を「今日 ＋ N ヶ月」で初期設定するための既定月数（作成後も手動変更可）
- NULL の場合は自動設定しない（`expected_close_date` は空欄で作成される）
- 商材によってリードタイムが異なるため、パイプライン種別ごとに admin から調整する

**CRUD:** 管理者のみ作成・更新・論理削除（is_active=FALSE）。物理削除不可（FKで参照される）。

---

### M02: contract_types（契約種別）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | 契約種別名 | `name` | TEXT | | | UK | NN | | | 1-100文字 |
| 3 | 有効フラグ | `is_active` | BOOLEAN | | | | NN | TRUE | | |
| 4 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |
| 5 | 更新日時 | `updated_at` | TIMESTAMPTZ | | | | NN | NOW() | | トリガー自動更新 |

**CRUD:** M01と同じパターン。

---

### M03: corporate_types（法人格）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | 法人格名 | `name` | TEXT | | | UK | NN | | | 1-50文字 |
| 3 | 有効フラグ | `is_active` | BOOLEAN | | | | NN | TRUE | | |
| 4 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |
| 5 | 更新日時 | `updated_at` | TIMESTAMPTZ | | | | NN | NOW() | | トリガー自動更新 |

**CRUD:** M01と同じパターン。

---

### M04: services（サービス）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | サービス名 | `name` | TEXT | | | UK | NN | | | 1-100文字 |
| 3 | サービス説明 | `description` | TEXT | | | | | | | max 1000文字 |
| 4 | 有効フラグ | `is_active` | BOOLEAN | | | | NN | TRUE | | |
| 5 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |
| 6 | 更新日時 | `updated_at` | TIMESTAMPTZ | | | | NN | NOW() | | トリガー自動更新 |

**CRUD:** M01と同じパターン。

---

### M05: lead_sources（リードソース）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | リードソース名 | `name` | TEXT | | | UK | NN | | | 1-100文字 |
| 3 | **識別子** | **`slug`** | **VARCHAR(32)** | | | **UK** | **NN** | | **`^[a-z][a-z0-9_]{0,31}$`** | **CSV取込・Lead作成のプログラムキー** |
| 4 | リードソース説明 | `description` | TEXT | | | | | | | max 500文字 |
| 5 | 有効フラグ | `is_active` | BOOLEAN | | | | NN | TRUE | | |
| 6 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |
| 7 | 更新日時 | `updated_at` | TIMESTAMPTZ | | | | NN | NOW() | | トリガー自動更新 |

**既存バックフィル（20260419000003）:** `tele_appo` / `dm` / `web_form` / `referral` / `event` / `sns` / `line` / `other`

**CRUD:** M01と同じパターン。

---

### M06: account_types（アカウント種別）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | アカウント種別名 | `name` | TEXT | | | UK | NN | | | 1-50文字 |
| 3 | 有効フラグ | `is_active` | BOOLEAN | | | | NN | TRUE | | |
| 4 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |
| 5 | 更新日時 | `updated_at` | TIMESTAMPTZ | | | | NN | NOW() | | トリガー自動更新 |

**CRUD:** M01と同じパターン。

---

### M07: account_statuses（アカウントステータス）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | アカウントステータス名 | `name` | TEXT | | | UK | NN | | | 1-50文字 |
| 3 | **コード** | **`code`** | **VARCHAR(32)** | | | **UK** | **NN** | | **`^[a-z][a-z0-9_]{0,31}$`** | **CSV取込キー** |
| 4 | 有効フラグ | `is_active` | BOOLEAN | | | | NN | TRUE | | |
| 5 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |
| 6 | 更新日時 | `updated_at` | TIMESTAMPTZ | | | | NN | NOW() | | トリガー自動更新 |
| 7 | バッジ色 | `color` | TEXT | | | | | NULL | `^#[0-9A-Fa-f]{6}$` | §11 参照 |

**既存バックフィル:** `active` / `inactive` / `churned` / `prospect`（インサイドセールスの見込みリードは `prospect` を使用）

**CRUD:** M01と同じパターン。

---

### M08: contact_statuses（コンタクトステータス）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | コンタクトステータス名 | `name` | TEXT | | | UK | NN | | | 1-50文字 |
| 3 | 有効フラグ | `is_active` | BOOLEAN | | | | NN | TRUE | | |
| 4 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |
| 5 | 更新日時 | `updated_at` | TIMESTAMPTZ | | | | NN | NOW() | | トリガー自動更新 |
| 6 | バッジ色 | `color` | TEXT | | | | | NULL | `^#[0-9A-Fa-f]{6}$` | §11 参照 |

**初期値:** アクティブ / 休眠 / 退職

**「見込み」を持たない理由（2026-07-31）:** 連絡先ステータスは「連絡先として今も有効か」だけを表す。
「見込み」は営業上の進度であり、リード側（`lead_statuses`）が持つ。同じ語彙を両方に置くと
同一人物について 2 か所に進度が書かれ、どちらが正かが決まらない。
マイグレーション `20260731000009` で論理削除済み（既存の該当連絡先は「アクティブ」へ移行）。

**CRUD:** M01と同じパターン。

---

### M11: company_statuses（カンパニーステータス）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | カンパニーステータス名 | `name` | TEXT | | | UK | NN | | | 1-50文字 |
| 3 | 削除日時 | `deleted_at` | TIMESTAMPTZ | | | | | NULL | | 論理削除 |
| 4 | 削除実行者 | `deleted_by` | UUID | | FK→T01.id | | | | | |
| 5 | 削除理由 | `deletion_reason` | TEXT | | | | | | | |
| 6 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |
| 7 | 更新日時 | `updated_at` | TIMESTAMPTZ | | | | NN | NOW() | | トリガー自動更新 |
| 8 | バッジ色 | `color` | TEXT | | | | | NULL | `^#[0-9A-Fa-f]{6}$` | §11 参照 |

**CRUD:** M01と同じパターン（SELECT は認証済み全員、INSERT/UPDATE/DELETE は admin のみ）。
**初期値:** アクティブ / 休眠 / 取引停止 / 見込み

---

### M12: project_statuses（プロジェクトステータス）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | プロジェクトステータス名 | `name` | TEXT | | | UK | NN | | | 1-50文字 |
| 3 | 表示順 | `sort_order` | INTEGER | | | | NN | 0 | >= 0 | |
| 4 | 有効フラグ | `is_active` | BOOLEAN | | | | NN | TRUE | | |
| 5 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |
| 6 | 更新日時 | `updated_at` | TIMESTAMPTZ | | | | NN | NOW() | | トリガー自動更新 |

**CRUD:** M01と同じパターン（SELECT は認証済み全員、INSERT/UPDATE/DELETE は admin のみ）。
**初期値:** 計画中 / 進行中 / 保留 / 完了 / 中止

---

### M09: skill_categories（スキルカテゴリ）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | カテゴリ名 | `name` | TEXT | | | UK | NN | | | 1-50文字 |
| 3 | 表示順 | `sort_order` | INTEGER | | | | NN | 0 | >= 0 | |
| 4 | 有効フラグ | `is_active` | BOOLEAN | | | | NN | TRUE | | |
| 5 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |
| 6 | 更新日時 | `updated_at` | TIMESTAMPTZ | | | | NN | NOW() | | トリガー自動更新 |

**CRUD:** M01と同じパターン。

---

### M10: skills（スキル）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | スキルカテゴリID | `skill_category_id` | UUID | | FK→M09.id | | NN | | | |
| 3 | スキル名 | `name` | TEXT | | | | NN | | | 1-100文字 |
| 4 | 表示順 | `sort_order` | INTEGER | | | | NN | 0 | >= 0 | |
| 5 | 有効フラグ | `is_active` | BOOLEAN | | | | NN | TRUE | | |
| 6 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |
| 7 | 更新日時 | `updated_at` | TIMESTAMPTZ | | | | NN | NOW() | | トリガー自動更新 |

**UK:** (skill_category_id, name) — 同一カテゴリ内でスキル名は一意
**CRUD:** M01と同じパターン。

---

### S01: deal_stages（ディールステージ）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | パイプライン種別ID | `pipeline_type_id` | UUID | | FK→M01.id | | NN | | | |
| 3 | ステージ名 | `name` | TEXT | | | | NN | | | 1-100文字 |
| 4 | ITERRAから見た現状 | `current_situation` | TEXT | | | | | | | max 500文字 |
| 5 | 担当者アクション | `required_action` | TEXT | | | | | | | max 500文字 |
| 6 | 顧客の状況 | `customer_situation` | TEXT | | | | | | | max 500文字 |
| 7 | ステージ変更条件 | `transition_condition` | TEXT | | | | | | | max 500文字 |
| 8 | 表示順 | `sort_order` | INTEGER | | | | NN | 0 | >= 0 | |
| 9 | 有効フラグ | `is_active` | BOOLEAN | | | | NN | TRUE | | |
| 10 | ~~フェーズID~~ | ~~`phase_id`~~ | — | | — | | | | **廃止（20260419000002）** | `inside_sales_phases` 廃止に伴い削除。温度感は `lead_temperatures` で管理 |
| 11 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |
| 12 | 更新日時 | `updated_at` | TIMESTAMPTZ | | | | NN | NOW() | | トリガー自動更新 |

**UK:** (pipeline_type_id, name) — 同一パイプライン内でステージ名は一意

**CRUD:** 管理者のみ。論理削除。FK参照により物理削除不可。

---

### S02: deal_statuses（ディールステータス）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | ステータス名 | `name` | TEXT | | | | NN | | | 1-100文字 |
| 3 | パイプライン種別ID | `pipeline_type_id` | UUID | | FK→M01.id | | NN | | | |
| 4 | ディールステージID | `deal_stage_id` | UUID | | FK→S01.id | | | | | アプリ層でpipeline整合性チェック |
| 5 | 表示順 | `sort_order` | INTEGER | | | | NN | 0 | >= 0 | |
| 6 | 有効フラグ | `is_active` | BOOLEAN | | | | NN | TRUE | | |
| 7 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |
| 8 | 更新日時 | `updated_at` | TIMESTAMPTZ | | | | NN | NOW() | | トリガー自動更新 |

**UK:** (pipeline_type_id, deal_stage_id, name) — 同一パイプライン+ステージ内でステータス名は一意
**整合性:** deal_stage_id が指定される場合、そのステージの pipeline_type_id と本レコードの pipeline_type_id が一致すること（アプリ層で検証）
**CRUD:** 管理者のみ。論理削除。

---

### S03: industry_classifications（業種分類）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | 大分類コード | `major_code` | VARCHAR(2) | | | | NN | | | 2桁数字 |
| 3 | 大分類名 | `major_name` | TEXT | | | | NN | | | 1-100文字 |
| 4 | 中分類コード | `middle_code` | VARCHAR(3) | | | | | | | 3桁数字 |
| 5 | 中分類名 | `middle_name` | TEXT | | | | | | | 中分類コードありの場合必須 |
| 6 | 小分類コード | `minor_code` | VARCHAR(4) | | | | | | | 4桁数字 |
| 7 | 小分類名 | `minor_name` | TEXT | | | | | | | 小分類コードありの場合必須 |
| 8 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |

**UK:** (major_code, middle_code, minor_code) — コード組み合わせは一意（NULLは区別される）
**CHECK:** middle_code IS NOT NULL OR minor_code IS NULL（中分類なしに小分類は不可）
**CHECK:** (middle_code IS NULL) = (middle_name IS NULL) — コードと名称のセット整合性
**CHECK:** (minor_code IS NULL) = (minor_name IS NULL)
**CRUD:** 管理者のみ。総務省の業種分類に基づくシードデータ。追加・変更は稀。

---

### R01: constellation_fortune_telling（星座占い）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | 整理番号 | `sort_number` | INTEGER | | | UK | NN | | 1-12 | |
| 3 | 月 | `month` | SMALLINT | | | | NN | | 1-12 | |
| 4 | 境界日 | `boundary_day` | SMALLINT | | | | NN | | 1-31 | |
| 5 | 星座名 | `constellation` | TEXT | | | UK | NN | | | 1-20文字 |
| 6 | エレメント | `element` | TEXT | | | | NN | | 火/地/風/水 | |
| 7 | 属性の説明 | `element_description` | TEXT | | | | | | | max 500文字 |
| 8 | 性質 | `nature` | TEXT | | | | | | | max 50文字 |
| 9 | 性質の説明 | `nature_description` | TEXT | | | | | | | max 500文字 |
| 10 | キーワード | `keywords` | TEXT | | | | | | | max 200文字 |
| 11 | 強み | `strengths` | TEXT | | | | | | | max 500文字 |
| 12 | 弱み | `weaknesses` | TEXT | | | | | | | max 500文字 |
| 13 | 特徴 | `characteristics` | TEXT | | | | | | | max 1000文字 |
| 14 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |
| 15 | 更新日時 | `updated_at` | TIMESTAMPTZ | | | | NN | NOW() | | トリガー自動更新 |

**CRUD:** 管理者のみ更新可。12件固定のシードデータ。物理削除不可。

---

### R02: number_diagnosis（ポテンシャルプロファイリング）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | 番号 | `number` | INTEGER | | | UK | NN | | 1-60 | contactsからFK参照 |
| 3 | 動物No | `animal_no` | SMALLINT | | | | | | | |
| 4 | 動物名 | `animal` | TEXT | | | | | | | max 20文字 |
| 5 | キャラクター | `character` | TEXT | | | | | | | max 50文字 |
| 6 | リズムNo | `rhythm_no` | SMALLINT | | | | | | | |
| 7 | リズム | `rhythm` | TEXT | | | | | | | max 20文字 |
| 8 | 分類No | `classification_no` | SMALLINT | | | | | | | |
| 9 | ３分類 | `three_classification` | TEXT | | | | | | | max 20文字 |
| 10 | 循環 | `circulation` | TEXT | | | | | | | max 20文字 |
| 11 | 中心 | `center` | TEXT | | | | | | | max 20文字 |
| 12 | 展望 | `outlook` | TEXT | | | | | | | max 20文字 |
| 13 | 軸 | `axis` | TEXT | | | | | | | max 20文字 |
| 14 | 指向 | `orientation` | TEXT | | | | | | | max 20文字 |
| 15 | ポテンシャル | `potential` | TEXT | | | | | | | max 50文字 |
| 16 | 優位脳 | `dominant_brain` | TEXT | | | | | | | max 20文字 |
| 17 | 脳特徴 | `brain_characteristics` | TEXT | | | | | | | max 100文字 |
| 18 | 得意部位 | `strong_area` | TEXT | | | | | | | max 50文字 |
| 19 | 重視 | `priority` | TEXT | | | | | | | max 50文字 |
| 20 | タイプ | `type` | TEXT | | | | | | | max 50文字 |
| 21 | 判断基準 | `judgment_criteria` | TEXT | | | | | | | max 100文字 |
| 22 | 強み | `strengths` | TEXT | | | | | | | max 500文字 |
| 23 | 弱み | `weaknesses` | TEXT | | | | | | | max 500文字 |
| 24 | 個数 | `count` | SMALLINT | | | | | | | |
| 25 | 出現度 | `frequency` | TEXT | | | | | | | max 50文字 |
| 26 | キャラクター画像URL | `character_image_url` | TEXT | | | | | | | URL形式バリデーション |
| 27 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |
| 28 | 更新日時 | `updated_at` | TIMESTAMPTZ | | | | NN | NOW() | | トリガー自動更新 |

**CRUD:** 管理者のみ更新可。60件固定のシードデータ。物理削除不可。

---

### T01: crm_users（CRMユーザー）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | FK→auth.users.id (CASCADE) | | NN | | | |
| 2 | メールアドレス | `email` | TEXT | | | UK | NN | | | RFC5322準拠 |
| 3 | 氏名 | `full_name` | TEXT | | | | NN | | | 1-100文字 |
| 4 | 氏名フリガナ | `full_name_kana` | TEXT | | | | | | | カタカナのみ |
| 5 | ロール | `role` | TEXT | | | | NN | 'member' | 'member','manager','admin' | |
| 6 | アバターURL | `avatar_url` | TEXT | | | | | | | URL形式 |
| 7 | 有効フラグ | `is_active` | BOOLEAN | | | | NN | TRUE | | |
| 8 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |
| 9 | 更新日時 | `updated_at` | TIMESTAMPTZ | | | | NN | NOW() | | トリガー自動更新 |

**区分値 role:**
| 値 | 説明 |
|---|------|
| member | 一般メンバー。自分が担当するデータのみ操作可 |
| manager | マネージャー。全データ閲覧可、自分の担当データ編集可 |
| admin | 管理者。全データのCRUD、マスタ管理可 |

**CRUD:**
- CREATE: auth.users登録時にトリガーで自動作成
- READ: 自分自身 + manager/adminは全件
- UPDATE: 自分自身のプロフィール情報のみ。roleの変更はadminのみ
- DELETE: 論理削除（is_active=FALSE）。adminのみ

---

### T02: companies（カンパニー）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | 会社コード | `company_code` | VARCHAR(10) | | | UK | NN | トリガー自動採番 | 'CMP-'＋6桁連番 | 更新不可 |
| 3 | 法人格ID | `corporate_type_id` | UUID | | FK→M03.id | | | | | |
| 4 | 会社名 | `name` | TEXT | | | | NN | | | 1-200文字 |
| 5 | 会社名フリガナ | `name_kana` | TEXT | | | | | | | カタカナのみ, max 200文字 |
| 6 | 代表者名 | `representative_name` | TEXT | | | | | | | max 100文字 |
| 7 | 法人番号 | `corporate_number` | VARCHAR(13) | | | UK(NULLable) | | | | 13桁数字。法人のみ |
| 8 | インボイス登録有無 | `invoice_registered` | BOOLEAN | | | | NN | FALSE | | |
| 9 | インボイス登録番号 | `invoice_registration_number` | VARCHAR(14) | | | UK(NULLable) | | | | 'T'+13桁数字。invoice_registered=TRUEの場合必須 |
| 10 | 郵便番号 | `postal_code` | VARCHAR(8) | | | | | | | nnn-nnnn形式 |
| 11 | 都道府県 | `prefecture` | TEXT | | | | | | 47都道府県 | |
| 12 | 市区町村 | `city` | TEXT | | | | | | | max 100文字 |
| 13 | 丁目・番地 | `address_line1` | TEXT | | | | | | | max 200文字 |
| 14 | 建物名等 | `address_line2` | TEXT | | | | | | | max 200文字 |
| 15 | 代表電話番号 | `phone` | VARCHAR(20) | | | | | | | 電話番号形式 |
| 16 | FAX番号 | `fax` | VARCHAR(20) | | | | | | | 電話番号形式 |
| 17 | ホームページURL | `website_url` | TEXT | | | | | | | URL形式 |
| 18 | 業種分類ID | `industry_classification_id` | UUID | | FK→S03.id | | | | | |
| 19 | 登記事項証明書URL | `registration_certificate_url` | TEXT | | | | | | | URL形式 |
| 20 | 社内メモ | `internal_memo` | TEXT | | | | | | | max 2000文字 |
| 21 | リードソースID | `lead_source_id` | UUID | | FK→M05.id | | | | | |
| 22 | 担当者ID | `owner_user_id` | UUID | | FK→T01.id | | | | | |
| 23 | カンパニーステータスID | `company_status_id` | UUID | | FK→M11.id | | NN | | | |
| 24 | ステータス更新日時 | `status_updated_at` | TIMESTAMPTZ | | | | | NULL | | ステータス変更時に自動更新 |
| 25 | 有効フラグ | `is_active` | BOOLEAN | | | | NN | TRUE | | |
| 26 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |
| 27 | 更新日時 | `updated_at` | TIMESTAMPTZ | | | | NN | NOW() | | トリガー自動更新 |

**CHECK:** invoice_registered = FALSE OR invoice_registration_number IS NOT NULL
**INDEX:** name, owner_user_id, corporate_type_id, company_status_id
**CRUD:**
- CREATE: member以上。company_codeはトリガーで自動採番
- READ: member=自分の担当のみ、manager/admin=全件
- UPDATE: member=自分の担当のみ、admin=全件
- DELETE: 論理削除（is_active=FALSE）。配下にaccountsがある場合は削除不可（アプリ層チェック）

---

### T03: accounts（アカウント）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | アカウントコード | `account_code` | VARCHAR(10) | | | UK | NN | トリガー自動採番 | 'ACC-'＋6桁連番 | 更新不可 |
| 3 | カンパニーID | `company_id` | UUID | | FK→T02.id | | | | | |
| 4 | アカウント種別ID | `account_type_id` | UUID | | FK→M06.id | | | | | |
| 5 | アカウントステータスID | `account_status_id` | UUID | | FK→M07.id | | NN | | | 初回作成時にデフォルトステータスをアプリ層で設定 |
| 6 | アカウント名 | `name` | TEXT | | | | NN | | | 1-200文字 |
| 7 | 説明 | `description` | TEXT | | | | | | | max 1000文字 |
| 8 | リードソースID | `lead_source_id` | UUID | | FK→M05.id | | | | | |
| 9 | 担当者ID | `owner_user_id` | UUID | | FK→T01.id | | | | | |
| 10 | 有効フラグ | `is_active` | BOOLEAN | | | | NN | TRUE | | |
| 11 | ステータス更新日時 | `status_updated_at` | TIMESTAMPTZ | | | | | | | ステータス変更時にアプリ層で更新 |
| 12 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |
| 13 | 更新日時 | `updated_at` | TIMESTAMPTZ | | | | NN | NOW() | | トリガー自動更新 |

**アカウントの2つのパターン:**
| パターン | company_id | 説明 | 例 |
|---------|-----------|------|---|
| 法人アカウント | NOT NULL | Companyに紐づく取引主体 | 株式会社ABCのアカウント |
| 個人アカウント | NULL | Company無し。個人事業主等の取引主体 | 田中太郎事務所 |

- 法人アカウント: company_id にCompanyを設定。account_contacts でそのCompanyの従業員をContactとして紐づけ
- 個人アカウント: company_id = NULL。account_contacts でContactを直接紐づけ
- **同一Contactが複数Accountに属することが可能**（例: 法人の従業員として + 個人事業主として）

**INDEX:** company_id, owner_user_id, account_status_id
**CRUD:**
- CREATE: member以上。account_codeはトリガーで自動採番
- READ: member=自分の担当のみ、manager/admin=全件
- UPDATE: member=自分の担当のみ、admin=全件。ステータス変更時はstatus_updated_atも更新
- DELETE: 論理削除。配下にdealsがある場合は削除不可

---

### T04: contacts（コンタクト）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | コンタクトコード | `contact_code` | VARCHAR(10) | | | UK | NN | トリガー自動採番 | 'CNT-'＋6桁連番 | 更新不可 |
| 3 | 姓 | `last_name` | TEXT | | | | NN | | | 1-50文字 |
| 4 | ミドルネーム | `middle_name` | TEXT | | | | | | | max 50文字 |
| 5 | 名 | `first_name` | TEXT | | | | NN | | | 1-50文字 |
| 6 | 姓フリガナ | `last_name_kana` | TEXT | | | | | | | カタカナのみ, max 50文字 |
| 7 | ミドルフリガナ | `middle_name_kana` | TEXT | | | | | | | カタカナのみ, max 50文字 |
| 8 | 名フリガナ | `first_name_kana` | TEXT | | | | | | | カタカナのみ, max 50文字 |
| 9 | コンタクトステータスID | `contact_status_id` | UUID | | FK→M08.id | | NN | | | 初回作成時にデフォルトステータスをアプリ層で設定 |
| 10 | コンタクト種別 | `contact_type` | TEXT | | | | | | 'individual','corporate_rep','employee','other' | |
| 10a | カンパニーID | `company_id` | UUID | | FK→T02.id | | | | | corporate_rep/employeeの場合に設定 |
| 11 | インボイス登録有無 | `invoice_registered` | BOOLEAN | | | | NN | FALSE | | |
| 12 | インボイス登録番号 | `invoice_registration_number` | VARCHAR(14) | | | UK(NULLable) | | | | 'T'+13桁。registered=TRUEの場合必須 |
| 13 | 郵便番号 | `postal_code` | VARCHAR(8) | | | | | | | nnn-nnnn形式 |
| 14 | 都道府県 | `prefecture` | TEXT | | | | | | 47都道府県 | |
| 15 | 市区町村 | `city` | TEXT | | | | | | | max 100文字 |
| 16 | 丁目・番地 | `address_line1` | TEXT | | | | | | | max 200文字 |
| 17 | 建物名等 | `address_line2` | TEXT | | | | | | | max 200文字 |
| 18 | 部署 | `department` | TEXT | | | | | | | max 100文字 |
| 19 | 役職 | `job_title` | TEXT | | | | | | | max 100文字 |
| 20 | 生年月日 | `birth_date` | DATE | | | | | | | 未来日不可 |
| 20a | 血液型 | `blood_type` | TEXT | | | | | NULL | A/B/AB/O | CHECK 制約で4値に限定 |
| 21 | ポテンシャル番号 | `potential_number` | INTEGER | | FK→R02.number | | | | 1-60 | birth_date から自動算出（§10）。内部キーとして保持し、画面表示は R02.type（ポテンシャルタイプ）を使用。ユーザー明示指定は優先 |
| 22 | 星座ID | `constellation_id` | UUID | | FK→R01.id | | | | | birth_date から自動算出（§10）。ユーザーが明示指定した場合はそれを優先 |
| 23 | リードソースID | `lead_source_id` | UUID | | FK→M05.id | | | | | |
| 24 | LINEユーザーID | `line_user_id` | TEXT | | | UK(NULLable) | | | | |
| 24a | 個人サイトURL | `website_url` | TEXT | | | | | | | max 500文字。Lead 個人昇格時に leads.url から転記 |
| 25 | 社内メモ | `internal_memo` | TEXT | | | | | | | max 2000文字 |
| 26 | 担当者ID | `owner_user_id` | UUID | | FK→T01.id | | | | | |
| 27 | 有効フラグ | `is_active` | BOOLEAN | | | | NN | TRUE | | |
| 28 | ステータス更新日時 | `status_updated_at` | TIMESTAMPTZ | | | | | | | |
| 29 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |
| 30 | 更新日時 | `updated_at` | TIMESTAMPTZ | | | | NN | NOW() | | トリガー自動更新 |

**区分値 contact_type:**
| 値 | 説明 |
|---|------|
| individual | 個人 |
| corporate_rep | 法人代表者 |
| employee | 企業の従業員/担当者 |
| other | その他 |

**CHECK:**
- invoice_registered = FALSE OR invoice_registration_number IS NOT NULL
- contact_type IN ('corporate_rep','employee') の場合 company_id IS NOT NULL（アプリ層で制御）
- contact_type = 'individual' の場合 company_id IS NULL（アプリ層で制御）。
  **例外: 個人事業主の本人は `company_id` にその事業者を持つ**（§22.2.4）。
  個人事業主は法人ではないため `corporate_rep` にせず `individual` のまま事業者へ結ぶ。
  整合性検査を `individual` へ広げるときはこの例外を除外すること

**INDEX:** last_name + first_name, contact_status_id, owner_user_id, potential_number, company_id
**CRUD:**
- CREATE: member以上。contact_codeはトリガーで自動採番
- READ: member=自分の担当のみ、manager/admin=全件
- UPDATE: member=自分の担当のみ、admin=全件
- DELETE: 論理削除。配下のcontact_emails, contact_phones, talentsは CASCADE

---

### T05: deals（ディール）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | ディールコード | `deal_code` | VARCHAR(9) | | | UK | NN | トリガー自動採番 | 'DL-'＋6桁連番 | 更新不可 |
| 3 | 取引名 | `name` | TEXT | | | | NN | | | 1-200文字 |
| 4 | パイプライン種別ID | `pipeline_type_id` | UUID | | FK→M01.id | | NN | | | |
| 5 | ディールステージID | `deal_stage_id` | UUID | | FK→S01.id | | NN | | | pipeline_type_idとの整合性（アプリ層） |
| 6 | ディールステータスID | `deal_status_id` | UUID | | FK→S02.id | | NN | | | pipeline+stageとの整合性（アプリ層） |
| 7 | 金額 | `amount` | BIGINT | | | | | | >= 0 | |
| 8 | アカウントID | `account_id` | UUID | | FK→T03.id | | | | | **契約成立時に作られるため、契約前は NULL**（20260731000006） |
| 8a | カンパニーID | `company_id` | UUID | | FK→T02.id | | | | | 取引先が未作成の間の相手法人 |
| 8b | コンタクトID | `contact_id` | UUID | | FK→T04.id | | | | | 取引先が未作成の間の相手担当者 |
| 8c | **リードID** | **`lead_id`** | UUID | | FK→T09.id | | | | | **紐づけの正本**（20260808000004）。1 リードにディール N 本。requires_lead なパイプラインでは必須。§16.6.3 |
| 9 | 取引担当者ID | `owner_user_id` | UUID | | FK→T01.id | | | | | |
| 10 | ~~契約書名~~ | ~~`contract_name`~~ | TEXT | | | | | | | **【非推奨・2026-08-07】契約の正本は T06 contracts（`contracts.deal_id` で紐づく）。アプリからは読み書きしない**（20260807000001。§16.6.1） |
| 11 | 申請日 | `application_date` | DATE | | | | | | | |
| 12 | 審査完了日 | `review_completed_date` | DATE | | | | | | | application_date以降 |
| 13 | ステージ更新日時 | `stage_updated_at` | TIMESTAMPTZ | | | | | | | ステージ変更時にアプリ層で更新 |
| 14 | クローズ日時 | `closed_at` | TIMESTAMPTZ | | | | | | | |
| 15 | **クローズ予定日** | **`expected_close_date`** | **DATE** | | | | | | | **新規作成時に `pipeline_types.default_close_months` から「今日＋N ヶ月」で自動セット（手動変更可）** |
| 16 | 最終更新者ID | `last_updated_by` | UUID | | FK→T01.id | | | | | |
| 17 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |
| 18 | 更新日時 | `updated_at` | TIMESTAMPTZ | | | | NN | NOW() | | トリガー自動更新 |

**CHECK:** `account_id IS NOT NULL OR company_id IS NOT NULL OR contact_id IS NOT NULL`（相手が特定できないディールは作れない）

**取引先の作られ方（2026-07-31 変更）:**
取引先は契約主体なので、契約が成立するまで作らない。

```
Lead ─取込→ Company + Contact          （名刺はリードであると同時に連絡先）
     ─昇格→ Deal（account_id = NULL、company_id / contact_id で相手を示す）
     ─契約→ Account 作成 + Deal に紐付け（contracts の AFTER INSERT トリガー）
```

表示側は取引先 → 事業者情報 → 連絡先の順でフォールバックする（`src/lib/deal-counterparty.ts`）。

**設計変更点:**
- `account_id` は当初 **必須(NN)** だったが、上記の運用変更に伴い任意へ戻した
- `primary_contact_id` を **削除**。コンタクトとDealの関係はAccount経由（account_contacts）で表現される
- `contractor_company_name` / `contractor_representative` を **削除**。Account→Companyから取得可能であり、非正規化による整合性リスクを排除。表示時はJOINで取得する

**整合性チェック（アプリ層 Zod + Server Action）:**
1. deal_stage_id のステージが pipeline_type_id に属すること
2. deal_status_id のステータスが pipeline_type_id（+ deal_stage_id）に属すること
3. review_completed_date >= application_date
4. closed_at 設定時はステータスがクローズ系であること
5. account_id のAccountが存在し、is_active=TRUEであること

**INDEX:** pipeline_type_id, deal_stage_id, deal_status_id, account_id, owner_user_id, created_at DESC, expected_close_date（部分INDEX。`WHERE closed_at IS NULL AND deleted_at IS NULL`。期日超過抽出・期日順ソート用）
**CRUD:**
- CREATE: member以上。deal_codeはトリガーで自動採番
- READ: member=自分の担当のみ、manager/admin=全件
- UPDATE: member=自分の担当のみ、admin=全件。ステージ変更時にstage_updated_at更新、activity_logにも記録
- DELETE: 論理削除不可（deals自体は削除しない運用）。クローズのみ

---

## 5.X パイプライン拡張の共通規約

パイプラインごとに管理カラムが大きく異なる場合、`deals` 本体は共通のまま、固有カラムは拡張テーブルへ切り出す。新規パイプライン追加時は以下の規約に従う。

### 命名規則
| 種別 | 命名 | 例 |
|---|---|---|
| パイプライン識別子 | `pipeline_types.slug` | `inside_sales` |
| 拡張本体（Deal 1:1） | `deal_ext_<slug>` | `deal_ext_inside_sales` |
| 拡張子テーブル（Deal 1:N） | `deal_ext_<slug>_<entity>` | `deal_ext_inside_sales_calls` |
| パイプライン固有マスタ | `<slug>_<master>` | `inside_sales_phases`, `inside_sales_call_statuses` |

### 構造ルール
1. 拡張本体の主キーは `deal_id UUID PK, FK→deals.id ON DELETE CASCADE`（1:1保証）
2. 子テーブルも `deal_id` を FK 保持、`ON DELETE CASCADE`
3. 拡張カラムの中で**繰り返し構造**（例: 架電N回分）は必ず子テーブルに正規化する
4. `created_at / updated_at` を全拡張テーブルに付与。`updated_at` は `update_updated_at()` トリガーで自動更新
5. パイプライン固有マスタには **`code VARCHAR(32) UK NN`** を必ず持たせる（CSV取込・外部連携キー）

### RLS
- 拡張テーブルは **`is_deal_accessible(deal_id)`** 関数を使用した一元ポリシーを適用
- 親dealが生きていて、呼び出しユーザーがオーナー or manager/admin の場合のみアクセス可

### アプリ層
```
src/
├── actions/deals/
│   ├── inside-sales.ts   # パイプライン固有Server Action
│   └── ...
├── lib/validators/deals/
│   ├── inside-sales.ts   # パイプライン固有Zodスキーマ
│   └── ...
└── components/deals/pipelines/
    └── <slug>/            # 拡張UIコンポーネント（form / detail / 補助）
```
UIは `pipeline_types.slug` をキーにしたレジストリパターンで拡張コンポーネントを解決する。

### フェーズ設計（パイプライン単位独立）
- フェーズは **パイプラインごとに独立したマスタテーブル**（`<slug>_phases`）で定義
- `deal_stages.phase_id` で該当パイプラインのフェーズに紐づけるが、**DB-FKは張らない**（新規パイプライン追加時の schema 変更を避けるため）
- 整合性はアプリ層で担保：`pipeline_type.slug` → `<slug>_phases` を解決し `phase_id` の妥当性を検証

### アカウント×パイプラインの現在フェーズ
派生ビュー **`v_account_current_phase`** が以下を返す：
- (account_id, pipeline_type_id, phase_id, leading_deal_id)
- 集約ルール: 当該パイプラインで closed でない deal のうち `stage_updated_at` が最新のものを代表とする

アカウントのステータスはフェーズの組み合わせから**業務ロジックで決定される想定**だが、現状は手動設定のまま（自動導出は将来拡張）。

---

## ~~5.Y インサイドセールス拡張（slug='inside_sales'）~~

> **Phase D 完了（2026-04-19）: この拡張は撤去済みです。**
>
> `deal_ext_inside_sales` / `deal_ext_inside_sales_calls` テーブルはマイグレーション
> `20260419000010_drop_inside_sales_legacy.sql` で物理削除されました。
>
> 架電記録の機能は Lead エンティティ（§11）の `lead_activities` テーブルに移管済み。
> 新規パイプライン拡張を追加する場合は §5.X の命名規則・構造ルールに従ってください。
**RLS:** `is_deal_accessible(deal_id)` に委譲
**補足:** 削除時は call_number の gap を許容（詰めない）。CSV取込では deal_id ごとにまとめて投入

---

### T06: contracts（契約）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | 契約コード | `contract_code` | VARCHAR(10) | | | UK | NN | トリガー自動採番 | 'CTR-'＋6桁連番 | 更新不可 |
| 3 | ディールID | `deal_id` | UUID | | FK→T05.id | | | | | **任意**（20260808000001）。どのディールにも紐づかない契約を持てる。§16.6.1 |
| 4 | 契約方法 | `contract_method` | TEXT | | | | | | 'paper','electronic','verbal' | |
| 5 | 契約種別ID | `contract_type_id` | UUID | | FK→M02.id | | | | | |
| 6 | 契約書名 | `contract_name` | TEXT | | | | | | | max 200文字。**人が入れる文書名**。契約名の材料になる |
| 6a | **契約名** | **`contract_display_name`** | TEXT | | | | | | | **自動生成**（締結日_契約書名_契約種別_金額_契約ID）。人は編集しない。§16.6.2 |
| 6b | 金額 | `amount` | BIGINT | | | | | | >= 0 | `deals.amount` とは別（1 ディールに複数の契約が下がる） |
| 7 | 契約相手先種別 | `counterparty_type` | TEXT | | | | | | 'company','individual' | |
| 8 | 契約相手先カンパニーID | `counterparty_company_id` | UUID | | FK→T02.id | | | | | counterparty_type='company'の場合 |
| 9 | 契約相手先コンタクトID | `counterparty_contact_id` | UUID | | FK→T04.id | | | | | counterparty_type='individual'の場合 |
| 10 | 契約担当者ID | `counterparty_manager_id` | UUID | | FK→T04.id | | | | | counterparty_type='company'の場合、該当CompanyのContact（company_id一致）から選択 |
| 11 | 契約内容 | `contract_content` | TEXT | | | | | | | max 5000文字 |
| 12 | 契約送付日 | `sent_date` | DATE | | | | | | | |
| 13 | 契約サインバック日 | `signback_date` | DATE | | | | | | | sent_date以降 |
| 14 | 契約締結日 | `execution_date` | DATE | | | | | | | |
| 15 | 契約開始日 | `start_date` | DATE | | | | | | | |
| 16 | 契約終了日 | `end_date` | DATE | | | | | | | start_date以降 |
| 17 | 自動更新有無 | `auto_renewal` | BOOLEAN | | | | NN | FALSE | | |
| 18 | 解約日 | `cancellation_date` | DATE | | | | | | | start_date以降 |
| 19 | 契約書原本URL | `original_document_url` | TEXT | | | | | | | URL形式 |
| 20 | 契約書URL | `contract_url` | TEXT | | | | | | | URL形式 |
| 21 | 登録担当者ID | `registered_by` | UUID | | FK→T01.id | | | | | |
| 22 | 有効フラグ | `is_active` | BOOLEAN | | | | NN | TRUE | | |
| 23 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |
| 24 | 更新日時 | `updated_at` | TIMESTAMPTZ | | | | NN | NOW() | | トリガー自動更新 |

**区分値 contract_method:**
| 値 | 説明 |
|---|------|
| paper | 紙面契約 |
| electronic | 電子契約 |
| verbal | 口頭契約 |

**区分値 counterparty_type:**
| 値 | 説明 |
|---|------|
| company | 法人 |
| individual | 個人 |

**CHECK:** end_date IS NULL OR start_date IS NULL OR end_date >= start_date
**CHECK:** signback_date IS NULL OR sent_date IS NULL OR signback_date >= sent_date
**CHECK:** cancellation_date IS NULL OR start_date IS NULL OR cancellation_date >= start_date

**整合性チェック（アプリ層）:**
- counterparty_type='company' の場合: counterparty_manager_id のContactは counterparty_company_id と同じ company_id を持つこと
- counterparty_type='individual' の場合: counterparty_manager_id は不要（counterparty_contact_id が契約者本人）
**INDEX:** deal_id, contract_type_id, counterparty_company_id, counterparty_contact_id, counterparty_manager_id
**CRUD:**
- CREATE: manager/admin
- READ: manager/admin
- UPDATE: manager/admin
- DELETE: 論理削除（is_active=FALSE）。adminのみ

---

### T07: talents（タレント）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | コンタクトID | `contact_id` | UUID | | FK→T04.id (CASCADE) | UK | NN | | | 1コンタクト1タレント |
| 3 | 性格分析メモ | `personality_memo` | TEXT | | | | | | | max 5000文字 |
| 4 | 独自の強み | `custom_strengths` | TEXT | | | | | | | max 2000文字 |
| 5 | 独自の弱み | `custom_weaknesses` | TEXT | | | | | | | max 2000文字 |
| 6 | 適性メモ | `aptitude_notes` | TEXT | | | | | | | max 2000文字 |
| 7 | 総合評価 | `overall_assessment` | TEXT | | | | | | | max 3000文字 |
| 8 | 有効フラグ | `is_active` | BOOLEAN | | | | NN | TRUE | | |
| 9 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |
| 10 | 更新日時 | `updated_at` | TIMESTAMPTZ | | | | NN | NOW() | | トリガー自動更新 |

**UK:** contact_id — 1コンタクトにつき1タレントレコードのみ
**CRUD:**
- CREATE: member以上。コンタクトが存在する場合のみ
- READ: コンタクトのアクセス権に従う
- UPDATE: member=自分の担当コンタクトのタレントのみ、admin=全件
- DELETE: コンタクト削除時にCASCADE

---

### T08: projects（プロジェクト）

複数ディールを横断的にグルーピングする業務イニシアチブ。単一アカウントに閉じず、複数アカウント・複数パイプライン種別のディールを 1 つのプロジェクトで束ねられる（例: 万博プロジェクト = A社への営業取引 + B社との仕入れ取引 + OEM 契約取引）。ディールとは N:M（`deal_projects`）、メンバーとは 1:N（`project_members`）で関連。

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | プロジェクトコード | `project_code` | VARCHAR(10) | | | UK | NN | トリガー自動採番 | 'PRJ-'＋6桁連番 | 更新不可 |
| 3 | プロジェクト名 | `name` | TEXT | | | | NN | | | 1-200文字 |
| 4 | 説明 | `description` | TEXT | | | | | | | max 1000文字 |
| 5 | プロジェクトステータスID | `project_status_id` | UUID | | FK→M12.id | | NN | | | 初回作成時にデフォルトステータス（計画中）をアプリ層で設定 |
| 6 | 開始日 | `start_date` | DATE | | | | | | | |
| 7 | 終了予定日 | `end_date` | DATE | | | | | | end_date >= start_date | |
| 8 | 責任者ID | `owner_user_id` | UUID | | FK→T01.id | | | | | プロジェクト責任者（1 名） |
| 9 | 社内メモ | `internal_memo` | TEXT | | | | | | | max 2000文字 |
| 10 | 有効フラグ | `is_active` | BOOLEAN | | | | NN | TRUE | | 論理削除 |
| 11 | ステータス更新日時 | `status_updated_at` | TIMESTAMPTZ | | | | | | | ステータス変更時にアプリ層で更新 |
| 12 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |
| 13 | 更新日時 | `updated_at` | TIMESTAMPTZ | | | | NN | NOW() | | トリガー自動更新 |

**CHECK:** end_date IS NULL OR start_date IS NULL OR end_date >= start_date
**INDEX:** project_status_id, owner_user_id, start_date, created_at DESC

**Phase A の RLS 方針（暫定）:**
- SELECT: 認証済み全員（新 3 段階ロール方針の先行適用）
- INSERT: manager / admin
- UPDATE: manager / admin（Phase D で既存エンティティも同方針へ統一予定）
- DELETE: 論理削除（is_active=FALSE）。admin のみ

**CRUD（UI 観点）:**
- CREATE: manager 以上。project_code はトリガーで自動採番
- READ: 全認証ユーザー
- UPDATE: manager / admin
- DELETE: 論理削除。admin のみ。配下の deal_projects は残置（プロジェクト側が非表示になっても過去の紐づけは保持）

---

### D01: contact_emails（コンタクトメール）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | コンタクトID | `contact_id` | UUID | | FK→T04.id (CASCADE) | | NN | | | |
| 3 | メールアドレス | `email` | TEXT | | | | NN | | | RFC5322準拠 |
| 4 | ラベル | `label` | TEXT | | | | NN | 'work' | 'work','personal','other' | |
| 5 | 主メールフラグ | `is_primary` | BOOLEAN | | | | NN | FALSE | | 同一contactで1件のみTRUE（アプリ層で制御） |
| 6 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |

**UK:** (contact_id, email) — 同一コンタクトで同じメールは登録不可
**INDEX:** email（メールアドレスでの検索用）
**ビジネスルール:** 1コンタクトにつきis_primary=TRUEは最大1件（アプリ層でUPSERT時にチェック）
**CRUD:** 親コンタクトのCRUD権限に従う。CASCADE削除。

---

### D02: contact_phones（コンタクト電話）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | コンタクトID | `contact_id` | UUID | | FK→T04.id (CASCADE) | | NN | | | |
| 3 | 電話番号 | `phone` | VARCHAR(20) | | | | NN | | | 電話番号形式 |
| 4 | ラベル | `label` | TEXT | | | | NN | 'work' | 'work','mobile','home','fax','other' | |
| 5 | 主電話フラグ | `is_primary` | BOOLEAN | | | | NN | FALSE | | 同一contactで1件のみTRUE |
| 6 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |

**UK:** (contact_id, phone) — 同一コンタクトで同じ電話番号は登録不可
**INDEX:** phone
**CRUD:** D01と同じパターン。

---

### D03: financial_info（金融機関情報）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | カンパニーID | `company_id` | UUID | | FK→T02.id (CASCADE) | | | | | company_id/contact_id排他 |
| 3 | コンタクトID | `contact_id` | UUID | | FK→T04.id (CASCADE) | | | | | company_id/contact_id排他 |
| 4 | 金融機関名 | `bank_name` | TEXT | | | | NN | | | 1-100文字 |
| 5 | 金融機関コード | `bank_code` | VARCHAR(4) | | | | | | | 4桁数字 |
| 6 | 支店名 | `branch_name` | TEXT | | | | | | | max 100文字 |
| 7 | 支店コード | `branch_code` | VARCHAR(3) | | | | | | | 3桁数字 |
| 8 | 口座種別 | `account_type` | TEXT | | | | | | 'ordinary','current','savings' | |
| 9 | 口座番号 | `account_number` | VARCHAR(7) | | | | | | | 7桁数字 |
| 10 | 口座名義人 | `account_holder` | TEXT | | | | | | | max 100文字 |
| 11 | 口座名義人フリガナ | `account_holder_kana` | TEXT | | | | | | | カタカナのみ |
| 12 | 通帳コピーURL | `passbook_copy_url` | TEXT | | | | | | | URL形式 |
| 13 | 主口座フラグ | `is_primary` | BOOLEAN | | | | NN | TRUE | | |
| 14 | 有効フラグ | `is_active` | BOOLEAN | | | | NN | TRUE | | |
| 15 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |
| 16 | 更新日時 | `updated_at` | TIMESTAMPTZ | | | | NN | NOW() | | トリガー自動更新 |

**区分値 account_type:**
| 値 | 説明 |
|---|------|
| ordinary | 普通預金 |
| current | 当座預金 |
| savings | 貯蓄預金 |

**CHECK:** (company_id IS NOT NULL AND contact_id IS NULL) OR (company_id IS NULL AND contact_id IS NOT NULL) — 排他的所有
**CRUD:**
- CREATE/UPDATE/DELETE: admin のみ
- READ: manager/admin のみ（機密情報のため）

**索引（20260802000019）:**
| 索引 | 目的 |
|---|---|
| `idx_financial_info_company` | 事業者ごとに引く（`deleted_at IS NULL` の部分索引） |
| `uq_financial_info_primary_company` | 事業者ごとに主口座は 1 つ。振込先が二重に「主」になるとどちらへ払うのか決まらない |

**画面:** 事業者情報の編集ページに `FinancialInfoEditor`、詳細ページに読み取りを置く。
住所と同じく本体の保存とは切り離してその場で反映する。**manager 未満には
`getCompanyFinancialInfo` が拒否を返し、欄ごと出さない**（口座番号を含むため）。
主口座の付け替え・削除時の繰り上げは Server Action 側で面倒を見る
（`src/actions/financial-info.ts`）。

---

### D04: other_addresses（追加住所）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | カンパニーID | `company_id` | UUID | | FK→T02.id (CASCADE) | | | | | 排他的所有 |
| 3 | コンタクトID | `contact_id` | UUID | | FK→T04.id (CASCADE) | | | | | 排他的所有 |
| 4 | ラベル | `label` | TEXT | | | | | | | max 100文字 |
| 5 | 郵便番号 | `postal_code` | VARCHAR(8) | | | | | | | nnn-nnnn形式 |
| 6 | 都道府県 | `prefecture` | TEXT | | | | | | 47都道府県 | |
| 7 | 市区町村 | `city` | TEXT | | | | | | | max 100文字 |
| 8 | 丁目・番地 | `address_line1` | TEXT | | | | | | | max 200文字 |
| 9 | 建物名等 | `address_line2` | TEXT | | | | | | | max 200文字 |
| 10 | 電話番号 | `phone` | VARCHAR(20) | | | | | | | 電話番号形式 |
| 11 | FAX番号 | `fax` | VARCHAR(20) | | | | | | | 電話番号形式 |
| 12 | 有効フラグ | `is_active` | BOOLEAN | | | | NN | TRUE | | |
| 13 | 備考 | `memo` | TEXT | | | | | | | max 500文字 |
| 14 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |
| 15 | 更新日時 | `updated_at` | TIMESTAMPTZ | | | | NN | NOW() | | トリガー自動更新 |

**CHECK:** D03と同じ排他的所有制約
**CRUD:** 親エンティティのCRUD権限に従う。

---

### D05: talent_skills（タレントスキル）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | タレントID | `talent_id` | UUID | | FK→T07.id (CASCADE) | | NN | | | |
| 3 | スキルID | `skill_id` | UUID | | FK→M10.id | | NN | | | |
| 4 | 習熟度 | `proficiency_level` | SMALLINT | | | | NN | 1 | 1-5 | |
| 5 | 経験年数 | `years_experience` | SMALLINT | | | | | | >= 0 | |
| 6 | 備考 | `note` | TEXT | | | | | | | max 500文字 |
| 7 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |
| 8 | 更新日時 | `updated_at` | TIMESTAMPTZ | | | | NN | NOW() | | トリガー自動更新 |

**UK:** (talent_id, skill_id) — 同一タレントに同じスキルは1回のみ
**区分値 proficiency_level:**
| 値 | 説明 |
|---|------|
| 1 | 初心者 |
| 2 | 基礎的 |
| 3 | 中級者 |
| 4 | 上級者 |
| 5 | エキスパート |

**CRUD:** 親タレントのCRUD権限に従う。

---

### D06: talent_careers（タレント経歴）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | タレントID | `talent_id` | UUID | | FK→T07.id (CASCADE) | | NN | | | |
| 3 | 経歴種別 | `career_type` | TEXT | | | | NN | | 'work','education','certification' | |
| 4 | 組織名 | `organization` | TEXT | | | | NN | | | 1-200文字 |
| 5 | 役職/学位/資格名 | `title` | TEXT | | | | | | | max 200文字 |
| 6 | 説明 | `description` | TEXT | | | | | | | max 2000文字 |
| 7 | 開始日 | `start_date` | DATE | | | | | | | |
| 8 | 終了日 | `end_date` | DATE | | | | | | | start_date以降。NULLは「現在」 |
| 9 | 現在進行中 | `is_current` | BOOLEAN | | | | NN | FALSE | | is_current=TRUEならend_date IS NULL |
| 10 | 表示順 | `sort_order` | INTEGER | | | | NN | 0 | >= 0 | |
| 11 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |
| 12 | 更新日時 | `updated_at` | TIMESTAMPTZ | | | | NN | NOW() | | トリガー自動更新 |

**区分値 career_type:**
| 値 | 説明 |
|---|------|
| work | 職歴 |
| education | 学歴 |
| certification | 資格 |

**CHECK:** end_date IS NULL OR start_date IS NULL OR end_date >= start_date
**CHECK:** is_current = FALSE OR end_date IS NULL
**CRUD:** 親タレントのCRUD権限に従う。

---

### D07: project_members（プロジェクトメンバー）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | プロジェクトID | `project_id` | UUID | | FK→T08.id (CASCADE) | | NN | | | |
| 3 | ユーザーID | `user_id` | UUID | | FK→T01.id | | NN | | | |
| 4 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |

**UK:** (project_id, user_id) — 同一プロジェクトに同じユーザーは 1 回のみ
**INDEX:** project_id, user_id

**運用方針:**
- プロジェクト配下ディールの `owner_user_id` との自動同期は**行わない**（手動管理）
- UI には「このプロジェクト配下のディール担当者を一括追加」アクションを設ける
- プロジェクトロール（lead/member 等）は初版では持たない。`owner_user_id`（T08）で責任者 1 名を特定し、残りのメンバーはフラット

**CRUD:**
- CREATE / DELETE: プロジェクトの owner_user_id もしくは manager / admin
- READ: 認証済み全員
- UPDATE: 不要（メンバーシップの編集は DELETE + INSERT で表現）

---

### J01: deal_services（ディール×サービス）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | ディールID | `deal_id` | UUID | | FK→T05.id (CASCADE) | | NN | | | |
| 3 | サービスID | `service_id` | UUID | | FK→M04.id | | NN | | | |
| 4 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |

**UK:** (deal_id, service_id) — 同一ディールに同じサービスは1回のみ
**CRUD:** ディールのCRUD権限に従う。

---

### J01b: contact_social_accounts（連絡先 × SNS・チャット）

連絡先の SNS・チャットの連絡口。**1 人が複数持てる**（Chatwork と Slack の両方、
Slack が 2 ワークスペース、など）。`contacts.line_user_id`（Messaging API 用の
ユーザー ID）とは別物。

| # | 論理名 | 物理名 | 型 | PK | FK | NN | 備考 |
|---|--------|--------|-----|----|----|----|------|
| 1 | ID | `id` | UUID | PK | | NN | |
| 2 | 連絡先ID | `contact_id` | UUID | | FK→T04.id (CASCADE) | NN | |
| 3 | サービスID | `service_id` | UUID | | FK→social_services.id | NN | |
| 4 | アカウントID | `account_id` | TEXT | | | NN | 意味はサービスごとに違う（LINE ID / Chatwork のルーム ID / Slack のメンバー ID） |
| 5 | ワークスペース | `workspace` | TEXT | | | | Slack のように相手を絞る上位の識別子 |
| 6 | 表示名 | `display_name` | TEXT | | | | 同じサービスに複数あるときの区別 |
| 7 | メモ | `note` | TEXT | | | | |

**UK:** (contact_id, service_id, account_id, workspace)
**CRUD:** 親（連絡先）に合わせる。RLS は `contacts.owner_user_id` を見る
**削除:** 物理削除。連絡口は「今つながれるか」を表すだけで、やり取りの記録では
ないため（記録はアクティビティが持つ）

#### M: social_services（サービスマスタ）

飛び先の URL の作り方をマスタに置く。`dm_url_template` の `{account_id}` /
`{workspace}` を差し替えて**相手ひとりとのやり取りを直接開く**。置換で済むので、
新しい SNS は admin がマスタに 1 行足せば動く（コードを直さなくてよい）。

| 物理名 | 用途 |
|---|---|
| `code` / `name` | 識別子と表示名 |
| `short_label` / `color` | 詳細ページに丸バッジで並べるときの表記と色。ブランドのロゴは使えないので略称と色で見分ける |
| `dm_url_template` | 飛び先の雛形。例 `https://line.me/ti/p/~{account_id}` |
| `requires_workspace` / `workspace_label` | Slack のようにワークスペースまで決めないと相手が定まらないサービス用 |
| `account_label` / `hint` | 入力欄のラベルと案内。「何の ID か」がサービスごとに違うため |

初期データ: Chatwork / Slack / LINE / X / Messenger / Instagram / LinkedIn / その他。
LinkedIn だけは DM の直リンクが無いためプロフィールを開く。「その他」は入れた
URL をそのまま開く。

**URL の組み立ては `src/lib/social-links.ts`（ユニットテストあり）。**
必要な値が欠けていたり、組み立てた結果が http(s) にならないときは開かない
（「その他」の欄に `javascript:` を書かれても実行しない）。

**画面:**
- 詳細ページ … 連絡先セクションに**使えるサービスを全部並べる**。登録があるものは
  サービスの色、無いものは灰色。誰にどの手段で連絡できるかが一目で分かる
- 編集ページ … 「SNS・チャット」で増減。選んだサービスに合わせて欄と案内が変わる

---

### J02: account_contacts（アカウント×コンタクト）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | アカウントID | `account_id` | UUID | | FK→T03.id (CASCADE) | | NN | | | |
| 3 | コンタクトID | `contact_id` | UUID | | FK→T04.id (CASCADE) | | NN | | | |
| 4 | 役割 | `role` | TEXT | | | | | | 'primary','billing','technical','other' | |
| 5 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |

**区分値 role:**
| 値 | 説明 |
|---|------|
| primary | 主担当 |
| billing | 経理担当 |
| technical | 技術担当 |
| other | その他 |

**UK:** (account_id, contact_id) — 同一アカウントに同じコンタクトは1回のみ
**CRUD:** アカウントのCRUD権限に従う。

**これは「所属」ではなく「取引の窓口」。**
人がどの事業者に属するかは `contacts.company_id` が持つ。この表が表すのは
*その取引先の案件で誰が窓口か* で、契約を登録したときに
`ensure_account_on_contract()` がディールの相手担当者を `role=primary` で自動登録する
（§ 16.6）。取引先そのものが契約成立まで作られないので、この紐づけも
契約より前には生まれない。

画面での扱いもこれに合わせる:

| 画面 | 見出し | 操作 |
|---|---|---|
| 取引先詳細 | 窓口の連絡先 | 追加・削除できる（窓口を管理するのは取引先側） |
| 連絡先詳細 | 窓口になっている取引先 | 閲覧のみ |

連絡先側から足せるようにすると、同じ紐づけの入口が 2 つに増えるうえ、
`contacts.company_id`（所属）と混同されやすいため。

---

### J03: deal_projects（ディール×プロジェクト）

ディールとプロジェクトを紐づける中間テーブル。1 ディールが複数プロジェクトに属しうる（例: OEM 契約取引が複数プロジェクトで共用される）前提で N:M で設計。

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | ディールID | `deal_id` | UUID | | FK→T05.id (CASCADE) | | NN | | | |
| 3 | プロジェクトID | `project_id` | UUID | | FK→T08.id (CASCADE) | | NN | | | |
| 4 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |

**UK:** (deal_id, project_id) — 同一ディールに同じプロジェクトは 1 回のみ
**INDEX:** deal_id, project_id

**CRUD:**
- CREATE / DELETE: ディールの owner_user_id もしくは manager / admin（deal_services と同じパターン）
- READ: 認証済み全員
- UPDATE: 不要（紐づけの編集は DELETE + INSERT）

---

### A01: activity_logs（アクティビティログ）

汎用監査ログ。各エンティティに対する操作を記録する。

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | アクティビティ種別 | `activity_type` | TEXT | | | | NN | | 'note','task','other' | |
| 3 | 件名 | `subject` | TEXT | | | | | | | max 200文字 |
| 4 | 内容 | `description` | TEXT | | | | | | | max 5000文字 |
| 5 | ディールID | `deal_id` | UUID | | FK→T05.id (CASCADE) | | | | | |
| 6 | コンタクトID | `contact_id` | UUID | | FK→T04.id (CASCADE) | | | | | |
| 7 | アカウントID | `account_id` | UUID | | FK→T03.id (CASCADE) | | | | | |
| 8 | カンパニーID | `company_id` | UUID | | FK→T02.id (CASCADE) | | | | | |
| 9 | 作成者ID | `created_by` | UUID | | FK→T01.id | | | | | |
| 10 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可。INSERT ONLY |

**CHECK:** COALESCE(deal_id, contact_id, account_id, company_id) IS NOT NULL — 少なくとも1つの紐づけ先が必要
**INDEX:** deal_id, contact_id, account_id, company_id, created_at DESC
**CRUD:** INSERT ONLY（更新・削除不可）。認証済みユーザーは全件参照・作成可。

※ メール・電話・打合せ等の対応履歴は A02 deal_activities で管理
※ ステージ/ステータスの変更履歴は A04/A05 で管理
※ フィールド変更履歴は A06〜A10 で管理
※ LINE経由のリード情報は、リードソース（M05）で「LINE」を指定し、コンタクトの line_user_id に記録

---

### A02: deal_activities（ディール対応履歴）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | ディールID | `deal_id` | UUID | | FK→T05.id (CASCADE) | | NN | | | |
| 3 | 対応種別 | `activity_type` | TEXT | | | | NN | | 'email','call','meeting','visit','other' | |
| 4 | 対応日時 | `activity_at` | TIMESTAMPTZ | | | | NN | | | |
| 5 | 対応相手コンタクトID | `contact_id` | UUID | | FK→T04.id | | | | | |
| 6 | 件名 | `subject` | TEXT | | | | | | | max 200文字 |
| 7 | 内容 | `description` | TEXT | | | | | | | max 5000文字 |
| 8 | 所要時間（分） | `duration_minutes` | INTEGER | | | | | | >= 0 | |
| 9 | 対応者ID | `performed_by` | UUID | | FK→T01.id | | NN | | | |
| 10 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |
| 11 | 更新日時 | `updated_at` | TIMESTAMPTZ | | | | NN | NOW() | | トリガー自動更新 |

**区分値 activity_type:**
| 値 | 説明 |
|---|------|
| email | メール |
| call | 電話 |
| meeting | 打合せ |
| visit | 訪問 |
| other | その他 |

**INDEX:** deal_id, contact_id, performed_by, activity_at DESC
**CRUD:**
- CREATE: member以上
- READ: member=自分の対応のみ、manager/admin=全件
- UPDATE: member=自分の対応のみ、admin=全件
- DELETE: adminのみ

---

### A03: deal_activity_emails（ディール対応メール詳細）

deal_activitiesの `activity_type='email'` の場合のメール固有情報。

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | ディール対応履歴ID | `deal_activity_id` | UUID | | FK→A02.id (CASCADE) | UK | NN | | | 1:1 |
| 3 | 差出人名 | `sender_name` | TEXT | | | | | | | max 100文字 |
| 4 | 差出人メール | `sender_email` | TEXT | | | | | | | RFC5322準拠 |
| 5 | 宛先メール | `recipient_email` | TEXT | | | | | | | RFC5322準拠 |
| 6 | 本文 | `body` | TEXT | | | | | | | |
| 7 | 要約 | `summary` | TEXT | | | | | | | max 2000文字 |
| 8 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |

**UK:** deal_activity_id（1対応履歴に対し1メール詳細）
**INDEX:** deal_activity_id
**CRUD:** deal_activitiesのCRUD権限に従う。

---

### A04: deal_stage_histories（ディールステージ遷移履歴）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | ディールID | `deal_id` | UUID | | FK→T05.id (CASCADE) | | NN | | | |
| 3 | 変更前ステージID | `from_stage_id` | UUID | | FK→S01.id | | | | | 初回登録時はNULL |
| 4 | 変更後ステージID | `to_stage_id` | UUID | | FK→S01.id | | NN | | | |
| 5 | 変更理由 | `reason` | TEXT | | | | | | | max 1000文字 |
| 6 | 変更者ID | `changed_by` | UUID | | FK→T01.id | | NN | | | |
| 7 | 変更日時 | `changed_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可。INSERT ONLY |

**INDEX:** deal_id, changed_at DESC
**CRUD:** INSERT ONLY（更新・削除不可）。ステージ変更時にアプリ層で自動挿入。

---

### A05: deal_status_histories（ディールステータス変更履歴）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | ディールID | `deal_id` | UUID | | FK→T05.id (CASCADE) | | NN | | | |
| 3 | ステージID | `stage_id` | UUID | | FK→S01.id | | NN | | | 変更時点のステージ |
| 4 | 変更前ステータスID | `from_status_id` | UUID | | FK→S02.id | | | | | 初回登録時はNULL |
| 5 | 変更後ステータスID | `to_status_id` | UUID | | FK→S02.id | | NN | | | |
| 6 | 変更理由 | `reason` | TEXT | | | | | | | max 1000文字 |
| 7 | 変更者ID | `changed_by` | UUID | | FK→T01.id | | NN | | | |
| 8 | 変更日時 | `changed_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可。INSERT ONLY |

**INDEX:** deal_id, stage_id, changed_at DESC
**CRUD:** INSERT ONLY（更新・削除不可）。ステータス変更時にアプリ層で自動挿入。

---

### A06〜A10: エンティティ変更履歴（共通構造）

カンパニー・アカウント・コンタクト・ディール・タレントの各エンティティに対し、フィールド単位の変更履歴を記録する。全テーブル共通の構造を持ち、INSERT ONLY（更新・削除不可）。

**共通カラム定義:**

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | |
| 2 | 対象ID | `{entity}_id` | UUID | | FK→親テーブル (CASCADE) | | NN | | |
| 3 | 変更カラム名 | `field_name` | TEXT | | | | NN | | |
| 4 | 変更前の値 | `old_value` | TEXT | | | | | | |
| 5 | 変更後の値 | `new_value` | TEXT | | | | | | |
| 6 | 変更者ID | `changed_by` | UUID | | FK→T01.id | | NN | | |
| 7 | 変更日時 | `changed_at` | TIMESTAMPTZ | | | | NN | NOW() | 更新不可。INSERT ONLY |

#### A06: company_change_histories

- 対象ID: `company_id` FK→T02.id (CASCADE)
- **INDEX:** company_id, changed_at DESC
- **CRUD:** INSERT ONLY。カンパニー更新時にアプリ層で自動挿入

#### A07: account_change_histories

- 対象ID: `account_id` FK→T03.id (CASCADE)
- **INDEX:** account_id, changed_at DESC
- **CRUD:** INSERT ONLY。アカウント更新時にアプリ層で自動挿入

#### A08: contact_change_histories

- 対象ID: `contact_id` FK→T04.id (CASCADE)
- **INDEX:** contact_id, changed_at DESC
- **CRUD:** INSERT ONLY。コンタクト更新時にアプリ層で自動挿入

#### A09: deal_change_histories

- 対象ID: `deal_id` FK→T05.id (CASCADE)
- **INDEX:** deal_id, changed_at DESC
- **CRUD:** INSERT ONLY。ディール更新時にアプリ層で自動挿入

#### A10: talent_change_histories

- 対象ID: `talent_id` FK→T07.id (CASCADE)
- **INDEX:** talent_id, changed_at DESC
- **CRUD:** INSERT ONLY。タレント更新時にアプリ層で自動挿入

#### A11: project_change_histories

- 対象ID: `project_id` FK→T08.id (CASCADE)
- **INDEX:** project_id, changed_at DESC
- **CRUD:** INSERT ONLY。プロジェクト更新時にアプリ層で自動挿入

---

## 5. 正規化の考慮

### 第1正規形（1NF）
- 全カラムがアトミック値。繰り返し項目（メール複数、電話複数）はcontact_emails/contact_phonesに分離済み
- 住所は郵便番号・都道府県・市区町村・丁目番地・建物名に分解

### 第2正規形（2NF）
- 全テーブルがUUID単一PKのため、部分関数従属は存在しない
- 複合UK（deal_stages: pipeline_type_id + name）は候補キーだが、PKではないため2NF違反なし

### 第3正規形（3NF）
- deals.contractor_company_name / contractor_representative は意図的な非正規化（パフォーマンス目的の冗長）
  - 理由: ディール一覧表示時にaccount→company→representative のJOINを回避
  - 整合性: account/company更新時にアプリ層で同期更新するか、表示時にJOINで取得するか選択（推奨: JOINで取得し、このフィールドは廃止検討）

### ボイス・コッド正規形（BCNF）
- deal_statuses の (pipeline_type_id, deal_stage_id, name) UK について:
  - deal_stage_id → pipeline_type_id の関数従属が存在（ステージはパイプラインに属するため）
  - これはBCNF違反だが、deal_statuses がパイプライン直属の場合（stage未指定）にも対応するため、意図的にpipeline_type_idを保持

---

## 6. TypeScript型定義（主要エンティティ）

```typescript
// === 区分値型 ===
type CrmUserRole = 'member' | 'manager' | 'admin';
type ContactType = 'individual' | 'corporate_rep' | 'employee' | 'other';
type ContractMethod = 'paper' | 'electronic' | 'verbal';
type CounterpartyType = 'company' | 'individual';
type EmailLabel = 'work' | 'personal' | 'other';
type PhoneLabel = 'work' | 'mobile' | 'home' | 'fax' | 'other';
type BankAccountType = 'ordinary' | 'current' | 'savings';
type CareerType = 'work' | 'education' | 'certification';
type AccountContactRole = 'primary' | 'billing' | 'technical' | 'other';
type ActivityType = 'note' | 'email' | 'call' | 'meeting' | 'task' | 'stage_change' | 'status_change';
type ConstellationElement = '火' | '地' | '風' | '水';

// === 共通フィールド ===
type Timestamps = {
  created_at: string;  // ISO 8601 TIMESTAMPTZ
  updated_at: string;
};

type SoftDeletable = {
  is_active: boolean;
};

// === マスタ型 ===
type PipelineType = {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
} & SoftDeletable & Timestamps;

type DealStage = {
  id: string;
  pipeline_type_id: string;
  name: string;
  current_situation: string | null;
  required_action: string | null;
  customer_situation: string | null;
  transition_condition: string | null;
  sort_order: number;
} & SoftDeletable & Timestamps;

type DealStatus = {
  id: string;
  name: string;
  pipeline_type_id: string;
  deal_stage_id: string | null;
  sort_order: number;
} & SoftDeletable & Timestamps;

// === エンティティ型 ===
type Company = {
  id: string;
  company_code: string;
  corporate_type_id: string | null;
  name: string;
  name_kana: string | null;
  representative_name: string | null;
  corporate_number: string | null;
  invoice_registered: boolean;
  invoice_registration_number: string | null;
  postal_code: string | null;
  prefecture: string | null;
  city: string | null;
  address_line1: string | null;
  address_line2: string | null;
  phone: string | null;
  fax: string | null;
  website_url: string | null;
  industry_classification_id: string | null;
  registration_certificate_url: string | null;
  internal_memo: string | null;
  lead_source_id: string | null;
  owner_user_id: string | null;
} & SoftDeletable & Timestamps;

type Account = {
  id: string;
  account_code: string;
  company_id: string | null;
  account_type_id: string | null;
  account_status_id: string;
  name: string;
  description: string | null;
  lead_source_id: string | null;
  owner_user_id: string | null;
  status_updated_at: string | null;
} & SoftDeletable & Timestamps;

type Contact = {
  id: string;
  contact_code: string;
  last_name: string;
  middle_name: string | null;
  first_name: string;
  last_name_kana: string | null;
  middle_name_kana: string | null;
  first_name_kana: string | null;
  contact_status_id: string;
  contact_type: ContactType | null;
  company_id: string | null;          // corporate_rep/employeeの場合にCompanyへ紐づけ
  invoice_registered: boolean;
  invoice_registration_number: string | null;
  postal_code: string | null;
  prefecture: string | null;
  city: string | null;
  address_line1: string | null;
  address_line2: string | null;
  department: string | null;
  job_title: string | null;
  birth_date: string | null;  // ISO date
  potential_number: number | null;
  constellation_id: string | null;
  lead_source_id: string | null;
  line_user_id: string | null;
  internal_memo: string | null;
  owner_user_id: string | null;
  status_updated_at: string | null;
} & SoftDeletable & Timestamps;

type Deal = {
  id: string;
  deal_code: string;
  name: string;
  pipeline_type_id: string;
  deal_stage_id: string;
  deal_status_id: string;
  amount: number | null;
  account_id: string;              // 必須: ディールは必ずAccountに紐づく
  owner_user_id: string | null;
  contract_name: string | null;
  application_date: string | null;
  review_completed_date: string | null;
  stage_updated_at: string | null;
  closed_at: string | null;
  last_updated_by: string | null;
} & Timestamps;

type Talent = {
  id: string;
  contact_id: string;
  personality_memo: string | null;
  custom_strengths: string | null;
  custom_weaknesses: string | null;
  aptitude_notes: string | null;
  overall_assessment: string | null;
} & SoftDeletable & Timestamps;

type ProjectStatus = {
  id: string;
  name: string;
  sort_order: number;
} & SoftDeletable & Timestamps;

type Project = {
  id: string;
  project_code: string;
  name: string;
  description: string | null;
  project_status_id: string;
  start_date: string | null;   // ISO date
  end_date: string | null;     // ISO date
  owner_user_id: string | null;
  internal_memo: string | null;
  status_updated_at: string | null;
} & SoftDeletable & Timestamps;

type ProjectMember = {
  id: string;
  project_id: string;
  user_id: string;
  created_at: string;
};

type DealProject = {
  id: string;
  deal_id: string;
  project_id: string;
  created_at: string;
};

// === リレーション付き型（JOIN結果） ===
type ContactWithRelations = Contact & {
  emails: ContactEmail[];
  phones: ContactPhone[];
  talent: (Talent & {
    skills: (TalentSkill & { skill: Skill })[];
    careers: TalentCareer[];
  }) | null;
  number_diagnosis: NumberDiagnosis | null;
  constellation: ConstellationFortuneTelling | null;
};

type DealWithRelations = Deal & {
  pipeline_type: PipelineType;
  deal_stage: DealStage;
  deal_status: DealStatus;
  account: AccountWithRelations;   // 必須: Accountを介してContacts/Companyを取得
  owner: CrmUser | null;
  services: Service[];
  contracts: Contract[];
};

type AccountWithRelations = Account & {
  company: Company | null;
  account_type: AccountType | null;
  account_status: AccountStatus;
  contacts: (Contact & { role: AccountContactRole })[];
  deals: Deal[];
};
```

---

## 7. 実装フェーズ

### Phase 1: プロジェクト初期設定
Next.js 15プロジェクト初期化、Supabase設定、共通ライブラリ

### Phase 2: DBマイグレーション（18ファイル＋拡張5ファイル）
1. `00001_create_master_tables.sql` — M01-M08 マスタテーブル
2. `00002_create_skill_masters.sql` — M09-M10 スキルマスタ
3. `00003_create_structured_masters.sql` — S01-S03 構造化マスタ
4. `00004_create_fortune_telling_masters.sql` — R01-R02 占いマスタ
5. `00005_create_crm_users.sql` — T01 CRMユーザー
6. `00006_create_companies.sql` — T02 カンパニー
7. `00007_create_accounts.sql` — T03 アカウント + J02 account_contacts
8. `00008_create_contacts.sql` — T04 コンタクト + D01-D02 メール/電話
9. `00009_create_deals_and_contracts.sql` — T05-T06 ディール + 契約 + J01 deal_services
10. `00010_create_talents.sql` — T07 タレント + D05-D06 スキル/経歴
11. `00011_create_shared_entities.sql` — D03-D04 金融機関/住所
12. `00012_create_activities.sql` — A01-A03 アクティビティ/ログ
13. `00013_create_functions_triggers_rls.sql` — トリガー/関数/RLSポリシー
14. `20260416040014_fix_dependent_table_rls.sql` — 従属テーブル RLS 修正
15. `20260417000001_add_soft_delete_columns.sql` — 論理削除列の追加
16. `20260417000002_drop_is_active_and_setup_cron.sql` — is_active 廃止 + cron 設定
17. `20260418000001_add_company_statuses.sql` — M11 カンパニーステータス
18. `20260418000002_add_contact_blood_type.sql` — コンタクトの血液型追加
19. `20260418000003_add_company_primary_contact.sql` — カンパニー代表コンタクト紐付け
20. `20260418000004_add_slug_to_pipeline_types.sql` — M01 slug 追加
21. `20260418000005_add_code_to_account_statuses.sql` — M07 code 追加
22. `20260418000006_alter_deal_stages_add_phase.sql` — S01 phase_id 追加（DB-FKなし）
23. `20260418000007_create_inside_sales_masters.sql` — M13-M17 インサイドセールス専用マスタ
24. `20260418000008_create_deal_ext_inside_sales.sql` — EX01/EX02 拡張＋`is_deal_accessible`関数＋`v_account_current_phase`ビュー
25. `20260418000009_add_audit_columns.sql` — Phase E: 全テーブルに created_by（NN, DEFAULT admin）+ last_updated_by 追加（35テーブル）
26. `20260418000010_relax_inside_sales_url_length.sql` — EX01 URL の長さ制約を 500 → 1000 文字に緩和
27. `20260418000011_create_projects.sql` — M12 project_statuses + T08 projects + D07 project_members + J03 deal_projects + A11 project_change_histories（Phase A）
28. `20260419000001_rename_inside_sales_masters.sql` — M14-M17 をリード共通マスタに改名
29. `20260419000002_drop_inside_sales_phases.sql` — M13 inside_sales_phases 廃止
30. `20260419000003_alter_lead_sources_add_slug.sql` — M05 lead_sources に slug 追加
31. `20260419000004_create_lead_stage_status_masters.sql` — M18-M21 リードステージ/ステータス/温度感/スコアルール
32. `20260419000005_create_campaigns.sql` — M23 campaigns + J04 lead_campaigns
33. `20260419000006_create_leads.sql` — T09 leads + RLS
34. `20260419000007_create_lead_activities.sql` — D08 lead_activities + RLS
35. `20260419000008_create_v_leads_with_category.sql` — v_leads_with_category ビュー
36. `20260419000009_alter_leads_status_nullable.sql` — leads.status_id を NULL 許容に変更（Opportunity ステージ対応）
37. `20260419000010_drop_inside_sales_legacy.sql` — **Phase D**: inside_sales パイプライン deals 物理削除・EX01/EX02 テーブル DROP・pipeline_type 削除（テスト段階1回限りの例外 2026-04-19）
38. `20260419000013_rename_lead_stage_sql_to_sales.sql` — M18 lead_stages.slug `sql` → `sales` に rename（M22 category との衝突回避・業務呼称統一）
39. `20260419000014_create_lead_categories.sql` — M22 lead_categories マスタ作成（RLS 標準マスタパターン）
40. `20260419000015_alter_leads_add_category_id.sql` — T09 leads に category_id（M22 FK、NULL 許容）追加 + idx_leads_category
41. `20260419000016_recreate_v_leads_with_category.sql` — v_leads_with_category を再定義（CASE 式廃止 → lead_categories LEFT JOIN）
42. `20260420000001_alter_leads_add_promoted_refs.sql` — leads に promoted_company_id / promoted_contact_id / promoted_account_id 追加
43. `20260420000002_alter_contacts_first_name_nullable.sql` — contacts.first_name を NULL 許容に変更（昇格時 1 単語名対応）
44. `20260420000003_create_lead_activity_types.sql` — M20相当 lead_activity_types マスタ作成
45. `20260420000004_alter_lead_activities_add_type.sql` — lead_activities に activity_type_id 追加
46. `20260421000001_add_definition_to_masters.sql` — 各マスタに definition 列追加
47. `20260421000002_talent_classification_masters.sql` — タレント分類マスタ作成
48. `20260422000001_rename_lead_scoring_rules.sql` — lead_scoring_rules → lead_score_thresholds リネーム（Phase 1）
49. `20260422000002_create_lead_score_masters.sql` — M24 lead_company_sizes / M25 lead_customer_activity_types / M26 lead_score_rules 作成（Phase 2）
50. `20260422000003_alter_leads_add_company_size.sql` — T09 leads に employee_count / capital / company_size_id 追加 + score CHECK 強化 + 企業規模自動判定トリガ（Phase 3）
51. `20260422000004_create_lead_customer_activities.sql` — D09 lead_customer_activities + RLS（Phase E）
52. `20260422000005_create_lead_score_breakdowns.sql` — D10 lead_score_breakdowns + RLS（Phase E）
53. `20260422000006_create_recalculate_lead_score.sql` — recalculate_lead_score 関数（Phase E）
54. `20260422000007_setup_lead_score_weekly_cron.sql` — 週次スコア再計算 cron 設定（Phase E）
55. `20260422000008_alter_leads_add_contact_company_info.sql` — T09 leads に phone→company_phone リネーム + 担当者情報9列・企業情報3列追加 + CHECK 制約（Phase 9b）
56. `20260422000009_alter_contacts_add_website_url.sql` — T04 contacts に website_url 追加（Lead 個人昇格転記先、Phase 9b）
57. `20260422000010_create_lead_owners.sql` — T10/J05 lead_owners（副担当中間テーブル）+ `is_lead_accessible` 関数更新（Phase 10b-1）
58. `20260422000011_migrate_lead_activities_caller.sql` — D08 lead_activities.caller_id を caller_user_id（FK→crm_users）に移行（Phase 10b-2）
59. `20260422000012_drop_lead_primary_caller.sql` — T09 leads.primary_caller_id カラム DROP（Phase 10b-3）
60. `20260422000013_drop_lead_callers.sql` — M17 lead_callers テーブル DROP・RLSポリシー削除（Phase 10b-3）
61. `20260426000001_lead_activities_allow_update.sql` — D08 lead_activities に `last_edited_at` / `last_edited_by_user_id` 追加・UPDATE ポリシー新設（Phase 11: caller_user_id 本人 + manager/admin に編集解禁）

### Phase 3: 型定義・Zodバリデーション
- `src/types/index.ts`
- `src/lib/validators/` — 各エンティティ

### Phase 4: Server Actions
- `src/actions/` — 各エンティティのCRUD

### Phase 5: UI実装
- ダッシュボード、ディール（カンバン）、コンタクト、カンパニー、アカウント、契約、タレント、マスタ管理

## 8. 検証方法
1. `supabase db reset` でマイグレーション全適用を確認
2. Supabase StudioでPK/FK/UK/CHECK制約を目視確認
3. シードデータ投入（マスタ12件星座、60件数秘術、業種分類）
4. Server ActionsでCRUD動作テスト（バリデーションエラー含む）
5. RLSポリシー確認（member/manager/adminそれぞれでデータアクセステスト）
6. ブラウザで各画面操作確認

## 9. 参照ファイル
- `work-talent-hub/supabase/migrations/` — マイグレーションパターン
- `work-talent-hub/src/types/index.ts` — 型定義パターン
- `work-talent-hub/src/actions/` — Server Actionパターン
- `work-talent-hub/src/lib/supabase/` — Supabaseクライアント設定

---

## 10. 自動診断ロジック（コンタクト生年月日 → ポテンシャル番号 / 星座ID）

### 10.1 目的

タレントの「要素になる診断」を、別プロジェクト `potential-profiling` と同じ算出式で CRM 側でも自動付与する。
**本書の範囲は算出値（数値・ID）の付与のみ。** LLM によるテキスト生成・診断履歴保存・トキ算出等は対象外（potential-profiling 側の責務）。

### 10.2 入出力

**入力**
- `contacts.birth_date`（DATE, nullable）

**出力（contacts 内に書込み）**
- `contacts.potential_number` — INTEGER 1–60（FK→R02.number）
- `contacts.constellation_id` — UUID（FK→R01.id）

### 10.3 発火タイミング

| 操作 | 条件 | 挙動 |
|------|------|------|
| `createContact` | `birth_date` が入力にある | 下記 10.5 の計算結果で `potential_number` / `constellation_id` を埋める |
| `updateContact` | `birth_date` が入力にあり、かつ変更前の値と異なる | 同上で再計算して上書き |
| `updateContact` | `birth_date` が入力にない／変わっていない | 何もしない |

**明示指定の優先:** 同じリクエスト内でユーザーが `potential_number` / `constellation_id` を明示的に送っている場合、そのフィールドについては自動算出値を**差し込まない**（ユーザー指定を尊重）。判定は Zod パース後の値ではなく「入力オブジェクトに当該キーが含まれるか」で行う（undefined と未指定を区別するため）。

### 10.4 算出定数

potential-profiling の `system_settings` をハードコード（CRM 側には `system_settings` テーブルを設けない）。実装位置: `src/lib/diagnosis/index.ts`。

| 定数 | 値 | 用途 |
|------|------|------|
| `POTENTIAL_BASE_DATE` | `1920-01-01` | ポテンシャル番号算出用基準日 |

> 変更が発生した場合は同ファイルの定数を書換える。potential-profiling 側の値が変わった場合は要同期。

### 10.5 算出式

**potential_number（1–60）**

```
diffDays = floor((birthdate_UTC - POTENTIAL_BASE_DATE_UTC) / 1日)
potential_number = ((diffDays + 1) mod 60 + 60) mod 60 + 1
```

- `potential-profiling` の `calcPotentialValue`（0-59）に +1 して 1-60 の FK 範囲に収めたもの。
- この番号で R02 `number_diagnosis` を引くと `type`（IL+ / PR+ 等 12 種）が取得でき、画面はこの `type` を表示する。
- UTC 0時基準で差分日数を算出しタイムゾーン依存を排除。
- 負値対応のため二重 mod。

**constellation_id（UUID）**

1. 生年月日から西洋占星術の星座名を判定（12通りの境界日ハードコード、`calcZodiacSign` と同一）。
2. `constellation_fortune_telling.constellation` 列で完全一致する行を検索し、その `id` を採用。

星座名は日本語（牡羊座 / 牡牛座 / 双子座 / 蟹座 / 獅子座 / 乙女座 / 天秤座 / 蠍座 / 射手座 / 山羊座 / 水瓶座 / 魚座）で、R01 マスタの `constellation` 値と一致させる必要がある。

### 10.6 マスタデータ依存（重要）

本機能は以下のマスタが投入済みであることを**必須の前提**とする。

| マスタ | 必要な内容 |
|--------|-----------|
| R02: number_diagnosis | `number` = 1〜60 の 60行（他列は任意だが FK 成立のため 60 行完備） |
| R01: constellation_fortune_telling | 12星座分。`constellation` 列が 10.5 記載の日本語名と一致していること |

**R02 の FK 制約:** `contacts.potential_number` は `number_diagnosis(number)` に FK を張っているため、R02 に対応行がない場合は INSERT/UPDATE が FK 違反で失敗する。

**R01 の lookup:** `constellation_id` は UUID ルックアップ。マッチする行がなければ自動付与できない。

### 10.7 マスタ未投入時の挙動

**エラーを返して書込自体を中止する。** 暗黙のスキップ（空欄のまま作成）は行わない。

| 状況 | 挙動 |
|------|------|
| R02 に対応行あり | 自動算出して埋めて書込 |
| R02 に対応行なし | **エラー:** 「ポテンシャル診断マスタ（number=N）が見つかりません。マスタを整備してください」を Server Action の返却 error にセットし、コンタクトの insert/update を中止 |
| R01 に一致星座あり | 自動算出して埋めて書込 |
| R01 に一致星座なし | **エラー:** 「星座マスタ（constellation=…）が見つかりません。マスタを整備してください」を返却して書込中止 |

→ マスタ未投入の環境では `birth_date` を伴うコンタクト作成・更新が落ちる。運用上はマスタ投入を前提とし、未整備時はエラーで明示的に気づけるようにする。

### 10.8 エッジケース

- `birth_date` が未来日: バリデータ層（Zod）で弾く。`src/lib/validators/common.ts` の `birthDateSchema` が未来日・存在しない日付（例 `2020-02-30`）・日付形式違反を拒否する。空文字は null に寄せる。自動診断ロジック自体はエラーにはしない。
- `birth_date` が極端に古い/新しい: 計算式は整数範囲内で完結（diff が大きくても mod 60 で丸まる）ので破綻しない。
- **`birth_date` を null 化する更新:** `potential_number` と `constellation_id` も同じタイミングで自動的に null にリセットする。診断結果は `birth_date` に従属する派生値であり、単独では保持しない。ユーザーが同じリクエストで明示的に両フィールドを送っている場合はその値を優先。

### 10.9 実装ファイル

- `src/lib/diagnosis/index.ts` — pure functions（`calcPotentialNumber` / `calcZodiacSign`）と定数
- `src/actions/contacts.ts` — `createContact` / `updateContact` に組込（マスタ未投入時ガードを含む）

### 10.10 移植元との差分メモ

potential-profiling から**移植しなかった**要素：

- `Character` / `PotentialType` / `Rhythm` / `Toki` の独立マスタ（iterra-hub では R01/R02 に集約済み）
- `system_settings` テーブル（定数で代替）
- `calcPotentialValue` (0–59) / `calcTokiNo` / LLM 生成系 / 診断履歴テーブル / プライバシー同意フロー
- Prisma スキーマ・関連 API ルート

理由: CRM の要件は「コンタクトにポテンシャル番号と星座を付与する」のみで、詳細プロファイリング UI や履歴管理は別プロジェクトに委ねる。

---

## 11. Lead / Campaign 設計（Phase A: 2026-04-19 導入）

### 11.1 エンティティ概要

Lead は Deal より上流の「見込み客」を管理するエンティティ。インサイドセールス架電〜アポ獲得〜ディール化（Deal 昇格）の一連フローを担う。

```
[lead_stages] 1──N [lead_statuses]
                         │
[leads] ─────────────────┘ (stage_id 必須。status_id は通常ステージでは必須、Opportunity 等 auto_promote_to_deal=true のステージでは NULL 許容)
  │ N──1 [lead_temperatures]
  │ N──0..1 [lead_categories] (category_id。M22。ステージとは独立)
  │ N──0..1 [lead_company_sizes] (company_size_id。M24。DBトリガ自動設定)
  │ N──1 [lead_large_segments]
  │ N──1 [lead_small_segments]
  │ N──1 [lead_sources] (M05)
  │ N──1 [account_types] (M06 流用。slug: corporate/sole_proprietor/government)
  │ 0..1──1 [companies] (company_id: リード収集時の任意参照。UI からは設定不可)
  │ 0..1──1 [contacts] (contact_id: リード収集時の任意参照。UI からは設定不可)
  │ 0..1──1 [deals]    (promoted_deal_id: Opportunity 昇格時に自動生成)
  │ 0..1──1 [companies] (promoted_company_id: 昇格時に新規作成した Company。法人のみ)
  │ 0..1──1 [contacts]  (promoted_contact_id: 昇格時に新規作成した Contact)
  │ 0..1──1 [accounts]  (promoted_account_id: 昇格時に新規作成した Account)
  │ 1──N [lead_activities]
  │ N──M [campaigns] via [lead_campaigns]
  │ N──1 [crm_users] (owner)
```

### 11.2 ステージ階層（M18 lead_stages）

| slug | 名称 | is_terminal | auto_promote_to_deal | requires_deal | requires_contract | 説明 |
|------|------|-------------|---------------------|---------------|-------------------|------|
| `generation` | リード獲得 | false | false | false | false | リスト化〜未架電段階 |
| `nurturing` | ナーチャリング | false | false | false | false | 架電試行〜資料送付段階 |
| `qualification` | リード選定 | false | false | false | false | 見込みがあるか判断する段階 |
| `sales` | ディール | false | **true** | **true** | false | ディールが動いている段階（旧 `sql` → `sales` に rename: 20260419000013） |
| `opportunity` | オポチュニティ | false | **true** | **true** | false | Deal 昇格トリガー |
| `customer` | **取引先** | **true** | false | **true** | **true** | 契約が成立し取引が始まった相手（端末） |
| `dead` | デッド | **true** | false | false | false | 失注・辞退等（端末） |

**表示名は本番の値**（2026-08-08 に照合し seed を合わせた）。slug は変えていない。
判定は slug とフラグで行い、**名称で分岐しない**（改名で壊れるため）。

**`customer` の表示名は「取引先」**（2026-08-04 変更）。顧客・仕入れ先・協業パートナーの
いずれもありうるため、関係の方向を名前で決め打たない。方向は取引先区分（`account_roles`）が表す。
**slug は `customer` のまま**変えていない（DB 関数 `resolve_lead_category` /
`lead_source_category` の分岐に使われているため。§24 参照）。

### 11.3 ステータス一覧（M19 lead_statuses）

> **重要:** `Opportunity` ステージ（`auto_promote_to_deal=true`）にはステータスが定義されていない。Deal 側で進捗を管理するため、`leads.status_id` はこのステージでは `NULL` になる。DB カラムも `NULL 許容`（20260419000009 で NOT NULL 制約を解除）。

| ステージ | code | 名称 |
|---------|------|------|
| リード獲得 | `list_ready` | リスト化済 |
| リード獲得 | `not_called` | 未架電 |
| リード獲得 | `not_started` | 未着手 |
| リード獲得 | `card_exchanged` | 名刺交換済 |
| ナーチャリング | `calling` | 架電試行中 |
| ナーチャリング | `continuing_call` | 継続架電 |
| ナーチャリング | `awaiting_recall` | 再架電待ち |
| ナーチャリング | `material_sent` | 資料送付済 |
| ナーチャリング | `opt_out` | DM/TLオプトアウト |
| リード選定 | `appointment_obtained` | 見込み判断中 |
| ディール | `negotiation` | 商談化 |
| ディール | `handed_over` | 引継済 |
| **オポチュニティ** | —（なし） | **status_id = NULL**（Deal 昇格トリガーステージ。Deal 側で進捗管理） |
| 取引先 | `closed_won` | 成約 |
| デッド | `lost` | 失注 |
| デッド | `declined` | 辞退 |
| デッド | `unreachable` | 連絡不能 |
| デッド | `approach_prohibited` | アプローチ禁止 |

全 17 件。**本番と 1 行ずつ照合してある**（2026-08-08）。

- `call_scheduled`（架電予定）は本番で廃止済み。seed からも外した
- `opt_out` は「もう接触しない」ではなく「DM / テレアポを止める」扱いなので
  デッドではなく**ナーチャリング**に置く
- `card_exchanged` の UUID は本番で採番された `7d779305-…`。seed もこれに揃えてある

### 11.4 デマンドファネル（M22 lead_categories）と v_leads_with_category View

> **この節の前半は 2026-08-02 に覆っている。** 当初は「独立した 2 軸で人が選ぶ」
> 設計だったが、`resolve_lead_category` を入れて**ステージと流入元から決まる
> 導出値**にした（`20260802000013`）。現在の規則は §16.6.6 と、
> `20260805000020` の `resolve_lead_category` が正本。
> 呼び名も「リードカテゴリ」→「**デマンドファネル**」へ改称した（T-0077）。

（当初の記述）デマンドファネル（Inquiry / MQL / TQL / SQL）とリードステージ（generation / nurturing / qualification / sales / opportunity / customer / dead）は独立した 2 軸として管理する。自動マッピングや推奨連動は実装しない。ユーザーが手動で選択する。

**leads.category_id カラム（20260419000015 で追加）**

`leads.category_id UUID REFERENCES lead_categories(id)` — NULL 許容（未分類リード可）。

| カラム | 型 | 説明 |
|--------|---|------|
| `category_id` | UUID | lead_categories FK。NULL = 未分類 |

**インデックス:** `CREATE INDEX idx_leads_category ON leads(category_id) WHERE deleted_at IS NULL AND category_id IS NOT NULL`

**M22 lead_categories シードデータ**

| code | name | color |
|------|------|-------|
| `inquiry` | Inquiry | — |
| `mql` | MQL | — |
| `tql` | TQL | — |
| `sql` | SQL | — |

**制約:** `code ~ '^[a-z][a-z0-9_]{0,31}$'` / `color ~ '^#[0-9A-Fa-f]{6}$'`（NULL 許容） / `char_length(name) BETWEEN 1 AND 50`

**v_leads_with_category View（20260419000016 で再定義）**

旧仕様（stage.slug と score から CASE 式で category を算出）を廃止し、`leads.category_id` を `lead_categories` に LEFT JOIN して以下カラムを提供する。

| 追加カラム | 元テーブル | 説明 |
|-----------|----------|------|
| `category_code` | lead_categories.code | カテゴリ識別子（NULL=未分類） |
| `category_name` | lead_categories.name | カテゴリ表示名 |
| `category_color` | lead_categories.color | カテゴリ色（HEX or NULL） |

> **注意:** category は lead_categories マスタ参照（stage / score とは独立）。CASE 式による自動算出は廃止済み。

### 11.5 温度感の自動判定ルール（M20/M21）

| code | 名称 | score 範囲 |
|------|------|-----------|
| `hot` | ホット | 80 以上 |
| `warm` | ウォーム | 50〜79 |
| `cold` | コールド | 0〜49 |

**実装方針:** `temperature_id` は Server Action 側で `lead_score_thresholds` を参照して設定する。DB トリガーによる自動更新は行わない（Phase B で Server Action 実装時に対応）。

### 11.6 Lead→Opportunity 昇格フロー（20260420000001 で拡張）

Lead は「仮の情報保持」を目的とし、既存の Company/Contact を UI から紐付ける機能は持たない。
Opportunity ステージへの遷移時に初めて Company/Contact/Account/Deal を**自動新規作成**する。

#### 昇格トリガー
1. `updateLead` で `stage_id` が変更され、新ステージの `auto_promote_to_deal = true` の場合
2. `promoted_deal_id` が既に存在する場合は昇格をスキップ（二重発火防止）
3. `lead_name` と `account_type_id` が必須（欠落時は `[ステージ遷移] Opportunity 昇格には lead_name と account_type_id が必要です` を返す）

#### 法人昇格（account_types.slug = `corporate` または `government`）
0. **corporate_number 重複チェック（ブロック）:** `leads.corporate_number` が `companies.corporate_number` に既存かつ `deleted_at IS NULL` の場合、エラー返却・昇格中止
1. `companies` に新規挿入（`buildCompanyPayloadFromLead`）: `company_name` / `company_name_kana` / `representative_name` / `corporate_number` / `company_phone`→`phone` / `url`→`website_url` 転記
2. `contacts` に `contact_type=corporate_rep` で挿入（`buildContactPayloadFromLead`）: 担当者情報9カラム転記 / `contact_last_name` 未入力時は `lead_name` フォールバック / `website_url=null`（法人は companies 側に転記）
3. `companies.primary_contact_id` を新 Contact で更新
4. `contact_email` がある場合 → `contact_emails`（label=work, is_primary=true）に追加
5. `contact_phone` がある場合 → `contact_phones`（label=work, is_primary=true）に追加
6. `accounts` に新規挿入（`company_id` を設定）
7. `account_contacts` で Account と Contact を紐付け（`role=primary`）
8. `deals` に新規挿入（`name = lead_name + " 案件"`、pipeline_type=sales の先頭ステージ）
9. `leads` の `promoted_deal_id / promoted_company_id / promoted_contact_id / promoted_account_id` を一括更新

#### 個人昇格（account_types.slug = `sole_proprietor` 等、またはスラッグ未設定かつ company_name が空の場合）
1. `contacts` に `contact_type=individual` で挿入（`buildContactPayloadFromLead`）: 担当者情報9カラム転記 / `url`→`website_url`（個人は contacts 側に転記）
2. `contact_email` がある場合 → `contact_emails` に追加
3. `contact_phone` がある場合 → `contact_phones` に追加（未入力時は `company_phone` でフォールバック）
4. `accounts` に新規挿入（`company_id=null`）
5. `account_contacts` で Account と Contact を紐付け
6. `deals` に新規挿入
7. `leads` の `promoted_*` を更新

#### エラー時ロールバック
各エンティティ作成で失敗した場合、作成済みのエンティティを逆順に物理削除する（手動補償トランザクション）。
Lead 更新は成功済みのため、`error` 文字列を警告として返し UI に表示する。

#### promoted_* カラム（20260420000001 追加）
| カラム | 型 | 説明 |
|-------|----|------|
| `promoted_deal_id`    | UUID FK → deals(id) ON DELETE SET NULL    | 昇格先 Deal |
| `promoted_company_id` | UUID FK → companies(id) ON DELETE SET NULL | 昇格時に作成した Company（法人のみ）|
| `promoted_contact_id` | UUID FK → contacts(id) ON DELETE SET NULL  | 昇格時に作成した Contact |
| `promoted_account_id` | UUID FK → accounts(id) ON DELETE SET NULL  | 昇格時に作成した Account |

昇格後に再度 Opportunity 以外のステージに戻した場合も、作成済みの Company/Contact/Account/Deal は削除しない（業務的に不自然）。

#### Lead→昇格先 転記マッピング（Phase 9b 追加: 20260422000008/09 で列追加）

| Lead カラム | 転記先 | 条件 |
|---|---|---|
| `leads.url` | `companies.website_url` | 法人昇格 |
| `leads.url` | `contacts.website_url` | 個人昇格 |
| `leads.company_phone` | `companies.phone` | 法人昇格 |
| `leads.contact_phone` | `contact_phones.phone`（label=work, is_primary=true） | 法人・個人両方 |
| `leads.contact_last_name` | `contacts.last_name` | 法人・個人両方 |
| `leads.contact_middle_name` | `contacts.middle_name` | 法人・個人両方 |
| `leads.contact_first_name` | `contacts.first_name` | 法人・個人両方 |
| `leads.contact_last_name_kana` | `contacts.last_name_kana` | 法人・個人両方 |
| `leads.contact_middle_name_kana` | `contacts.middle_name_kana` | 法人・個人両方 |
| `leads.contact_first_name_kana` | `contacts.first_name_kana` | 法人・個人両方 |
| `leads.contact_department` | `contacts.department` | 法人・個人両方 |
| `leads.contact_job_title` | `contacts.job_title` | 法人・個人両方 |
| `leads.contact_email` | `contact_emails.email`（label=work, is_primary=true） | 法人・個人両方 |
| `leads.company_name_kana` | `companies.name_kana` | 法人昇格 |
| `leads.representative_name` | `companies.representative_name` | 法人昇格 |
| `leads.corporate_number` | `companies.corporate_number` | 法人昇格（重複時はブロック：9c で対応）|

> **実装済み（Phase 9e）:** 上記転記ロジックは `src/actions/leads.ts`（`promoteLeadToDeal`）および `src/lib/leads/promote-helpers.ts` に実装済み。
>
> - 法人昇格時: `buildCompanyPayloadFromLead` で Company payload 生成 → `corporate_number` 重複は昇格をブロック（エラー返却）
> - 個人昇格時: `buildContactPayloadFromLead` で Contact payload 生成 → `website_url` を `contacts.website_url` に転記
> - 担当者情報未入力時: `lead_name` からのフォールバック分割を維持
> - `contact_email` → `contact_emails`（label=work, is_primary=true）追加
> - `contact_phone` → `contact_phones`（label=work, is_primary=true）追加（個人かつ contact_phone 未入力時は company_phone でフォールバック）

**注意:** `leads.promoted_deal_id` は `ON DELETE SET NULL` なので Deal 物理削除時も無効化される。テスト段階での Deal 物理削除は Phase D で許容するが、運用後は禁止（§11.8 参照）。

### 11.7 マスタリネームマッピング（20260419000001）

| 旧テーブル名 | 新テーブル名 | 理由 |
|------------|------------|------|
| `inside_sales_large_segments` | `lead_large_segments` | Lead 共通リソースへ昇格 |
| `inside_sales_small_segments` | `lead_small_segments` | 同上 |
| `inside_sales_call_statuses` | `lead_call_statuses` | 同上 |
| `inside_sales_callers` | `lead_callers` | 同上 |
| `inside_sales_phases` | **廃止** | `lead_temperatures` に統合 |

`deal_stages.phase_id` カラムも 20260419000002 で削除。`v_account_current_phase` View も同マイグレーションで廃止。

### 11.8 運用後の deals 物理削除禁止ポリシー

以下の理由により、**運用後の deals レコード物理削除は禁止**とする。

| 制約 | 詳細 |
|------|------|
| `contracts.deal_id NOT NULL FK` | 契約情報が deal に依存。物理削除時に契約が孤立 |
| `deal_change_histories` / `deal_stage_histories` / `deal_status_histories` | 3テーブルが deal_id を参照。削除時に履歴が消失 |
| `deal_activities` / `deal_activity_emails` | 対応履歴が消失 |
| `leads.promoted_deal_id` | Lead の昇格先が不明になる（ON DELETE SET NULL だが追跡不能に） |

**例外:** Phase D での既存 inside_sales pipeline の leads への移行作業は **テスト段階の1回限りの例外**（2026-04-19 ユーザー承認済み）。`deal_ext_inside_sales` / `deal_ext_inside_sales_calls` の物理削除も同様に Phase D 限定で許容する。

### 11.9 inside_sales pipeline 撤去完了（Phase D: 2026-04-19）

以下のファイルは Phase D で物理削除済み。残骸なし。

| 削除ファイル | 理由 |
|------------|------|
| `src/actions/deals/inside-sales.ts` | Lead エンティティに機能移管 |
| `src/actions/deals/inside-sales-import.ts` | CSV 取込は Lead フロー経由に変更 |
| `src/lib/validators/deals/inside-sales.ts` | Zod スキーマ不要 |
| `src/lib/inside-sales/import-helpers.ts`（ディレクトリごと） | IS 固有ヘルパー不要 |
| `src/app/(app)/admin/inside-sales/`（ディレクトリごと） | 管理UI削除 |
| `scripts/test-inside-sales-dryrun.ts` | テストスクリプト削除 |

`src/types/database.ts` の `InsideSales*` deprecated alias 型定義も同時削除。
`src/lib/validators/index.ts` の `insideSalesValidators` エクスポートも削除。
`supabase/seed.sql` から inside_sales の pipeline_types / deal_stages / deal_statuses エントリを削除。

### 11.10 lead_source 自動同期（Phase D 追加）

Lead 登録・更新時に `lead_source_id` が設定されている場合、紐づく `companies` / `contacts` の
`lead_source_id` が **NULL の場合のみ** 自動コピーする。

**実装場所:** `src/actions/leads.ts` — `createLead` / `updateLead` の末尾で `syncLeadSourceToRelated` を呼び出す。

| 挙動 | 詳細 |
|------|------|
| 未設定のみコピー | 対象の `lead_source_id` が `NULL` の場合だけ上書きする |
| 既存値は保持 | 手動設定済みの `lead_source` を上書きしない |
| company + contact 並列処理 | `Promise.all` で同時実行 |
| Server Action 内で実行 | RLS が効く `createClient()` 経由。多層防御を維持 |

**理由:** テレアポ→架電リード登録時に contact の `lead_source_id='teleappointment'` を自動セットするなど、
初回流入チャネルをトラッキングしやすくするため。ただし手動で設定した値は尊重する。

### 11.12 Lead スコアリング機構（Phase E: 2026-04-22 刷新中）

本章は Phase 2-7 完了後に最終更新予定。現時点ではマスタ定義のみ記載。

#### 11.12.1 マスタ構成
- M21 lead_score_thresholds: score → temperature_id 変換
- M24 lead_company_sizes: 資本金/従業員数レンジ
- M25 lead_customer_activity_types: 顧客行動タイプ
- M26 lead_score_rules: 加点ルール

#### 11.12.2 leads テーブルへの追加列（20260422000003 で追加）

| カラム | 型 | NULL | 説明 |
|--------|---|------|------|
| `employee_count` | INT | 許容 | 従業員数（判定用。スコア算出では company_size_id 経由で参照）。CHECK: >= 0 |
| `capital` | NUMERIC | 許容 | 資本金（円、判定用）。CHECK: >= 0 |
| `company_size_id` | UUID FK → lead_company_sizes(id) | 許容 | 企業規模。DBトリガ（trg_leads_company_size_before_*）で自動設定。アプリからの設定不可 |

**score CHECK 強化:** `score IS NULL OR (score >= 0 AND score <= 100)`（旧: `score >= 0` のみ）

#### 11.12.x leads テーブルへの追加列（20260422000008 で追加 — Phase 9b）

##### phone リネーム

| 旧カラム | 新カラム | 型 | 説明 |
|---------|---------|---|------|
| `phone` | `company_phone` | VARCHAR(20) | 代表電話（旧 phone をリネーム）|

##### 担当者情報（contact_* 9列）

| カラム | 型 | NULL | 説明 |
|--------|---|------|------|
| `contact_phone` | VARCHAR(20) | 許容 | 担当者電話。昇格時 contact_phones へ転記 |
| `contact_last_name` | TEXT | 許容 | 担当者姓（max 50文字）|
| `contact_middle_name` | TEXT | 許容 | 担当者ミドルネーム |
| `contact_first_name` | TEXT | 許容 | 担当者名（max 50文字）|
| `contact_last_name_kana` | TEXT | 許容 | 担当者姓カナ |
| `contact_middle_name_kana` | TEXT | 許容 | 担当者ミドルネームカナ |
| `contact_first_name_kana` | TEXT | 許容 | 担当者名カナ |
| `contact_department` | TEXT | 許容 | 担当者部署（max 100文字）|
| `contact_job_title` | TEXT | 許容 | 担当者役職（max 100文字）|
| `contact_email` | TEXT | 許容 | 担当者メール（max 255文字）|

##### 企業情報（3列）

| カラム | 型 | NULL | 説明 |
|--------|---|------|------|
| `company_name_kana` | TEXT | 許容 | 企業名カナ（max 200文字）|
| `representative_name` | TEXT | 許容 | 代表者名（max 100文字）|
| `corporate_number` | VARCHAR(13) | 許容 | 法人番号13桁。CHECK: `^[0-9]{13}$`。昇格時 companies.corporate_number へ転記（重複時ブロック）|

#### 11.12.3 企業規模の自動判定

- 資本金優先: `capital` が NOT NULL の場合、`lead_company_sizes.min_capital / max_capital` レンジで判定
- 資本金 NULL または該当レンジなし → 従業員数でフォールバック（`min_employees / max_employees`）
- BEFORE INSERT/UPDATE トリガ（`trg_leads_company_size_before_insert` / `trg_leads_company_size_before_update`）で自動設定
- アプリから `company_size_id` を指定しても無視（トリガ関数内で上書き）

#### 11.12.4 顧客行動ログ（D09 lead_customer_activities）

- 顧客側の行動（イベント参加・資料DL等）を手動入力で記録
- `lead_activities`（社内架電対応）とは別テーブル
- RLS: `is_lead_accessible` 委譲、DELETE のみ admin
- `source` 列は将来の外部連携（Peatix / HubSpot 等）を見越した文字列フィールド

#### 11.12.5 スコア内訳（D10 lead_score_breakdowns）

- `recalculate_lead_score` 実行時に全置換（DELETE → INSERT）
- `UNIQUE(lead_id, rule_id)` で 1 ルール = 1 行
- SELECT は `is_lead_accessible` 委譲、書き込みは service_role のみ（authenticated ポリシー未定義 = 拒否）
- 企業規模判定関数: `resolve_lead_company_size(p_capital NUMERIC, p_employee_count INT) RETURNS UUID`

#### 11.12.6 スコア算出ロジック（recalculate_lead_score）

- 単一 Lead のスコアを算出する DB 関数
- 入力: `p_lead_id UUID`
- 出力: 算出後の score（INT, 0-100）
- 処理:
  1. `lead_score_rules` を全件取得（`deleted_at IS NULL` / `sort_order ASC`）
  2. 各ルールを `category × condition_type` に応じて評価（下表）
  3. 一致したルールの `score_delta` を合算、`LEAST(合計, 100)` でクリップ
  4. `lead_score_thresholds` から `temperature_id` を解決（`min_score <= score AND (max_score IS NULL OR score <= max_score)`）
  5. `leads.score / temperature_id` を UPDATE
  6. `lead_score_breakdowns` を DELETE → INSERT で全置換（一致ルールのみ）
- 時間窓: 全期間（マイナス点なし）

| condition_type | 判定方法 |
|---|---|
| `company_size` | `lead.company_size_id = rule.condition_value_id` |
| `large_segment` | `lead.large_segment_id = rule.condition_value_id` |
| `small_segment` | `lead.small_segment_id = rule.condition_value_id` |
| `lead_source` | `lead.lead_source_id = rule.condition_value_id` |
| `stage` | `lead.stage_id = rule.condition_value_id` |
| `status` | `lead.status_id = rule.condition_value_id` |
| `call_status` | `lead_activities` の最新1件の `call_status_id` |
| `activity_type` | `lead_activities` に該当 `activity_type_id` が1件以上 |
| `customer_activity_type` | `lead_customer_activities` に該当 `activity_type_id` が1件以上 |

- 参照切れ: `condition_value_id` の参照先マスタが未存在 or 論理削除済みの場合、`RAISE WARNING` で記録し該当ルールはスキップ
- 呼び出し元: `createLead` / `updateLead` / `lead_customer_activities` CRUD / Phase 6 pg_cron
- 手動スコア入力不可: `leadCreateSchema` / `leadUpdateSchema` から `score` / `temperature_id` を削除。`createAdminClient()` 経由で RPC 呼び出し

#### 11.12.7 週次バッチ（recalculate_all_lead_scores）

- **マイグレーション:** `20260422000007_setup_lead_score_weekly_cron.sql`
- **pg_cron スケジュール:** JST 日曜 03:00（= UTC 土曜 18:00）
- **cron 書式:** `0 18 * * 6`（分 時 日 月 曜日。曜日 6 = 土曜 UTC = 日曜 JST）
- **処理フロー:**
  1. `leads` テーブルから `deleted_at IS NULL` の全件をループ
  2. 各 Lead について `resolve_lead_company_size(capital, employee_count)` で企業規模を再判定
  3. 判定結果が現行の `company_size_id` と異なる場合のみ `UPDATE leads SET company_size_id = ...`（マスタ変更反映）
  4. `recalculate_lead_score(id)` を実行（スコア・温度感・breakdowns を更新）
- **statement_timeout 対策:** `SET LOCAL statement_timeout = 0` で pg_cron 実行中はタイムアウト無効化
- **冪等性:** DO ブロックで既存 job を `cron.unschedule` してから再登録。マイグレーション 2 回適用でもエラーにならない
- **マスタ変更の反映タイミング:** `lead_score_rules` / `lead_company_sizes` / `lead_score_thresholds` の変更は翌週日曜 03:00 に自動反映。即時反映が必要な場合は管理者が手動実行（下記）
- **手動実行（画面）:** マスタ・取込 → 「リード スコアルール」タブの「全件を再計算」。
  2026-08-09 にジョブ方式へ変更（`admin_bulk_jobs` / `job_type = 'lead_score_recalc'`。§27）。
  HTTP リクエストの中では実行しない。SQL から `SELECT recalculate_all_lead_scores();` を
  直接叩く経路（admin のみ）も残っている
- **戻り値:** 処理した Lead 件数（INT）
- **ログ:** `RAISE NOTICE '[recalculate_all_lead_scores] N リードの再計算を完了'`

---

### 11.11 移行マッピング表（旧 IS → Lead）（参考）

Phase D で実施する移行の参考として、既存 deal_stages/deal_statuses → lead_stages/lead_statuses の対応。

| 既存 deal_stages (IS) | → lead_stages slug | 既存 deal_statuses (IS) | → lead_statuses code |
|----------------------|-------------------|----------------------|---------------------|
| リスト化済 | `generation` | 未着手 | `not_started` |
| 未架電 | `generation` | 架電予定 | `call_scheduled` |
| 架電試行中 | `nurturing` | 継続架電 | `continuing_call` |
| 再架電待ち | `nurturing` | 再架電待ち | `awaiting_recall` |
| アポ獲得 | `qualification` | アポ確定 | `appointment_confirmed` ※ |
| 商談化 | `sales` | 引継済 | `handed_over` |
| クローズ（成約） | `customer`（取引先） | 成約 | `closed_won` |
| クローズ（失注） | `dead` | 失注 | `lost` |

※ `appointment_confirmed`（アポ確定）は移行時には存在したが、**2026-08-05 に廃止して
`appointment_obtained`（アポ獲得）へ寄せた**。運用上この 2 つを分けていなかったため。
本番の該当 8 件も同時に付け替えている（T-0054）。この表は移行時点の対応を残したもので、
現行のステータス一覧は §「リードステータス」を見ること。

---

## 13. リード複数担当者（Phase 10b-1）

### 13.1 背景

主担当（`leads.owner_user_id`）に加え、副担当を複数設定可能にする。  
主担当カラムは残置し、副担当のみ中間テーブルで管理する設計とした（tech-pm Phase 10a レビュー確定）。

### 13.2 lead_owners 中間テーブル（T10 / J05）

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| `lead_id` | UUID | NOT NULL, FK → leads(id) ON DELETE CASCADE | 対象リード |
| `user_id` | UUID | NOT NULL, FK → crm_users(id) ON DELETE RESTRICT | 副担当CRMユーザー |
| `assigned_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 割り当て日時 |

- PRIMARY KEY: `(lead_id, user_id)`
- インデックス: `idx_lead_owners_user` on `user_id`
- `is_primary` カラムなし（主担当は `leads.owner_user_id` で一元管理）
- 部分 UNIQUE 不要（PK で一意性を保証）
- `owner_user_id` との重複は DB では許容。UI でガード推奨

### 13.3 RLS 更新

| 操作 | 許可条件 |
|---|---|
| leads SELECT | `is_manager_or_above()` OR `owner_user_id = auth.uid()` OR `lead_owners` に所属 |
| leads UPDATE | `is_manager_or_above()` OR `owner_user_id = auth.uid()` OR `lead_owners` に所属 |
| leads DELETE | `is_manager_or_above()` OR `owner_user_id = auth.uid()` のみ（副担当は削除不可） |
| lead_owners SELECT/INSERT/DELETE | `is_lead_accessible(lead_id)` で委譲 |

- `is_lead_accessible(UUID)` ヘルパー関数も `lead_owners` チェックを含む定義に更新済み
- この変更により `lead_campaigns` / `lead_activities` / `lead_customer_activities` / `lead_score_breakdowns` の RLS も副担当アクセスを自動的に反映（`is_lead_accessible` 経由）

## § 14. lead_activities.caller_id → caller_user_id 移行（Phase 10b-2: 2026-04-22）

### 14.1 目的

Phase 10b-3 で `lead_callers` マスタを DROP するための事前準備。`lead_activities.caller_id`（FK→lead_callers）を `caller_user_id`（FK→crm_users）に移行する。

### 14.2 D08 lead_activities カラム変更

| 変更前 | 変更後 | 型 | 制約 | 説明 |
|--------|--------|---|------|------|
| `caller_id` | `caller_user_id` | UUID | NOT NULL, FK→crm_users(id) | 対応者。旧 lead_callers FK から crm_users FK へ移行 |

- インデックス: `idx_lead_activities_caller`（旧）→ `idx_lead_activities_caller_user`（新）

### 14.3 マイグレーション戦略

1. `caller_user_id`（NULL 許容）を追加
2. `lead_callers.linked_user_id` 経由でバックフィル（開発環境 seed では全3件が解決済み）
3. `caller_id` を DROP
4. `caller_user_id` を NOT NULL に変更

### 14.4 影響ファイル

| ファイル | 変更内容 |
|---|---|
| `supabase/migrations/20260422000011_migrate_lead_activities_caller.sql` | マイグレーション本体 |
| `src/lib/validators/lead-activities.ts` | `caller_id` → `caller_user_id` |
| `src/actions/lead-activities.ts` | JOIN を `crm_users!lead_activities_caller_user_id_fkey` に変更 |
| `src/types/database.ts` | `LeadActivity.caller_id` → `caller_user_id`、`caller` JOIN 型更新 |
| `src/app/(app)/leads/[id]/lead-detail-client.tsx` | フォームフィールド・表示を更新 |
| `supabase/seed-leads-generated.sql` | `caller_id` → `caller_user_id`、値を `crm_users.id` に変換 |
| `scripts/generate-leads-seed.mjs` | 生成ロジックを `caller_user_id` ベースに更新 |

### 14.5 注意事項（Phase 10b-2 時点）

- `leads.primary_caller_id`（FK→lead_callers）は Phase 10b-3 で廃止済み
- `lead_callers` マスタは Phase 10b-3 で DROP 済み
- UI の「対応者」Select は `masters.callers`（lead_callers）から `masters.owners`（crm_users）に変更済み

---

## 15. Phase 10b-3: lead_callers マスタ廃止

### 15.1 背景・目的

Phase 10b-1 で `lead_owners` を導入し、Phase 10b-2 で `lead_activities.caller_id`（FK→lead_callers）を `caller_user_id`（FK→crm_users）に移行した。
これにより `lead_callers` への外部 FK 参照が全て解消されたため、`leads.primary_caller_id` カラムと `lead_callers` テーブルを廃止する。

### 15.2 変更内容

| ファイル | 変更 |
|---|---|
| `supabase/migrations/20260422000012_drop_lead_primary_caller.sql` | `leads.primary_caller_id` カラム DROP |
| `supabase/migrations/20260422000013_drop_lead_callers.sql` | RLS ポリシー削除 → `lead_callers` テーブル DROP |
| `src/lib/validators/leads.ts` | `primary_caller_id` フィールド削除 |
| `src/lib/validators/masters.ts` | `leadCallerCreateSchema`, `leadCallerUpdateSchema` 削除 |
| `src/actions/masters.ts` | `getLeadCallers`, `createLeadCaller`, `updateLeadCaller`, `deleteLeadCaller` 削除 |
| `src/actions/leads.ts` | LEAD_SELECT / getLeads の `primary_caller:lead_callers(...)` JOIN 削除 |
| `src/types/database.ts` | `LeadCaller` 型削除、`Lead.primary_caller_id` 削除 |
| `src/app/(app)/leads/[id]/page.tsx` | `getLeadCallers()` 呼び出し・`masters.callers` 削除 |
| `src/app/(app)/leads/[id]/edit/page.tsx` | 同上 |
| `src/app/(app)/leads/new/page.tsx` | 同上 |
| `src/app/(app)/leads/[id]/lead-detail-client.tsx` | `Masters.callers` 型フィールド削除 |
| `src/app/(app)/leads/[id]/edit/lead-edit-client.tsx` | `Masters.callers` 削除、初期値・submit・UI の `primary_caller_id` 削除 |
| `src/app/(app)/leads/new/lead-new-form.tsx` | `Masters.callers` 削除、初期値・submit・UI の `primary_caller_id` 削除 |
| `src/app/(app)/admin/admin-view.tsx` | `lead_callers` タブ・state・Promise.all エントリ・refresh 関数削除 |
| `src/app/(app)/manual/page.tsx` | `lead_callers` 行削除 |
| `supabase/seed.sql` | `INSERT INTO lead_callers` 削除、leads INSERT から `primary_caller_id` 列・値削除 |
| `supabase/seed-leads-generated.sql` | leads INSERT から `primary_caller_id` 列・値削除 |
| `scripts/generate-leads-seed.mjs` | `callerId` フィールド削除、INSERT から `primary_caller_id` 削除 |

---

## § 16. Phase 10c: Server Action 戻り値統一 + Lead 複数担当者対応（2026-04-22）

### 16.1 Server Action 戻り値統一

全 getXxx 系 Server Action の戻り値を `{ rows: T[]; total: number }` に統一した。

| Action | 変更前 | 変更後 |
|---|---|---|
| `getLeads` | `{ items, count }` | `{ rows, total }` |
| `getContacts` | `{ rows, count }` | `{ rows, total }` |
| `getCompanies` | `{ items, total }` | `{ rows, total }` |
| `getAccounts` | `{ rows, count }` | `{ rows, total }` |
| `getContracts` | `{ items, count }` | `{ rows, total }` |
| `getDeals` | `{ items, count }` | `{ rows, total }` |
| `getProjects` | `{ items, total }` | `{ rows, total }` |
| `getCampaigns` | `{ items, count }` | `{ rows, total }` |
| `getTalents` | `{ items, count }` | `{ rows, total }` |

呼び出し元の view コンポーネント・page.tsx・detail コンポーネントも同様に更新済み。

### 16.2 Lead 複数担当者 Server Action 仕様

#### `createLead`（`sub_owner_user_ids` 対応）

- `leadCreateSchema` に `sub_owner_user_ids?: string[]`（default `[]`）を追加
- lead 作成後、`sub_owner_user_ids` から `owner_user_id` と重複するものを除外し `lead_owners` に bulk insert
- bulk insert 失敗は best-effort（警告ログのみ、lead 作成は成功扱い）

#### `updateLead`（`sub_owner_user_ids` + 副担当編集権限）

- `leadUpdateSchema` に `sub_owner_user_ids?: string[]` を追加（optional、省略時は lead_owners を変更しない）
- member ロールのアクセス制御: `owner_user_id = user.id` OR `lead_owners` に `user_id = user.id` が存在する場合のみ編集可
- `sub_owner_user_ids` が渡された場合: 既存 `lead_owners` を全件削除 → 新しい配列で bulk insert（`owner_user_id` との重複除外）

#### `deleteLead`（副担当は削除不可）

- member ロール: `owner_user_id = user.id` のみ許可（副担当ユーザーは削除不可）
- manager/admin: 全件削除可

#### `LEAD_SELECT` 更新

`sub_owners:lead_owners(user_id, user:crm_users!lead_owners_user_id_fkey(id, full_name))` を追加。
詳細取得・作成・更新の全 SELECT で副担当一覧を返す。

### 16.3 型定義更新

`src/types/database.ts` の `Lead` 型に `sub_owners?: LeadOwner[]` を追加。

---

## § 17. Phase 11: lead_activities 編集機能解禁（2026-04-26）

### 17.1 背景・目的

`lead_activities`（D08 社内対応履歴）は当初 INSERT ONLY 運用としていたが、誤記録のたびに admin が DELETE→再作成するのは運用負荷が高い。
そのため `caller_user_id` 本人と manager/admin による UPDATE を解禁し、`last_edited_at` / `last_edited_by_user_id` で監査証跡を保全する方針へ変更する。

### 17.2 D08 lead_activities カラム追加

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| `last_edited_at` | TIMESTAMPTZ | NULL 許容 | 最終編集日時。INSERT 時は NULL、編集時のみ `now()` をセット |
| `last_edited_by_user_id` | UUID | NULL 許容、FK→crm_users(id) | 最終編集者。INSERT 時は NULL、編集時のみ操作ユーザー ID をセット |

### 17.3 RLS ポリシー追加

```sql
CREATE POLICY lead_activities_update ON lead_activities
  FOR UPDATE TO authenticated
  USING  (caller_user_id = auth.uid() OR is_manager_or_above())
  WITH CHECK (caller_user_id = auth.uid() OR is_manager_or_above());
```

- DELETE は従来通り admin のみ（`lead_activities_delete_admin`）
- INSERT / SELECT は変更なし（`is_lead_accessible` 委譲）
- Server Action 側でも明示的に権限チェックする（多層防御）

### 17.4 影響範囲

| ファイル | 変更 |
|---|---|
| `supabase/migrations/20260426000001_lead_activities_allow_update.sql` | カラム追加 + UPDATE ポリシー新設 |
| `src/lib/validators/lead-activities.ts` | `leadActivityUpdateSchema` 追加（`id` 必須、`lead_id` / `call_number` は不変） |
| `src/actions/lead-activities.ts` | `updateLeadActivity` 追加。冒頭コメント更新（INSERT ONLY → 編集可） |
| `src/app/(app)/leads/[id]/lead-detail-client.tsx` | `LeadActivityEditModal` 追加、アコーディオンに編集ボタン追加（caller_user_id 本人 OR manager/admin で表示） |
| `CLAUDE.md` | 「履歴テーブル: INSERT ONLY」記述に lead_activities 例外を明記 |


---

## § 18. タレント分類マスタ（系統 / グレード / 職種）（2026-04-21 導入）

### 18.1 目的

タレントの保有スキル（`talent_skills` × `skills`）と実績（`talent_achievements`）から、
**系統（System）・グレード（Grade）・適合職種（Job Type）** を自動判定する。
判定結果はテーブルに永続化せず、参照時に純粋関数で算出する（マスタ変更が即時反映される）。

### 18.2 テーブル

| テーブル | 用途 | 主なキー |
|---|---|---|
| `talent_system_tags` | 系統マスタ（G / SP / CO の 3 件） | `system_code` UNIQUE |
| `talent_grades` | グレードマスタ（A1〜L4 の 16 段階） | `grade_code` UNIQUE、`sort_order`（1=最低 16=最高） |
| `talent_grade_requirements` | 系統 × グレードの昇格要件（36 件 = 3 系統 × A2〜L1） | UNIQUE (`system_code`, `grade_code`) |
| `talent_job_types` | 職種マスタ（19 件） | `job_type_code` UNIQUE |
| `talent_achievements_master` | 実績マスタ（9 件） | `achievement_code` UNIQUE |
| `talent_achievements` | タレント × 実績（junction） | UNIQUE (`talent_id`, `achievement_code`) |

`skills` テーブルの拡張カラム:

| カラム | 型 | 内容 |
|---|---|---|
| `skill_code` | VARCHAR(8) UNIQUE | `T01` / `D14` 等。判定ロジックが参照する識別子 |
| `axis` | VARCHAR(1) | `T`（Technical）/ `D`（Domain）/ `B`（Business）/ `M`（Management） |
| `system_tags` | TEXT[] | そのスキルが属する系統（`{G,SP}` 等）。系統判定の `tag_filter` が参照 |
| `note` | TEXT | 補足 |

`talent_skills.proficiency_level` の CHECK 制約は 0〜5 に拡張済み。

### 18.3 判定ロジック（`src/lib/talent-classification/`）

すべて副作用のない純粋関数。Server Action `getTalentProfile` がマスタを読み込んで呼び出す。

| ファイル | 役割 |
|---|---|
| `system-classifier.ts` | `determination_rule.conditions` を全件 AND 評価して該当 `system_code` を返す |
| `grade-calculator.ts` | 系統ごとに `skill_thresholds`（AND）+ `required_achievements`（AND）を評価し、`sort_order` 降順で最初に充足したグレードを返す |
| `job-type-classifier.ts` | `rules` を AND 評価。ルール内の `skill_ids_any` は OR、`axis_filter` は「その軸で `min_star` 以上が `min_count` 件以上」 |
| `d-co-pool.ts` | `skill_ids_any_pool: "d_co_system_skill_ids"` の実体（D 軸 × CO 系統のスキルコード一覧） |
| `index.ts` | 上記を統合し `TalentProfileResult`（systems / grades / primary_system / highest_grade / job_types）を返す |

判定上の取り決め:

- **L2〜L4 は自動判定の対象外**（人事評価による）。グレードマスタの `sort_order` を基準に、L1 の `sort_order` 以下のみ評価する
- どの要件も満たさない場合は**グレードマスタの最下位**（`sort_order` 最小 = A1）を返す。マスタが空の場合は `null`
- 1 ルール内に `skill_ids_any` と `axis_filter` が併記された場合は**両方を満たすこと**（AND）
- `skill_ids_any_pool` に未知のプール名が指定された場合は空配列扱い（= 要件未達）とし、`console.warn` を出す

### 18.4 RLS

- マスタ 5 テーブル: SELECT は認証済み全員、INSERT / UPDATE / DELETE は `is_admin()` のみ
- `talent_achievements`: SELECT / INSERT は `is_manager_or_above()` または「対象 talent の contact が自分の担当」、UPDATE / DELETE は `is_admin()` または同オーナー条件
- **Server Action 側では実績の追加・更新・削除を manager 以上に限定**している（`src/actions/talent-classification.ts`）。
  RLS より厳しい制限を UI（`canEdit`）と一致させるための多層防御であり、RLS 単独に依存しない

### 18.5 マイグレーションと seed

| ファイル | 内容 |
|---|---|
| `supabase/migrations/20260421000001_add_definition_to_masters.sql` | 全マスタへ `definition` 追加（`description` を持つ 3 テーブルはリネーム） |
| `supabase/migrations/20260421000002_talent_classification_masters.sql` | `skills` 拡張 + 分類マスタ 6 テーブル + RLS |
| `supabase/seed-talent-classification.sql` | スキル体系（4 カテゴリ / 99 スキル）+ 分類マスタ。**スキル体系の正本** |

**適用順序の注意:**

- 上記 2 本のマイグレーションはタイムスタンプが `20260421` であり、既に適用済みの `20260422*` / `20260426000001` より**過去**に位置する。
  ローカル DB には適用済みのためファイル名は変更していない。リモートへ反映する際は
  `supabase db push --include-all` が必要になる（out-of-order のためデフォルトではスキップされる）
- `20260421000001` は `lead_callers`（`20260422000013` で DROP 済み）を対象に含めない。
  含めると廃止後の環境で適用に失敗する
- seed は本番投入の可否で `supabase/seeds/` 配下に分割している（`01-masters` / `02-dev-users` /
  `03-dev-samples` / `04-leads`）。`seed-talent-classification.sql` はスキル体系の正本で、
  `03-dev-samples.sql` の `talent_skills` サンプルが `skill_code`（B13 / B09 / T20）を参照するため
  **サンプルより先**に読み込む。読み込み順は `config.toml` の `sql_paths` で管理する
- 同 seed は全 INSERT が `ON CONFLICT DO NOTHING` で、既存データを削除しない
  （旧実装は `DELETE FROM talent_skills / skills` を行っており、本番実行でタレントの保有スキルが全消失する構造だった）

### 18.6 影響ファイル

| ファイル | 内容 |
|---|---|
| `src/lib/validators/talent-classification.ts` | マスタ・実績の Zod スキーマと型 |
| `src/actions/talent-classification.ts` | マスタ取得 / 実績 CRUD / `getTalentProfile` |
| `src/lib/talent-classification/*` | 判定ロジック（純粋関数） |
| `src/app/(app)/talents/[id]/page.tsx` | プロファイル・実績・ロールを取得してクライアントへ渡す |
| `src/app/(app)/talents/[id]/talent-detail-client.tsx` | 基本性質 / スキル / 職種 / 経歴の 4 タブ |


---

## 16. 名刺データの連絡先化・取引先の契約後作成・ステータス色（2026-07-31）

### 16.1 背景

3 点の運用変更をまとめて反映した。

1. **バッジ色が画面ごとに違う** — 色の決め方が「sort_order からの進行度」と「id のハッシュ」の 2 系統に分かれていた。前者は画面が渡す総件数で色が変わり、後者はマスタ間で対応が取れない
2. **名刺データが連絡先に出てこない** — Deal 昇格まで `contacts` を作っていなかったため、取り込んだ人物を連絡先一覧から探せなかった
3. **契約前から取引先が増える** — 取引先は契約主体なので、契約成立まで作らない

### 16.2 ステータス色（color）

対象マスタに `color`（`^#[0-9A-Fa-f]{6}$`）を追加し、表示側は DB の値をそのまま使う。

| テーブル | マイグレーション |
|---|---|
| `account_statuses` / `contact_statuses` / `company_statuses` | 20260731000001 |
| `deal_stages` / `deal_statuses` | 同上 |
| `lead_stages` / `lead_statuses` | 同上 |
| `project_statuses` | 同上 |

既定色は `apply_default_status_colors()` に集約し、マイグレーションと `seeds/01-masters.sql` の双方から呼ぶ（色定義の二重管理を避けるため）。色が入っている行は上書きしない。

**意味カテゴリで横断統一する。** マスタが違っても同じ意味の値は同じ色になる。

| 意味 | 色 | 例 |
|---|---|---|
| 開始・新規・見込み | `#2563EB` | 見込み / 新規 / 計画中 / 獲得 |
| 接触・育成 | `#0E7490` | コンタクト済み / 架電試行中 / 育成 |
| 進行・提案 | `#0F766E` | 進行中 / 提案中 / 選定 |
| 交渉・見積 | `#B88A2E` | 見積り提出 / アポ獲得 |
| 成功・完了 | `#4D7A65` | アクティブ / 受注 / 成約 / Customer |
| 失敗・終了 | `#B03A2E` | 解約 / 失注 / 中止 / Dead |
| 停止・保留 | `#6B7280` | 休眠 / 保留 |

Admin のマスタ管理から色を編集できる（`colorSwatch` フィールド）。`color` が NULL の行は表示側が従来のフォールバック配色を使う。

**ステータス・種別は一覧でも詳細でもバッジで出す**（2026-08-05 に統一。T-0056）。
それまで一覧はバッジ、詳細は素のテキストで、同じ値が画面によって違う見え方をしていた。
対象は事業者情報・連絡先・取引先（ステータスと種別）・プロジェクト。
`InfoField` は `value` に ReactNode を取れるので、器は変えずに中身だけ差し替える。

**バッジを出す箇所は `color` まで SELECT すること。** 落とすと
フォールバック配色になり、同じ値が画面ごとに別の色で出る（§16.1 の 1 と同じ壊れ方）。

### 16.3 D06: company_domains（法人ドメイン）

名刺取込で所属法人を判定する一次キー。会社名は表記ゆれが大きいため、ゆれの無いメールドメインを先に見る。

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK |
|---|--------|--------|-----|----|----|----|----|----------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | |
| 2 | カンパニーID | `company_id` | UUID | | FK→T02.id (CASCADE) | | NN | | |
| 3 | ドメイン | `domain` | TEXT | | | UK | NN | | 小文字・ラベル形式のみ／フリーメール禁止 |
| 4 | 代表フラグ | `is_primary` | BOOLEAN | | | | NN | FALSE | 法人ごとに 1 件（部分 UNIQUE） |
| 5 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | now() | |
| 6 | 作成者 | `created_by` | UUID | | FK→T01.id | | | | |
| 7 | 更新日時 | `updated_at` | TIMESTAMPTZ | | | | NN | now() | トリガー自動更新 |
| 8 | 最終更新者 | `last_updated_by` | UUID | | FK→T01.id | | | | |

- **`domain` は全体で UNIQUE。** 法人を一意に決めるキーとして使うため、同じドメインを 2 社に登録できない（名寄せ結果が呼び出し順で変わるのを防ぐ）
- **RLS:** 親 `companies` の可視性・編集権限をそのまま引き継ぐ（従属テーブルの規約どおり）
- **UI:** 事業者情報の編集ページで追加・削除・代表切替。保存ボタンとは独立して即時反映する

### 16.4 名寄せ関数

| 関数 | 役割 |
|---|---|
| `is_free_email_domain(TEXT)` | フリーメール判定。IMMUTABLE。`company_domains` の CHECK からも使う |
| `normalize_domain(TEXT)` | メール／URL／裸のドメインを保存形式（小文字・www 無し）へ |
| `expand_corporate_abbreviations(TEXT)` | 略記を正式表記へ（`㈱` → `株式会社`）。保存する値そのものを整える |
| `resolve_corporate_type_id(TEXT)` | 名称に含まれる法人格を返す。最長一致。決まらなければ NULL |
| `normalize_company_name(TEXT)` | 法人格表記・全角半角・区切り記号を落とした名寄せキー。`companies` に関数インデックス |
| `normalize_address_key(...)` | 住所の照合キー。郵便番号（無ければ都道府県+市区町村）と番地の数字列 |
| `resolve_or_create_company(...)` | **法人番号 → ドメイン → 住所+名称 → 名称** の順に照合し、無ければ作る |
| `resolve_or_create_contact(...)` | メール一致 → 会社×姓名一致 → 新規作成。メール・電話は空欄補完のみ |

取込（`import_eight_leads`）と既存リードの遡及作成が同じ関数を通る。片方だけ判定が変わる事故を防ぐため。

#### 一覧の並び順（20260802000008 / 20260802000009）

事業者情報の一覧は **法人格を除いた名称順**（`companies.sort_key`）。
登録順では 3,598 件から目当ての事業者を辿れず、また「株式会社ABC」と
「ABC株式会社」が離れた位置に並ぶと探せないため。

- `sort_key` は生成列。`company_sort_key(name, name_kana)` で計算し、
  照合順序に ICU の `ja-JP-x-icu` を指定している（既定の `en_US` では
  かな・記号の並びが日本語とずれる）
- フリガナ（`name_kana`）があればそれを優先する。読み仮名を持たない漢字は
  どの照合順序でも五十音順に並べられないため、**フリガナが無いと読み順にならない**

#### フリガナの自動生成（20260802 / `src/lib/kana.ts`）

空欄のままでは漢字の事業者が読み順に並ばないので、形態素解析（kuromoji / IPADIC）で
読みの下書きを入れる。

- **読みは正確とは限らない。** 社名は地名・人名・造語が多く、辞書の読みと実際の読みが
  食い違うことがある。「あとから人が直せる下書き」という位置づけで、
  **人が入れた値は上書きしない**（空欄のときだけ補う）
- **法人格は含めない。** フリガナは事業者の呼び名なので「カブシキガイシャ〜」は要らない。
  `stripCorporateType()` で落としてから読む。法人格の綴りは
  DB 関数 `company_sort_key` の除去リストと対で持つので、増やすときは両方直す。
  除去は**長い綴りから当てる**こと（「独立行政法人」が先に当たると
  「地方独立行政法人」の「地方」が残る）
- 辞書に無い語（英字・記号）は表記のまま残す。英字社名は読み下すより綴りのままの方が探しやすい
- 画面では会社名を入力し終えた時点（blur）で補完する。保存時にも Server Action 側で補う
- 既存分は `scripts/backfill-company-kana.mts` で一括投入する（`--dry-run` で内容だけ確認できる）
- 辞書は 17MB。**サーバー側でのみ読む**（クライアントから import しないこと）。
  Turbopack にバンドルさせると内部のパス解決が壊れるため
  `serverExternalPackages` に入れ、standalone 出力には
  `outputFileTracingIncludes` で辞書を明示的に含めている
- 法人格を落とした後に残る括弧などは頭から取り除く。記号は文字より前に並ぶため、
  残すと一覧の先頭に集まってしまう
- **`company_sort_key` を変えたら `sort_key` 列を作り直すこと。**
  生成列は関数の再定義では再計算されない（`DROP COLUMN` → `ADD COLUMN`）

#### 名寄せの優先順位（20260802000006）

同名の会社は珍しくないため、名称だけでは決められない。信頼できるキーから順に見る。

| 順 | キー | 単独で確定してよいか |
|---|---|---|
| 1 | 法人番号 | **可**。法的に一意 |
| 2 | メールドメイン | **可**。フリーメールは除外済み（`is_free_email_domain`） |
| 3 | 住所 + 名称 | 住所単独は**不可**。雑居ビル・レンタルオフィスには何社も入っている |
| 4 | 名称 | 最後の手段。複数該当したら最も古いものを採る |

住所は「郵便番号 + 番地」で比べる。実データでは建物名が `address_line1` に続けて
入っている（「日本橋浜町2-35-4日本橋浜町パークビル」）ため、**先頭の数字列だけ**を取り、
建物名や階数に引きずられないようにする。番地を取り出せない住所はキーを作らない。

会社を新規作成するときは法人番号と住所も残す。残さないと次回以降そのキーで照合できない。
既存の会社には、紐づくリードの住所から主住所を 1 件バックフィルした（20260802000007）。

**`normalize_address_key` を変えたら `addresses_matching_key_idx` を REINDEX する。**

#### 会社名の表記（20260802000003）

`㈱` 712 件 /`（株）` 179 件 /`(株)` 89 件 と、同じ法人格が 4 通りで書かれていた。
表記が違うだけで別法人として登録されるため、**保存する値を正式表記に開く**。

- `normalize_company_name` は「開いてから落とす」順序にした。除去リストに合成文字を
  書き足す方式では書き漏らしがそのまま名寄せの取りこぼしになる（実際 `㈱` が漏れ、
  「㈱ワンエイト」と「株式会社ワンエイト」が別法人になっていた）
- 綴りが一意に定まらない合成文字（`㈳` は社団法人か一般社団法人か決められない）は開かない
- 規則は TS 側 `src/lib/company-name.ts` と対。画面からの保存は TS、名刺取込は DB を
  通るため**両方に同じ規則が要る**。`company-name.test.ts` で固定している
- **`normalize_company_name` を変えたら `companies_normalized_name_idx` を REINDEX する。**
  PostgreSQL は IMMUTABLE 関数の再定義を検知せず、索引に古いキーが残る

法人格（`corporate_types`）は名称に綴りが含まれていれば機械的に決まるので、
新規保存時に空欄なら補う。**人が選んだ値は上書きしない。**
名称に現れない「個人事業主」は自動では決まらない。

### 16.5 leads の新カラム

| 物理名 | 型 | 説明 |
|---|---|---|
| `company_id` | UUID FK→T02.id | 取込時に名寄せ／作成した法人 |
| `contact_id` | UUID FK→T04.id | 取込時に作成した連絡先 |

`promoted_company_id` / `promoted_contact_id` は「Deal 昇格で確定したもの」を指す既存カラムで、意味が違うため別に持つ。昇格時は `company_id` / `contact_id` の値をそのまま `promoted_*` へ引き継ぎ、作り直さない。

姓が取れない行（企業リスト由来など）は連絡先を作らない。会社名が無い行は法人も作らない。

### 16.6 取引先の作成タイミング

`contracts` の AFTER INSERT トリガー `ensure_account_on_contract()` が、取引先未作成のディールに取引先を作って紐付ける。

- 契約と同一トランザクションで完結する（「契約はあるが取引先が無い」状態を作らない）
- 取引先名は法人名を優先し、個人取引なら担当者名を使う
- 種別は法人紐付きなら「法人」、無ければ「個人事業主」
- ディールの相手担当者を `account_contacts` に `primary` で登録する
- 昇格元リードの `promoted_account_id` も更新する
- **SECURITY DEFINER。** 契約を登録する manager がディールの担当者とは限らず、`deals` の UPDATE ポリシー（owner / admin）では紐付けが 0 行更新で静かに失敗するため

### 16.6.1 ディールと契約の持ち方（2026-08-07 / T-0063、2026-08-08 / T-0065・T-0067）

**契約の正本は `contracts` の 1 か所。** ディールから見た契約は `contracts.deal_id` の
逆参照で引く。`deals` 側に契約の情報を持たない。

`deals.contract_name` は契約テーブルができる前の名残で、ディールの新規作成・編集
フォームが手入力させていた。同じ「契約書名」が 2 か所にあり、片方を直しても
片方が古いまま残る状態だったため、**2026-08-07 に画面と Zod スキーマから外した**
（`20260807000001` で列に非推奨の COMMENT を付与。列自体は落とさない）。

**`contracts.deal_id` は任意**（`20260808000001` で NOT NULL を外した）。
どのディールにも紐づかない契約を持てる。導線は次の 3 つ:

| 操作 | 入口 | 実装 |
|---|---|---|
| 新しく契約を登録する | ディール編集の「契約を新規作成」／ディール詳細の「契約を追加」 | `/contracts/new?deal_id=` |
| すでにある契約を紐づける | ディール編集の「既存の契約を紐づける」 | `linkContractToDeal()` |
| 紐づけを解除する | ディール編集の各行「紐づけ解除」／契約詳細のディール欄 | `unlinkContractFromDeal()` |

**紐づけ候補は「どのディールにも紐づいていない契約」だけ。** 2026-08-07 の実装は
`deal_id` が NOT NULL だったため、紐づけが必ず**他のディールから奪う付け替え**に
なっていた。利用者の指摘で 2026-08-08 に付け替えを廃止した。

- 候補の SQL は `.is("deal_id", null)`。**`.neq("deal_id", …)` は使えない**
  （`NULL <> 'x'` が UNKNOWN になり、欲しい未紐づけの行が丸ごと落ちる）
- 楽観ロック（契約の `updated_at`）は**必須**。候補一覧や編集画面を開いたまま
  放置している間に、他の人が同じ契約を触っている可能性がある
- 解除は `deal_id` も突き合わせる（古い画面から別のディールの紐づけを外さない）

**契約はディールの新規作成画面からは作れない。** ディールの ID が無いと
`/contracts/new?deal_id=` を組み立てられないため、案内だけ置いている。

取引先を作る `ensure_account_on_contract` は **`AFTER INSERT OR UPDATE OF deal_id`**
（`20260808000001` で UPDATE を追加）。後から紐づけても取引先が作られる。
**解除しても取引先は消さない**（契約があった事実は残り、他のディールや連絡先が
ぶら下がっている可能性がある）。

**リードのステージ要件は解除でも守る。** `check_contract_deletion_against_leads` は
`BEFORE UPDATE OF deleted_at` にしか張られておらず、契約を消さずに剥がすと
「ステージは取引先なのに契約が無い」状態を作れてしまった。
`check_contract_detach_against_leads` に置き換え、`deleted_at` と `deal_id` の
両方を監視する（判定対象は `OLD.deal_id`）。削除と解除で文言を分ける。

### 16.6.2 契約名の自動生成（2026-08-08 / T-0068）

契約名が任意入力で命名が揃わなかったため、保存のたびに組み立てるようにした。

```
契約締結日_契約書名_契約種別_金額_契約ID
例: 20260807_業務委託基本契約書_基本契約_1200000_CTR-000123
```

| 列 | 役割 |
|---|---|
| `contract_name` | **契約書名**（人が入れる文書名）。materialの 1 つ |
| `contract_display_name` | **契約名**（自動生成）。人は編集しない |
| `amount` | 契約金額。**`deals.amount` とは別**（1 ディールに複数の契約が下がる） |

- 日付は `YYYYMMDD`、金額は桁区切りなしの数字、部品内の `_` は `-` に置換
- **欠けた部品は落として連結する**（`__` を作らない）。契約コードは必ず入るので空にならない
- 一覧の 1 列目・詳細の見出し・横断検索・変更履歴の対象名はすべて自動生成の方を使う

**生成は DB トリガー**（`build_contract_display_name` が規則の正本、
`set_contract_display_name` が BEFORE INSERT OR UPDATE で適用）。理由:

1. `contract_code` は BEFORE INSERT トリガーでしか確定しない。TS 側でやると
   「INSERT → 返ってきたコードで再 UPDATE」の 2 段書き込みになり、
   途中で失敗すると中途半端な行が残る（§ 冒頭の規約が禁じている形）
2. 契約種別の名前が別テーブルにあり、TS 側だと**マスタ名を直したときに
   既存の契約名が追随できない**（`contract_types` の AFTER UPDATE で再生成している）
3. seed・SQL 直接操作・将来の一括取込でも同じ結果になる必要がある
4. 生成列（`GENERATED ALWAYS AS`）は同一行の IMMUTABLE 式しか使えず `contract_types` を引けない

**TS 側に同じ規則を二重実装しない**（`company-name.ts` と
`expand_corporate_abbreviations` で「片方だけ直す」事故を経験している）。
そのため保存前プレビューは無い。

**トリガー名の昇順に依存する。** BEFORE トリガーは名前順に走るため
`trg_contracts_generate_code`（g）→ `trg_contracts_set_display_name`（s）の順になる。
**この並びを崩すと INSERT 時の契約名から契約コードが落ちる。**

**変更履歴には残さない**（`log_entity_change` の `v_ignored` に追加）。
材料を 1 つ直すたびに「金額」と「契約名」の 2 行が並んで見えるため。
前例は `20260728000003`（スコア等の自動計算を除外）。

### 16.6.3 ディールとリードの紐づけ（2026-08-08 / T-0069・T-0070）

**紐づけの正本は `deals.lead_id`。** 1 リードにディール N 本が下がる
（2 回目・3 回目のディールも同じリードに紐づく）。

`leads.promoted_deal_id` は**「最初に紐づいたディール」の派生値**へ降格した。
トリガー `sync_lead_promoted_deal` が維持し、**アプリからは書かない**。
判定（ステージ要件・ディールの削除ガード・契約の紐づけ解除ガード）はすべて
`deals.lead_id` 経由へ移した。列を落とさなかったのは、撤去すると
DB オブジェクト 6 個・UI 3 箇所・E2E 4 本に一斉波及するため。

| 規則 | 置き場所 | 強制するもの |
|---|---|---|
| リードが要るか | `pipeline_types.requires_lead` | `check_deal_lead_requirement`（トリガー） |
| ディールを起こしてよい段階か | `lead_stages.is_deal_ready` | **`create_deal_with_lead`（RPC）だけ** |

**段階の検査をトリガーに置いてはいけない。** 昇格（リードを Sales へ上げる操作）は
「ディールを作ってからステージを上げる」順序で動く（逆にすると
`check_lead_stage_requirements` の「Sales にはディールが必要」と噛み合わない）。
つまり昇格の途中では、リードがまだ獲得や育成のままディールが作られる。
ここで段階を強制すると**昇格という正当な経路が壊れる**（実装中に踏んだ）。

**フラグ名に「TQL」「営業」を使わない。** パイプラインが増えても、
リードカテゴリの呼び名を変えても影響しないようにするため。
値は `apply_master_role_flags()` が設定する（`is_deal_ready` は
`is_qualification OR requires_deal` から導くので、新しい名指しを増やさない。
**Dead が自動で外れる**のも効く）。

**既存のディールは遡って埋めず、止めもしない**（grandfathering）。
全ディールに必須を効かせると既存の編集が全部止まる。検出は `v_deals_without_lead`。

入口は 2 つあり、役割が違う。

| 入口 | 役割 | 回数 |
|---|---|---|
| リード編集 → Sales/Opportunity | **昇格**。リードのテキストから事業者情報・連絡先・ディールをまとめて作る | 1 回だけ |
| `/deals/new` | **ディールを足す**。既にあるリードに 2 本目・3 本目 | 何回でも |

昇格は「リードの `company_name` などのテキストから実体を起こす」唯一の経路なので残す。

### 16.6.6 デマンドファネル（旧: リードカテゴリ）（2026-08-08 / T-0077）

「リードカテゴリ」を**デマンドファネル**へ改称した。利用者の意図は意味づけの明確化。

> 本来はセールスファネルとして TQL・SQL を、マーケティングファネルとして
> Inquiry・MQL を定義すべきだが、詳細化しすぎるため包括的なデマンドファネルとする。

**変えたのは表示ラベルだけ。** テーブル名（`lead_categories`）・`code`
（`inquiry` / `mql` / `tql` / `sql`）・関数名（`resolve_lead_category` /
`set_lead_category`）・ビュー（`v_leads_with_category`）・列名（`leads.category_id`）は
そのまま（CLAUDE.md「コードは変更しない、名前変更は可」）。

改称の影響が表示に閉じるのは、**ディールを作れる段階の判定を
`lead_stages.is_deal_ready` に寄せてある**ため（§16.6.3）。ファネルの
呼び名や `sort_order` に依存する判定はどこにも無い。

**人は設定できない。** `trg_leads_set_category` がステージと流入元から
毎回上書きする。にもかかわらず新規作成・編集画面に選択欄が残っており、
「選べるのに反映されない」状態だった。2026-08-08 に読み取り専用へ変えた
（新規作成は T-0072、編集は T-0077）。

### 16.6.5 パイプラインごとに画面を分ける（2026-08-08 / T-0073・T-0074）

利用者の判断「ディール（セールス）と仕入れ・業務委託は性質が異なる」。

| パイプライン | 画面 | パス |
|---|---|---|
| 営業（`sales`） | セールス | `/sales` |
| 仕入れ（`procurement`） | プロキュアメント | `/procurement` |
| 業務委託（`outsourcing`） | パートナーシップ | `/partnership` |

**対応は `pipeline_types.screen_key` で持つ**（`lead_categories.progress_view` と同じ形）。
slug は `20260805000019` で自動採番になり「引くな」とされているため使わない。
**slug は `outsourcing` のまま**で、画面名（パートナーシップ）とはずらしてある
（UI 表示名と内部名を分ける方針。slug を変えると `account_role_types` の
対応や過去のマイグレーションの前提が崩れる）。

**一覧だけを分け、ディールの詳細（`/deals/{id}`）は分けていない。** 分けると
契約・プロジェクト・リード・横断検索・活動履歴のリンク元が全部パイプラインを
知る必要が出る。詳細から一覧へ戻るときだけ `screen_key` で行き先を選ぶ
（`src/lib/deals/pipeline-screen.ts`）。`/deals` は `/sales` へ逃がす。

**仕入れ・業務委託はステージもステータスも 0 件だった**（seed にあるのは営業だけ）。
選ぶとカンバンが列ゼロになり、ステージ・ステータスが必須のディールは作れなかった。
`20260808000008` で 6 段階ずつ入れた。

- プロキュアメント: 候補 → 問い合わせ → 見積り → 交渉 → 発注 → 完了
- パートナーシップ: 候補 → 打診 → 条件調整 → 契約 → 稼働 → 完了

**同名のステージが既にあれば拾い上げる（UUID を決め打ちで INSERT しない）。**
本番の業務委託には管理画面で作られた「契約」（表示順 0・説明が空）と
ステータス「手続き」が 1 件ずつあった。決め打ちで入れると「契約」が二重になり、
かといって消すと紐づいたディールが行き場を失う。`ensure_pipeline_stages()` は
**パイプライン + 名前**で引き、見つかれば足りない項目だけ埋める。

- 表示順は **`0`（まだ並べていない）のときだけ**入れる。毎回上書きすると
  管理画面で並べ替えたものが次の `db push` で戻ってしまう
- **既にステータスが置かれているステージには足さない。** 運用者が自分で
  組んだ段階なので、こちらの案を上乗せしない（本番の「契約」は「手続き」だけが残る）
- ステータス側もステージを **UUID ではなく名前で引く**（拾い上げた行は UUID が違う）

**投入は `ensure_pipeline_stages()` に置き、`apply_master_role_flags()` から呼ぶ。**
`db reset` は「マイグレーション → seed」の順なので、マイグレーションの本文で
INSERT すると `pipeline_types` の行がまだ無く外部キー違反になる（T-0053 と同じ構造）。
役割フラグと同じ入口に繋げば、`db reset` でも本番でも当たる。
`apply_master_role_flags()` は入口だけになり、中身は `_core` と
`ensure_pipeline_stages` / `apply_pipeline_screen_keys` の 3 つに分かれている。

**新規作成でパイプラインは選ばせない**（2026-08-08 / T-0079）。
`/deals/new?pipeline=<screen_key>` で決まり、指定が無ければ
「ディール化の既定」（`pipeline_types.is_default`）を使う。3 つの画面それぞれから
作るので、作成画面で選び直せると**作った直後に別の画面へ消えたように見える**。

**リードが要るかもパイプラインが決める**（`pipeline_types.requires_lead`）。
セールスは必須、プロキュアメント・パートナーシップは不要（相手＝仕入れ先・
委託先が既にいるところから始まる）。判定は 3 か所すべてがこのフラグに従う。

| 層 | 見るもの |
|---|---|
| 画面（`deal-new-form.tsx`） | `requiresLead` が偽ならリードの欄を出さず、検査もしない |
| Zod（`createDealWithLeadSchema`） | `lead_mode: "none"` を受け付ける。画面が送ってきた形を受け止めるだけ |
| DB（`create_deal_with_lead`） | **強制はここ。** `pipeline_types.requires_lead` を引き、必須なのにリードが無ければ例外 |

画面と Zod は行き止まりを作らないための前倒しで、**正本は DB**。
画面を通さない経路（RPC の直呼び）も同じ規則で塞がる。

**ダッシュボードのファネルは 1 パイプラインだけを描く**（T-0075）。
以前は `deal_stages` をパイプライン無関係に全件並べており、仕入れ・業務委託の
ステージを入れた瞬間に「候補・完了」が 2 回ずつ出る壊れたファネルになった
（営業しかステージが無い間は偶然動いていただけ）。対象は `is_default` のパイプライン。

### 16.6.4 事業者情報とリードは 1 : N（2026-08-08 / T-0071・T-0072）

**DB 上はもともと 1 : N**（`leads.company_id` は素の FK で制約は無い）。
同じ会社から 2 件目のリードが来るのは普通で、そのとき事業者は 1 つに寄せる。

運用できていなかった理由が 3 つあり、すべて塞いだ。

1. **昇格が法人番号の重複で拒否していた**（`src/actions/leads.ts`）。
   「同一企業への昇格はできません」は 1 : N を否定する判定だった。
   しかも `lead.company_id` が埋まっていても見ずに弾いていた（SELECT にすら無かった）
2. **昇格だけが名寄せを通っていなかった。** 取込経路（名刺・問い合わせ・遡及）は
   `resolve_or_create_company()` で既存を再利用するのに、`promote_lead_to_deal` は
   無条件 INSERT していた。名寄せ経由に変え、名寄せが扱わない項目
   （カナ・代表者名・ステータス）は**空欄だけ COALESCE 補完**する
3. **画面から辿れなかった。** 事業者情報の詳細にリードのセクションが無く、
   `getLeads` に `company_id` フィルタも無く、手動作成のリードは
   事業者を選ぶ手段が UI にも Zod にも無かった

### 16.7 マイグレーション

| ファイル | 内容 |
|---|---|
| `20260731000001_add_status_colors.sql` | ステータス／ステージ 8 マスタに `color` + 既定色関数 |
| `20260731000002_create_company_domains.sql` | `company_domains` + ドメイン正規化・登録関数 |
| `20260731000003_lead_company_contact_resolution.sql` | 会社名正規化・`leads.company_id/contact_id`・名寄せ関数 |
| `20260731000004_import_eight_leads_with_contacts.sql` | 取込で法人・連絡先も作る |
| `20260731000005_backfill_lead_companies_contacts.sql` | 既存リードの遡及作成（3,812 件処理） |
| `20260731000006_deals_optional_account.sql` | `deals.account_id` 任意化・`company_id/contact_id` 追加・昇格関数から Account 作成を除去 |
| `20260731000007_create_account_on_contract.sql` | 契約時の取引先自動作成トリガー |
| `20260807000001_deprecate_deals_contract_name.sql` | `deals.contract_name` を非推奨に（§16.6.1） |
| `20260808000001_contracts_optional_deal.sql` | `contracts.deal_id` を任意化。取引先作成を `AFTER UPDATE OF deal_id` でも走らせ、紐づけ解除でもリードのステージ要件を守る（§16.6.1） |
| `20260808000002_contract_amount_and_display_name.sql` | `amount` / `contract_display_name` を追加。契約名の組み立てと、契約種別の改名への追随（§16.6.2） |
| `20260808000003_contract_display_name_change_log.sql` | 契約名を変更履歴の差分から除外し、対象名に優先。既存行のバックフィル（§16.6.2） |
| `20260808000004_deals_lead_link.sql` | `deals.lead_id`・`requires_lead`・`is_deal_ready`（§16.6.3） |
| `20260808000005_deals_lead_rules.sql` | リード必須の強制と、判定の `lead_id` 経由への移設（§16.6.3） |
| `20260808000006_promote_lead_resolve_company.sql` | 昇格を名寄せ経由にする（§16.6.4） |
| `20260808000007_create_deal_with_lead.sql` | ディールをリード起点で作る RPC（§16.6.3） |
| `20260808000008_pipeline_screens_and_stages.sql` | `screen_key` と、仕入れ・業務委託のステージ（§16.6.5） |

---

## 17. 取引先区分（2026-07-31）

### 17.1 軸の分離

既存の `account_types`（法人 / 個人事業主 / 官公庁・自治体）は**事業体の形態**を表す軸。
「顧客か仕入れ先か」は**取引上の役割**で軸が違うため、同じマスタに混ぜない。

混ぜた場合の問題:
- 「法人かつ顧客」が 1 レコードで表せない
- 契約時の種別自動判定（`slug = 'corporate' / 'sole_proprietor'`）が壊れる

1 社が顧客でも仕入れ先でもあることは実務で起きるため N:M で持つ。

| | account_types（種別） | account_role_types（区分） |
|---|---|---|
| 軸 | 事業体の形態 | 取引上の役割 |
| 値 | 法人 / 個人事業主 / 官公庁・自治体 | 顧客 / 販売パートナー / 技術パートナー / 仕入れ先 / 外注先 |
| 個数 | 1 つ（`accounts.account_type_id`） | 複数（`account_roles` 経由） |
| 表示 | 取引先名の直後にバッジ | 一覧の独立列・詳細の「区分」 |

### 17.2 M: account_role_types（取引先区分マスタ）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK |
|---|--------|--------|-----|----|----|----|----|----------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | |
| 2 | コード | `code` | VARCHAR(32) | | | UK | NN | | `^[a-z][a-z0-9_]{0,31}$` |
| 3 | 名前 | `name` | TEXT | | | | NN | | |
| 4 | 定義 | `definition` | TEXT | | | | | | |
| 5 | バッジ色 | `color` | TEXT | | | | | NULL | `^#[0-9A-Fa-f]{6}$` |
| 6 | 表示順 | `sort_order` | INTEGER | | | | NN | 0 | |
| 7 | 自動付与パイプライン | `pipeline_type_id` | UUID | | FK→M01.id | | | NULL | 部分 UNIQUE（1 パイプライン 1 区分） |
| 8-13 | 監査・論理削除カラム | | | | | | | | |

`pipeline_type_id` が NULL の区分は手動付与のみ。1 パイプラインに複数の区分を割り当てられないよう部分 UNIQUE インデックスを張る（複数あると契約時にどれを付けるかが呼び出し順で変わる）。

**初期値:**

| code | 名前 | 自動付与パイプライン | 色 |
|---|---|---|---|
| `customer` | 顧客 | 営業 | `#4D7A65` |
| `sales_partner` | 販売パートナー | （手動） | `#0F766E` |
| `tech_partner` | 技術パートナー | （手動） | `#0E7490` |
| `supplier` | 仕入れ先 | 仕入れ | `#B88A2E` |
| `subcontractor` | 外注先 | 業務委託 | `#C2703A` |

### 17.3 J: account_roles（取引先 × 区分）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト |
|---|--------|--------|-----|----|----|----|----|----------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() |
| 2 | 取引先ID | `account_id` | UUID | | FK→T03.id (CASCADE) | | NN | |
| 3 | 区分ID | `role_type_id` | UUID | | FK→account_role_types.id | | NN | |
| 4 | 契約による自動付与 | `assigned_by_contract` | BOOLEAN | | | | NN | FALSE |
| 5 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | now() |
| 6 | 作成者 | `created_by` | UUID | | FK→T01.id | | | |

**UK:** (account_id, role_type_id)
**RLS:** 親 `accounts` の可視性・編集権限を引き継ぐ

### 17.4 契約成立時の自動付与

`ensure_account_on_contract()`（§16.6）を拡張し、取引先を作る／作らないに関わらず
**契約したディールのパイプラインに対応する区分を必ず付与する**。

```
営業パイプラインで契約     → 顧客
仕入れパイプラインで契約   → 仕入れ先
業務委託パイプラインで契約 → 外注先
```

既に顧客として登録済みの相手と仕入れ契約を結べば「顧客 + 仕入れ先」になる。
手動で付けた区分と区別するため `assigned_by_contract` を立てる。

### 17.5 マイグレーション

| ファイル | 内容 |
|---|---|
| `20260731000008_create_account_roles.sql` | `account_role_types` / `account_roles` + 初期値 + トリガー拡張 |

---

## 18. 法人の実在確認（2026-07-31）

### 18.1 ステータスの意味づけを変更

`company_statuses` は アクティブ / 休眠 / 取引停止 / 見込み だった。これは取引状態の語彙で、
取引先区分（§17）やディールと役割が重なる。名刺取込で作られた 3,597 件が一律「見込み」になり
意味を持たなくなっていたため、**実在性ベース**に置き換えた。

| code | 名前 | 意味 | 色 |
|---|---|---|---|
| `unverified` | 未確認 | 実在確認をまだ行っていない | `#6B7280` |
| `verified` | 実在確認済 | 法人番号システム等で存在を確認できた | `#4D7A65` |
| `needs_review` | 要確認 | 商号・所在地の変更を検知した、または照合できなかった | `#B88A2E` |
| `closed` | 閉鎖・解散 | 登記が閉鎖されている | `#B03A2E` |

旧ステータスは論理削除し、既存法人は全件「未確認」へ移行した（実在性は誰も確認していないため）。
**取引しているかどうかは取引先（Account）側が持つ。**

`company_statuses.code` を追加し、プログラムから状態を引けるようにした（`account_statuses` にならう）。

### 18.2 確認の記録

`companies` に確認結果を持たせる。

| 物理名 | 型 | 説明 |
|---|---|---|
| `verified_at` | TIMESTAMPTZ | 最後に実在確認を行った日時 |
| `verified_by` | UUID FK→T01 | 確認者 |
| `verification_source` | TEXT | `houjin_bangou_api` / `manual` |
| `verification_note` | TEXT | 検知した差分や照合できなかった理由 |

未確認・古い確認から処理するため `companies (verified_at NULLS FIRST)` に索引を張る。

### 18.3 company_verification_logs（確認履歴）

`companies` のカラムは最新 1 回分しか持てない。「定期的に回す」運用では
いつ何件処理し何が変わったかを追える必要があるため履歴を別に持つ。**INSERT ONLY**。

| 物理名 | 型 | 説明 |
|---|---|---|
| `company_id` | UUID FK→T02 (CASCADE) | |
| `checked_at` | TIMESTAMPTZ | |
| `source` | TEXT | `houjin_bangou_api` / `manual` |
| `result` | TEXT | `verified` / `changed` / `not_found` / `closed` / `error` |
| `corporate_number` | VARCHAR(13) | 照合で引き当てた法人番号 |
| `detail` | JSONB | 差分内容・候補一覧・エラー理由 |
| `checked_by` | UUID FK→T01 | |

### 18.4 照合ロジック

国税庁 法人番号 Web-API（Ver.4）を CSV/Unicode（`type=02`）で叩く。
XML だとパーサ依存が増えるため、既存の CSV パーサ（`parseCsv`）を使える形式を選んだ。

| ファイル | 役割 |
|---|---|
| `src/lib/houjin-bangou/parse.ts` | CSV（30 列・ヘッダ無し）→ レコード。列位置は仕様で固定 |
| `src/lib/houjin-bangou/match.ts` | 正規化名で照合、台帳との差分検出 |
| `src/lib/houjin-bangou/client.ts` | API 呼び出し。アプリケーションID は `HOUJIN_BANGOU_APP_ID` |
| `src/actions/company-verification.ts` | 1 社照合・一括照合・API 設定状態の取得 |

**判定方針:**

- 法人番号を持っていれば番号（`/num`）で、無ければ商号（`/name`、前方一致）で引く
- **最新履歴（`isLatest`）のみを対象**にする。過去の商号で引っかかった行を拾うと、現在は別名の法人を一致と判定してしまう
- **正規化名の完全一致が 1 件のときだけ採用**する。複数該当・該当なしは「要確認」にして人に回す。自動で決め打つと誤った法人番号が台帳に入り、以降の確認がその法人を追い続ける
- 表記ゆれ（`(株)` と `株式会社` 等）は差分としない。台帳に住所が無い場合も差分としない（未入力であって変更ではない）
- 通信エラーはステータスを動かさない（法人の状態ではないため）

正規化規則は DB 関数 `normalize_company_name` と**同一**。片方だけ変えると取込時の名寄せと
API 照合の結果がずれるため、`match.test.ts` で規則を固定している。

**運用上の配慮:** 1 件ずつ 1 秒間隔で叩き、1 回の実行件数に上限（既定 20 / 最大 100）を設ける。
全件を一度に処理すると数時間かかり実行が途中で切れる。

### 18.5 未実装

- **定期実行**: 現在は Admin（事業者情報 → 実在確認）からの手動実行のみ。cron 化は後続
- アプリケーションID は未設定でもビルド・起動は通り、画面に未設定の案内が出る

### 18.6 マイグレーション

| ファイル | 内容 |
|---|---|
| `20260731000009_contact_status_semantics.sql` | 連絡先ステータスから「見込み」を除去（§M08 参照） |
| `20260731000010_company_existence_verification.sql` | 法人ステータスの実在性化・確認記録・履歴テーブル |
---

## 19. アクティビティ横断フィード（2026-07-31）

### 19.1 背景

活動の記録先はテーブルごとに分かれている。

| テーブル | 何の記録か | 時刻の持ち方 | 紐づく先 |
|---|---|---|---|
| `lead_activities` | 社内対応（架電・名刺交換など、こちらから動いた記録） | `called_on` + `called_at_time`（分割） | lead |
| `lead_customer_activities` | 顧客行動（イベント参加・資料DL など、相手が動いた記録） | `occurred_at` | lead |
| `email_messages` × `email_message_contacts` | メールのやり取り（Gmail 同期） | `sent_at` | contact |

「いつ・誰と・何があったか」を時系列で追うには 3 テーブルを突き合わせる必要があり、
画面ごとに書くと条件がずれる。読み取り専用のビューに集約した。

### 19.2 `activity_feed`（ビュー）

`security_invoker = true` で作る。**これを付けないとビュー所有者の権限で読まれ、
member が他人のリードの対応履歴まで見えてしまう。** 付けることで元テーブルの RLS が
そのまま効く（`is_lead_accessible` / 連絡先の owner 判定）。

| 列 | 内容 |
|---|---|
| `source_kind` | `lead_activity` / `lead_customer_activity` / `email` |
| `id` | 記録元テーブルの行 ID。テーブルをまたぐと衝突しうるので、キーは `source_kind` と組で扱う |
| `occurred_at` | `timestamptz` に統一。`lead_activities` は JST として組み立ててから変換 |
| `has_time` | 時刻を持つか。`false` の行で `0:00` を表示しないための区別 |
| `activity_name` / `activity_color` | 種別バッジ。色はマスタの `color` |
| `outcome_name` / `outcome_color` | 架電結果など。種別と同じ文字列になる場合は `NULL`（「名刺交換／名刺交換」の重複を避ける） |
| `detail` | 備考。メールは件名 |
| `actor_name` | 社内の実行者。顧客行動と受信メールは `NULL`（社内の行動ではないため） |
| `entity_type` / `entity_id` / `entity_label` | 相手先。`lead` または `contact` |
| `owner_user_id` | 担当者フィルタ用 |

1 通のメールが同じ連絡先に From と Cc の両方で紐づくことがあるため、
`email_message_contacts` の代表 1 行に絞ってから UNION している。

**未収録:** `deal_activities` と `activity_logs` は書き込む画面がまだ無く常に空になるため
入れていない。使い始めるときに UNION ALL を足す。

### 19.3 `lead_customer_activity_types.color`

バッジ色はマスタの `color` を正本にする規約に対し、このマスタだけ列が欠けていたため追加。
既定色は顧客の意思表示の強さで割り当てる（問合せ = 進行・提案、参加/DL = 接触・育成、
閲覧/開封 = 開始・新規）。

### 19.4 マイグレーション

| ファイル | 内容 |
|---|---|
| `20260731000014_create_activity_feed.sql` | `activity_feed` ビュー・`lead_customer_activity_types.color` |

---

## 20. Gmail 連携（2026-07-31）

### 20.1 目的

連絡先とのメール送受信を CRM 側で時系列に追えるようにする。
名刺交換をしていない相手とのやり取りも拾い、連絡先として登録できるようにする。

### 20.2 方針

**本文と添付は保存しない。** 件名・相手・日時だけを持ち、中身を見るときは Gmail へ遷移する。
OAuth スコープも `gmail.metadata` だけを要求し、本文を取得できる権限自体を持たない。
契約書や個人情報を CRM に複製しないため。

**未登録アドレスは候補として溜め、担当者が承認したら連絡先にする。**
自動作成にすると配信メールやメーリングリストで連絡先が汚れる。

### 20.3 テーブル

| 物理名 | 内容 |
|---|---|
| `gmail_connections` | 連携アカウント。1 ユーザーが複数繋げる。リフレッシュトークンは pgcrypto で暗号化（鍵は DB に置かず `GMAIL_TOKEN_ENCRYPTION_KEY`） |
| `email_messages` | 同期したメールのメタデータ。`(connection_id, gmail_message_id)` が一意で再同期しても重複しない |
| `email_message_contacts` | メール × 連絡先の N:M。1 通に複数の連絡先が絡むため |
| `email_contact_candidates` | 連絡先に紐づかなかったアドレス。承認すると連絡先を作り、過去のメールを遡って紐づける |

書き込みは DB 関数に集約する（`record_email_message` / `approve_email_contact_candidate`）。
1 通ごとに複数テーブルへ書くため、途中で切れて中途半端に残らないようにする。

`approve_email_contact_candidate` は画面（authenticated）から呼ぶが
`email_message_contacts` に authenticated 向けの INSERT ポリシーが無いため
`SECURITY DEFINER` にしてある。RLS の代わりに関数内で manager 以上を確認する。

### 20.4 OAuth の前提（2026-07-31 決定）

**連携できるのは Google Workspace のアカウントのみとする。** OAuth 同意画面は「内部」で構成する。

個人 Gmail（`@gmail.com`）を繋ごうとすると同意画面が「外部」になり、次のいずれかになる。

- **テスト状態のまま**: 外部アプリのリフレッシュトークンが 7 日で失効する。週次で全員が再連携になり実運用に耐えない
- **本番公開**: `gmail.metadata` は制限付きスコープのため CASA セキュリティ監査（Google 認定ラボ・年次更新）が必要

個人アドレス宛のやり取りを取り込みたい場合は、Gmail 側の転送または
「他のアカウントのメールを確認」で Workspace の受信箱に集約する。
送信も Workspace から「他のメールアドレスとして送信」で行えば SENT に残るため、
CRM 側の実装は変わらない。

### 20.5 過去メールの扱い

**同期は連携以降のやり取りを対象とする。** 過去分は別途データ化してインポートする運用。

`gmail.metadata` スコープでは `users.messages.list` の `q`（検索クエリ）が使えず、
期間を指定して遡ることが API 側でできない。ラベル（INBOX / SENT）での絞り込みのみ可能。
新しい順にページングして遡ることは可能だが、初回に大量取得する設計は取らない。

### 20.6 マイグレーション

| ファイル | 内容 |
|---|---|
| `20260731000011_create_gmail_sync.sql` | 4 テーブルと RLS |
| `20260731000012_email_contact_resolution.sql` | `find_contact_by_email` / `record_email_message` / `approve_email_contact_candidate` |
| `20260731000013_fix_email_function_privileges.sql` | 承認関数を `SECURITY DEFINER` 化、`record_email_message` を service_role 限定に |

### 20.7 実装

| ファイル | 役割 |
|---|---|
| `src/lib/gmail/config.ts` | 環境変数の読み取り。未設定でも起動は通し、画面に案内を出すだけにする |
| `src/lib/app-origin.ts` | 外部へ渡す URL のオリジン解決（`APP_ORIGIN`）。Gmail 固有ではないため lib 直下 |
| `src/lib/gmail/crypto.ts` | リフレッシュトークンの暗号化（AES-256-GCM）。**アプリ側で暗号化し DB には鍵を渡さない** |
| `src/lib/gmail/client.ts` | OAuth とGmail API の薄いラッパ。`googleapis` は入れない（使うのは数エンドポイントのみ） |
| `src/lib/gmail/address.ts` | ヘッダの解析と記録対象の選別 |
| `src/lib/gmail/sync.ts` | 取り込み本体。書き込みは service_role で `record_email_message` を呼ぶ |
| `src/app/api/gmail/auth`・`callback` | 認可の開始と受領。`state` を Cookie で照合して CSRF を防ぐ |
| `src/components/profile/GmailConnectionsSection.tsx` | 連携・同期・解除の UI |

**コールバック URL は `APP_ORIGIN` から組む。**
リバースプロキシ（Cloudflare Tunnel）の内側では、リクエストから公開 URL を復元できない。
standalone の Next は Host ヘッダを信用せず、サーバーの `HOSTNAME`（Docker では `0.0.0.0`）で
絶対 URL を組むためで、当初の「リクエストの origin から組む」実装では
`https://0.0.0.0/api/gmail/callback` を Google へ送っていた（IP アドレスのリダイレクト先は
OAuth のポリシーで禁止されており `invalid_request` になる。`docs/deployment-nas.md § 9`）。

解決は `src/lib/app-origin.ts` に集約する。`APP_ORIGIN` が未設定なら
リクエスト由来の値で代替するため、開発機（`http://localhost:2000`）は設定不要。
Google Cloud 側には開発・本番の両方の URI を登録しておくこと。

**外部へ渡す URL と、画面へ戻すリダイレクトの両方が対象。** Route Handler の
`NextResponse.redirect` は middleware と違い絶対 URL をそのまま `Location` に入れるため、
戻り先も同じ基準で組まないと `https://0.0.0.0:3000/profile` へ飛ばすことになる。

**認可時にスコープを検証する。** 要求は `gmail.metadata` のみで、これより広い
Gmail スコープが付いていたら連携を中止する。本文を読める権限が紛れ込むと設計の前提が崩れる。

取り込み範囲は次のとおり。

- 初回（`last_synced_at` が空）: 直近 50 通。動作確認と直近の文脈を拾うため。過去分の一括取り込みはしない
- 通常: `history.list` の差分
- `historyId` 失効時（404）: 直近 50 通へフォールバック
- 1 回あたり最大 200 通。長時間のリクエストにしないため

### 20.8 定期同期

`POST /api/gmail/sync` を NAS のタスクスケジューラから 15 分ごとに叩く
（手順は `docs/deployment-nas.md § 8.0`）。

- 認証は `GMAIL_SYNC_CRON_SECRET` の Bearer トークン。Cookie 認証はマシンからの実行に使えないため
- **未設定ならエンドポイント自体が 503 で無効。** 開発機では設定せず、手動の「同期」ボタンを使う
- middleware の認証対象から外してある。Cookie を持たないリクエストが `/login` へ飛ばないようにするため
- アプリのコンテナはポートを公開していないので、`docker exec` でコンテナの中から叩く
- 実行中フラグで多重実行を防ぐ。走行中に来たら 409 を返して次の実行に任せる
  （コンテナが 1 つである前提。増やすときは DB のロックに移すこと）
- 1 つの連携が失敗しても他は続行する。理由は `last_error` に残り、プロフィール画面に表示される

### 20.9 未実装

- 過去メールのインポート経路（データ化した外部ファイルの取り込み）

---

## 21. 名刺と連絡先の同一性（2026-08-01）

名刺は「その人の、ある所属における連絡手段」。設計の背景と判断の経緯は
`docs/contact-identity.md` が正本。

### 21.1 日付を所属の根拠にしない

Eight の CSV にある「名刺交換日」は、**利用者が Eight にデータを登録した日**であり、
名刺を受け取った日でも在籍期間でもない。過去の名刺を後からまとめて登録すると
登録日が最新になるため、これを時系列の根拠にすると前職で現職を上書きしてしまう。

そのため所属の順序は日付で決めず、**所属は名刺ごとの情報として持ち、
どれが現在の所属かは人が決める**。

### 21.2 D11 `business_cards`

| カラム | 型 | 説明 |
|---|---|---|
| `contact_id` | UUID NOT NULL | → `contacts` ON DELETE CASCADE |
| `contact_email_id` / `contact_phone_id` | UUID | → `contact_emails` / `contact_phones`。**この名刺の連絡手段** |
| `company_id` / `company_name_raw` | | 名刺に書かれていた所属先 |
| `department` / `job_title` | TEXT | |
| `address_id` | UUID | → `addresses` |
| `source` / `source_external_key` | TEXT | 取込元と一意キー（再取込で増やさない） |
| `source_registered_on` | DATE | **取込元に登録した日。在籍期間ではない**（名前で誤用を防ぐ） |
| `is_primary` | BOOLEAN | 現在の所属として採用している名刺。`contact_id` ごとに 1 枚 |

メールアドレスは会社ドメインを含むため所属の裏付けになる。名刺をメール・電話の行に
紐づけることで、日付に頼らず「どの所属のときの連絡手段か」を保持できる。

### 21.3 人物の同定

| 段 | 条件 | 根拠 |
|---|---|---|
| P1 | `contact_emails` にメールが完全一致 | 最も確実 |
| P2 | **携帯番号**が一致 + 姓が一致 | 転職しても携帯は変わらない |
| P3 | 会社 × 姓 × 名 が一致 | 従来の判定 |
| P4 | 姓名のみ一致 | 別人として作り、`contact_merge_candidates` に記録 |

P2 は `is_mobile_phone()`（`070`/`080`/`090` + 8 桁）で携帯に限る。代表電話では
同じ会社の全員が一致してしまうため。照合は数字だけに正規化する（式インデックスあり）。

種別判定は `phone_line_type()` に集約。**市内局番の先頭は 2〜9** と決まっているため、
3 桁目が 0 なら非固定（`0X0` = 020/050/060/070/080/090）と確実に判別できる。
ただし **050（IP 電話）は同定キーに使わない**。会社の代表番号として社内で共有されうるため。
`contact_phones.label` の既定値は `default_phone_label()` が決める。

### 21.4 所属の切り替え

`contacts.company_id` / `department` / `job_title` は**人が決めた現在の所属**。

- **取込（`record_business_card`）は書き換えない。** 名刺として別に残すだけ
- 書き換えるのは `apply_business_card_as_current()` のみで、画面の
  「現在の所属にする」からしか呼ばれない

例外は「現在の所属がその名刺と同じ会社のとき」で、採用済みの印だけ付ける
（値が同じなので上書きにはならない）。

### 21.4.1 紹介者（20260802000012）

誰の紹介で会えたのかを名刺に持つ。

| 列 | 用途 |
|---|---|
| `referrer_contact_id` | 紹介者の連絡先（FK、`ON DELETE SET NULL`） |
| `referral_memo` | 紹介の経緯。自由記入 |

**連絡先ごとではなく名刺ごとに持つ。** 同じ人でも、転職後に別の人から改めて
紹介されることがある。連絡先に 1 つだけ持たせると、どの出会いの紹介者なのかが
分からなくなる。

紹介者は連絡先から選ぶが、**連絡先として登録されていない相手**（社外の人づて・
イベント経由）もいるので自由記入も併せて持つ。片方だけでも記録できる。

- 自分自身は紹介者にできない（`chk_business_cards_referrer_not_self`）
- 画面は連絡先詳細の名刺セクション（`BusinessCardReferral`）。連絡先は
  3,000 件近くあり一覧から選べないので、2 文字以上の入力で絞り込む

### 21.5 統合候補と統合（D12）

姓名しか一致しない組は自動統合せず `contact_merge_candidates` に記録する。

| 関数 | 役割 |
|---|---|
| `contact_merge_candidate_pairs(UUID)` | 候補になる組を返す。判定条件の正本。`NULL` で全件 |
| `detect_contact_merge_candidates(UUID)` | 1 件分の検出。名刺取込の中から呼ばれる |
| `detect_all_contact_merge_candidates()` | 全件の棚卸し。**manager 以上**。新規件数を返す |
| `merge_contacts_preview(UUID, UUID)` | 付け替え件数の下見 |
| `merge_contacts(UUID, UUID)` | 統合の実行。**manager 以上**。取り消せない |

検出条件は姓名一致・会社違いで、カナが両方あって食い違う組は除外する。
**検出は取込の中でしか走らない**ため、取込を通っていない連絡先どうしの重複は
`/contacts/merge-candidates` の「候補を洗い直す」（全件版）でしか挙がらない。
この全件版は 2026-08-09 にジョブ方式へ変更した（`admin_bulk_jobs` /
`job_type = 'contact_merge_detection'`。§27）。全連絡先の総当たりは件数に比例して
伸びるため、HTTP リクエストの中では実行しない。

統合は 18 の外部キーに跨るため単一トランザクションで行う。一意制約があるものは
重複しない行だけを移す。名刺・住所はすべて移し、**主の印は残す側を優先する**
（統合で所属が勝手に変わらないようにするため）。メール・電話も同じ扱いだが、
主だった行を重複として捨てた場合に主が空にならないよう、統合の最後に補う
（繰り上げトリガーは吸収した側しか見ないため）。タレント情報は 1:1 のため
両方にある場合は例外で止める。吸収した側は `deleted_at` + `merged_into_contact_id`。

統合で吸収した連絡先は `purge_soft_deleted_records()` の対象外にしている。
90 日で物理削除すると統合先を辿れなくなるため。

### 21.6 マイグレーション

| ファイル | 内容 |
|---|---|
| `20260801000001_create_business_cards.sql` | テーブル・RLS・`apply_business_card_as_current` |
| `20260801000002_business_card_resolution.sql` | `is_mobile_phone` / `resolve_or_create_contact` 改訂 / `record_business_card` |
| `20260801000003_backfill_business_cards.sql` | 既存リード・連絡先から名刺 756 枚を復元。活動記録の文言も実態に合わせて修正 |
| `20260801000004_create_contact_merge_candidates.sql` | 統合候補と検出関数 |
| `20260801000005_merge_contacts.sql` | 統合の下見と実行 |
| `20260801000006_import_eight_business_cards.sql` | 取込で名刺を記録し、統合候補を検出 |
| `20260802000001_fix_contact_functions_after_address_move.sql` | 住所の共通マスタ化で取り残された参照を修正（`merge_contacts` / `purge_soft_deleted_records`）。統合に住所の引き継ぎと主フラグの調整を追加 |
| `20260802000002_detect_all_contact_merge_candidates.sql` | 判定条件を `contact_merge_candidate_pairs` に切り出し、全件検出の入口を追加 |

### 21.7 連絡手段の増減

1 人の連絡先に複数のメール・電話が紐づくのは通常の状態で、増減も日常的に起きる。
そのたびに連絡先を作り直さずに済むよう、**編集ページから行単位で足し引きできる**
（`src/components/contacts/ContactChannelsEditor.tsx`）。連絡先本体の保存とは
独立して即時反映する。

主連絡先（`is_primary`）は DB 側で保証する。

| 仕組み | 内容 |
|---|---|
| 部分 UNIQUE インデックス | `contact_id` ごとに `is_primary` は 1 件 |
| `set_primary_contact_email` / `_phone` | 「落としてから立てる」順序を単一トランザクションで行う |
| AFTER DELETE トリガー | 主を消したら残りの最古を主に繰り上げる（主が空にならない） |

**削除前に、その連絡手段を使っている名刺の枚数を見せる。** `business_cards` の
FK は `ON DELETE SET NULL` なので名刺自体は残るが、連絡手段との紐付けは外れる。

### 21.8 ドライランで判定しないこと

法人の名寄せ（`resolve_or_create_company`）は法人を**作る**処理でもあるため、
ドライランでは走らせられない。所属の変化はドライランでは出さず、
姓名の一致だけを事前に知らせる（`docs/contact-identity.md § 8`）。

---

## 22. 住所とインボイスの整理（2026-08-01）

### 22.1 住所を共通マスタにする

住所は `contacts` / `companies` に 5 カラムずつ重複して持ち、追加住所は
`other_addresses` が別に持ち、`leads` / `business_cards` だけが `addresses` を
参照していた。同じ概念が 3 か所に散っていたため一本化した。

```
addresses (住所そのもの)
   ▲
   │ address_id
entity_addresses (誰のどの住所か)
   ├─ contact_id → contacts
   ├─ company_id → companies
   └─ account_id → accounts        ← いずれか 1 つ（CHECK 制約）
```

| カラム | 説明 |
|---|---|
| `label` | `main` / `branch` / `billing` / `shipping` / `home` / `other` |
| `is_primary` | 主住所。相手ごとに 1 件（部分 UNIQUE インデックス） |
| `phone` / `fax` | **その拠点の**連絡先。本社と支店で電話が違うため住所側に持つ |

| 仕組み | 内容 |
|---|---|
| `add_entity_address()` | 住所本体と紐付けを 1 トランザクションで作る。1 件目は自動で主住所 |
| `set_primary_entity_address()` | 「落としてから立てる」順序を単一トランザクションで |
| AFTER DELETE トリガー | 主住所を消したら残りの最古を繰り上げる |
| AFTER DELETE トリガー | どこからも参照されなくなった `addresses` を片付ける（`leads` / `business_cards` も確認する） |

RLS は紐づく相手の `owner_user_id` に従う（`is_entity_address_accessible()`）。

**廃止したもの:** `contacts` / `companies` の住所 5 カラム、`other_addresses` テーブル。
いずれも実データ 0 件だったため値の移送は不要だった。

### 22.2 インボイス登録番号の置き場所

**登録番号は適格請求書発行事業者に付く番号であり、個人の属性でも契約の属性でもない。**

| テーブル | 状態 |
|---|---|
| `companies` | **正本**。事業者の登録番号 |
| `accounts` | **廃止**（20260802000005）。紐づく事業者情報のものを読み取りで見せる |
| `contacts` | **廃止**（20260801000010、実データ 0 件） |

登録の有無は番号の有無から導出する（チェックボックスは持たない）。

2026-08-01 時点では `accounts` を「取引の主体」と見て新設したが、
契約が成立する前は取引先が存在せず番号を持てない。番号は事業者に付くものなので
`companies` を正本に改めた（実データ 0 件のうちに整理）。

### 22.2.1 個人事業主の扱い（2026-08-02）

**個人事業主も屋号で `companies` に登録する。** 法人格（`corporate_types`）の
「個人事業主」で法人と区別し、器は分けない。

```
連絡先（人） → 事業者情報（法人 / 個人事業主・登録番号を持つ） → 契約成立 → 取引先
```

別テーブルに切り出さない理由:

- **名刺・CSV に事業形態が書かれていない。** 取込の時点でどちらか決められず、
  誤って入れると後からテーブル間の移動（参照の全付け替え）になる
- ドメインと正規化名による名寄せ（`resolve_or_create_company`）が二重になる
- `contacts` / `deals` / `leads` / `business_cards` の紐付けが二系統になる

法人格が「個人事業主」のときの扱い:

| 箇所 | 挙動 |
|---|---|
| 法人番号の入力欄・詳細表示 | 出さない（個人事業主は法人番号を持たない） |
| `verifyCompany` | 「対象外」を返して照合しない。商号検索で同名の法人に当たるため |
| `verifyCompaniesBatch` | 対象から除外する。残すと毎回「該当なし」で枠を食い潰す |
| 実在確認の表示 | 「対象外（個人事業主）」 |

法人格が未設定の会社は法人かもしれないので、一括照合の対象に残す。

### 22.2.3 事業者名・会社名・屋号名（2026-08-04）

呼び方が「会社名」「屋号」で揺れていたため、3 つに分けて持つ。

| 列 | 呼び名 | 中身 |
|---|---|---|
| `name` | **事業者名** | **表示・検索・名寄せの正本**（必須）。法人は会社名、個人事業主は屋号か個人名 |
| `corporate_name` | 会社名 | 法人のとき。事業者名と同じ値になるのが普通 |
| `trade_name` | 屋号名 | 個人事業主のとき。屋号を持たない事業主では空 |

**名寄せ・検索は `name` のまま。** `resolve_or_create_company` も検索も
事業者名を見る。会社名・屋号名は補助で、ここを判定に使わない。

画面では事業種別で出し分ける（法人 → 会社名、個人事業主 → 屋号名）。

**「法人格」は「事業種別」と呼ぶ。** 個人事業主も含む区分なので、
法人だけを指す言葉にしない。内部名（`corporate_types` / `corporate_type_id`）は変えない。

**代表者は個人事業主でも選べる。** 事業主本人を連絡先として紐づけたいため。
ラベルは「事業主」にする。候補は法人なら「法人代表」の連絡先だけだが、
**個人事業主は本人が「個人」種別で登録されることがある**ので絞らない。

### 22.2.2 個人事業主に出さないもの（2026-08-04）

法人格が「個人事業主」のとき、次は画面に出さない。判定は
`src/lib/company-type.ts` に集約する（`corporate_types` は code を持たず
名称の一致で見るしかないため、比較を散らさない）。

| 項目 | 理由 |
|---|---|
| 法人番号 | 個人事業主は持たない |
| 代表者・担当者 | 本人しかいないので別に持つ意味がない |
| 法人格（詳細画面） | 「個人事業主」と出しても情報が増えない |
| 登記事項証明書 URL | 登記されないので存在しない |
| 会社名の欄 | 代わりに**屋号名**を出す（§22.2.3） |

**フォームの法人格の選択欄は隠さない。** そこで個人事業主を選ぶため。

### 22.2.4 個人事業主の作成時に本人の連絡先を同時に作る（2026-08-09、T-0087）

**経緯。** 本番の `CMP-003597`（個人事業主）で、事業主欄も連絡先一覧も空のまま
運用されていた（T-0086）。調べると削除事故ではなく、**手入力での事業者作成が
連絡先を一切作らない設計**が原因だった。新規作成フォームには
「代表者の連絡先への紐づけは作成後に詳細画面から行う（作成時点ではその会社の
連絡先がまだ無いため）」というコメントがあり、**作られていない連絡先を後から
選ばせる導線**になっていた。個人事業主は定義上本人が必ず存在するため、
作成と同時に本人の連絡先を作る。

**DB 関数 `create_company_with_contact(p_company JSONB, p_contact JSONB)`。**
戻り値は `{ "company_id": UUID, "contact_id": UUID | null }`。

| 手順 | 内容 |
|---|---|
| 1 | `auth.uid()` が NULL なら例外（SECURITY INVOKER なので RLS はそのまま効く） |
| 2 | `companies` を INSERT（`company_code` はトリガー採番、担当者は指定が無ければ実行者） |
| 3 | `p_contact` が NULL ならここで終了（会社だけを作る） |
| 4 | `contact_status_id` の指定が無ければ `contact_statuses.is_new_default` を引く。**無ければ例外**（`resolve_or_create_contact` と同じ思想。非決定的な別ステータスへフォールバックしない） |
| 5 | `create_contact_with_details` を入れ子で呼ぶ（連絡先の書き込み規則を 1 箇所に保つ） |
| 6 | `companies.representative_contact_id` / `primary_contact_id` を UPDATE。**影響行数が 0 なら例外**（下記） |

**手順 6 の行数検査が要点。** `companies` の UPDATE ポリシーは
`is_admin() OR owner_user_id = auth.uid()` なので、member が担当者を他人にして
作ると **UPDATE が黙って 0 行**になり、「連絡先はあるのに事業主が空」という
T-0086 と同じ形が再発する。`GET DIAGNOSTICS ROW_COUNT` で検出して例外にし、
単一トランザクションなので会社ごと巻き戻す。

**同時作成は既定オン + チェックボックスで外せる。** 必須にはしない。
氏名が分からない場面で仮名を入れて通す運用に化けるため。外したものは
下記の整合性検査で拾う。

**法人（`corporate_rep`）への拡張は `p_contact.contact_type` の差し替えで届く。**
今回のスコープは個人事業主のみで、Server Action は `individual` を渡している。

**整合性検査 Q15「連絡先ゼロの個人事業主」**（`docs/test-cases/02-integration-db.md` §6）。
判定は `corporate_types.is_sole_proprietor` フラグで行い、名称では判定しない。
生きている個人事業主のうち `contacts.company_id` を持つ生きた連絡先が 1 件も無いものを出す。

### 22.3 画面での扱い

| 画面 | 位置 |
|---|---|
| 連絡先詳細 | 住所は**基本情報**の中（連絡先セクションは連絡手段だけを扱う）。プロファイル（生年月日・血液型・星座・ポテンシャル）は**右カラム** |
| 連絡先・事業者情報の編集 | `AddressesEditor` で行単位に追加・削除・主住所の切り替え。本体の保存とは独立して即時反映 |
| 新規作成 | 住所は登録しない（紐付けに相手の ID が要るため、作成後に編集画面から登録する旨を表示） |

## 23. freee 会計連携（2026-08-04）

### 23.1 目的

freee 会計に既にある取引先（Partner）を CRM へ取り込み、事業者情報・取引先と
突き合わせられるようにする。会計側にしかいない相手を CRM に取り込む導線と、
同じ相手が両システムで別に管理されている状態の解消が目的。

### 23.2 方針（決定事項）

**freee 側には一切書かない。** 読み取り専用の同期にする。会計は確定した数字を扱う
システムであり、CRM 側の編集が伝播すると仕訳の前提が崩れる。

**自動紐付けは「番号の一致」だけ。** 名称・メールドメイン・電話の一致は
「候補」として画面に出し、admin が確定する。会社名の一致は雑居ビルの別会社や
グループ会社で普通に起きるため、自動で結ぶには弱い。

見る順序は **取引先コード → インボイス登録番号 → 法人番号**（2026-08-05 に
取引先コードを追加）。インボイス番号と法人番号は「同じ番号なら同じ会社のはず」という
**推定**だが、取引先コード（`companies.company_code`）は **CRM 自身が採番した値**
なので推定が要らない。ただし freee の画面で人が自由に入れられる欄でもあるため、
**該当する事業者が無いコードは無視して次のキーへ回す**。

**既に別の取引先が紐付いている事業者には繋がない。** `freee_partners.company_id` に
UNIQUE 制約が無く、放っておくと 1 つの事業者に複数の取引先がぶら下がる。そうなると
差分画面が同じ相手を何度も出し、どちらへ書いたのか追えなくなる。

**取引先（Account）は自動作成しない。** Account は契約成立時の
`ensure_account_on_contract` トリガーでのみ作られる原則（§16）を崩さない。
freee にあって CRM に無い相手への操作は次の 3 択で、いずれも Account を生まない。

| 操作 | 結果 |
|---|---|
| 既存の事業者情報へ紐付ける | `link_status = 'confirmed'`、`company_id` を張る |
| 事業者情報として登録する | `companies` を新規作成して紐付ける（`accounts` は作らない） |
| 対象外にする | `link_status = 'excluded'`。以後の突合対象から外れる |

**インボイス番号が食い違う場合は CRM が正本。** 自動紐付けせず、画面に警告を出して
人が判断する。会計側の入力ミスで CRM のマスタを上書きしないため。

### 23.3 テーブル

| 物理名 | 内容 |
|---|---|
| `freee_connections` | freee との接続。**組織レベル**（Gmail と違い個人ごとではない）。事業所 ID ごとに 1 行で、切断は `is_active = FALSE`。行は消さない |
| `freee_partners` | 取引先のミラー + CRM への紐付け。冪等キーは `(freee_company_id, freee_partner_id)` |

`freee_partners` は **freee 側の写し**（ミラー列）と **CRM 側の判断**（`link_status` /
`company_id` / `account_id` / `linked_by`）を分けて持つ。同期はミラー列だけを上書きし、
判断列には触れない。会計側の変更で人の判断が消えないようにするため。

| 列 | 意味 |
|---|---|
| `corporate_number` | 生成列。**`org_code = 1`（法人）のときだけ**インボイス番号の `T` を除いた 13 桁。個人事業主の T 番号は独自採番であり法人番号ではない |
| `available` | freee 側の使用停止フラグ。突合画面では既定で隠す |
| `freee_deleted_at` | **全件同期でのみ**検出する「freee 側から消えていた」印。差分同期では検出できない |
| `link_status` | `unlinked` / `auto`（インボイス一致） / `confirmed`（人が確定） / `excluded`（対象外） |

RLS は 4 状態とも **admin のみ**（SELECT / UPDATE）。会計との突合は admin の業務で、
member / manager には見せない。同期は service_role が RLS をバイパスして行う。

### 23.4 DB 関数

| 関数 | 呼び出し元 | 内容 |
|---|---|---|
| `upsert_freee_partners(company_id, rows, full)` | 同期（service_role 限定） | ミラーの一括 upsert + 自動紐付け + 全件時の削除検出。`statement_timeout = 120s` |
| `detect_freee_partner_candidates(partner_id)` | 画面（authenticated） | 候補の検出。**保存せず都度計算する**（freee 側・CRM 側どちらの変化でも陳腐化するため）。**1 社 1 行**で最も強い理由（名称 > ドメイン > 電話）を返す |
| `confirm_freee_partner_link(...)` | 画面（authenticated） | 紐付けの確定 |
| `register_freee_partner_company(...)` | 画面（authenticated） | 事業者情報の新規作成 + 紐付け |
| `list_companies_without_freee_partner(search, limit, offset)` | 画面（authenticated） | freee と紐付いていない事業者情報。登録対象の一覧（§26.13） |
| `detect_freee_candidates_for_company(company_id)` | 画面（authenticated） | 逆向きの候補検出。**1 件 1 行**で最も強い理由（インボイス > 名称 > 電話）を返す |
| `get_company_freee_source(company_id)` | 画面（authenticated） | 新規登録で送る値一式。**差分検出と同じ集約にする** |
| `link_created_freee_partner(...)` | 登録（service_role 限定） | POST 成功後にミラー登録 → 確定紐付け → ログを 1 トランザクションで行う |

確定系の 2 関数は `SECURITY DEFINER` なので RLS に頼れない。関数内で
`IF NOT COALESCE(is_admin(), FALSE)` を確認する。**`COALESCE` を外さないこと。**
`is_admin()` は `crm_users` に行の無い認証ユーザーに対して NULL を返し、
`NOT NULL` は偽になるため、素の `IF NOT is_admin()` ではチェックをすり抜ける
（2026-08-04 の検証で検出）。

`register_freee_partner_company` は **`resolve_or_create_company` を使わない。**
あの関数は名称一致で既存へ寄せるが、既存へ寄せてよいかは人の判断（候補から選ぶ操作）。
この関数は「CRM に確かに無い」と人が判断したときの新規作成専用。
法人番号・インボイス番号が既存行と衝突する場合は番号なしで作り、画面の警告に委ねる
（UNIQUE 制約で取込全体を落とさないため）。

### 23.5 同期

| 種別 | 起点 | 内容 |
|---|---|---|
| 差分 | 前回同期日の **1 日前** | freee の `start_update_date` が日付粒度なので 1 日戻して取りこぼしを防ぐ |
| 全件 | 指定なし | freee 側の削除を検出できる唯一の経路。週次で回す |

トークンの扱いが Gmail と違う。**freee のリフレッシュトークンはローテーション式**で、
使うと古い値が失効する。「リフレッシュ → 保存の前に落ちる」と接続が死ぬため、

1. アクセストークン（6 時間有効）も暗号化保存し、生きている間は再利用してリフレッシュ自体を減らす
2. リフレッシュしたら**新トークンを保存し切ってから** API を呼ぶ

の順序を守る。保存に失敗したら例外を投げて同期を止める（保存できていない新トークンで先へ進まない）。

### 23.6 制約と未対応

- **突合の操作に楽観ロックは掛けていない。** 紐付け・対象外・解除はボタン 1 押しの状態遷移で
  「編集開始時点」が無く、後勝ちになっても画面から戻せる（`unlinkFreeePartner`）。
  操作できるのは admin だけで、同時編集の可能性も低い。エンティティの編集フォームには
  従来どおり `expected_updated_at` が要る
- **事業所は先頭の 1 つだけを繋ぐ。** ITERRA は 1 事業所のため選択 UI は作っていない。複数事業所を扱うときはコールバックに選択画面が要る
- **取引先（Account）との紐付けは自動で 1 件のときだけ。** その事業者の未削除 Account がちょうど 1 件なら自動で張り、複数あるときは人が選ぶ
- freee 側の勘定科目・取引（deals）・請求書は対象外。取引先の突合だけを扱う

### 23.7 マイグレーション

| ファイル | 内容 |
|---|---|
| `20260805000001_create_freee_sync.sql` | 2 テーブル + RLS + 4 関数 |

## 23.8 リード系 4 マスタの役割（2026-08-05 に整理）

利用者から「制御機構や度重なる修正でうまく機能していないのでは」と確認を受けて
整理した。**4 つは性質がまったく違う。** 混ぜて考えると事故る。

| マスタ | 性質 | 誰が決めるか | 壊れると |
|---|---|---|---|
| **リードステージ** | 業務の骨格。**規則を持つ** | 人が選ぶ。ただし遷移は DB トリガーが検査 | 昇格・契約の整合が崩れる |
| **リードステータス** | ステージに**従属**（`stage_id` NOT NULL） | 人が選ぶ | 既存リードの参照先が失われる |
| **デマンドファネル**（旧: リードカテゴリ） | **完全な導出値。人は設定できない** | `resolve_lead_category` が保存のたびに上書き | 進捗画面の分類が空になる |
| **コールステータス** | 単なる記録の選択肢。**制御に関与しない** | 人が選ぶ | 影響なし（過去の記録の表示だけ） |

### ステージが持つ規則

| 列 | 意味 |
|---|---|
| `requires_deal` | このステージへ進むにはディールが要る（§24 のトリガーが強制） |
| `requires_contract` | さらに契約も要る |
| `is_terminal` | 終端。ここから先へは進めない |
| `auto_promote_to_deal` | 昇格の予告を画面に出す |
| `is_inquiry_default` | 問い合わせ取込で付ける初期ステージ（1 行だけ） |
| `is_qualification` | 選定段階。カテゴリ判定で TQL になる |

**ステータスを持たないステージがある**（Opportunity は 0 個）。画面は
「そのステージにステータスが定義されているか」で欄の出し分けを決める。
**特定のステージを名指ししない**（§24.5）。

### カテゴリは導出値

`set_lead_category` トリガーが保存のたびに `resolve_lead_category` の結果で上書きする。
**マスタ管理でカテゴリを増やしても、誰にも割り当てられない**（判定が返す 4 種以外）。
逆に 4 行を消すとリードにカテゴリが付かなくなる。だから 4 行とも
`is_system_required = true` にしてある（§23.8.1）。

判定の入力は**すべてマスタの列**で、スラッグは見ない:

```
requires_deal        → SQL（is_sales_qualified のカテゴリ）
is_qualification     → TQL（progress_view = 'outbound'）
lead_sources.is_inbound_inquiry → Inquiry（progress_view = 'inquiry'）
それ以外             → MQL（progress_view = 'inbound'）
```

### 23.8.1 手動設定で壊れないようにする

マスタ管理は admin が自由に編集できる。**業務の骨格に関わる行を消されると
リードの保存や取引先の自動生成が止まる**ため、DB で守る。

| 守り | 実装 |
|---|---|
| システム必須行を消せない | `is_system_required` ＋ `prevent_system_required_delete` トリガー。画面も削除ボタンを出さず「システム必須」と表示する |
| 使用中のステータスを消せない | `prevent_in_use_status_delete`。参照が 1 件でもあれば理由と件数を返す |
| 「既定」が 2 行にならない | 部分 UNIQUE インデックス（`is_inquiry_default` など） |
| 既定が未設定のとき | エラー文言に**どこで設定するか**まで書く |

**必須の判定はフラグで持つ**（名前やスラッグで判定しない）。
必須でない行は今までどおり削除できる（過剰に縛らない）。

## 23.7 変更履歴（2026-08-05 に全面見直し）

利用者から「ログの記載も取りこぼしている。システムログをそのまま表示させている
だけで日本語に最適化されていない」と指摘を受けて直した。

### 何が問題だったか

| 問題 | 直し方 |
|---|---|
| **記録対象が 9 テーブルだけ**。マスタが 1 つも記録されていなかった | **76 テーブル**へ拡大。「誰がステータスや既定を変えたか」を追える |
| 項目名が DB のカラム名のまま（`deleted_at` `job_title`） | `src/lib/change-log-format.ts` で日本語へ |
| 値が生のまま（UUID・ISO 日時・`null`） | 人の名前・和式日時・「未設定」へ |
| 作成時に**全カラムの JSON**（数百文字）が 1 セルに入る | 対象の名前だけを要約 |
| **論理削除が「更新」に見える** | `SOFT_DELETE` / `RESTORE` として記録（過去分も移行） |
| 削除の記録で**何を消したか分からない** | `_name` に対象名を残す（過去分も埋めた） |

### 守ること

- **変換の判断は `src/lib/change-log-format.ts` に集める**（画面に散らさない）。
  純粋関数でテストがある（UT-70）
- **対応の無い列は隠さず列名のまま出す。** 消すと「何が変わったか分からない」
  記録になる。読めなくても出す方がまし
- **UUID を画面に出さない。** 引けないときは「他のデータ」と示す
- 記録対象から外すのは**履歴そのものと自動生成物だけ**
  （`entity_change_logs` / 各種ログ / ジョブ / 連携の内部状態）
- テーブル名の対応は `src/lib/master-labels.ts`。
  **マスタ管理と変更履歴で共用する**（片方だけに持つと内部名が残る）

## 23.8.2 マスタは「役割フラグ」で引く（2026-08-05）

**マスタの行を name / code / slug / UUID で名指ししない。** 役割を表す列を足し、
それで引く。名前は自由に変えられるし、コードは自動採番、UUID は seed を作り直すと
別物になるため、いずれも参照の拠り所にならない。

### なぜ UUID の直書きが一番危険か

実際に壊れていた（2026-08-05 に発覚）。

```ts
export const COMPANY_STATUS_ACTIVE = "c1000000-0000-0000-0000-000000000001";
```

2026-07-31 に事業者ステータスを「取引状態」から「実在性」へ入れ替えた際、
**既存行の移行は正しく行われていた**が、この定数が残っていた。結果、
移行後も**論理削除済みの行を指す新規データを作り続け**、事業者情報 27 件が
壊れていた（`20260805000023` で修復）。

**論理削除は外部キーで防げない。** 参照先が消えていても FK は通るので、
名前やコードなら「見つからない」で気づけるところが、UUID だと静かに通る。

### 役割フラグの一覧

| マスタ | 列 | 意味 |
|---|---|---|
| `account_statuses` | `is_active_default` / `is_churned_default` / `is_prospect_default` | 契約状態から自動で付くステータス |
| `company_statuses` | `is_new_default` | 取込・昇格で作るときの初期値 |
| `contact_statuses` | `is_new_default` | 同上 |
| `corporate_types` | `is_sole_proprietor` | 個人事業主（freee で「個人」扱い） |
| `lead_stages` | `is_inquiry_default` / `is_qualification` ほか | §23.8 |
| `lead_sources` | `is_inquiry_default` / `is_inbound_inquiry` / `is_card_import_default` | 取込の既定・問い合わせ扱い |
| `lead_statuses` | `is_inquiry_initial` / `is_card_import_initial` | **取込の経路ごとに違う**初期ステータス |
| `lead_activity_types` / `lead_call_statuses` | `is_card_exchange` | 名刺取込が記録する種別 |
| `lead_customer_activity_types` | `is_form_submit` | 問い合わせフォーム送信 |
| `lead_categories` | `progress_view` / `is_sales_qualified` | 進捗画面との対応 |
| `account_types` | `requires_corporate_fields` / `is_company_default` / `is_sole_proprietor_default` | 法人向け項目・自動生成の既定 |
| `pipeline_types` | `is_default` | ディール化の既定 |

**「既定」は部分 UNIQUE で 1 行に制限する。** 2 行 true だと不定になる。

### 守り

| 守り | 実装 |
|---|---|
| 役割を持つ行を消せない | `is_system_required` ＋ `prevent_system_required_delete` |
| 使用中のステータスを消せない | `prevent_in_use_status_delete` |
| **削除済みマスタを新たに参照できない** | `check_master_not_deleted`（companies / contacts / accounts / leads） |
| 改名は許す | 役割はフラグが持つので、表示名を業務に合わせて変えても壊れない |

### 検査の手順（**新しい機能を足したら必ず回す**）

アプリの grep だけでは足りない。**DB 関数の本文まで検索する**こと。
実際、これを怠って 2 回見落とした。

```sql
-- マスタを名指ししている関数を洗う（採番トリガーの接頭辞だけが残れば OK）
select p.proname, m[1]
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
  lateral regexp_matches(pg_get_functiondef(p.oid),
    '(name|code|slug)\s*=\s*''[^'']+''', 'g') m
 where n.nspname = 'public' and p.prokind = 'f';
```

```bash
# アプリ側（UUID の直書きも見る）
grep -rnE '\.eq\("(code|name|slug)",\s*"' src/
grep -rnE '"[0-9a-f]{8}-[0-9a-f]{4}-' src/ --include=*.ts
```

### 23.8.3 フラグの設定はマイグレーションに書かない（2026-08-05）

役割フラグを立てる `UPDATE <マスタ> SET is_xxx = TRUE WHERE code = '...'` を
マイグレーションに直接書くと、**まっさらな DB では 1 つも立たない**。

`supabase db reset` は **マイグレーション → seed の順**に実行する。
マイグレーションが走る時点でマスタの行はまだ存在せず、UPDATE は全部 0 行更新になる。
**エラーは出ない**。本番は既にマスタがあるので当たるため、
**ローカルと本番で DB の状態が食い違ったまま気づけない**
（2026-08-05 に発生。ローカルで通したはずの seed が、まっさらから流すと
「削除済みの事業者ステータスを指定しています」で止まって発覚した）。

設定は冪等な関数 `apply_master_role_flags()` に集約し、
**マイグレーションと `seeds/01-masters.sql` の末尾の両方から呼ぶ**。

```sql
SELECT apply_master_role_flags();   -- 何度でも実行できる
```

戻り値は `'すべて設定済み'` か `'未設定: <フラグ名>, ...'`。
**本番でフラグが空振りしていた場合の復旧もこれで行う**
（該当行の code / slug / name を直してから実行する）。

役割フラグを増やすときは、この関数だけを直す。**名指しの値（code / slug / name）は
ここが唯一の置き場所。** マイグレーションに散らさない。

## 23.9 マスタのスラッグ／コードは自動採番（2026-08-05）

**人が編集する項目ではない。** マスタ管理画面から入力欄を外し、DB のトリガーが
ランダムな値を付ける（`stage_7f3a9c2b` の形）。利用者の依頼「編集できるスラッグ設定を
廃止したい（運用が楽）」への対応。

対象は自動採番トリガーを付けた 7 マスタ:
`lead_stages` / `lead_sources` / `account_types` / `pipeline_types`（`slug`）、
`lead_statuses` / `lead_categories` / `lead_temperatures`（`code`）。

### なぜ先に「意味のある列」へ移したか

**スラッグは表示用の識別子のはずが、実際には「この行が何であるか」を
コードが判定する鍵になっていた。** ランダム化すると該当なしで NULL が返り、
**エラーにならないまま機能が止まる**（静かに壊れる）。実際に 6 箇所あった。

| 元の判定 | 置き換え先 |
|---|---|
| `lead_stages.slug = 'generation'`（取込の既定ステージ） | `lead_stages.is_inquiry_default` |
| `lead_sources.slug = 'web_form'`（取込の既定の流入元） | `lead_sources.is_inquiry_default` |
| `lead_stages.slug = 'opportunity'`（昇格ステージ） | 到達しない分岐だったので**削除**（`requires_deal` で除外済み） |
| `account_types.slug IN ('corporate','government')`（法人向け項目） | `account_types.requires_corporate_fields` |
| `account_types.slug = 'corporate'`（企業名からの既定） | `account_types.is_company_default` |
| `pipeline_types.slug = 'sales'`（ディール化の既定） | `pipeline_types.is_default` |
| `lead_categories.code IN ('inquiry','mql','tql')`（進捗画面） | `lead_categories.progress_view` |

これは既存方針（**判定をコードに書かない。`requires_deal` で表す**。§24）の延長。

### 守ること

- **「既定」を表す列は部分 UNIQUE で 1 行に制限する**
  （2 行が true だと「どちらが使われるか」が不定になる）
- 既定が未設定のときは、**何をすればよいかまで文言にする**
  （「マスタ・取込 → リードステージで『問い合わせ取込の既定』を 1 つ選んでください」）
- **スラッグ列自体は消さない。** 外部連携の突合や過去ログの追跡に使う
- **既存の値は書き換えない。** 手順書や過去ログに出てくる値と食い違うと調査で混乱する
- seed が明示した値は尊重する（トリガーは**未入力のときだけ**採番する）

**新しくマスタを増やすときも、コードから名指しで引かないこと。**
「この行が何であるか」が要るなら、意味のある列を足す。

## 24. リードステージと実体の整合規則（2026-08-04）

### 24.1 背景

ステージが Sales / Opportunity / Customer なのにディールも契約も無いリードを作れてしまった。
穴は 3 つあった。

1. **Customer へ直行できた。** 獲得 → Customer とステージだけ変えれば、ディールも契約も無いまま「成約済み」になる
2. **Sales は「商談化」という名前なのにディールを要求していなかった**
3. **Opportunity の不変条件が `src/actions/leads.ts` の中にしか無かった。**
   SQL 直接・service_role 経由・将来の別経路ですり抜ける状態で、多層防御になっていなかった

### 24.2 規則

**ステージが要求する実体を、そのステージへ進む時点で満たしていること。**

| ステージ | ディール | 契約 |
|---|---|---|
| リード獲得 / ナーチャリング / リード選定 | 不要 | 不要 |
| Sales | **必須** | 不要 |
| Opportunity | **必須** | 不要 |
| 取引先（`customer`） | **必須** | **必須**（ディールに紐づく契約が 1 件以上） |
| Dead | 不要 | 不要 |

規則はハードコードせず `lead_stages.requires_deal` / `requires_contract` で持つ。
判定をコードに書かないので、ステージを増やしても分岐を足さずに済む。
**契約を求めるならディールも要る**（契約はディールにぶら下がるため）を CHECK 制約で担保している。

**この 2 つのフラグはマスタ管理画面からは編集できない**（`auto_promote_to_deal` /
`is_terminal` と同じ扱い。`leadStageCreateSchema` に含めていない）。業務の骨格に関わる
設定で、画面から気軽に変えられると整合が崩れるため、変更はマイグレーションで行う。

### 24.3 強制のしかた（多層防御）

| 層 | 実装 | 役割 |
|---|---|---|
| DB | `check_lead_stage_requirements()` + `trg_lead_stage_requirements` | **どの経路からも**違反を作らせない。`BEFORE INSERT OR UPDATE OF stage_id ON leads` |
| DB | `check_deal_deletion_against_leads()` / `check_contract_deletion_against_leads()` | 逆向きの穴（実体を消して不整合を作る）を塞ぐ |
| Server Action | `createLead` | ディールが要るステージを新規作成では拒否（何をすればよいかまで文言にする） |
| Server Action | `updateLead` | **ディールを先に作ってから** leads を更新する（下記） |
| 画面 | `/leads/new` | `requires_deal` のステージを選択肢から外す |

**ステージが変わるときだけ検査する。** 常時検査にすると、規則の導入前から不整合だった行の
「ステージと無関係な項目の修正」まで塞がり、是正の手段そのものが無くなる。ステージを下げる
操作も塞がってしまう。既存の不整合は `v_lead_stage_violations` で洗い出して個別に直す。

### 24.4 昇格の順序（2026-08-04 変更）

**ディールの生成を leads の更新より先に行う。**

```
旧: leads を UPDATE → promote_lead_to_deal → 失敗したらステージを手で戻す（補償処理）
新: promote_lead_to_deal → leads を UPDATE（失敗しても leads は手つかず）
```

トリガーが「ディールなしで Sales 以降へ進む」ことを拒否するため、旧順序では保存自体が通らない。
先に作れば、昇格が失敗しても leads は元のままなので**補償処理が要らなくなる**
（CLAUDE.md の「複数テーブルへの書き込みは DB 関数にまとめる」に対する応急処置を 1 つ解消）。

楽観ロックは、昇格が `leads.promoted_deal_id` を更新して `updated_at` を進めるため、
**昇格の前に競合を確認し、昇格の後に新しい `updated_at` を取り直して**条件に使う。

### 24.5 ステータスの有無で分岐する

`status_id` を NULL にするかは **「そのステージにステータスが定義されているか」** で決める。
`auto_promote_to_deal` で判定していたが、Sales もディールを自動生成するようになったため、
そのままだと Sales のステータス（商談化 / 引継済）が消えてしまう。

| ステージ | ステータス定義 | `status_id` |
|---|---|---|
| Opportunity | なし | NULL に強制 |
| Sales ほか | あり | 必須（親子整合をチェック） |

### 24.6 規則の値は seed が正本（db reset の罠）

**マイグレーションの `UPDATE lead_stages SET requires_deal = ...` は `db reset` では効かない。**
reset は「マイグレーション → seed」の順で走るため、UPDATE の時点で対象行が無く、
その後 seed の INSERT が既定値（`FALSE`）で入れ直す。

そのため **`supabase/seeds/01-masters.sql` の `lead_stages` にフラグを直接書いてある**。
本番は既存行があるのでマイグレーションの UPDATE が効き、ローカルは seed が入れる。
**片方だけ直すと本番とローカルで規則が食い違う。必ず両方を揃えること。**

同じ罠は `lead_statuses`（`card_exchanged`）でも踏んでいる（seed 内にコメントあり）。
マスタの値をマイグレーションで足すときは、seed 側にも同じ値を入れる。

### 24.7 マイグレーション

| ファイル | 内容 |
|---|---|
| `20260805000002_lead_stage_requirements.sql` | フラグ 2 つ + トリガー 3 つ + `v_lead_stage_violations` |

## 25. 新規作成の項目の揃いと、親から子を追加する導線（2026-08-04）

### 25.1 連絡先は連絡手段・住所ごと作る

新規作成画面にメール・電話・住所の欄が無く、作ってから編集画面で足す運用になっていた。
子テーブル（`contact_emails` / `contact_phones` / `entity_addresses`）が `contact_id` を
必要とし、既存のエディタが「作成済みの相手にその場で足す」方式だったため。

**`create_contact_with_details()` で親子まとめて書く。** アプリ側で順に INSERT すると
途中失敗で「連絡先だけできて連絡手段が無い」状態が残る（CLAUDE.md の規約）。

| 引数 | 内容 |
|---|---|
| `p_contact` | 連絡先本体 |
| `p_emails` / `p_phones` | 複数可。`is_primary` の指定が無ければ**先頭を主にする**（複数立つと表示側が選べない） |
| `p_address` | 1 件だけ。2 件目以降は編集画面で足す。`add_entity_address()` に委ねる |
| `p_account_id` | 取引先の詳細から来たときの紐づけ。`account_contacts` に張る |
| `p_social_accounts` | 複数可。`{ service_id, account_id, workspace, display_name }`。サービスごとの入力欄の出し分けは TS 側（`ContactSocialAccountsDraft`）が持ち、DB 側は配列を受けて 1 件ずつ書くだけ（2026-08-09、T-0026） |

SECURITY INVOKER なので **RLS がそのまま効く**（連絡先を作れない利用者は子も作れない）。

#### 25.1.1 SNS・チャットも新規作成に載せる（2026-08-09、T-0026）

上表の `p_social_accounts` を追加するまでは対象外にしていた（サービスごとに入力欄が
変わるため設計を分けていた）。実装は既存の `contact_social_accounts` と同じ形（配列を
受け取り 1 件ずつ INSERT）で足りたため、`create_contact_with_details()` に引数を 1 つ
追加するだけで済んだ。

**PostgreSQL は引数の個数が変わると `CREATE OR REPLACE FUNCTION` では置き換えにならず
別オーバーロードとして増える**（実機で確認済み）。マイグレーションでは旧シグネチャ
（5 引数）を `DROP FUNCTION` してから 6 引数で作り直している
（`20260809110001_contact_with_details_social_accounts.sql`）。

サービスごとの必須欄（Slack のワークスペース等）の検査は既存の
`SocialAccountsEditor`（その場で追加する版）と同じく **クライアント側でだけ**行う
（`contact_social_accounts` に CHECK 制約は無い）。DB は一意制約
（`uq_contact_social_account`: `contact_id, service_id, account_id, workspace`）だけを持つ。
**この一意制約は `workspace` が NULL のとき機能しない**（PostgreSQL は既定で
UNIQUE 制約中の NULL 同士を区別しないため、`workspace` を持たないサービス
＝ ほとんどのサービスでは同じ ID を重複登録できてしまう）。既存の
`SocialAccountsEditor` 経由でも同じ穴があり、今回の新規作成対応で新たに
持ち込んだものではない。修正は別タスクとする。

### 25.2 親から子を追加する導線

**詳細ページのセクション見出しに `AddRelatedLink` を置き、`?<親>_id=` を渡す。**

| 親 | 子 | 遷移先 |
|---|---|---|
| 事業者情報 | 連絡先 | `/contacts/new?company_id=` |
| 取引先 | 連絡先 | `/contacts/new?account_id=`（`account_contacts` に張る） |
| 事業者情報 / 取引先 / 連絡先 | ディール | `/deals/new?company_id=` / `?account_id=` / `?contact_id=` |
| プロジェクト | ディール | `/deals/new?project_id=`（`deal_projects` に張る） |
| ディール | 契約 | `/contracts/new?deal_id=` |
| 連絡先 | タレント | `/talents/new?contact_id=` |

**移動先では初期選択にするだけで固定しない。** 間違えた導線から来たときに相手先を
直せなくなるため。不正な UUID は黙って無視する（初期選択が外れるだけで作成は行える）。

詳細ページが閲覧専用という原則は崩していない。ここで行うのは**別のエンティティの
作成ページへ移動すること**だけで、この画面で値を書き換えるわけではない。

### 25.3 ディールの相手先は 3 択（不具合の修正）

`deals.account_id` を必須にしている画面と Zod が残っており、**契約前の相手とディールを
作れなかった**。2026-07-31 に「取引先は契約成立まで作らない」方針へ変えた際の追従漏れ。

DB は `deals_counterparty_check` で「account / company / contact のいずれか 1 つ以上」を
要求している。画面も取引先・事業者情報・連絡先の 3 択にし、Zod は
`hasCounterparty` の refine で同じことを見る。**既定は事業者情報**（契約前が普通のため）。

### 25.4 タレントの新規作成画面

`createTalent` の Server Action はあったが**画面が無かった**。`/talents/new` を新設し、
連絡先の詳細（未登録のとき）と一覧から入れるようにした。タレントは連絡先 1 人に
1 件なので、**既に登録されている連絡先は候補に出さない**。

### 25.5 マイグレーション

| ファイル | 内容 |
|---|---|
| `20260805000003_create_contact_with_details.sql` | 連絡先と連絡手段・住所・取引先紐づけを 1 トランザクションで作る関数 |
| `20260809110001_contact_with_details_social_accounts.sql` | `create_contact_with_details()` に `p_social_accounts` を追加（旧シグネチャを DROP してから作り直し）。T-0026 |

## 26. freee との相互同期（2026-08-04）

### 26.1 方針の変更

§23.2 では「**freee 側には一切書かない**」と決めていた。会計は確定した数字を扱うため、
CRM 側の編集が伝播すると仕訳の前提が崩れる、という判断による。

2026-08-04 に利用者の判断で**書き込みを許す**方針へ変えた。ただし条件を付ける。

- **CRM を正とする**（既定は CRM の値を freee へ）
- **自動では書かない。** 差分を画面に出し、項目ごとに人が確定したものだけを書く
- 会計側の修正を残したい項目は「freee → CRM」か「触らない」を選べる
- **書いた記録を必ず残す**（成功も失敗も）

取り込み（freee → CRM）は従来どおり自動で回る。変わったのは書き込みの経路だけ。

### 26.2 差分の出し方

`detect_freee_partner_diffs(freee_company_id)` が、紐付け済み（`auto` / `confirmed`）の
相手について**項目ごと**の差分を返す。保存せず都度計算する（どちらの変化でも陳腐化するため）。

| 比較する項目 | CRM 側 | freee 側 |
|---|---|---|
| 名称 | `companies.name` | `long_name`（無ければ `name`） |
| カナ | `companies.name_kana` | `name_kana` |
| 電話番号 | `companies.phone` | `phone`（**数字だけで比較**） |
| インボイス番号 | `companies.invoice_registration_number` | `invoice_registration_number` |
| 郵便番号 | 主住所の `postal_code` | `address_zipcode`（数字だけで比較） |
| 住所 | 主住所の `address_line1` | `address_street_name1` |

**空文字と NULL は同じ「未入力」として扱う。** 片方が空文字、片方が NULL というだけで
差分に出すと、直しようのない差分が並び続ける。

CRM にしか無い項目（社内メモ・担当者・実在確認の状態など）は同期の対象にしない。

### 26.3 反映のしかた

| 方向 | 実装 | 備考 |
|---|---|---|
| freee → CRM | `apply_freee_values_to_crm()` | 選んだ項目だけ `companies` を更新。インボイス番号が他社と重複するときは例外にして中断する（UNIQUE 制約） |
| CRM → freee | `pushPartnerToFreee()`（アプリ） | `PUT /api/1/partners/{id}` の部分更新。送った項目だけが変わる |

画面は**先に CRM への取り込みを済ませてから freee へ送る。** 逆にすると、freee へ送った
直後に CRM 側を書き換えることになり、どちらが最新か分からなくなる。

### 26.3.1 更新でも `name` は必須

freee の `PUT /api/1/partners/{id}` は部分更新だが、**`name` だけは毎回必須**。
省くと 400 で「name が指定されていません。」が返る（2026-08-04 に踏んだ）。

住所や取引先コードだけを反映する回でも `name` を送る必要があるため、
**名称を変えないときは freee 側の現在の名称をそのまま送り返す**。
型でも `payload: FreeePartnerPayload & { name: string }` として省けないようにした。

### 26.4 記録

`freee_sync_logs` に 1 操作 1 行で残す。会計データを触るので、**失敗も残す**
（送ったが弾かれた、を後から追えないと原因が分からなくなる）。

| 列 | 内容 |
|---|---|
| `direction` | `to_freee` / `to_crm` |
| `changes` | `{"name": {"from": "旧", "to": "新"}}` |
| `succeeded` / `error_message` | 結果 |
| `performed_by` / `performed_at` | 誰がいつ |

RLS は SELECT が admin のみ。書き込みは service_role と SECURITY DEFINER の関数が行う。

### 26.5 freee の権限

書き込みには freee 側のアプリに**取引先の更新権限**が要る。読み取りだけの設定だと
`403` が返る。文言でその旨を案内する（`docs/error-messages.md` §6）。

### 26.7 住所の持ち方の違い（2026-08-04 修正）

**freee は「市区町村＋町名＋番地」を `street_name1` の 1 項目で持つ。**
CRM は `city`（市区町村）と `address_line1`（町名・番地）に分けて持つ。

当初は CRM の `address_line1` だけを `street_name1` と比べていたため、
**市区町村の分だけ必ず食い違い**、直しようのない差分が出続けた。
取り込み側も `street_name1` を丸ごと `address_line1` に入れており、
市区町村が番地欄に混ざっていた。

| 方向 | 扱い |
|---|---|
| 比較 | CRM の `city ‖ address_line1` を連結して `street_name1` と比べる。**空白は無視**する |
| freee → CRM | `split_japanese_city()` で市区町村を切り出して別々に入れる |
| CRM → freee | 連結した値を `street_name1` に送る |

`split_japanese_city()` の規則は **TS の `parseAddress`（Eight 取込）と同じ**にしてある。
片方だけ直すと取込経路によって住所の入り方が変わる。

都道府県は freee がコード（0: 北海道 〜 46: 沖縄県）、CRM が和名。
`freee_prefecture_name()` / `freee_prefecture_code()`（DB）と
`src/lib/freee/prefecture.ts`（TS）で変換する。**取り込みは DB 関数、送信は TS** と
経路が分かれているため両方に必要になった。**片方だけ直さないこと。**

### 26.8 取引先コード

freee の `code`（取引先コード）に **CRM の事業者コード（`companies.company_code`、
`CMP-000001` の形）** を入れる。freee 側からどの CRM レコードに対応するのかが
分かるようにするため。

**事業者情報の識別子は 2 つで、「UID」という別の列は無い。**

| 列 | 例 | 用途 |
|---|---|---|
| `id`（UUID） | `10000000-0000-…` | 内部の主キー。URL と参照に使う |
| `company_code` | `CMP-000001` | **人が読むコード**。UNIQUE 制約あり |

当初は `id`（UUID）を入れていたが、**freee の取引先コードは会計担当が画面で見る項目**で
36 文字の UUID は読めない。`company_code` なら CRM の画面にも出ているので突き合わせられる
（2026-08-04 に変更）。

#### 既存の取引先には API から入れられない（2026-08-05 に判明）

**取引先コードを指定できるのは新規登録（POST）のときだけ。** 更新（PUT）に `code` は無く、
混ぜると 400 が返る。

```
不正なリクエストです。 / このAPIでは code の指定はできません。
```

freee 公式 SDK の型でも `PartnerCreateParams` にだけ `code` があり、
`PartnerUpdateParams` には無い。**1 項目のために更新全体が落ちる**ため、
`FreeePartnerPayload`（更新用）からは外し、`FreeePartnerCreatePayload`（作成用）に置いた。

逆向きも通らない。`companies.company_code` は `generate_company_code()` が採番する
`VARCHAR(10) UNIQUE NOT NULL` で、freee の値では上書きできない。

したがって**既存の取引先**については、取引先コードはどちらへも反映できない。差分画面では
値を並べて見せるだけにし、選択肢を出さない（担当者名と同じ扱い）。揃えるときは freee の
画面か CSV インポートで人が入れる。

**新しく作る相手には入れられる**（§26.13）。CRM から登録した相手は以後コードで
自動的に突合される（§23.2）。

なお freee 側の**事業所設定で取引先コードは既定が「使用しない」**。「使用する」にすると
新規登録時に必須になり、省くと 400「Codeを入力してください。」が返る。
**ITERRA は「使用する」で運用する**（2026-08-05 に確認）。

取引先（`accounts`）ではなく事業者情報にしたのは、**取引先は契約成立まで存在せず**、
多くの相手で空になるため。契約成立を境にコードが入れ替わると、freee 側でコードを
鍵にしている運用と食い違う。

### 26.8.1 名称とカナの入り先（2026-08-05）

freee には**名前が 2 組**ある。画面では「基本情報」と「書類に使用する名称」に分かれる。

| freee の画面 | API | CRM から入れるもの |
|---|---|---|
| 基本情報の「名前」 | `name` | 事業者名（`companies.name`） |
| 基本情報の「名前（ふりがな）」 | **対応する項目が無い** | **入れられない** |
| 書類の「正式名称」 | `long_name` | 事業者名（同上） |
| 書類の「正式名称（カナ）」 | `name_kana` | フリガナ（`companies.name_kana`） |

**会社名は `name` と `long_name` の両方へ入れる。** 片方だけだと freee 側で表記が
ばらつく。送信は元から両方に入れていたが、**差分の検出が
`COALESCE(long_name, name)` を見ていた**ため、`long_name` だけ空のときに差分にならず、
正式名称が空のまま残り続けていた（2026-08-05 の指摘）。
検出は**両方を CRM の会社名と比べ、どちらかが違えば差分にする**。

**「名前（ふりがな）」は API から設定できない。** カナ系の項目は `name_kana`
（カナ名称）1 つだけで、これは書類の「正式名称（カナ）」に当たる。
`shortcut1` / `shortcut2` は画面にも別の欄として存在する別物なので**流用しない**
（検索用のキーワード欄で、意味が違う）。この欄を揃えたいときは freee の画面で人が入れる。

### 26.8.2 敬称は既定で「様」（2026-08-05）

`default_title` は **「御中 / 様 / (空白)」の 3 択**（API の仕様）。CRM に対応する項目は
無いため、**未設定のときだけ既定の「様」を提案する**。既に「御中」等が入っていれば触らない。

- 新規登録: 常に「様」を入れる
- 既存: 差分画面に「敬称」を出し、人が確定したときに入る
- **freee → CRM は不可**（CRM に項目が無い）。選ばれたら明示的に落とす

既定値は **DB（`freee_default_title()`）と TS（`DEFAULT_TITLE`）の対で持つ**。
片方だけ直すと、差分画面が提案する値と実際に送る値が食い違う。

### 26.10 連携する項目の一覧（2026-08-04 に全面見直し）

freee の取引先は 25 項目（＋ネスト）ある。**CRM に正本があるものだけ双方向にし、
freee にしかないものはミラーに取り込むだけ**にする。CRM に持たせると二重管理になる。

**① 双方向（差分画面に出る）**

| freee | CRM |
|---|---|
| `name`（基本情報の名前）＋ `long_name`（書類の正式名称） | `companies.name` |
| `name_kana`（書類の正式名称（カナ）） | `companies.name_kana` |
| `phone` | `companies.phone` |
| `invoice_registration_number` | `companies.invoice_registration_number` |
| `qualified_invoice_issuer` | `companies.invoice_registered`（該当する / 該当しない） |
| `org_code` | 法人格（個人事業主なら個人、それ以外は法人） |
| `address_attributes.*` | 主住所（郵便番号・都道府県・市区町村＋番地・建物名） |
| `partner_bank_account_attributes.*` | `financial_info` の主口座（銀行名・支店・口座番号・名義・種別） |

**② CRM → freee の一方向**

| freee | CRM | なぜ一方向か |
|---|---|---|
| `contact_name` | 主担当の**姓・ミドル名・名を続けた文字列** | freee は氏名を 1 項目で持ち、姓と名の切れ目が分からない。取り込むと別人に上書きしかねない |
| `email` | 主担当の主メール | 同上（連絡先が正本） |
| `default_title`（敬称） | **CRM に項目は無い**（既定の「様」を入れる） | 未設定だと書類の宛名が敬称なしになる。§26.8.2 |

**②' 差分画面に出すが、どちらへも反映できない**

| freee | CRM | なぜ反映できないか |
|---|---|---|
| `code` | `companies.company_code` | 更新 API が `code` を受け付けず（新規登録のみ）、CRM 側は採番した UNIQUE な値。§26.8 |

**③ ミラーに取り込むだけ（CRM に正本を持たない）**

`shortcut1` / `shortcut2` / `payer_walletable_id` /
`transfer_fee_handling_side` / `partner_doc_setting_attributes`（送付方法）/
`payment_term_attributes`（支払条件）/ `invoice_payment_term_attributes`（請求条件）/
`available` / `country_code` / `update_date`

**`shortcut1` / `shortcut2` を「ふりがな」に流用しないこと。** freee の画面にも
別の欄として存在する（§26.8.1）。

**④ freee に対応項目が無い（送らない）**

`corporate_number`（法人番号。CRM では法人格が法人のときだけ入力できる）/
代表者 / FAX / `website_url` / 業種

### 26.12 担当者名は候補から人が選ぶ

freee は担当者を `contact_name` の**文字列 1 つ**で持ち、CRM は `contacts` への
参照で持つ。CRM → freee は組み立てるだけで済むが、逆は「文字列から人を特定する」
ことになる。

**自動では結ばない。** 理由は 3 つ。

- **姓と名の切れ目が分からない。**「田中真理子」は「田中／真理子」か「田中真／理子」か判定できない
- **同名の別人がいる。** 別人に紐づくと、その連絡先のメール・電話が担当者の連絡先として扱われる
- **freee 側に連絡先の実体が無い。** 名前しかないので、探すのか作るのかを決める必要がある

そこで `detect_freee_contact_candidates()` が候補を出し、人が選んで確定する。

| 一致の強さ | 中身 |
|---|---|
| `exact_full` | 姓＋ミドル名＋名が一致 |
| `exact_name` | 姓＋名が一致（ミドル名を無視） |
| `last_name` | 姓だけ一致（弱い。確認前提） |

比較は**空白を落として**行う（freee は「鈴木 次郎」、CRM は姓と名が別カラム）。

**探す範囲はその事業者に紐づく連絡先だけ。** 全件から探すと同名の別人を拾う。
確定時も「その事業者の連絡先か」を DB 側で必ず確認する（画面から任意の ID を
送られても別の事業者の連絡先は紐づけない）。

**候補が無ければ何もしない。** 連絡先は作らない（姓名の分割を推測すると
`contacts` が汚れる）。画面では登録を促すだけにする。

差分画面では、担当者名とメールの行に「freee → CRM」を出さない。
代わりに候補から選ぶ操作を置く。

### 26.10.1 兼務（1 人が複数の事業者情報に関わる）— 2026-08-06

freee の突合で、同じ人が 2 社の担当者になっている例が出た
（坂本 明久 = DOCTOR QREATIVES と PICASSO、人見 麻里 = ペリニィヨン と
アークヒューマンキャピタル）。`contacts.company_id` は 1 列なので
**1 人は 1 社にしか属せず**、担当者の候補にも出てこないため差分が消せなかった。

| 持ち方 | 実体 |
|---|---|
| 主たる所属 | `contacts.company_id`（従来どおり。取込・名寄せ・RLS はこれを見る） |
| 兼務 | `company_contacts`（`company_id` / `contact_id` / `job_title` / `note`） |
| 参照 | **ビュー `company_contact_affiliations` に寄せる** |

**「この事業者に関わる連絡先」を聞かれたら必ずビューを使う。**
`contacts.company_id` を直接見ると兼務が漏れる。

- 主たる所属と同じ事業者は兼務に入れられない（トリガーが拒む。ビューで二重に出るため）
- freee の担当者候補（`detect_freee_contact_candidates`）と主担当の設定
  （`set_company_primary_contact_from_freee`）はビューを見る。
  **範囲は「その事業者に関わる人」のままで、そこに兼務が加わっただけ**
  （全件から探すと同名の別人を拾う、という前提は変えていない）

**`contacts.company_id` を廃して全面的に中間表へ移す案は採らなかった。**
TS 33 ファイル・マイグレーション 35 本・ポリシー 23 本に影響し、一度に動かすと
壊れたときの切り分けができない。ビューを挟んであるので、後から移すときの受け皿になる。

### 26.10.2 連携プロファイル（事業者情報 × 連携先）— 2026-08-06

freee へ渡す担当者メールは「主担当の主メール」で決まっていた。**主メールは連絡先に
1 つしか立たない**ため、同じ人が 2 社の主担当だと両社へ同じメールが渡り、
会社ごとに使い分けている場合は片方が永久に差分として残る。

利用者の指摘: **今後 API 連携する項目は増える。項目が増えるたびに列を足して回るのは
本質的でない。** 基本情報とは別に「連携用のプロファイル」を持ち、既定は基本情報から
導出しつつ、後から変更できる形にしたい。

`company_integration_profiles`（`company_id` × `integration` で 1 行）。

| 列 | NULL のとき（既定） |
|---|---|
| `contact_id` | `companies.primary_contact_id` |
| `contact_email_id` | 担当者の主メール |
| `entity_address_id` | 主住所 |
| `phone_entity_address_id` | `companies.phone`（代表電話） |
| `financial_info_id` | 主口座 |

**すべて NULL 可で、NULL は「既定に従う」。** 表が空でも今までと同じ値が出るので
移行は要らない。参照は `resolve_company_integration_values(company_id, integration)`
に集約し、`detect_freee_partner_diffs` はそれを呼ぶだけにした。

**値ではなくレコードを選ぶ。** CRM が正本のままで、CRM 側を直せば連携値も追随する。
値を持たせると同じ情報を二重に持つことになり、どちらが正かを毎回判断することになる。
どうしても CRM に持てない値（freee の敬称など）は、従来どおり freee 側の項目として扱う。

選べる範囲は DB のトリガーが縛る（`check_company_integration_profile`）。
担当者は**その事業者に関わる連絡先**（主たる所属 + 兼務。§26.10.1）、メールは
**その担当者が持つもの**、住所・電話・口座は**その事業者のもの**だけ。
画面から任意の ID を送られても通らない（別人のメールを会計へ渡さないため）。

**突き合わせ対象外（`ignored_fields`）**

`company_integration_profiles.ignored_fields` に項目名を入れると、その項目は
差分に出なくなる。**消えるのは表示だけで、値は変えないし何も送らない。**

freee にしか居ない担当者のように、**どちらの向きにも直せない項目**があるため
（候補 0 件・取り込みは拒否・送ると freee 側が消える。T-0058）。出し続けても人が
消せず、本当に直すべき差分が埋もれる。取引先まるごとの `link_status = 'excluded'`
では粒度が粗すぎて、他の項目まで見えなくなる。

**戻す入口は差分一覧とは別に置く。** 対象外にした項目はその一覧から消えるので、
同じ場所には戻すボタンを置けない（`/admin/freee/sync` の上部に一覧を出す）。

**この設計で減る作業・残る作業**

- 連携先が増える → `integration` の値が増えるだけ。スキーマ変更なし
- 既存のレコードから引ける項目が増える → 解決関数に列を足すだけ
- **別のレコードを選び分けたい項目が増える**（請求先住所と本社住所を分ける等）
  → プロファイルに列が 1 本増える。**ここは残る**

### 26.11 変換が要るもの

| 項目 | freee | CRM | 注意 |
|---|---|---|---|
| 都道府県 | コード（0: 北海道 〜 46） | 和名 | **0 始まり。**1 始まりと取り違えると全県ずれる |
| 市区町村・番地 | `street_name1` の 1 項目 | `city` ＋ `address_line1` | §26.7 |
| 口座種別 | `ordinary` / **`checking`** / `earmarked` / `savings` | `ordinary` / **`current`** / `savings` | **当座の綴りが違う。** 納税準備預金は CRM に無いので取り込まない（普通預金に寄せない） |
| 口座種別の未設定 | **持てない**（未選択でも `ordinary` が返る） | NULL を取れる | 比べる前に**両側を「未設定＝普通預金」へ揃える**（下記） |
| 適格請求書発行事業者 | 真偽値 | `invoice_registered` | **番号とセットでしか動かせない**（CHECK 制約が「該当する なら番号あり」を要求する） |

変換表は **DB と TS の両方**にある（取り込みは DB 関数、送信は TS）。
**片方だけ直さないこと。**

#### 口座種別の「未設定」（2026-08-06）

**freee は口座種別に未設定を持てない。** 画面で何も選ばなくても API は
`ordinary` を返すため、freee 側の `ordinary` は「普通預金と決めた」ではなく
**「未設定、または普通預金」**を意味する。CRM は NULL を取れるので、素で比べると
**どちらも未設定なのに差分として並ぶ**（利用者の指摘。38 件の突合で毎回出て、
本当に直すべき差分が埋もれていた）。

比較の直前に `normalize_account_type()` で両側を揃える
（`20260806000001`。TS 側は `normalizeAccountType`。UT-72 で固定）。

**既存データの一括書き換えはしない。** freee の `ordinary` は情報を
持っていないので、それを根拠に既存の全行へ「普通預金」と書くのは推測を
事実にしてしまう。**揃えるのは比較の土俵だけ。**

**入力フォームは「普通」を選んだ状態で開く**（`FinancialInfoEditor`）。
未設定の既存行を開いたときも「普通」になり、**未選択の選択肢は置かない**。
freee に「未設定」が無い以上、空にできても意味が無く、突合で差分に見えるだけ。
人が開いて保存したときだけ値が入るので、一括書き換えとは別の話になる。

揃えても取りこぼしは出ない。

| freee | CRM | 比較 | 差分 |
|---|---|---|---|
| 当座 | 未設定 | 当座 vs 普通 | **出る**（正しい） |
| 普通 | 貯蓄 | 普通 vs 貯蓄 | **出る**（正しい） |
| 普通 | 未設定 | 普通 vs 普通 | 出ない（今回の狙い） |

### 26.9 連携状態の見せ方

事業者情報の**一覧と詳細**に、freee と紐づいているかをアイコンで出す。
**カラー = 連携済み / グレー = 未連携。** 一覧で並べたときに一目で分かるよう、
形は変えずに色と濃さで差を出す（色覚に頼らないよう不透明度も落とす）。

記号はサイドバーの freee 連携と同じ `Landmark` を使う。画面ごとに別の記号を
当てると、それが freee のことだと分からなくなる。

| 状態 | 見た目 |
|---|---|
| `auto` / `confirmed` | カラー（連携済み） |
| `unlinked` / `excluded` / 紐づきなし | グレー |

`excluded`（突合の対象外と判断したもの）は**連携済みとは呼ばない**。
title 属性で状態の違いを補う。

**admin にしか出さない。** `freee_partners` は RLS で admin しか読めず、
他ロールでは連携済みでも空で返るため、出すと未連携と誤解させる。

### 26.13 CRM → freee の新規登録（2026-08-05 追加）

CRM にあって freee に無い相手を freee の取引先として作る。
画面は `/admin/freee/register`（freee 連携画面の「連携する事業者を追加する」）。

**この経路を作った理由は取引先コード。** 更新 API では入れられないため、
`CMP-000001` を freee に載せられるのは新規登録のときだけ（§26.8）。
ここで作った相手は以後コードで自動的に突合される。

#### 対象の出し方

「freee に無い」は**紐付いていない**（`link_status` が `auto` / `confirmed` でない）で
判断する。freee 側に実在していても紐付いていなければ一覧に出し、画面で候補を確認させる。
「本当に存在しないか」をアプリ側で判定しようとすると、結局は名寄せをやり直すことになる。

#### 二重登録を防ぐ

**freee は取引先名の重複を許す**（だから取引先コードが導入された）。
確認せずに作ると表記ゆれで同じ相手が 2 つできるため、
`detect_freee_candidates_for_company()` が似た取引先を出し、人が選ぶ。

| 一致 | 強さ |
|---|---|
| インボイス番号 | 強い（当たれば同一とみなしてよい） |
| 名称の正規化一致 | 中（略記の展開・空白除去を通したうえで比較） |
| 電話番号 | 弱い（代表番号の共用がある） |

候補があれば「これと紐づける」（`confirm_freee_partner_link`）を選べる。
**既に別の事業者と紐付いている候補は選ばせない。**

#### 送る項目

差分画面と同じ範囲（§26.10 の ①・②）＋ 取引先コード。
値は `get_company_freee_source()` が集める。**差分検出と同じ集約にすること。**
ずれると登録した直後に差分が出る。

**値が無い項目は送らない。** 更新は「空を送って消す」意味があるが、登録では単に
持っていないだけなので、送ると freee 側に空欄を作ることになる。

#### 作った後

POST が通ったら、**必ずミラーへ入れて紐付けまで済ませる**。やらないと次の同期で
「新しい取引先」として取り込まれ、未紐付けとして人の作業に戻ってくる。
`link_created_freee_partner()` が upsert → `confirmed` で紐付け → ログまでを
1 つの関数で行う（複数テーブルへの書き込みは DB 関数にまとめる規約）。

**POST が失敗したときは `freee_sync_logs` に残せない。** 取引先がまだ無く
`freee_partner_id` を埋められないため。理由は画面のダイアログに出す。
逆に **POST が通った後で紐付けに失敗した場合は、freee 側にだけ取引先が残る。**
このときは作られた取引先の ID を文言に含めて返し、同期で拾えるようにする
（黙って失敗にすると、作り直して二重登録になる）。

### 26.6 マイグレーション

| ファイル | 内容 |
|---|---|
| `20260805000006_freee_two_way_sync.sql` | `freee_sync_logs` + 差分検出 + 取り込み + 記録の関数 |
| `20260805000007_freee_address_and_code.sql` | 住所の分解・都道府県の変換・取引先コード。差分検出と取り込みを差し替え |
| `20260805000008_freee_code_use_company_code.sql` | 取引先コードを UUID から事業者コード（`CMP-000001`）へ |
| `20260805000009_freee_full_mirror.sql` | ミラーを全 25 項目へ拡張。口座種別の変換関数 |
| `20260805000010_freee_diff_full.sql` | 法人/個人・担当者名・メール・適格・口座を差分対象に |
| `20260805000011_freee_apply_full.sql` | 追加項目の取り込み。担当者名とメールは取り込まない |
| `20260805000012_company_names_and_type.sql` | 事業者名・会社名・屋号名の分離 |
| `20260805000013_freee_contact_candidates.sql` | 担当者名から連絡先の候補を出し、人が選んで主担当にする |
| `20260805000014_freee_code_read_only.sql` | 取引先コードの取り込みを明示的に拒否（無言の無視をやめる）。§26.8 |
| `20260805000015_freee_register_company.sql` | 取引先コードで自動紐付け。CRM → freee の新規登録に要る 4 関数。§26.13 |
| `20260805000016_freee_name_kana_title.sql` | 名称を name と long_name の両方で比較。敬称の既定値「様」。§26.8.1 / §26.8.2 |

## 27. 管理者向け一括ジョブ（admin_bulk_jobs、2026-08-09）

### 27.1 背景

統合候補の一括検出（`detect_all_contact_merge_candidates`、§21.5）と
全 Lead スコア再計算（`recalculate_all_lead_scores`、§11.12.7）は、どちらも全件を
総当たりで処理するため件数に比例して実行時間が伸びる。従来は関数単位で
`statement_timeout` を延長して凌いでいたが（`20260804000001`）、これは DB 側の
8 秒の壁を外すだけで、**HTTP 層のタイムアウト（Cloudflare の約 100 秒）は消えない**。
名刺取込（`lead_import_jobs`）で本番停止に至った経緯と同じ構造のため、
実行を HTTP リクエストの外へ移した（T-0020）。

### 27.2 `admin_bulk_jobs`

名刺取込のジョブ表と同じ形を踏襲するが、この 2 つは入力（payload）を持たない
「全件を洗い直すだけ」の操作のため、1 つの表を `job_type` で共有する。

| カラム | 型 | 説明 |
|---|---|---|
| `job_type` | TEXT | `contact_merge_detection`（統合候補の一括検出）/ `lead_score_recalc`（全 Lead スコア再計算） |
| `status` | TEXT | `queued` / `running` / `succeeded` / `failed` |
| `attempts` | INTEGER | 実行を試みた回数 |
| `requested_by` / `requested_at` | UUID / TIMESTAMPTZ | 投入者・投入時刻 |
| `started_at` / `finished_at` | TIMESTAMPTZ | ワーカーの実行開始・終了 |
| `result_count` | INTEGER | `contact_merge_detection` なら新規候補件数、`lead_score_recalc` なら再計算した Lead 件数 |
| `error_message` | TEXT | 失敗理由の原文（画面に出す前に `toUserMessage()` を通す） |

### 27.3 フロー

```
1. 投入: Server Action が admin_bulk_jobs へ 1 件 INSERT して即座に返す
2. 実行: pg_cron が毎分 process_admin_bulk_jobs を起動し、
         queued を 1 件取り出して（FOR UPDATE SKIP LOCKED）job_type ごとに
         既存の関数を呼ぶ（判定ロジックは変えていない）
3. 参照: 画面はジョブの status をポーリングする。閉じても実行は続く
```

ワーカーが呼ぶ関数は、権限判定を含む「入口」関数ではなく、判定を含まない
「内側」の関数にしている。

| job_type | ワーカーが呼ぶ関数 |
|---|---|
| `contact_merge_detection` | `record_contact_merge_candidates(NULL)`（`detect_all_contact_merge_candidates()` は呼ばない） |
| `lead_score_recalc` | `recalculate_all_lead_scores()` |

**理由:** pg_cron 実行には `auth.uid()` が無く、`is_manager_or_above()` /
`is_admin()` を内部で呼ぶ `detect_all_contact_merge_candidates()` をそのまま
ワーカーから呼ぶと判定が意図通りに働かない。権限確認は投入側
（`admin_bulk_jobs` の RLS INSERT ポリシー + Server Action のロールチェック）で
完結させ、ワーカーは判定を持たない関数を直接呼ぶ。これは `lead_import_jobs` の
ワーカーが `import_eight_leads` を直接呼ぶのと同じ分担であり、`detect_all_contact_merge_candidates()`
自体は SQL から直接叩く手動運用の入口として変更せず残す。

### 27.4 RLS

| job_type | 必要権限 |
|---|---|
| `contact_merge_detection` | manager 以上 |
| `lead_score_recalc` | admin のみ |

SELECT / INSERT ともに `job_type` に応じた条件を 1 ポリシーにまとめている。
**UPDATE ポリシーは無い**（実行中のジョブを利用者が `queued` へ戻せてしまうため。
状態を書くのはワーカーだけ）。DELETE は admin のみ（履歴の整理用）。

### 27.5 マイグレーション

| ファイル | 内容 |
|---|---|
| `20260809100001_admin_bulk_jobs.sql` | `admin_bulk_jobs` テーブル・RLS・`process_admin_bulk_jobs`・pg_cron 登録 |
