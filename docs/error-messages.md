# エラーメッセージ規約と一覧

利用者に見えるエラー文言の**正本**。文言を足すとき・直すときはこの文書を先に更新する。

最終更新: 2026-08-03

## 1. 原則

1. **英語の生エラーを画面に出さない。**
   Zod 既定（`Too small: expected number to be >=0`）、Postgres
   （`null value in column "code" ... violates not-null constraint`）、Gmail API
   （`Requested entity was not found.`）はいずれも利用者が読んで対処できない
2. **何が悪いか＋どうすればよいかを書く。** 「不正な値です」で止めない
3. **入力に紐づくエラーは `[field] 本文` 形式で返す。**
   画面側が `parseFieldError()`（`src/lib/errors.ts`）で分解し、**該当の入力欄の下に
   インライン表示**する。トーストにしない（CLAUDE.md の UI 規約）
4. **入力に紐づかないエラー（権限・競合・通信）はプレフィックス無し**で返す。画面はトーストで出す
5. **原因の切り分けに要る情報は括弧で添える。** 外部 API の原文、判定できなかった DB エラーの原文など
6. **上限・形式は DB の制約と同じ値を書く。** 片方だけ直すと、アプリを通ったのに DB で弾かれる

## 2. どこで文言を作るか

| 層 | 実装 | 役割 |
|---|---|---|
| 入力バリデーション | `src/lib/validators/common.ts`（共通スキーマ）, `masters.ts` ほか | 保存前に弾く。`[field]` 付き |
| DB エラー変換 | `src/lib/db-error.ts` の `toUserMessage()` | Postgres の生エラーを日本語へ。Server Action が `error` を返す前に必ず通す |
| 外部 API | `src/lib/gmail/client.ts` の `describeGmailError()` | Gmail API のエラーを日本語へ。原文を括弧で残す |
| 表示の振り分け | `src/lib/errors.ts` の `parseFieldError()` / `isFieldValidationError()` | インラインかトーストかを決める |

## 3. 入力バリデーション（マスタ共通）

`src/lib/validators/common.ts` の共通スキーマ。全マスタで同じ文言になる。

| 項目 | 条件 | メッセージ |
|---|---|---|
| `code` / `slug` | 未入力・空文字 | `[code] コードを入力してください` / `[slug] スラッグを入力してください` |
| `code` / `slug` | 33 文字以上 | `[code] コードは32文字以内で入力してください` |
| `code` / `slug` | 形式違反（`^[a-z][a-z0-9_]{0,31}$`） | `[code] コードは半角英小文字で始め、半角英数字とアンダースコアのみで入力してください（例: no_prospect）` |
| `name` | 未入力・空文字 | `[name] 名称を入力してください` |
| `name` | 上限超過 | `[name] 名称は{上限}文字以内で入力してください` |
| `definition` | 1001 文字以上 | `[definition] 定義は1000文字以内で入力してください` |
| `color` | 形式違反 | `[color] バッジ色は # と16進数6桁で入力してください（例: #E53935）` |
| `color` | 空欄 | エラーにせず **NULL に正規化**（既定配色にフォールバックする） |
| `sort_order` | 数値でない | `[sort_order] 表示順は数値で入力してください` |
| `sort_order` | 小数 | `[sort_order] 表示順は整数で入力してください` |
| `sort_order` | 負数 | `[sort_order] 表示順は0以上の整数で入力してください` |
| `sort_order` | 空欄 | エラーにせず 0 |
| UUID 参照（`stage_id` 等） | 未選択・形式違反 | `[stage_id] リードステージを選択してください`（呼び出し側が項目名を指定する） |

### 必須の参照カラム

DB が `NOT NULL` の参照カラムは、フォームの選択肢に「（未分類）」を置かない。

| マスタ | 必須カラム |
|---|---|
| `lead_statuses` | `stage_id`, `code` |
| `lead_stages` | `slug` |
| `lead_small_segments` | `large_segment_id`, `code` |
| `lead_large_segments` | `code` |
| `lead_temperatures` / `lead_call_statuses` | `code` |
| `lead_sources` / `pipeline_types` | `slug` |
| `account_statuses` | `code` |
| `deal_stages` / `deal_statuses` | `pipeline_type_id` |
| `skills` | `skill_category_id` |

## 4. DB エラー（`toUserMessage()`）

| SQLSTATE | 事象 | メッセージ |
|---|---|---|
| `23502` | NOT NULL 違反 | `[code] コードは必須です。値を入力してください`（カラム名は `COLUMN_LABELS` で和名化） |
| `23505` | UNIQUE 違反（単一） | `[code] このコードは既に使われています。別の値を入力してください` |
| `23505` | UNIQUE 違反（複合） | `同じリードステージ・コードの組み合わせが既に登録されています。いずれかを変えてください` |
| `23503` | 外部キー違反（削除時） | `他のデータから参照されているため、この{対象}は削除できません` |
| `23503` | 外部キー違反（作成・更新時） | `[stage_id] 選択したリードステージが見つかりません。画面を再読み込みして選び直してください` |
| `23514` | CHECK 違反（`_code_format` / `_slug_format`） | 入力バリデーションと同じ形式説明 |
| `23514` | CHECK 違反（`_color_format`） | `[color] バッジ色は # と16進数6桁で入力してください（例: #E53935）` |
| `23514` | CHECK 違反（`_name_length`） | `[name] 名称の文字数が制限を超えています` |
| `23514` | CHECK 違反（`_sort_order_check`） | `[sort_order] 表示順は0以上の整数で入力してください` |
| `23514` | CHECK 違反（未知の制約） | `入力値が{対象}の制限に合いません（{原文}）` |
| `22001` | 桁あふれ | `入力した文字数が上限を超えています` |
| `22P02` | 型変換の失敗 | `入力形式が正しくありません` |
| `42501` | 権限不足 / RLS | `この操作を行う権限がありません` |
| `57014` | ステートメントタイムアウト | `処理に時間がかかりすぎたため中断しました。対象を絞って再度実行してください` |
| `PGRST116` | 単一行を期待して 0 行 | `対象の{対象}が見つかりません。画面を再読み込みしてください` |
| （なし） | DB 関数の `RAISE EXCEPTION`（日本語） | **そのまま通す**（業務エラーの文言は DB 側が正本） |
| （なし） | 判定できない英語 | `処理に失敗しました（{原文}）` |

新しいマスタを足したら `src/actions/masters.ts` の `MASTER_LABELS` に和名を追記する。
和名が無いと主語が「マスタ」になる。

## 5. Gmail 連携（`describeGmailError()`）

原文は `（{操作名}: {原文}）` の形で末尾に残す。操作名は
「アカウント情報の取得 / メール一覧の取得 / メール本体の取得 / 差分履歴の取得」。

| HTTP | メッセージ |
|---|---|
| 401 | `Gmail の認証が切れています。連携し直してください` |
| 403（レート） | `Gmail API の利用上限に達しました。時間をおいて再度同期してください` |
| 403（権限） | `Gmail への参照が許可されていません。連携時に求めた権限が付与されているか確認してください` |
| 404 | `対象が Gmail 上に見つかりませんでした。削除された可能性があります` |
| 429 | `Gmail API の利用上限に達しました。時間をおいて再度同期してください` |
| 5xx | `Gmail 側で一時的な障害が発生しています。時間をおいて再度同期してください` |
| その他 | `Gmail との通信に失敗しました` |

### 404 の扱い

- **差分履歴（history.list）の 404** は historyId の失効。異常ではないので、直近分の走査に
  切り替えたうえで現在の historyId を控え、次回から差分同期に戻す
- **メール本体（messages.get）の 404** は取得前に削除されたメール。**その 1 通だけ飛ばして続行**し、
  件数を `missing` として同期結果に出す。ここで例外を投げると、削除済みメールが 1 通あるだけで
  同期全体が毎回失敗する

OAuth 側（`describeOAuthError()`）は別立て。

| `error` | メッセージ |
|---|---|
| `invalid_grant` | `連携の承認が失効しています。連携し直してください` |
| `redirect_uri_mismatch` | `リダイレクト URI が Google Cloud 側の登録と一致しません` |
| `invalid_client` | `クライアント ID / シークレットが正しくありません` |

## 6. 認証・権限・競合（共通文言）

| 事象 | メッセージ | 実装 |
|---|---|---|
| 未認証 | `認証が必要です` | 各 Server Action |
| admin 限定操作 | `管理者権限が必要です` | `requireAdmin()` |
| manager 以上限定 | `manager 以上の権限が必要です` | 各 Server Action |
| 楽観ロック競合 | `{対象}は他のユーザーによって更新されています。画面を再読み込みしてから保存してください` | `conflictErrorMessage()` |
| 不正な ID 形式 | `不正なパラメータです` | 詳細ページ（`[id]` ルート） |

## 7. 文言を追加するときの手順

1. 入力で防げるなら Zod スキーマに足す（DB に到達する前に止める）
2. DB でしか判定できないなら `toUserMessage()` に分岐を足す
3. この文書の表に追記する
4. `src/lib/validators/masters.test.ts` / `src/lib/db-error.test.ts` にケースを足す
5. 画面での見え方（インラインかトーストか）を `docs/test-cases/07-system-platform-admin.md` で確認する
