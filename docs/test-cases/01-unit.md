# 単体テスト仕様（Vitest）

最終更新: 2026-08-04

## 1. 対象と方針

- **対象:** `src/lib/` 以下の純粋関数モジュールと `src/lib/validators/` の Zod スキーマ。
  DB アクセス・ネットワーク I/O を伴わない関数のみを単体テストの対象とする
- **実行:** `npm test`（Vitest）。CI（`.github/workflows/ci.yml`）で必須
- **配置:** テストは実装と同じディレクトリに `*.test.ts` で置く（既存 15 ファイルと同じ流儀）。
  import はパスエイリアスでなく相対パスを使う（Vitest がエイリアスを解決しないため）
- **対象外（単体テストにしない）:**
  - `src/lib/supabase/*`（クライアント生成）、`src/lib/leads/score-temperature.ts` / `recalculate-score.ts`（DB アクセス）
  - `src/lib/gmail/client.ts` / `sync.ts`、`src/lib/d1.ts` の `queryD1`、`src/lib/cf-access.ts` の `verifyCfAccessJwt`（外部 API / JWKS 取得）
  - `src/lib/layout.ts`、`src/lib/constants/pagination.ts`、`src/lib/talent-classification/d-co-pool.ts`（定数のみ）
  - `src/lib/utils.ts` の `cn`（clsx + tailwind-merge の薄いラッパで、壊れれば型/画面で即分かる）
- ケース ID は UT-01 からの連番。§3（既存テストの不足）と §4（新規）で通し番号

## 2. テスト済みモジュール一覧

| モジュール | テストファイル | カバー済み観点 |
|---|---|---|
| `src/lib/company-name.ts` | `company-name.test.ts` | 略記展開（㈱/（株）/㈲/（同）/㈾/（一社）/（特非）/㈶/（財）/（社）、複合略記の優先、複数略記、正式表記の素通し、空値）、`formatCompanyName` の空白正規化、`stripCorporateType`（前株/後株、長い綴り優先、空括弧除去、全角法人格）、`detectCorporateType`（略記判定、長い綴り優先、判定不能 null） |
| `src/lib/validators/common.ts` | `common.test.ts` | `birthDateSchema` のみ（過去日受理、空値許容、未来日拒否、実在日チェック、形式不正、うるう年） |
| `src/lib/leads/import-helpers.ts` | `import-helpers.test.ts` | `decodeCsv`（UTF-8/SJIS 判別、BOM）、`normalizeCompanyName`、`normalizePhone`（+81、括弧・全角ハイフン、8桁未満破棄）、`normalizeEmail`、`normalizeDate`（YYYY/M/D、年省略補完、実在しない月日の拒否、うるう年）、`extractDomain`、`parseAddress`（都道府県列挙、連続する市、政令市の区、郡、都道府県欠落）、`buildExternalKey`（メール優先、ハッシュ安定性）、`parseCsv`（引用符・CRLF・引用内改行・BOM）、`dropEmptyRows` |
| `src/lib/leads/eight-import.ts` | `eight-import.test.ts` | `checkEightHeader`（必須列欠落、未知列許容、列順入替）、`parseEightRow`（項目マッピング、TEL直通優先、lead_name フォールバック、エラー行、raw 保持、品質フラグ警告、略記展開）、`mergeEightRows`（最新交換日採用、同日は後方行、日付なし後回し、ハッシュキー同一判定、エラー分離） |
| `src/lib/leads/inquiry-import.ts` | `inquiry-import.test.ts` | `splitPersonName`（全角空白、3 語以上、空値）、`formatDetailJson`（空項目除去、壊れた JSON、配列/文字列拒否）、`toInquiryLead`（lead_name フォールバック、external_key 接頭辞、本文組み立て、未知種別素通し） |
| `src/lib/houjin-bangou/match.ts`（+ `parse.ts` の `parseHoujinCsv`） | `match.test.ts` | `normalizeCompanyName`（法人格ゆれ、全角英数、区切り記号）、`matchCompany`（完全一致 1 件、isLatest 限定、ambiguous、closed、not_found）、`diffCompany`（表記ゆれ非差分、商号/所在地変更、住所未入力）、`parseHoujinCsv`（列取り出し、13桁チェック、列数不足、空文字列） |
| `src/lib/deals/expected-close-date.ts` | `expected-close-date.test.ts` | `addMonthsClamped`（通常加算、平年/閏年 2 月末クランプ、年またぎ、0 ヶ月）、`calculateDefaultCloseDate`（null/undefined で自動設定なし） |
| `src/lib/talent-classification/grade-calculator.ts` | `grade-calculator.test.ts` | 最上位充足グレード、実績 AND 判定、L1 超の評価除外、最下位フォールバック、マスタ空で null、不足実績返却、pool+axis の AND、他系統除外 |
| `src/lib/talent-classification/system-classifier.ts` | `system-classifier.test.ts` | 全条件 AND、tag_filter × axis_filter の AND、conditions 空は不一致、proficiency null は 0 扱い |
| `src/lib/talent-classification/job-type-classifier.ts` | `job-type-classifier.test.ts` | skill_ids_any の OR、rules の AND、axis_filter の min_count、併記時の AND、rules 空は不一致 |
| `src/lib/gmail/address.ts` | `address.test.ts` | `parseAddressList`（表示名、クォート内カンマ、小文字化、不正値）、`normalizeEmail` / `emailDomain`、`getSkipReason`（self/own_domain/noreply/list、サブアドレス）、`extractParticipants`（役割付与、重複排除、全除外） |
| `src/lib/gmail/crypto.ts` | `crypto.test.ts` | 暗号化/復号の往復、IV ランダム性、鍵違い失敗、本文/タグ改ざん検知、短すぎる入力、可変長鍵、BYTEA リテラル往復 |
| `src/lib/gmail/secret.ts` | `secret.test.ts` | `safeEqual`（長さ違い、マルチバイト）、`bearerMatches`（スキーム大小、空白、期待値未設定で常に false） |
| `src/lib/app-origin.ts` | `app-origin.test.ts` | `isReachableOrigin`（0.0.0.0 / :: / 壊れた URL）、`resolveExternalOrigin`（APP_ORIGIN 優先、末尾スラッシュ、フォールバック、両方不可で null、不正設定で null） |
| `src/lib/social-links.ts` | `social-links.test.ts` | `buildSocialDmUrl`（差し替え、workspace 必須、空 ID、雛形なし、記号エンコード、素通し、http(s) 以外拒否）、`isPassthroughTemplate` |
| `src/lib/search-query.ts` | `search-query.test.ts` | `sanitizeSearchTerm`（`,` `(` `)` `.` `'` `"` `\` `%` `_` の除去、前後空白 trim、空文字/null/undefined、記号のみは空文字）、`buildIlikePattern`（パターン組み立て、空入力で null） |
| `src/lib/validators/contact-social-accounts.ts` | `contact-social-accounts.test.ts` | `contactSocialAccountBaseSchema`（account_id の trim → 必須チェックの順序、空白のみ拒否、service_id の UUID 検証、workspace 等の空文字→null） |
| `src/lib/validators/lead-activities.ts` | `lead-activities.test.ts` | `leadActivityUpdateSchema` の `expected_updated_at`（楽観ロック用。未指定でも成功＝後方互換、文字列指定時の往復） |
| `src/lib/validators/campaigns.ts` | `campaigns.test.ts` | `campaignUpdateSchema` の `expected_updated_at`（未指定でも成功、文字列往復）、既存の日付 `refine` との両立 |
| `src/lib/validators/leads.ts` | `leads.test.ts` | `leadCustomerActivityUpdateSchema` の `expected_updated_at`（楽観ロック用。未指定でも成功＝後方互換、文字列指定時の往復） |

## 3. 既存テストの不足ケース

### UT-01: normalizeDate — 存在しない月日を弾く（実装済み・2026-08-03 修正）
- 入力: `normalizeDate("2025/13/40")`
- 期待値: `null`
- 理由: 旧実装（`import-helpers.ts` L111-129）は正規表現 `(\d{1,2})` で桁数しか見ず、`"2025-13-40"` をそのまま返していた。DATE 型カラムへ渡すと DB エラーで取込行が落ちるため、`isValidYmd`（`Date.UTC` で生成した年月日を読み戻して入力と一致するか確認する）で実在性を検証するよう修正した。うるう年は `2024-02-29` 有効・`2025-02-29` 無効として扱う

### UT-02: decodeCsv — UTF-8 / Shift_JIS のいずれでもないバイト列は例外
- 入力: `decodeCsv(new Uint8Array([0x80]))`（UTF-8 では不正な継続バイト、SJIS では未定義領域）
- 期待値: `/文字コードを判別できませんでした/` にマッチする例外を throw
- 理由: 両デコーダとも fatal で失敗する経路（L42-44）が未テスト。ここが黙って通ると文字化けデータが取り込まれる

### UT-03: parseCsv — 末尾に改行の無い最終行を落とさない
- 入力: `parseCsv("a,b\n1,2")`
- 期待値: `[["a","b"],["1","2"]]`
- 理由: 最終行のフラッシュ処理（L306-309）が独立した分岐で、既存テストはすべて末尾 `\n` 付き。Excel 保存の CSV は末尾改行が無いことがある

### UT-04: expandCorporateAbbreviations — 医療法人・学校法人の略記
- 入力: `expandCorporateAbbreviations("（医）健生会")` / `expandCorporateAbbreviations("㈻明星学園")`
- 期待値: `"医療法人健生会"` / `"学校法人明星学園"`
- 理由: 対応表 22 行のうち後半（医/学/福/宗）が未テスト。DB 関数 `expand_corporate_abbreviations` と対で規則を固定する目的からは全略記の代表を押さえたい

### UT-05: parseEightRow — 上限超過の切り詰めと警告
- 入力: `役職` に 134 文字（`"部".repeat(134)`）を入れた行（会社名 `"A社"`）
- 期待値: `p.lead.contact_job_title` の長さが 100、`p.warnings` に `"100 文字を超えるため切り詰めました"` を含む警告が 1 件
- 理由: `clamp`（eight-import.ts L69-81）は実データ（役職 134 文字が 1 件）対応で入れた機能だが未テスト。切り詰め漏れは DB の CHECK 制約違反で行が落ちる

### UT-06: mergeEightRows — 交換日が両方無い場合は行番号の降順で採用
- 入力: 同一メール `x@example.com`・名刺交換日なしの 2 行（rowNumber 1 = 会社名 "先"、rowNumber 2 = 会社名 "後"）
- 期待値: `merged[0].primary.lead.company_name === "後"`
- 理由: ソート比較器の最終分岐 `b.rowNumber - a.rowNumber`（L270）は「日付あり vs なし」のテストしかなく、両方なしの決定性が未検証

### UT-07: normalizeCompanyName（houjin-bangou/match）— 合成文字 ㈱ も除去される
- 入力: `normalizeCompanyName("㈱テスト")`
- 期待値: `"テスト"`（`normalizeCompanyName("株式会社テスト")` と同一キー）
- 理由: 実装は先に `expandCorporateAbbreviations` を通す前提（L27 のコメント）だが、テストは `(株)` しか通していない。㈱ の書き漏らしで別キーになる事故をこのテストで固定する

### UT-08: diffCompany — 商号と所在地が両方変わっていたら 2 件返す
- 入力: `diffCompany({ name: "株式会社旧商号", address: "大阪府大阪市北区1-1" }, record())`（record は match.test.ts のヘルパ: 株式会社テスト / 東京都千代田区丸の内1-1-1）
- 期待値: `diffs.length === 2`、`field` の集合が `{"name","address"}`
- 理由: 既存テストは単独変更のみ。両方変わる（移転を伴う商号変更）は実データで起こる

### UT-09: addMonthsClamped — 負の月数でも正しく戻る
- 入力: `addMonthsClamped(new Date(2026, 0, 15), -2)`
- 期待値: `toDateInputValue` で `"2025-11-15"`
- 理由: `((totalMonths % 12) + 12) % 12`（L15）は負数対応のための式だが負のケースが 1 つも無く、リグレッションに気付けない

### UT-10: addMonthsClamped — 31 日から 30 日の月へのクランプ
- 入力: `addMonthsClamped(new Date(2026, 2, 31), 1)`（2026-03-31 + 1 ヶ月）
- 期待値: `"2026-04-30"`
- 理由: クランプのテストが 2 月（28/29 日）のみ。30 日の月（4/6/9/11 月）で `Math.min(day, lastDay)` が効くことも固定する

### UT-11: calculateGrade — skill_ids_any の直接指定で絞り込む
- 入力: 要件 `req("A2", 1, [{ skill_ids_any: ["D01", "D02"], min_star: 3, min_count: 1 }])`、スキル `[skill("D02", "D", 3)]` / `[skill("D03", "D", 5)]`
- 期待値: 前者は `grade_code === "A2"`、後者は `"A1"`（最下位）
- 理由: `evaluateThreshold` の `skill_ids_any` 分岐（grade-calculator.ts L87-92）はプール指定のテストしか無く、直接指定の経路が未検証

### UT-12: calculateGrade — 未知のプール名は要件未達として扱う
- 入力: 要件 `req("A2", 1, [{ skill_ids_any_pool: "unknown_pool", min_star: 1, min_count: 1 }])`、スキル `[skill("D01", "D", 5)]`
- 期待値: `grade_code === "A1"`（最下位）。console.warn が呼ばれる（`vi.spyOn(console, "warn")` で検証）
- 理由: `resolvePool` の警告経路（L58-69）が未テスト。マスタに書き間違えたプール名を静かに空扱いすると原因が追えない、という設計意図をテストで固定する

### UT-13: classifyJobTypes — フィルタの無いルールは常に充足する（現仕様の固定）
- 入力: `classifyJobTypes([], [jobType("ANY", [{ min_star: 3 }])])`（skill_ids_any も axis_filter も無いルール）
- 期待値: `matched.length === 1`（スキル 0 件でもマッチ）
- 理由: `evaluateRule` は条件なし → true（job-type-classifier.ts L65-66）。マスタ設定ミスで全員に職種が付く挙動なので、仕様として明示的にテストに残し、変更時に議論の対象になるようにする

### UT-14: getSkipReason — 特定 SaaS の support@ は自動送信扱い
- 入力: `getSkipReason("support@github.com", options)` / `getSkipReason("support@example.co.jp", options)`（options は address.test.ts と同じ）
- 期待値: 前者は `"noreply"`、後者は `null`
- 理由: `NOREPLY_PATTERNS` の `support@(github|slack|...)` は「特定ドメインのみ」の限定パターン（address.ts L101）で、一般の support@ を巻き込まないことが未検証

### UT-15: isReachableOrigin — http(s) 以外のスキームは false
- 入力: `isReachableOrigin("ftp://example.com")` / `isReachableOrigin("javascript:alert(1)")`
- 期待値: いずれも `false`
- 理由: プロトコル検査（app-origin.ts L35）が未テスト。OAuth の redirect_uri に渡る値なのでスキーム制限は安全性要件

### UT-16: buildSocialDmUrl — requires_workspace=false でも雛形が {workspace} を要求すれば null
- 入力: `buildSocialDmUrl({ dm_url_template: "https://ex.com/{workspace}/{account_id}", requires_workspace: false }, { account_id: "abc" })`
- 期待値: `null`
- 理由: マスタの `requires_workspace` フラグと雛形の食い違い（フラグ更新漏れ）を検出する分岐（social-links.ts L52-53）が未テスト。ここを通ると `{workspace}` が空文字に置換された壊れた URL を開く

### UT-17: emailSchema — 空文字の null 変換と形式・長さの境界
- 入力: `emailSchema.safeParse("")` / `safeParse("foo")` / `safeParse("a@example.com")` / `safeParse("a".repeat(250) + "@x.jp")`（255 文字超）
- 期待値: `""` → success かつ `data === null`、`"foo"` → 失敗、`"a@example.com"` → success、255 文字超 → 失敗
- 理由: `.or(z.literal("").transform(() => null))` の合成（common.ts L32-38）はフォームの空欄を NULL に寄せる要。common.test.ts は birthDateSchema しかテストしていない

### UT-18: phoneSchema — 20 文字境界
- 入力: `phoneSchema.safeParse("0".repeat(20))` / `safeParse("0".repeat(21))` / `safeParse("")`
- 期待値: 20 文字 → success、21 文字 → 失敗（メッセージに `[phone]` を含む）、`""` → success かつ `data === null`
- 理由: DB の VARCHAR(20) と対の上限。境界テストが無い

### UT-19: corporateNumberSchema — 13 桁ちょうどのみ受理
- 入力: `safeParse("1234567890123")` / `safeParse("123456789012")` / `safeParse("12345678901234")` / `safeParse("123456789012a")` / `safeParse("")`
- 期待値: 13 桁のみ success。12/14 桁・英字混在は失敗、`""` → success かつ `data === null`
- 理由: 法人番号は名寄せの最優先キー。桁ずれの混入は `resolve_or_create_company` の判定を狂わせる

### UT-20: urlSchema — 形式不正の拒否と空文字変換
- 入力: `urlSchema.safeParse("not a url")` / `safeParse("https://example.com/" + "a".repeat(500))`（500 文字超） / `safeParse("")`
- 期待値: 前 2 つは失敗、`""` → success かつ `data === null`
- 理由: max(500) と url() の両方が効くこと、および空欄→NULL の変換が未テスト

### UT-21: uuidString — Postgres 互換の寛容な形式（seed UUID を弾かない）
- 入力: `uuidString().safeParse("c0000000-0000-0000-0000-000000000001")` / `safeParse("C0000000-0000-0000-0000-000000000001")` / `safeParse("not-a-uuid")` / `safeParse("c0000000000000000000000000000001")`（ハイフンなし）
- 期待値: 先頭 2 つ（大文字含む）は success、後ろ 2 つは失敗
- 理由: Zod 標準 `.uuid()` は version ビットを検査して開発 seed（`c0000000-...`）を弾くため独自 regex にした経緯（common.ts L3-6）がある。regex を「気を利かせて」`.uuid()` へ戻すリグレッションをこのテストで防ぐ

## 4. 未テストモジュールへの新規ケース

### 4.1 `src/lib/deal-counterparty.ts` — 相手先表示のフォールバック順

### UT-22: getDealCounterparty — 取引先が最優先
- 入力: `{ account: { id: "a1", name: "A社" }, company: { id: "c1", name: "B社" }, contact: { id: "p1", last_name: "山田", first_name: "太郎" } }`
- 期待値: `{ kind: "account", label: "A社", href: "/accounts/a1" }`
- 理由: CLAUDE.md で「相手先表示は必ずこの関数を通す」と定めた共通ロジックの根幹（取引先 → 事業者情報 → 連絡先の順）が完全に未テスト

### UT-23: getDealCounterparty — account が NULL なら事業者情報へフォールバック
- 入力: `{ account: null, company: { id: "c1", name: "B社" }, contact: { id: "p1", last_name: "山田", first_name: "太郎" } }`
- 期待値: `{ kind: "company", label: "B社", href: "/companies/c1" }`
- 理由: 契約前の商談（account_id = NULL）は日常状態。フォールバック 2 段目の検証

### UT-24: getDealCounterparty — 連絡先のみ・名が欠けていても余計な空白を出さない
- 入力: `{ account: null, company: null, contact: { id: "p1", last_name: "山田", first_name: null } }`
- 期待値: `{ kind: "contact", label: "山田", href: "/contacts/p1" }`（`"山田 "` にならない）
- 理由: 名刺由来データで first_name 欠落は実際にある（型コメント L14）。`.trim()` の効果を固定する

### UT-25: getDealCounterparty / getDealCounterpartyLabel — 全て NULL
- 入力: `{ account: null, company: null, contact: null }`
- 期待値: `getDealCounterparty` → `null`、`getDealCounterpartyLabel` → `""`
- 理由: CHECK 制約上は起きないはずだが、JOIN 失敗時に表示側が落ちない保証として必要

### 4.2 `src/lib/diagnosis/index.ts` — ポテンシャル診断の算出

### UT-26: calcPotentialNumber — 基準日周辺の具体値
- 入力: `calcPotentialNumber("1920-01-01")` / `calcPotentialNumber("1919-12-31")`
- 期待値: `2` / `1`
- 理由: `(((diffDays + 1) % 60) + 60) % 60 + 1` の +1 オフセット 2 箇所は potential-profiling（0-59）から 1-60 FK へ移す際の変換。オフセットを 1 つ消すリグレッションが FK 違反または全員 1 ずれた診断になる

### UT-27: calcPotentialNumber — 60 日周期で巻き戻り、常に 1〜60 に収まる
- 入力: `calcPotentialNumber("1920-02-28")` / `calcPotentialNumber("1920-02-29")` / 任意の日付数十件で範囲検査（例: 1950〜2000 年の 1 月 1 日）
- 期待値: `60` / `1`（59 日目→60、60 日目で 1 へ巻き戻る）。範囲検査はすべて `1 <= n && n <= 60`
- 理由: `number_diagnosis.number`（1-60）への FK。範囲を外れる値は登録時に必ず落ちる

### UT-28: calcZodiacSign — 星座の境界日
- 入力: `"2000-03-20"` / `"2000-03-21"` / `"2000-04-19"` / `"2000-04-20"` / `"2000-12-22"` / `"2000-01-19"` / `"2000-01-20"` / `"2000-02-19"`
- 期待値: `"魚座"` / `"牡羊座"` / `"牡羊座"` / `"牡牛座"` / `"山羊座"` / `"山羊座"` / `"水瓶座"` / `"魚座"`
- 理由: 12 分岐すべてが日付境界の比較で、戻り値は `constellation_fortune_telling.constellation` との文字列一致が前提。境界 1 日のずれはマスタ引き当て失敗になる

### UT-29: calcPotentialNumber — 不正な日付形式は例外
- 入力: `calcPotentialNumber("1990/04/15")` / `calcPotentialNumber("abc")`
- 期待値: `Invalid date` を含む例外を throw
- 理由: `toUTCDate` は `-` 区切り 3 要素以外を例外にする設計。呼び出し側（birth_date は `YYYY-MM-DD` 検証済み）の前提が崩れたとき静かに NaN 由来の値を返さないことを固定

### 4.3 `src/lib/leads/promote-helpers.ts` — Lead→Deal 昇格の転記

### UT-30: splitLeadName — 1 語 / 2 語 / 3 語以上
- 入力: `splitLeadName("山田")` / `splitLeadName("山田 太郎")` / `splitLeadName("山田　太郎 次郎")`（全角空白含む）
- 期待値: `{ lastName: "山田", firstName: null }` / `{ lastName: "山田", firstName: "太郎" }` / `{ lastName: "山田", firstName: "太郎 次郎" }`
- 理由: `contacts.last_name` は NOT NULL。分割結果が空になると昇格全体が失敗する。3 語以上の結合規則（inquiry-import の `splitPersonName` とは逆で先頭を姓にする）も明文化する

### UT-31: buildCompanyPayloadFromLead — company_name 欠落時は lead_name で補う
- 入力: `company_name: null, lead_name: "テスト商事", url: "https://ex.jp", owner_user_id: "u1"` を持つ LeadRow、`userId: "u2"`
- 期待値: `name === "テスト商事"`、`website_url === "https://ex.jp"`、`company_status_id === COMPANY_STATUS_ACTIVE`、`created_by === "u2"`、`owner_user_id === "u1"`
- 理由: `companies.name` は NOT NULL。フォールバックと「owner は Lead から・created_by は操作者」の使い分けが未テスト

### UT-32: buildContactPayloadFromLead — URL 転記先の法人/個人分岐
- 入力: `url: "https://ex.jp"` の LeadRow に対し、`{ contactType: "corporate_rep", companyId: "c1" }` / `{ contactType: "individual", companyId: null }`
- 期待値: 法人 → `website_url === null` かつ `company_id === "c1"`。個人 → `website_url === "https://ex.jp"` かつ `company_id === null`
- 理由: 法人は companies 側に転記済みのため contact には入れない仕様（L118-128 コメント）。両方に入る・どちらにも入らない事故をここで止める

### UT-33: buildContactPayloadFromLead — 担当者姓が空なら lead_name から分割
- 入力: `contact_last_name: null, contact_first_name: null, lead_name: "佐藤 花子"` の LeadRow、`{ contactType: "individual", companyId: null }`
- 期待値: `last_name === "佐藤"`、`first_name === "花子"`
- 理由: 名刺由来 Lead は担当者欄が空のことがある。NOT NULL の `last_name` を空で送らないためのフォールバック検証

### 4.4 `src/lib/errors.ts` — エラー表示先の判定

### UT-34: isFieldValidationError — インライン/トーストの振り分け
- 入力: `"[lead_name] リード名は必須です"` / `"診断マスタが未投入です"` / `conflictErrorMessage("商談")` の戻り値 / `null` / `""`
- 期待値: `true` / `true` / `false` / `false` / `false`
- 理由: 全画面共通のトースト振り分けロジック。`[` 前置きと「マスタ」キーワードという文字列依存の暫定実装（L13-14 コメント）だからこそ、挙動をテストで固定しないと気付かず壊れる

### 4.5 `src/lib/kanban-color.ts` — カンバン列の色

### UT-35: kanbanColorFrom — 正常な #RRGGBB
- 入力: `kanbanColorFrom("#3B82F6")`
- 期待値: `{ solid: "#3B82F6", bg: "#3B82F61F", text: "#3B82F6" }`
- 理由: bg は 8 桁 hex（末尾 1F ≒ 12% 不透明度）で作る規約。連結方法を変えると全列の下地が変わる

### UT-36: kanbanColorFrom — 不正値はフォールバック
- 入力: `kanbanColorFrom(null)` / `kanbanColorFrom("#FFF")`（3 桁） / `kanbanColorFrom("red")` / `kanbanColorFrom("#GGGGGG")`
- 期待値: すべて `{ solid: "#8A8A94", bg: "rgba(138, 138, 148, 0.10)", text: "#5A5A66" }`
- 理由: マスタの color は nullable。不正値で `style` に壊れた値が渡り列が無色になる事故を防ぐ。大文字 hex（`#3B82F6` vs `#3b82f6`）が通ることも `HEX` の `/i` フラグ検証として含める

### 4.6 `src/lib/company-options.ts` — 法人セレクトの選択肢

### UT-37: buildCompanyOptions — 一覧に無い現在値を先頭に補う
- 入力: `rows = [{ id: "1", name: "A社" }]`、`current = { id: "9", name: "Z社" }`
- 期待値: `[{ value: "9", label: "Z社" }, { value: "1", label: "A社" }]`
- 理由: perPage の上限から現在値が漏れると保存時に既存の紐付けが消える実害があった（ファイル冒頭コメント）。この補完が本モジュールの存在理由

### UT-38: buildCompanyOptions — 一覧に含まれる現在値は重複させない / current なし
- 入力: `rows = [{ id: "1", name: "A社" }]`、`current = { id: "1", name: "A社" }`、および `current = null`
- 期待値: いずれも `[{ value: "1", label: "A社" }]`
- 理由: 重複 option は select の値解決を不安定にする。新規作成画面（current なし）の経路も併せて固定

### 4.7 `src/lib/activity.ts` — アクティビティ表示

### UT-39: formatOccurredAt — 時刻なし記録は日付で止める
- 入力: `formatOccurredAt("2026-08-03T14:05:00", true)` / `formatOccurredAt("2026-08-03T00:00:00", false)` / `formatOccurredAt("2026-08-03T09:30:00", null)`
- 期待値: `"2026/08/03 14:05"` / `"2026/08/03"` / `"2026/08/03 09:30"`（`hasTime === false` のときだけ時刻を出さない）
- 理由: 架電日のみの記録に「0:00」を出すと 0 時の出来事と誤読される、という表示規約の核。null は「時刻あり」に倒す仕様も固定する（入力はタイムゾーン依存を避けるため Z なしローカル形式で書く）

### UT-40: activityEntityHref — lead とそれ以外の遷移先
- 入力: `activityEntityHref("lead", "id1")` / `activityEntityHref("contact", "id2")` / `activityEntityHref(null, "id3")`
- 期待値: `"/leads/id1"` / `"/contacts/id2"` / `"/contacts/id3"`
- 理由: lead 以外はすべて contacts に落ちる 2 択実装。entity_type が増えたときにこのテストが仕様変更を強制する

### 4.8 `src/lib/account-contact-roles.ts` — 役割ラベル

### UT-41: accountContactRoleLabel — 既知/未知/null
- 入力: `accountContactRoleLabel("billing")` / `accountContactRoleLabel("unknown_role")` / `accountContactRoleLabel(null)`
- 期待値: `"請求担当"` / `"unknown_role"`（生値をそのまま返す） / `null`
- 理由: DB CHECK の 4 値と対応表がずれた場合に生値表示へフォールバックする挙動（黙って空にならない）を固定

### 4.9 `src/lib/houjin-bangou/parse.ts` — 補助関数（parseHoujinCsv 以外）

### UT-42: isClosed / formatAddress
- 入力: `isClosed({ ...record, closeDate: "" })` / `isClosed({ ...record, closeDate: "2025-03-31" })`、`formatAddress({ prefecture: "東京都", city: "千代田区", street: "丸の内1-1-1", ... })`
- 期待値: `false` / `true`、`"東京都千代田区丸の内1-1-1"`
- 理由: `matchCompany` の closed 判定と `diffCompany` の住所比較が依存する基礎関数。match.test.ts から間接的にしか通っていない

### 4.10 validators — 業務ルール（refine / transform）の境界値

### UT-43: createDealSchema — 審査完了日は申請日以降
- 入力: 必須項目（name, pipeline_type_id / deal_stage_id / deal_status_id / account_id は有効な UUID）に加え `application_date: "2026-08-01", review_completed_date: "2026-07-31"`、および `"2026-08-01"` 同日
- 期待値: 前者は失敗（path が `review_completed_date`、メッセージ「審査完了日は申請日以降にしてください」）、同日は success
- 理由: `.refine` の不等号が `>=`（同日許容）であることを含め、日付整合の業務ルールが完全に未テスト

### UT-44: createCompanySchema — インボイス整合と登録番号形式
- 入力: (a) `invoice_registered: true` で `invoice_registration_number` なし、(b) `invoice_registration_number: "T1234567890123"`、(c) `"1234567890123"`（T なし）。いずれも name と company_status_id は有効値
- 期待値: (a) 失敗（path `invoice_registration_number`）、(b) success、(c) 失敗（「T+13桁の数字です」）
- 理由: インボイス番号は companies が正本という設計。登録あり・番号なしの不整合データを入口で止める唯一の検証

### UT-45: createContractSchema — 契約日付の 2 つの refine
- 入力: (a) `start_date: "2026-08-01", end_date: "2026-07-31"`、(b) `sent_date: "2026-08-01", signback_date: "2026-07-31"`、(c) 各同日。deal_id は有効な UUID
- 期待値: (a) 失敗（「終了日は開始日以降」）、(b) 失敗（「サインバック日は送付日以降」）、(c) いずれも success
- 理由: contracts は AFTER INSERT トリガーで Account を自動生成する起点。不正な期間の契約が入ると下流の区分自動付与まで巻き込む

### UT-46: createTalentCareerSchema — 期間整合と is_current 排他
- 入力: (a) `start_date: "2020-04-01", end_date: "2019-03-31"`、(b) `is_current: true, end_date: "2026-03-31"`、(c) `is_current: true, end_date` なし。talent_id は有効 UUID、career_type "work"、organization "X社"
- 期待値: (a) 失敗（「終了日は開始日以降」）、(b) 失敗（「現在進行中の場合、終了日は設定できません」）、(c) success
- 理由: 2 つの refine が独立に効くことの検証。経歴の時系列矛盾はタレント画面の並び順を壊す

### UT-47: leadCompanySizeSchema — 従業員数・資本金の下限 ≤ 上限
- 入力: (a) `min_employees: 100, max_employees: 50`、(b) `min_capital: 5000, max_capital: 1000`、(c) `min_employees: 50, max_employees: null`（片側のみ）。code/name は有効値
- 期待値: (a)(b) 失敗（path はそれぞれ `min_employees` / `min_capital`）、(c) success（片側 null は制約なし）
- 理由: 企業規模マスタは Lead スコアリングの自動判定（DB トリガ）の判定表。逆転した範囲を入れるとどのサイズにも当たらない Lead ができる

### UT-48: createPipelineTypeSchema — default_close_months の空文字は null へ
- 入力: `createPipelineTypeSchema.parse({ name: "受託", default_close_months: "" })` / `safeParse({ name: "受託", default_close_months: 121 })` / `safeParse({ name: "受託", default_close_months: 2.5 })`
- 期待値: `""` → `default_close_months === null`、`121` → 失敗（max 120）、`2.5` → 失敗（int）
- 理由: `z.preprocess` で空文字を「自動設定しない」に読み替える珍しい合成。ここが壊れるとフォームの空欄が型エラーになりマスタ更新ができなくなる

### UT-49: campaignCreateSchema — 期間整合と status 既定値
- 入力: (a) `start_date: "2026-08-01", end_date: "2026-07-01"`、(b) status を省略した最小入力（name, type: "generation"）
- 期待値: (a) 失敗（`[end_date] 終了日は開始日以降にしてください`）、(b) success かつ `data.status === "draft"`
- 理由: refine と `.default("draft")` が未テスト。既定値が消えると新規キャンペーンの INSERT が NOT NULL 違反になる

### UT-50: createProjectSchema — 日付形式は YYYY-MM-DD のみ
- 入力: `start_date: "2026/01/01"`（スラッシュ区切り）と `start_date: "2026-01-01", end_date: "2025-12-31"`。name / project_status_id は有効値
- 期待値: 前者は失敗（「YYYY-MM-DD 形式」）、後者は失敗（「終了予定日は開始日以降にしてください」）
- 理由: projects だけ日付に regex を掛けており（deals/contracts は自由文字列）、形式検証と期間 refine の両輪を固定する

### UT-51: financialInfoBaseSchema — 全銀協の桁数
- 入力: `bank_code: "123"` / `"1234"` / `"12a4"`、`branch_code: "12"` / `"123"`、`account_number: "12345678"`（8 桁）/ `"1"`（1 桁）/ `""`。company_id / bank_name は有効値
- 期待値: bank_code は 4 桁のみ success、branch_code は 3 桁のみ success、account_number は 1〜7 桁 success・8 桁失敗、`""` → `null`
- 理由: 「口座番号は 0 詰めがあるので桁数を縛らず 7 桁以内」（L54 コメント）という非対称な仕様は、テストが無いと 7 桁固定に「修正」されやすい

### UT-52: contactSocialAccountBaseSchema — account_id の trim と空白のみ入力（実装済み・2026-08-03 修正）
- 入力: `account_id: " abc "` / `account_id: "   "`（空白のみ 3 文字）。contact_id / service_id は有効 UUID
- 期待値: `" abc "` → success かつ `data.account_id === "abc"`。空白のみ → 失敗（`ID は必須です`）
- 理由: 旧実装 `z.string().min(1).max(200).transform(v => v.trim())` は `.min(1)` が transform より先に評価されるため、空白のみの入力が `""` として通っていた。`z.string().trim().min(1).max(200)` の順に直し、trim してから必須チェックにかかるようにした。空文字 ID は DM URL 組み立てで必ず null になるため、入口で弾く

### UT-53: createActivityLogSchema — 紐づけ先がひとつも無ければ拒否
- 入力: `{ activity_type: "note" }`（deal_id / contact_id / account_id / company_id すべて省略） / `{ activity_type: "note", contact_id: <有効UUID> }`
- 期待値: 前者は失敗（「少なくとも1つの紐づけ先が必要です」）、後者は success
- 理由: 宙に浮いたログはどの詳細ページからも見えなくなる。OR 条件の refine はフィールド単体検証では担保できない

### UT-54: createMemberSchema — メールの小文字化と updateMemberSchema の email 除外
- 入力: `createMemberSchema.parse({ email: "Biz.Ishida@ITERRA.JP", full_name: "石田", role: "admin" })`、および `updateMemberSchema.safeParse({ full_name: "石田", role: "member", email: "x@iterra.jp" })`
- 期待値: 前者 `data.email === "biz.ishida@iterra.jp"`。後者は success だが `data` に `email` キーが含まれない（omit の確認）
- 理由: 大文字違いの二重登録防止（transform）と、「メールは変更不可」（Auth / Cloudflare Access との紐付けが壊れるため）という運用制約の両方をコードで固定

### UT-55: leadCreateSchema — 境界値と既定値
- 入力: (a) `lead_name` 100 文字 / 101 文字、(b) `employee_count: -1`、(c) `capital: -0.5`、(d) `sub_owner_user_ids` 省略、(e) `url: ""`。必須（account_type_id / stage_id / owner_user_id）は有効 UUID
- 期待値: (a) 100 は success・101 は失敗（`[lead_name]`）、(b) 失敗（`[employee_count]` 0 以上）、(c) 失敗、(d) success かつ `data.sub_owner_user_ids` が `[]`、(e) success かつ `url === null`
- 理由: Lead はデータ量が最大のエンティティ（3,008 件 seed）で入口が CSV とフォームの 2 系統ある。`.default([])` が消えると Server Action の `for..of` が undefined で落ちる

### 4.11 `src/lib/kana.ts` — フリガナ生成（準単体）

### UT-56: toKatakanaReading — 読み生成と空値・失敗時の挙動
- 入力: `await toKatakanaReading("株式会社山田商店")` / `await toKatakanaReading("")` / `await toKatakanaReading(null)`、および `KUROMOJI_DIC_PATH` を存在しないパスにした場合の `await toKatakanaReading("テスト")`
- 期待値: 1 つ目はカタカナ主体の文字列（例: `"カブシキガイシャヤマダショウテン"`。辞書依存のため「空でない・ひらがな漢字を含まない」の性質検査でも可）、空値は `""`、辞書ロード失敗時も例外にならず `""`
- 理由: 17MB 辞書のロードを伴うため厳密には統合テスト寄りだが、「失敗しても空文字で業務を止めない」というエラー方針は単体で固定したい。実行時間が問題になる場合は Vitest の `test.concurrent` 対象から外すか別プロジェクト設定に分離する

### 4.12 `src/lib/validators/masters.ts` — マスタスキーマ（実装済み: `masters.test.ts`）

### UT-57: マスタスキーマの必須・形式・正規化
- 入力: (a) `leadStatusCreateSchema` に `code` 無し / 空文字 / `No_Prospect`、(b) `stage_id: null`、
  (c) `color: ""` / `"9E9E9E"` / `"#FFF"`、(d) `sort_order: -1` / `1.5` / 未指定、
  (e) `leadStatusUpdateSchema` に `{ name }` だけ、(f) `leadStageCreateSchema` /
  `leadSmallSegmentCreateSchema` / `createAccountStatusSchema` / `createPipelineTypeSchema` に必須欄なし
- 期待値: (a) すべて失敗し `[code]` 付きの日本語、(b) `[stage_id] リードステージを選択してください`、
  (c) 空文字は success かつ `color === null`、他は `[color]` の形式エラー、
  (d) 負数・小数は `[sort_order]` の日本語（英語の `Too small: ...` を返さない）、未指定は `0`、
  (e) success かつ `sort_order` キーを持たない（部分更新で並び順を 0 に潰さない）、
  (f) それぞれ `[slug]` / `[large_segment_id]` / `[code]` の必須エラー
- 理由: DB が NOT NULL のカラムがスキーマから抜けており、`null value in column "code" ...` が
  そのまま画面に出ていた。上限・形式は DB の CHECK と同値でなければアプリを通過して DB で落ちる

### 4.13 `src/lib/db-error.ts` — DB エラーの日本語化（実装済み: `db-error.test.ts`）

### UT-58: toUserMessage の SQLSTATE 別変換
- 入力: `23502` / `23505`（単一キー・複合キー）/ `23503`（delete と create）/ `23514`
  （`_code_format` / `_color_format` / `_sort_order_check` / 未知の制約）/ `22001` / `42501` /
  `PGRST116` / SQLSTATE 無しの日本語文言 / 判定できない英語 / `null`
- 期待値: 各行が `docs/error-messages.md` §4 の表どおりの文言になる。
  日本語（DB 関数の `RAISE EXCEPTION`）はそのまま通り、未知の英語は
  `処理に失敗しました（{原文}）` になる
- 理由: Postgres の生エラーが利用者に出ていた。文言の追加時にこのテストが表の写経になる

### 4.14 `src/lib/gmail/` — Gmail クライアントと同期（実装済み: `client.test.ts` / `sync.test.ts`）

### UT-59: Gmail API エラーの日本語化
- 入力: `getMessageMetadata` が 401 / 403（rate limit・権限不足）/ 404 / 503 を受けた場合、
  `listAddedMessageIds` が 404 / 500 を受けた場合
- 期待値: いずれも日本語かつ対処が書かれた文言で、末尾に `（{操作名}: {原文}）` が付く。
  `listAddedMessageIds` の 404 は例外ではなく `{ ids: [], historyId: null, expired: true }`、
  500 は投げ直す
- 理由: `Gmail API: Requested entity was not found.` が画面に出ていた。
  履歴失効（正常系）と本当の異常を取り違えない

### UT-60: 同期は 1 通の欠落で止まらない
- 入力: 差分履歴が返した ID のうち 1 件が `messages.get` で 404、残りは正常。
  および 500 が返る場合、履歴が失効した場合、初回同期の場合
- 期待値: 404 は `missing` に数えて続行し `error` は null。500 は同期全体を失敗させ
  `last_error` に日本語が残る。履歴失効・初回はいずれも `getProfile` の `historyId` を
  `last_history_id` に控える
- 理由: 削除済みメールが 1 通あるだけで同期全体が毎回失敗していた。
  historyId を控えないと、失効のたびに直近分の走査へ落ちて差分同期に戻れない

### 4.15 `src/lib/freee/partner.ts` — freee 取引先の変換（実装済み: `partner.test.ts`）

### UT-61: インボイス登録番号の形式判定と法人番号の導出
- 入力: `T` + 13 桁 / 12 桁 / 14 桁 / 小文字 `t` / `T` 無し / 空文字 / null / undefined。
  導出は `org_code` が 1（法人）・2（個人）・null の各組み合わせ
- 期待値: 形式判定は `T` + 半角数字 13 桁のみ true。導出は
  **`org_code = 1` かつ形式が正しいときだけ** `T` を除いた 13 桁を返し、他は null
- 理由: 法人のインボイス番号は「T + 法人番号」だが、**個人事業主の T 番号は独自採番で
  法人番号ではない**。ここで導出すると別の会社の法人番号と衝突して誤って紐付く。
  `org_code` 未設定も「法人と確認できない」ので導出しない

### UT-62: toPartnerRow — API レスポンスから DB 行への変換
- 入力: 最小構成（必須項目のみ）/ 全項目 / 空文字・空白のみ / 形式外のインボイス番号 /
  `prefecture_code = -1`（設定しない）/ 未知の `org_code` / `available = false` /
  形式の崩れた `update_date`
- 期待値: 空文字・空白は null に潰す。形式外のインボイス番号は **null にして持ち込まない**。
  `prefecture_code` は 0〜46 の範囲外を null。未知の `org_code` は null。
  `update_date` は `yyyy-mm-dd` 以外を null
- 理由: 形式外の値を持ち込むと生成列（`corporate_number`）が誤爆し、日付は DB の
  `DATE` キャストで取込全体が落ちる。**freee は未入力を空文字で返すことがある**

## 5. テスト追加の優先順位

### P1（先に着手。データ破壊・業務ルールの穴を直接塞ぐ）
- **UT-43〜UT-55（validators の refine / transform / 境界値）** — Server Action の入口で唯一の型・整合検証だが、birthDateSchema 以外は 1 ケースも無い。特に UT-44（インボイス整合）、UT-45（契約日付。Account 自動生成トリガーの起点）、UT-47（スコアリング判定表）、UT-55（Lead 境界値）は不正データが下流の DB 関数・トリガーへ波及する
- **UT-26〜UT-29（diagnosis）** — 算出値が FK（1-60）とマスタ文字列一致に直結し、1 ずれても登録が全滅する割にオフセット計算が壊れやすい
- **UT-22〜UT-25（deal-counterparty）** — CLAUDE.md で全画面に使用を義務付けた共通ロジックが未テストのまま
- **UT-30〜UT-33（promote-helpers）** — Lead→Deal 昇格は複数テーブル書き込みの前段。NOT NULL 落ち・URL 二重転記を防ぐ
- **UT-01（normalizeDate の不正月日）と UT-52（空白のみ account_id）** — 実装の穴を検出する既知バグケースだった。2026-08-03 にテスト追加と同時に実装修正済み

### P2（既存テストの穴埋め。実データで踏む頻度が高い順）
- UT-05 / UT-06（Eight 取込の clamp と決定的マージ順。実データに該当行が存在する）
- UT-17〜UT-21（common スキーマ。全エンティティが共有するため 1 箇所で効く。特に UT-21 は `.uuid()` へ戻すリグレッション防止）
- UT-11〜UT-13（talent-classification のルール評価の未検証分岐）
- UT-34（errors。トースト導入後の全画面が依存する文字列判定）、UT-35〜UT-38（kanban-color / company-options。UI 事故の再発防止）
- UT-02〜UT-04 / UT-07〜UT-10 / UT-14〜UT-16（各モジュールの残り分岐）

### P3（余力で。壊れても気付きやすい・影響が局所的）
- UT-39〜UT-42（activity / account-contact-roles / houjin parse 補助）
- UT-56（kana。辞書ロードが重く、値の正確性はそもそも保証しない設計）
- `getD1Config` / `getGmailConfig` / `getCfAccessConfig` / `getSyncCronSecret` の環境変数読み（未設定→null、前後空白 trim、`https://` 付き teamDomain の正規化）は同型のパターンなので、必要になったら app-origin.test.ts に倣ってまとめて追加する
