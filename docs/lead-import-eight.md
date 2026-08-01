# Eight 名刺データ取込 設計

Sansan の名刺アプリ **Eight** からエクスポートした CSV を Lead として取り込む機能の設計。

実データ（2026-07-30 提供分・922 行）の解析に基づく。

## 1. 前提

### 取得経路は CSV のみ

| 経路 | 可否 |
|---|---|
| Eight API | **提供なし**。API を持つのは法人向け Sansan |
| Eight プレミアムの CSV ダウンロード | **これを使う**。月 400 円 / 年 4,000 円 |
| Eight Team の共有名刺一括ダウンロード | 法人契約時のみ。今回は対象外 |

**契約形態: Eight プレミアム（個人）。** 列構成は本書の内容で確定。

### ファイル仕様（実測）

| 項目 | 値 |
|---|---|
| 文字コード | **Shift_JIS (cp932)**、BOM なし |
| 列数 | 18（固定・ヘッダあり） |
| 行数 | 922（サンプル） |
| 改行 | CRLF |

BOM が無いため、**エンコーディングは推測せず cp932 を第一候補にする**。UTF-8 でエクスポートされた場合にも備え、`cp932` でデコード失敗したら `utf-8-sig` → `utf-8` の順にフォールバックする。逆順（UTF-8 優先）にすると Shift_JIS が化けずに通ってしまう場合があるため、順序を守る。

## 2. Eight CSV の列と充填率（実測）

| # | 列名 | 充填率 | 形式・備考 |
|---|---|---|---|
| 0 | 会社名 | 95% | 46 行が空 |
| 1 | 部署名 | 31% | |
| 2 | 役職 | 82% | |
| 3 | 姓 | 99% | **姓名は分離済み**。分割処理は不要 |
| 4 | 名 | 98% | |
| 5 | e-mail | 89% | 99 行が空 |
| 6 | 郵便番号 | 89% | `999-9999` |
| 7 | 住所 | 91% | **1 列に都道府県〜建物名までまとめて** |
| 8 | TEL会社 | 71% | `99-9999-9999` 他 4 形式 |
| 9 | TEL部門 | 0% | 実データは全行空 |
| 10 | TEL直通 | 0.1% | 1 行のみ |
| 11 | Fax | 50% | |
| 12 | 携帯電話 | 70% | `999-9999-9999` が大半、`+81-` 形式が 8 件 |
| 13 | URL | 50% | `http://` 302 / `https://` 160 |
| 14 | 名刺交換日 | **100%** | `YYYY/MM/DD` |
| 15 | Eightでつながっている人 | 25% | 値は `1` のみ（フラグ） |
| 16 | 再データ化中の名刺 | 0% | 品質フラグ。将来値が入りうる |
| 17 | '?'を含んだデータ | 0% | 同上 |

**カナ列は存在しない。** `company_name_kana` / `contact_*_kana` は空のままとなる。

## 3. スキーマ変更

### 3.1 方針：3 層に分ける

名刺以外の流入経路が増えてもカラム追加を繰り返さないため、取り込む値を性質で分ける。

| 層 | 対象 | 置き場所 |
|---|---|---|
| (1) 構造が確定した共通項 | 住所（郵便番号・都道府県・市区町村・番地・建物） | **`addresses` テーブル**を新設し `leads` から参照 |
| (2) 出典依存の生データ | Fax、Eight フラグ、品質フラグ、未マッピング列すべて | **`lead_import_records.raw` (jsonb)** に CSV 1 行をそのまま保持 |
| (3) 業務で使うと決まった値 | 名刺交換日、リードソース | 既存テーブル（`lead_activities` / `lead_sources`） |

(2) があるため、**「あの項目が必要だった」となっても Eight から再エクスポートせずに `raw` から backfill できる。** カラムを追加するかどうかの判断を、必要性が確認できるまで遅らせられる。

`leads` 本体に `extra_attributes jsonb` を持たせて何でも入れる形は採らない。CLAUDE.md の「DB 型定義は生成物を使う。存在しないカラム参照をビルドで検出するための措置」が効かなくなるため。`raw` の jsonb は**出典の記録**であって業務データの置き場ではない、という切り分けを守る。

### 3.2 `addresses`（新規）

```sql
CREATE TABLE addresses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  postal_code   text,
  prefecture    text,
  city          text,
  address_line1 text,
  address_line2 text,
  -- 名刺の住所は 1 列にまとまっており、分割に失敗する行がある（実測 35/839）。
  -- 原文を必ず残し、分割結果は補助情報として扱う。
  raw_text      text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES crm_users(id),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  last_updated_by uuid REFERENCES crm_users(id)
);

ALTER TABLE leads ADD COLUMN address_id uuid REFERENCES addresses(id);
```

`companies` / `contacts` にも同じ 5 カラムが**既に重複して存在する**。将来それらを `addresses` へ寄せれば重複が解消できるが、本番稼働中のため**まず `leads` から使い始め、既存 2 テーブルの移行は別フェーズとする**。

昇格時は値をコピーせず `address_id` を `companies` へ引き継ぐだけで済む（`promote_lead_to_deal` の変更は 1 列分）。

### 3.3 取込レコード（新規）

```sql
CREATE TABLE lead_import_batches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_slug text NOT NULL,              -- 'eight'
  file_name   text NOT NULL,
  encoding    text NOT NULL,              -- 実際に成功したエンコーディング
  row_count   int  NOT NULL,              -- CSV の行数
  created_count  int NOT NULL DEFAULT 0,
  updated_count  int NOT NULL DEFAULT 0,
  skipped_count  int NOT NULL DEFAULT 0,
  error_count    int NOT NULL DEFAULT 0,
  imported_by uuid NOT NULL REFERENCES crm_users(id),
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lead_import_records (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id     uuid NOT NULL REFERENCES lead_import_batches(id) ON DELETE CASCADE,
  lead_id      uuid REFERENCES leads(id),   -- 作成/更新された Lead。エラー行は NULL
  row_number   int  NOT NULL,               -- CSV 上の行番号（エラー報告用）
  external_key text,
  raw          jsonb NOT NULL,              -- CSV 1 行を列名→値で保持
  outcome      text NOT NULL,               -- 'created' | 'updated' | 'skipped' | 'error'
  error_reason text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lead_import_records_batch_idx ON lead_import_records(batch_id);
CREATE INDEX lead_import_records_lead_idx  ON lead_import_records(lead_id);
```

### 3.4 冪等性キー

```sql
ALTER TABLE leads ADD COLUMN source_external_key text;

-- 同じ名刺を二重に取り込まない。論理削除済みは対象外にする
CREATE UNIQUE INDEX leads_source_external_key_uniq
  ON leads(source_external_key)
  WHERE source_external_key IS NOT NULL AND deleted_at IS NULL;
```

キーの決め方：

1. `e-mail` があれば `eight:mail:<小文字化・trim したアドレス>`
2. なければ `eight:hash:<sha256(正規化会社名 + '|' + 姓 + '|' + 名) の先頭 16 桁>`

実測では**メール由来 710 件 / ハッシュ由来 92 件**。メールなし 99 行があるためフォールバックは必須。

### 3.5 マスタ追加

```sql
-- リードソース
INSERT INTO lead_sources (name, definition, slug)
  VALUES ('Eight', '名刺アプリ Eight からの取込', 'eight');

-- 対応種別（名刺交換を履歴として記録するため）
INSERT INTO lead_activity_types (code, name, color, sort_order)
  VALUES ('card_exchange', '名刺交換', '#8FA9C4', 6);

-- 獲得ステージの新ステータス（既存の list_ready「リスト化済」は架電リスト用のため分ける）
INSERT INTO lead_statuses (stage_id, code, name, sort_order)
  SELECT id, 'card_exchanged', '名刺交換済', 5
    FROM lead_stages WHERE slug = 'generation';

-- スコアリング：名刺交換は接点があるため Web フォーム流入と同等以上に評価する
INSERT INTO lead_score_rules (category, condition_type, condition_value_id, score_delta, description, sort_order)
  SELECT 'attribute', 'lead_source', id, 10, 'Eight 名刺交換', 99
    FROM lead_sources WHERE slug = 'eight';
```

## 4. マッピング

| Eight 列 | → 保存先 | 変換 |
|---|---|---|
| 会社名 | `leads.company_name` | `normalizeCompanyName()`（㈱→株式会社 等） |
| 会社名 or 氏名 | `leads.lead_name` | 会社名があれば会社名、無ければ「姓 名」。**両方空の行はエラー**（実測 3 行） |
| 部署名 | `leads.contact_department` | trim |
| 役職 | `leads.contact_job_title` | trim |
| 姓 / 名 | `leads.contact_last_name` / `contact_first_name` | trim（分割不要） |
| e-mail | `leads.contact_email` | 小文字化・trim |
| TEL直通 ?? 携帯電話 | `leads.contact_phone` | `normalizePhone()`。両方持つ行は実測 0 件なので衝突しない |
| TEL会社 | `leads.company_phone` | `normalizePhone()` |
| URL | `leads.url` | そのまま保持。`extractDomain()` は重複判定に使う |
| 郵便番号 + 住所 | `addresses`（`leads.address_id`） | 後述のパース |
| 名刺交換日 | `lead_activities` を 1 件作成 | `YYYY/MM/DD` → `called_on`（date） |
| Fax | `lead_import_records.raw` のみ | 昇格時に `companies.fax` へ転記 |
| Eightでつながっている人 | `raw` のみ | 将来スコアリングに使うなら正規化を検討 |
| 再データ化中の名刺 / '?'を含んだデータ | `raw` のみ | 値が入っている行は取込結果に警告を出す |
| — | `leads.lead_source_id` | `slug = 'eight'` |
| — | `leads.stage_id` / `status_id` | 獲得 / 名刺交換済 |
| — | `leads.owner_user_id` | 取込 UI で選択（既定＝実行者） |
| — | `leads.source_external_key` | § 3.4 |

### 住所のパース

住所は 1 列に都道府県〜建物名までまとまっている。

```
prefecture    ← /^(北海道|東京都|京都府|大阪府|.{2,3}県)/ にマッチした部分
city          ← 続く /.+?[市区町村]/
address_line1 ← 残り
address_line2 ← （名刺は建物名も同じ列にあるため分けない。line1 に含める）
raw_text      ← 住所列の原文（必ず保持）
```

実測：都道府県を切り出せた **804 / 839**。失敗 35 行は名刺側で都道府県が省略されているもの（`墨田区江東橋…` `堺市西区…` `神戸市中央区…` 等）。

**失敗時は `prefecture` を NULL にし、`address_line1` に住所全文を入れる。** 市区町村名からの都道府県逆引き辞書は持たない（35 件のために辞書を抱えるのは過剰で、政令指定都市の同名区で誤判定するリスクがある）。`raw_text` があるため情報は失われず、必要なら画面から手で補正できる。

## 5. 重複と統合

CSV 922 行から作られる Lead は **802 件**（120 行が統合される）。同じ人と複数回名刺交換した場合に行が増えるため。

### 判定の段階

**リード（`leads`）と連絡先（`contacts`）で判定が別。** リードは「会社 × 人の案件」なので
転職したら別リードになるのが正しく、連絡先は「人」なので転職しても 1 件に寄せる。

リード側 — 外部キー（`source_external_key`）の一致だけで判定する。

| 段 | 条件 | 挙動 |
|---|---|---|
| L1 | `source_external_key` が既存リードと一致 | **空欄のみ補完**。既存値は上書きしない |
| L2 | 一致しない | 新規作成 |

外部キーは「メールがあればメール、無ければ正規化会社名 + 姓 + 名のハッシュ」
（`buildExternalKey()`）。会社名と氏名の一致は L2 相当としてキーに織り込まれている。

連絡先側 — `resolve_or_create_contact` が 3 段階で人を同定する
（詳細と設計の背景は `docs/contact-identity.md § 4`）。

| 段 | 条件 | 挙動 |
|---|---|---|
| P1 | メールが `contact_emails` と一致 | 同一人物 |
| P2 | **携帯番号**が一致 + 姓が一致 | 同一人物（転職しても携帯は変わらないため） |
| P3 | 会社 × 姓 × 名 が一致 | 同一人物 |
| — | 上記以外 | 新規作成（同じ会社の別人はここ。実測 144 社が複数名刺・最大 8 枚） |

**既存値を上書きしないのが原則。** CRM 側で更新した情報を、古い名刺の値で巻き戻さないため。
**所属（会社・部署・役職）も取込では書き換えない。** 名刺は `business_cards` に
1 枚ずつ記録し、どれを現在の所属とするかは人が選ぶ（`docs/contact-identity.md § 6`）。

CSV の「名刺交換日」は**利用者が Eight にデータを登録した日**であり、名刺を受け取った日でも
在籍期間でもない。過去の名刺を後からまとめて登録すると登録日が最新になるため、
**この日付を所属の順序の根拠にしない**。

### CSV 内の重複

同一キーで複数行あるもの：**100 件（最大 6 行）**。うち**交換日が異なるもの 55 件**。

- Lead は **1 件**にまとめる
- **属性は「名刺交換日が最新の行」を採用**する（転職・異動後の情報を優先）
- **`lead_activities` は行ごとに全件作成**する。いつ何回接点があったかが履歴として残る

同一メールで会社名が異なる行が **24 件**ある（転職または表記揺れ）。最新日の会社名を採用し、旧社名は `raw` に残る。
連絡先側では、この 24 件は `business_cards` に別々の名刺として残る（連絡先の現在の所属は変わらない）。

## 6. 取込フロー

既存の実装パターン（`git show c6e1273^:src/actions/deals/inside-sales-import.ts`）を踏襲する。

```
1. CSV アップロード
2. dry-run
   - デコード（cp932 → utf-8-sig → utf-8）
   - ヘッダ検証（18 列・列名一致。位置ではなく列名でマッピングする）
   - 行ごとにパース・正規化・重複判定
   - プレビュー: 新規 N / 更新 M / スキップ K / エラー E ＋ エラー行の一覧（行番号付き）
3. commit
   - lead_import_batches を 1 件作成
   - addresses → leads → lead_activities → lead_import_records の順に bulk insert
   - chunkedInsert で分割（実測 922 行 + activity 922 行 = 約 1,844 行）
   - 完了後にスコア再計算（recalculate_lead_score）
```

### 権限とクライアント

- **admin 限定**。`role !== "admin"` は拒否
- 1,000 行超の bulk insert は RLS 経由で `statement_timeout` に達するため **`createAdminClient()`（service_role）を使う**（既知の制約。メモリ `feedback_rls_bulk_insert` 参照）
- service_role は RLS をバイパスするので、**Server Action 側で admin チェックを必ず先に通す**

### トランザクション

`addresses` → `leads` → `lead_activities` は関連する複数テーブルへの書き込みなので、CLAUDE.md の規約に従い **PL/pgSQL 関数にまとめて `.rpc()` で呼ぶ**。TS 側で値を整形し、書き込みは DB 側で行う（`promote_lead_to_deal` と同じ分担）。

## 7. 例外処理

| ケース | 実測 | 挙動 |
|---|---|---|
| 会社名も氏名も空 | 3 行 | **エラー**。`outcome = 'error'` で記録し取込しない |
| 会社名が空 | 46 行 | 氏名を `lead_name` に使う |
| 姓名が両方空 | 7 行 | 会社名を `lead_name` に使う |
| メールなし | 99 行 | ハッシュキーで冪等性を担保 |
| 住所の都道府県が省略 | 35 行 | `prefecture` を NULL、全文を `address_line1` へ |
| 電話の形式ばらつき | 4 形式 | `normalizePhone()` で統一 |
| `+81-` 形式の携帯 | 8 行 | `normalizePhone()` で国番号を `0` に変換 |
| 「再データ化中」「'?'を含む」に値あり | 0 行 | 取込はするが**プレビューで警告**（データ品質が低い名刺） |

## 8. 実装フェーズ

| # | 内容 | 成果物 |
|---|---|---|
| 1 | マイグレーション | `addresses` / `lead_import_batches` / `lead_import_records` / `leads.address_id` / `leads.source_external_key` / マスタ 4 種 |
| 2 | 正規化ヘルパー復活 | `src/lib/leads/import-helpers.ts`（`parseCsv` / `normalizeCompanyName` / `extractDomain` / `normalizePhone` / `normalizeDate` ＋ **`decodeCsv`（エンコーディング判定）** と `parseAddress` を新規追加） |
| 3 | DB 関数 | `import_eight_leads(p_batch jsonb, p_rows jsonb)` — 単一トランザクション |
| 4 | Server Action | `dryRunEightImport` / `commitEightImport`（admin 限定・service_role） |
| 5 | UI | `/admin/leads/import`（アップロード → プレビュー → 実行） |
| 6 | テスト | Vitest（`parseAddress` / `normalizePhone` / 外部キー生成 / 重複統合ロジック） |

### テストで固定すべきケース

- `parseAddress`: 都道府県あり / 省略（`墨田区…`） / 政令指定都市（`堺市西区…`） / 空
- `normalizePhone`: `99-9999-9999` / `999-999-9999` / `9999-99-9999` / `99999999999` / `+81-` 形式
- 外部キー: メールあり / なし（ハッシュ） / メールの大文字小文字・前後空白
- 重複統合: 同一キー 6 行を 1 Lead + 6 activity にまとめる / 最新交換日の属性が採用される

## 9. 個人情報の取り扱い

- **CSV 実ファイルはリポジトリに置かない。** 取込は画面からのアップロードのみ
- `lead_import_records.raw` は名刺の全項目を保持する。RLS は `leads` と同等の可視性に揃え、**admin 以外は SELECT 不可**とする
- 誰がいつ何件取り込んだかは `lead_import_batches` に残る。Lead 自体の変更履歴は `entity_change_logs` のトリガーが自動記録する
