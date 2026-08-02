# コーポレートサイトの問い合わせ取込

コーポレートサイト（`corporate-iterra`）のフォーム送信を CRM のリードとして取り込む。

## なぜ「参照」ではなく「取込」なのか

D1 を都度参照する形も考えられるが、リードはスコアリング・ステージ・担当者・
社内対応の記録が CRM 側に乗る。参照だけではそれらを持てないので、
**CRM の `leads` へ移し替える**。

## なぜ CRM から取りに行くのか

サイト側の Worker から CRM へ push する形（即時）もあるが、

- CRM が落ちている間の送信を取りこぼす。リカバリの仕組みが別に要る
- CRM 側にエンドポイントを公開することになり、Cloudflare Access の Bypass が要る
- サイト側（`workers/contact.ts`）に手を入れることになる

D1 に残っていれば次の実行で拾えるので、**CRM から定期的に取りに行く**。
Gmail の定期同期（`/api/gmail/sync`）と同じ枠組みに乗せている。

## 取得元

| | |
|---|---|
| D1 データベース | `corporate-iterra-leads`（本番） / `corporate-iterra-leads-stg`（STG） |
| テーブル | `leads` |
| 定義 | `corporate-iterra/migrations/0001_create_leads.sql` |

```
leads(id, form_type, label, email, name, company, tel, source,
      is_first, detail_json, created_at)
```

- `form_type` … `lp-consult`（無料相談 LP） / `contact`（お問い合わせフォーム）
- `label` … `consult` / `hands-on` / `learning` / `recruit` / `other`
- `name` … 「姓 名」を結合した 1 つの値
- `detail_json` … フォーム固有項目（添付ファイルは入らない）

## 対応関係

| D1 | CRM |
|---|---|
| `id` | `lead_customer_activities.source`（`inquiry:<id>`） |
| `company` | `leads.company_name`（略記は正式表記に開く） |
| `name` | `contact_last_name` / `contact_first_name`（空白で分割） |
| `email` | `contact_email`（小文字に揃える） |
| `tel` | `contact_phone` |
| `form_type` / `label` / `source` / `detail_json` | 顧客行動の本文 |
| `created_at` | `lead_customer_activities.occurred_at` |

リード名は **会社名 → 氏名 → メール** の順に採る（一覧に「無題」を並べないため）。

既定値はマスタから引く。

| 項目 | 値 |
|---|---|
| ステージ | 獲得（`generation`） |
| ステータス | 未着手（`not_started`） |
| リードソース | Web問い合わせ（`web_form`） |
| 顧客行動 | 問合せフォーム送信（`form_submit`） |
| 担当者 | `INQUIRY_SYNC_OWNER_EMAIL`。未設定なら最初の管理者 |

## 同じ人から 2 回目が来たとき

**新しいリードは作らない。** メールアドレスで既存のリードを探し、
見つかれば**顧客行動だけを足す**。問い合わせのたびにリードが増えると
追客の状態が分散してしまうため。

取り込み済みかどうかは `lead_customer_activities.source` に入れた
`inquiry:<D1 の id>` で判断する。リード側の `source_external_key` では足りない
（1 つのリードに複数回の問い合わせが載るため）。

何度実行しても結果は同じになる。

## 実行

```bash
docker exec iterra-hub-app wget -qO- --post-data='' \
  --header="Authorization: Bearer $INQUIRY_SYNC_CRON_SECRET" \
  http://127.0.0.1:3000/api/leads/inquiry-sync
```

戻り値は `{ fetched, batch_id, created, appended, skipped }`。
取込の記録は `lead_import_batches`（`source_slug = 'inquiry'`）に残る。

コンテナはポートを公開していないので外から到達する経路は無い。それでも
合言葉を要求するのは、同一ホスト上の別プロセスから叩ける状態を残さないため。

## 設定

`.env` に入れる（`docs/secrets-management.md` の台帳にも追記すること）。

| キー | 取得元 |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare ダッシュボードの右下、または URL の `/accounts/<id>` |
| `CLOUDFLARE_D1_DATABASE_ID` | Workers & Pages → D1 → `corporate-iterra-leads` |
| `CLOUDFLARE_API_TOKEN` | **corporate-iterra の本番アカウント API トークンをそのまま使う**（既に D1 Edit を持つ）。アカウント API トークンは環境ごとに 1 本にまとめる方針で、用途ごとに発行しない。→ `docs/secrets-management.md` の同値グループ |
| `INQUIRY_SYNC_CRON_SECRET` | 自分で生成する（自分のターミナルで作り Bitwarden へ登録） |
| `INQUIRY_SYNC_OWNER_EMAIL` | 任意。取り込んだリードの担当者 |

3 つの `CLOUDFLARE_*` がそろわないとエンドポイントは 503 を返す。

## 実装

| ファイル | 役割 |
|---|---|
| `src/lib/d1.ts` | D1 REST API の読み取り |
| `src/lib/leads/inquiry-import.ts` | D1 の行を CRM の形へ（純粋関数・Vitest あり） |
| `src/app/api/leads/inquiry-sync/route.ts` | 入口。合言葉の確認と既定値の解決 |
| `20260802000011_import_inquiry_leads.sql` | 取込本体（単一トランザクション） |

## 積み残し

- 全件を読んで取り込み済みを DB 側で弾いている。問い合わせは多くても
  年に数百件なので足りるが、**増えてきたら `created_at` で絞ること**
- STG の D1（`corporate-iterra-leads-stg`）は取り込んでいない。
  検証で使うなら `CLOUDFLARE_D1_DATABASE_ID` を差し替える
