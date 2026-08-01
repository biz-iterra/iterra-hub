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
| M22 | リードカテゴリ | `lead_categories` | リードカテゴリマスタ（Inquiry/MQL/TQL/SQL）。Lead.category_id で参照。ステージとは独立した分類軸 | リード共通マスタ |
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
     │                │          1──N [contracts] (deal_id必須)
     │                │          1──N [deal_activities] (対応履歴)
     │                │          1──N [deal_stage_histories] (ステージ遷移履歴)
     │                │          1──N [deal_status_histories] (ステータス変更履歴)
     │                │          N──M [services] via [deal_services]
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
  ※ 個人事業主などのContactはAccountに紐づく。company_id = NULL

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
| accounts | deals | 1:N | 必須 | ディールは必ず1つのアカウントに属する |
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
| deals | contracts | 1:N | 必須 | 契約は必ず1つのディールに属する |
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
- 商談（`deals`）を新規作成したとき、`deals.expected_close_date` を「今日 ＋ N ヶ月」で初期設定するための既定月数（作成後も手動変更可）
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
- contact_type = 'individual' の場合 company_id IS NULL（アプリ層で制御）

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
| 9 | 取引担当者ID | `owner_user_id` | UUID | | FK→T01.id | | | | | |
| 10 | 契約書名 | `contract_name` | TEXT | | | | | | | max 200文字 |
| 11 | 申請日 | `application_date` | DATE | | | | | | | |
| 12 | 審査完了日 | `review_completed_date` | DATE | | | | | | | application_date以降 |
| 13 | ステージ更新日時 | `stage_updated_at` | TIMESTAMPTZ | | | | | | | ステージ変更時にアプリ層で更新 |
| 14 | クローズ日時 | `closed_at` | TIMESTAMPTZ | | | | | | | |
| 15 | **クローズ予定日** | **`expected_close_date`** | **DATE** | | | | | | | **新規作成時に `pipeline_types.default_close_months` から「今日＋N ヶ月」で自動セット（手動変更可）** |
| 16 | 最終更新者ID | `last_updated_by` | UUID | | FK→T01.id | | | | | |
| 17 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |
| 18 | 更新日時 | `updated_at` | TIMESTAMPTZ | | | | NN | NOW() | | トリガー自動更新 |

**CHECK:** `account_id IS NOT NULL OR company_id IS NOT NULL OR contact_id IS NOT NULL`（相手が特定できない商談は作れない）

**取引先の作られ方（2026-07-31 変更）:**
取引先は契約主体なので、契約が成立するまで作らない。

```
Lead ─取込→ Company + Contact          （名刺はリードであると同時に連絡先）
     ─昇格→ Deal（account_id = NULL、company_id / contact_id で相手を示す）
     ─契約→ Account 作成 + Deal に紐付け（contracts の AFTER INSERT トリガー）
```

表示側は取引先 → 法人情報 → 連絡先の順でフォールバックする（`src/lib/deal-counterparty.ts`）。

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
| 3 | ディールID | `deal_id` | UUID | | FK→T05.id | | NN | | | 契約は必ずディールに紐づく |
| 4 | 契約方法 | `contract_method` | TEXT | | | | | | 'paper','electronic','verbal' | |
| 5 | 契約種別ID | `contract_type_id` | UUID | | FK→M02.id | | | | | |
| 6 | 契約書名 | `contract_name` | TEXT | | | | | | | max 200文字 |
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

Lead は Deal より上流の「見込み客」を管理するエンティティ。インサイドセールス架電〜アポ獲得〜商談化（Deal 昇格）の一連フローを担う。

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

| slug | 名称 | is_terminal | auto_promote_to_deal | 説明 |
|------|------|-------------|---------------------|------|
| `generation` | 獲得 | false | false | リスト化〜未架電段階 |
| `nurturing` | 育成 | false | false | 架電試行〜資料送付段階 |
| `qualification` | 選定 | false | false | アポ獲得〜確定段階 |
| `sales` | Sales | false | false | 商談化〜引継段階（旧 `sql` → `sales` に rename: 20260419000013） |
| `opportunity` | Opportunity | false | **true** | Deal 昇格トリガー |
| `customer` | Customer | **true** | false | 成約済み（端末） |
| `dead` | Dead | **true** | false | 失注・辞退等（端末） |

### 11.3 ステータス一覧（M19 lead_statuses）

> **重要:** `Opportunity` ステージ（`auto_promote_to_deal=true`）にはステータスが定義されていない。Deal 側で進捗を管理するため、`leads.status_id` はこのステージでは `NULL` になる。DB カラムも `NULL 許容`（20260419000009 で NOT NULL 制約を解除）。

| ステージ | code | 名称 |
|---------|------|------|
| 獲得 | `list_ready` | リスト化済 |
| 獲得 | `not_called` | 未架電 |
| 獲得 | `not_started` | 未着手 |
| 獲得 | `call_scheduled` | 架電予定 |
| 育成 | `calling` | 架電試行中 |
| 育成 | `continuing_call` | 継続架電 |
| 育成 | `awaiting_recall` | 再架電待ち |
| 育成 | `material_sent` | 資料送付済 |
| 選定 | `appointment_obtained` | アポ獲得 |
| 選定 | `appointment_confirmed` | アポ確定 |
| Sales | `negotiation` | 商談化 |
| Sales | `handed_over` | 引継済 |
| **Opportunity** | —（なし） | **status_id = NULL**（Deal 昇格トリガーステージ。Deal 側で進捗管理） |
| Customer | `closed_won` | 成約 |
| Dead | `lost` | 失注 |
| Dead | `declined` | 辞退 |
| Dead | `unreachable` | 連絡不能 |
| Dead | `approach_prohibited` | アプローチ禁止 |
| Dead | `opt_out` | オプトアウト |

### 11.4 Category マスタ（M22 lead_categories）と v_leads_with_category View

**設計方針: カテゴリとステージは独立した2軸**

リードカテゴリ（Inquiry / MQL / TQL / SQL）とリードステージ（generation / nurturing / qualification / sales / opportunity / customer / dead）は**独立した2軸**として管理する。自動マッピングや推奨連動は実装しない。ユーザーが手動で選択する。

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
- **手動実行:** `SELECT recalculate_all_lead_scores();`（admin のみ）
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
| アポ獲得 | `qualification` | アポ確定 | `appointment_confirmed` |
| 商談化 | `sales` | 引継済 | `handed_over` |
| クローズ（成約） | `customer` | 成約 | `closed_won` |
| クローズ（失注） | `dead` | 失注 | `lost` |

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
- **UI:** 法人情報の編集ページで追加・削除・代表切替。保存ボタンとは独立して即時反映する

### 16.4 名寄せ関数

| 関数 | 役割 |
|---|---|
| `is_free_email_domain(TEXT)` | フリーメール判定。IMMUTABLE。`company_domains` の CHECK からも使う |
| `normalize_domain(TEXT)` | メール／URL／裸のドメインを保存形式（小文字・www 無し）へ |
| `normalize_company_name(TEXT)` | 法人格表記・全角半角・区切り記号を落とした名寄せキー。`companies` に関数インデックス |
| `resolve_or_create_company(...)` | ドメイン一致 → 会社名一致 → 新規作成。ドメインも同時に登録 |
| `resolve_or_create_contact(...)` | メール一致 → 会社×姓名一致 → 新規作成。メール・電話は空欄補完のみ |

取込（`import_eight_leads`）と既存リードの遡及作成が同じ関数を通る。片方だけ判定が変わる事故を防ぐため。

### 16.5 leads の新カラム

| 物理名 | 型 | 説明 |
|---|---|---|
| `company_id` | UUID FK→T02.id | 取込時に名寄せ／作成した法人 |
| `contact_id` | UUID FK→T04.id | 取込時に作成した連絡先 |

`promoted_company_id` / `promoted_contact_id` は「Deal 昇格で確定したもの」を指す既存カラムで、意味が違うため別に持つ。昇格時は `company_id` / `contact_id` の値をそのまま `promoted_*` へ引き継ぎ、作り直さない。

姓が取れない行（企業リスト由来など）は連絡先を作らない。会社名が無い行は法人も作らない。

### 16.6 取引先の作成タイミング

`contracts` の AFTER INSERT トリガー `ensure_account_on_contract()` が、取引先未作成の商談に取引先を作って紐付ける。

- 契約と同一トランザクションで完結する（「契約はあるが取引先が無い」状態を作らない）
- 取引先名は法人名を優先し、個人取引なら担当者名を使う
- 種別は法人紐付きなら「法人」、無ければ「個人事業主」
- 商談の相手担当者を `account_contacts` に `primary` で登録する
- 昇格元リードの `promoted_account_id` も更新する
- **SECURITY DEFINER。** 契約を登録する manager が商談の担当者とは限らず、`deals` の UPDATE ポリシー（owner / admin）では紐付けが 0 行更新で静かに失敗するため

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
**契約した商談のパイプラインに対応する区分を必ず付与する**。

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
取引先区分（§17）や商談と役割が重なる。名刺取込で作られた 3,597 件が一律「見込み」になり
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

- **定期実行**: 現在は Admin（法人情報 → 実在確認）からの手動実行のみ。cron 化は後続
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

### 21.5 統合候補と統合（D12）

姓名しか一致しない組は自動統合せず `contact_merge_candidates` に記録する。

| 関数 | 役割 |
|---|---|
| `detect_contact_merge_candidates(UUID)` | 姓名一致・会社違いの組を検出。カナが両方あって食い違う組は除外 |
| `merge_contacts_preview(UUID, UUID)` | 付け替え件数の下見 |
| `merge_contacts(UUID, UUID)` | 統合の実行。**manager 以上**。取り消せない |

統合は 18 の外部キーに跨るため単一トランザクションで行う。一意制約があるものは
重複しない行だけを移す。名刺はすべて移し、**採用済みの印は残す側を優先する**
（統合で所属が勝手に変わらないようにするため）。タレント情報は 1:1 のため
両方にある場合は例外で止める。吸収した側は `deleted_at` + `merged_into_contact_id`。

### 21.6 マイグレーション

| ファイル | 内容 |
|---|---|
| `20260801000001_create_business_cards.sql` | テーブル・RLS・`apply_business_card_as_current` |
| `20260801000002_business_card_resolution.sql` | `is_mobile_phone` / `resolve_or_create_contact` 改訂 / `record_business_card` |
| `20260801000003_backfill_business_cards.sql` | 既存リード・連絡先から名刺 756 枚を復元。活動記録の文言も実態に合わせて修正 |
| `20260801000004_create_contact_merge_candidates.sql` | 統合候補と検出関数 |
| `20260801000005_merge_contacts.sql` | 統合の下見と実行 |
| `20260801000006_import_eight_business_cards.sql` | 取込で名刺を記録し、統合候補を検出 |

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

**登録番号は取引の主体に紐づく情報であり、個人の属性ではない。**

| テーブル | 状態 |
|---|---|
| `accounts` | **新設**。取引先ごとの登録番号（個人事業主の取引先でも持てる） |
| `companies` | 維持。法人としての登録番号 |
| `contacts` | **廃止**（実データ 0 件） |

登録の有無は番号の有無から導出する（チェックボックスは持たない）。

### 22.3 画面での扱い

| 画面 | 位置 |
|---|---|
| 連絡先詳細 | 住所は**基本情報**の中（連絡先セクションは連絡手段だけを扱う）。プロファイル（生年月日・血液型・星座・ポテンシャル）は**右カラム** |
| 連絡先・法人情報の編集 | `AddressesEditor` で行単位に追加・削除・主住所の切り替え。本体の保存とは独立して即時反映 |
| 新規作成 | 住所は登録しない（紐付けに相手の ID が要るため、作成後に編集画面から登録する旨を表示） |
