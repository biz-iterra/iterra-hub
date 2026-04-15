# ITERRA CRM (iterra-hub) データベース設計書

## 1. Context

ITERRAの営業・取引管理CRMシステムを新規構築する。現在スプレッドシートで管理しているデータをSupabase（PostgreSQL）に移行し、Next.js 15のWebアプリケーションとして提供する。

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
| M03 | 事業者種別 | `corporate_types` | 法人/個人事業主等 | 静的マスタ |
| M04 | サービス | `services` | ITERRAが提供するサービス | 静的マスタ |
| M05 | リードソース | `lead_sources` | 顧客獲得経路 | 静的マスタ |
| M06 | アカウント種別 | `account_types` | アカウントの分類 | 静的マスタ |
| M07 | アカウントステータス | `account_statuses` | アカウントの状態 | 静的マスタ |
| M08 | コンタクトステータス | `contact_statuses` | コンタクトの状態 | 静的マスタ |
| M09 | スキルカテゴリ | `skill_categories` | スキルの分類（技術/ビジネス等） | 静的マスタ |
| M10 | スキル | `skills` | 個別スキル定義 | 静的マスタ |

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

### 2.6 中間テーブル（N:M関係）

| # | テーブル論理名 | テーブル物理名 | 関係 |
|---|-------------|-------------|------|
| J01 | ディール×サービス | `deal_services` | Deal N : M Service |
| J02 | アカウント×コンタクト | `account_contacts` | Account N : M Contact |

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

---

## 4. 論理設計（全テーブル詳細）

### 凡例
- **PK**: 主キー, **FK**: 外部キー, **UK**: ユニーク制約, **NN**: NOT NULL
- **型**: PostgreSQLデータ型
- **区分値**: CHECK制約で制限される値のリスト
- **デフォルト**: DEFAULT値
- **バリデーション**: アプリ層(Zod)での追加検証ルール

---

### M01: pipeline_types（パイプライン種別）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | パイプライン名 | `name` | TEXT | | | UK | NN | | | 1-100文字 |
| 3 | パイプライン説明 | `description` | TEXT | | | | | | | max 500文字 |
| 4 | 表示順 | `sort_order` | INTEGER | | | | NN | 0 | >= 0 | |
| 5 | 有効フラグ | `is_active` | BOOLEAN | | | | NN | TRUE | | |
| 6 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |
| 7 | 更新日時 | `updated_at` | TIMESTAMPTZ | | | | NN | NOW() | | トリガー自動更新 |

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

### M03: corporate_types（事業者種別）

| # | 論理名 | 物理名 | 型 | PK | FK | UK | NN | デフォルト | 区分値/CHECK | バリデーション |
|---|--------|--------|-----|----|----|----|----|----------|-------------|-------------|
| 1 | ID | `id` | UUID | PK | | | NN | gen_random_uuid() | | |
| 2 | 事業者種別名 | `name` | TEXT | | | UK | NN | | | 1-50文字 |
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
| 3 | リードソース説明 | `description` | TEXT | | | | | | | max 500文字 |
| 4 | 有効フラグ | `is_active` | BOOLEAN | | | | NN | TRUE | | |
| 5 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |
| 6 | 更新日時 | `updated_at` | TIMESTAMPTZ | | | | NN | NOW() | | トリガー自動更新 |

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
| 3 | 有効フラグ | `is_active` | BOOLEAN | | | | NN | TRUE | | |
| 4 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |
| 5 | 更新日時 | `updated_at` | TIMESTAMPTZ | | | | NN | NOW() | | トリガー自動更新 |

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

**CRUD:** M01と同じパターン。

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
| 10 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |
| 11 | 更新日時 | `updated_at` | TIMESTAMPTZ | | | | NN | NOW() | | トリガー自動更新 |

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
| 3 | 事業者種別ID | `corporate_type_id` | UUID | | FK→M03.id | | | | | |
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
| 23 | 有効フラグ | `is_active` | BOOLEAN | | | | NN | TRUE | | |
| 24 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |
| 25 | 更新日時 | `updated_at` | TIMESTAMPTZ | | | | NN | NOW() | | トリガー自動更新 |

**CHECK:** invoice_registered = FALSE OR invoice_registration_number IS NOT NULL
**INDEX:** name, owner_user_id, corporate_type_id
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
| 21 | ポテンシャル番号 | `potential_number` | INTEGER | | FK→R02.number | | | | 1-60 | |
| 22 | 星座ID | `constellation_id` | UUID | | FK→R01.id | | | | | |
| 23 | リードソースID | `lead_source_id` | UUID | | FK→M05.id | | | | | |
| 24 | LINEユーザーID | `line_user_id` | TEXT | | | UK(NULLable) | | | | |
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
| 8 | アカウントID | `account_id` | UUID | | FK→T03.id | | NN | | | ディールは必ずAccountに紐づく |
| 9 | 取引担当者ID | `owner_user_id` | UUID | | FK→T01.id | | | | | |
| 10 | 契約書名 | `contract_name` | TEXT | | | | | | | max 200文字 |
| 11 | 申請日 | `application_date` | DATE | | | | | | | |
| 12 | 審査完了日 | `review_completed_date` | DATE | | | | | | | application_date以降 |
| 13 | ステージ更新日時 | `stage_updated_at` | TIMESTAMPTZ | | | | | | | ステージ変更時にアプリ層で更新 |
| 14 | クローズ日時 | `closed_at` | TIMESTAMPTZ | | | | | | | |
| 15 | 最終更新者ID | `last_updated_by` | UUID | | FK→T01.id | | | | | |
| 16 | 作成日時 | `created_at` | TIMESTAMPTZ | | | | NN | NOW() | | 更新不可 |
| 17 | 更新日時 | `updated_at` | TIMESTAMPTZ | | | | NN | NOW() | | トリガー自動更新 |

**設計変更点:**
- `account_id` を **必須(NN)** に変更。コンタクトはAccountを介してDealに紐づくため、Dealには必ずAccountが必要
- `primary_contact_id` を **削除**。コンタクトとDealの関係はAccount経由（account_contacts）で表現される
- `contractor_company_name` / `contractor_representative` を **削除**。Account→Companyから取得可能であり、非正規化による整合性リスクを排除。表示時はJOINで取得する

**整合性チェック（アプリ層 Zod + Server Action）:**
1. deal_stage_id のステージが pipeline_type_id に属すること
2. deal_status_id のステータスが pipeline_type_id（+ deal_stage_id）に属すること
3. review_completed_date >= application_date
4. closed_at 設定時はステータスがクローズ系であること
5. account_id のAccountが存在し、is_active=TRUEであること

**INDEX:** pipeline_type_id, deal_stage_id, deal_status_id, account_id, owner_user_id, created_at DESC
**CRUD:**
- CREATE: member以上。deal_codeはトリガーで自動採番
- READ: member=自分の担当のみ、manager/admin=全件
- UPDATE: member=自分の担当のみ、admin=全件。ステージ変更時にstage_updated_at更新、activity_logにも記録
- DELETE: 論理削除不可（deals自体は削除しない運用）。クローズのみ

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

### Phase 2: DBマイグレーション（13ファイル）
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
