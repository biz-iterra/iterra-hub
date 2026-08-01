# 連絡先の同一性と所属履歴（名刺の異動・転職対応）

名刺は「ある時点における、その人の所属のスナップショット」である。
人は変わらないが所属は変わる、という前提でモデルを組み直す。

対象は `contacts`（連絡先）と、名刺 CSV 取込（`docs/lead-import-eight.md`）の判定部分。

## 1. 現状の問題

`contacts` は所属を単一の値で持つ（`company_id` / `department` / `job_title`）。
履歴を残す構造が無いため、次の不具合がある。

| 場面 | 現状の挙動 | 問題 |
|---|---|---|
| 転職後の名刺を取り込む | 「会社 × 姓名一致」が外れて**別人として新規作成** | 同一人物が二重に存在する。過去のやり取りが分断される |
| 異動後の名刺を取り込む | 部署・役職は空欄補完のみで**更新されない** | 旧部署のまま残り、宛先が誤る |
| 旧所属の情報 | 上書きされれば失われる | いつまでどこに在籍していたかが追えない |

名刺交換日（`exchanged_on`）という**時点の情報を持っているのに使っていない**点が本質。

## 2. 決定事項

| 論点 | 決定 |
|---|---|
| 姓名一致のみ（メール・電話が一致しない） | **別人として取り込み、統合候補として画面に出す。** 自動統合はしない |
| 転職を検知したときの旧リード | **そのまま残し、新所属のリードを別に作る。** 旧職場の案件が後任に引き継がれる可能性があるため |
| 名刺と CRM 手修正値の競合 | **所属 3 項目（会社・部署・役職）だけ名刺を優先。** 他は現行どおり空欄補完 |

誤統合は元に戻すのが難しく、分かれているものを後から繋ぐ方が安全、という判断で一貫させる。

## 3. データモデル

### 3.1 `contact_affiliations`（新設 / T-XX）

人と所属の関係を時系列で持つ。

| カラム | 型 | 説明 |
|---|---|---|
| `id` | UUID PK | |
| `contact_id` | UUID NOT NULL | → `contacts` ON DELETE CASCADE |
| `company_id` | UUID | → `companies`。法人が特定できない名刺は NULL |
| `company_name_raw` | TEXT | 名刺に書かれていた会社名。`company_id` が NULL のときの手掛かり |
| `department` | TEXT | |
| `job_title` | TEXT | |
| `started_on` | DATE | 在籍を確認できた最古の日（名刺交換日）。不明なら NULL |
| `ended_on` | DATE | 次の所属が判明した時点で入る。在籍中は NULL |
| `is_current` | BOOLEAN NOT NULL | 現在の所属。`contact_id` ごとに 1 行だけ |
| `source` | TEXT NOT NULL | `business_card` / `manual` / `email` / `import` |
| `source_record_id` | UUID | `lead_import_records.id` 等。どの名刺由来か辿れるように |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

```sql
-- 現在の所属は 1 人 1 つ（兼務は扱わない。§11）
CREATE UNIQUE INDEX uq_contact_affiliations_current
  ON contact_affiliations (contact_id) WHERE is_current;

CREATE INDEX idx_contact_affiliations_contact ON contact_affiliations (contact_id);
CREATE INDEX idx_contact_affiliations_company ON contact_affiliations (company_id);
```

RLS は親の `contacts` の `owner_user_id` を参照する（従属テーブルの規約どおり）。
履歴だが **UPDATE を許可する**（`ended_on` / `is_current` の更新が必要なため）。
DELETE は admin のみ（誤記録の修正用）。

### 3.2 `contacts` の既存カラムの位置づけ

`company_id` / `department` / `job_title` は **`is_current = true` の所属のキャッシュ**として残す。

- 既存の画面・検索・RLS・`resolve_or_create_contact` を壊さない
- 一覧で毎回 JOIN しなくて済む
- 更新は所属を書き換える DB 関数の中でのみ行い、**アプリから直接更新しない**

整合性は `contact_affiliations` を正本とし、キャッシュがずれたら所属側から再構築できるようにする。

### 3.3 `contacts` への追加カラム

| カラム | 型 | 用途 |
|---|---|---|
| `merged_into_contact_id` | UUID → `contacts` | 統合で吸収された側に入る。参照を辿れるようにする |

統合された側は物理削除せず `is_active = false` + `merged_into_contact_id` で閉じる（削除ポリシー）。

### 3.4 `contact_merge_candidates`（新設 / Phase B）

| カラム | 型 | 説明 |
|---|---|---|
| `id` | UUID PK | |
| `contact_id` | UUID NOT NULL | 既存側 |
| `candidate_contact_id` | UUID NOT NULL | 新しく作られた側 |
| `reason` | TEXT NOT NULL | `same_name_diff_company` / `same_mobile` 等 |
| `detail` | JSONB | 一致した項目・食い違った項目 |
| `status` | TEXT NOT NULL | `pending` / `merged` / `rejected` |
| `decided_by_user_id` / `decided_at` | | 判断の監査証跡 |

`UNIQUE (contact_id, candidate_contact_id)`。同じ組を何度も出さない。

## 4. 人物の同定

`resolve_or_create_contact` を次の順で判定する。**上の段で決まったら下は見ない。**

| 段 | 条件 | 判定 | 根拠 |
|---|---|---|---|
| P1 | `contact_emails` にメールが完全一致 | 同一人物 | 最も確実 |
| P2 | `contact_phones` に**携帯番号**が一致 かつ 姓が一致 | 同一人物 | 携帯は転職しても変わらない |
| P3 | 会社 × 姓 × 名 が一致 | 同一人物 | 現行の判定 |
| P4 | 姓 × 名 が一致（会社が違う）かつ カナが一致 or 一方が空 | **別人として作り、統合候補に記録** | 同姓同名の誤統合を避ける |
| — | 上記以外 | 新規作成 | |

**P2 は携帯番号に限る。** 代表電話で判定すると同じ会社の全員が一致してしまう。
判定は DB 関数 `is_mobile_phone(TEXT)` を正本とし（`070` / `080` / `090` 始まりの 11 桁）、
TS 側は取込プレビュー表示のために同じ判定を持つ。

**P4 でカナを見るのは誤検知を減らすため。** 「田中 太郎」は実在の別人が多い。
カナが両方あって違えば候補にもしない。

## 5. 転職・異動の反映

同一人物と判定できた後、名刺の所属 B（交換日 D）と現在の所属 A を比べる。

```
A が無い                     → B を is_current で作る
B の会社・部署・役職が A と同じ → 何もしない
D が不明（NULL）              → 履歴に is_current=false で残すだけ。現在の所属は動かさない
D <= A.started_on            → 過去の名刺。履歴に残すだけ（ended_on = A.started_on - 1 day）
D >  A.started_on            → 所属変更として反映（下記）
```

所属変更の反映:

1. `A.ended_on = D - 1 day`（`A.started_on` を下回らないようガード）、`A.is_current = false`
2. B を `started_on = D` / `is_current = true` で追加
3. `contacts` のキャッシュ 3 項目を B の値で更新
4. 会社が変わった場合は `contacts.contact_type` を再判定（`company_id` が付けば `employee`）

**転職と異動の区別**は「`company_id` が変わったか」だけ。データ構造上の扱いは同じで、
画面表示と通知の文言が変わる。

**古い名刺で現在の所属が巻き戻らない**のがこの設計の要点。名刺は交換日順に届くとは限らない。

## 6. リードの扱い

転職を検知した場合:

- **新所属のリードを新規に作る。** 外部キー（`source_external_key`）は新しい名刺のもの
- **旧リードはそのまま残す。** ステージ・ステータスも動かさない
- 旧リードに `lead_activities` を 1 件自動記録する（種別 `memo`、本文「担当者が〇〇株式会社へ転職（名刺交換日: YYYY-MM-DD）」）。
  後任へのアプローチを検討できるように、気付ける形で残す
- 両リードの `contact_id` は**同じ人物**を指す。連絡先詳細からは両方が見える

異動（同じ会社内）の場合はリードを増やさない。既存リードの担当者情報を更新する。

## 7. 値の優先ルール

| 項目 | 規則 |
|---|---|
| 会社・部署・役職 | **交換日が現在の所属の開始日より新しければ上書き。** 古ければ履歴にのみ残す |
| メール・電話 | **追加**（`contact_emails` / `contact_phones` は複数持てる）。旧アドレスも残す |
| 氏名・カナ | 空欄補完のみ（改姓は手作業で判断する。§11） |
| 住所・URL・その他 | 空欄補完のみ（現行どおり） |

メールは追加時にラベルを付け直す。**旧所属のドメインのメールは `is_primary` を外す**
（現所属のドメインと一致するものを優先）。連絡が旧アドレスへ飛ぶのを防ぐ。

## 8. 取込フローへの反映

**ドライランと取込結果で出せる情報が違う。** 判定に必要な法人の名寄せ
（`resolve_or_create_company`。メールドメインが一次キー）は法人を**作る**処理でもあり、
ドライランでは走らせられない。会社名の文字列比較で代用すると実際の判定とずれるため、
ドライランでは踏み込まず、確定した区分は取込後に出す。

ドライランで出すもの:

| 区分 | 意味 |
|---|---|
| 新規 | 外部キーが既存リードと一致しない |
| 更新 | 一致する（空欄のみ補完される） |
| **同姓同名あり** | 姓名が一致する連絡先が既にある。**別人として取り込まれる**旨と、名刺側・既存側の所属先を併記して一覧で出す |
| スキップ | エラー行 |

取込結果で出すもの:

| 区分 | 由来 |
|---|---|
| **転職** | `apply_contact_affiliation` が `transferred` を返した数 |
| **異動** | 同 `reassigned` の数 |
| **統合候補** | `detect_contact_merge_candidates` が記録した組の数（一覧への導線付き） |

同姓同名の事前確認は、取り込む前に「別人として増える」ことに気付けるようにするのが目的。
姓名の一致は文字列だけで確定するため、この判定はドライランでも正確に出せる。

## 9. 統合（マージ）

`merge_contacts(p_keep UUID, p_merge UUID, p_actor UUID)` を DB 関数として実装する。
複数テーブルへの書き込みなので単一トランザクションにする（データ整合性の規約）。

付け替え対象:

| テーブル | 備考 |
|---|---|
| `contact_emails` / `contact_phones` | `UNIQUE (contact_id, email/phone)` の衝突は読み飛ばす |
| `contact_affiliations` | 期間で並べ直し、`is_current` は交換日が最新の 1 行だけ残す |
| `account_contacts` | 衝突は読み飛ばす |
| `leads` / `deals` / `contracts` | 付け替え |
| `talents` | **1:1 制約あり。** 両方にあれば例外を投げて手動判断に回す |
| `financial_info` / `other_addresses` | 付け替え |
| `activity_logs` / `deal_activities` / `contact_change_histories` | 履歴なので付け替えて残す |
| `email_message_contacts` / `email_contact_candidates` | 衝突は読み飛ばす |
| `companies.primary_contact_id` | 付け替え |

統合された側は `is_active = false` + `merged_into_contact_id = p_keep`。物理削除しない。
`entity_change_logs` にはトリガーで自動記録される（アプリから INSERT しない）。

**統合は取り消せない前提で作る。** 確認ダイアログで、消える側・残る側と
付け替わる件数を明示してから実行する。

## 10. フェーズ分け

| Phase | 内容 | 状態 |
|---|---|---|
| **A** | `contact_affiliations` 新設 / 既存データからの初期投入 / P2 の携帯判定追加 / 転職・異動の反映 / 連絡先詳細に所属履歴セクション | **完了**（2026-08-01） |
| **B** | `contact_merge_candidates` / P4 の候補記録 / ドライランの同姓同名表示 / 統合候補の一覧画面 | **完了**（2026-08-01） |
| **C** | `merge_contacts` / 統合 UI | **完了**（2026-08-01） |

Phase A の初期投入は、既存 `contacts` の現在値から `is_current = true` の行を 1 件ずつ作る。
`started_on` は取込済み名刺があれば最古の交換日、無ければ `contacts.created_at` の日付。

## 11. 未決事項

- **兼務・複業**: 現在の所属を 1 つに限定している。役員兼任などが実務で出てきたら
  `is_current` の一意制約を外し、主たる所属のフラグを別に持つ形へ広げる
- **改姓**: 姓が変わると P1（メール）か P2（携帯）でしか同定できない。
  旧姓を持つカラムは今回作らない
- **会社の統廃合**: 会社側が合併した場合の `companies` の統合は別テーマ
- **P2 の携帯番号**: 会社支給の携帯を退職時に返却するケースでは、番号が別人に再割当される
  可能性がある。実務で問題が出たら「姓 + 名」の一致も条件に足す
