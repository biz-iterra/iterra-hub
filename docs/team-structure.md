# エージェントチーム体制

ITERRA CRM (iterra-hub) プロジェクトの開発を担うエージェントチームの構成と運用ルール。

## 1. 組織図

```
User（プロダクトオーナー）
  │
  └── Agent Manager ←→ Tech PM      ← 全体統括
        │                │
        ├── Designer（UI/UX横断）
        │
        ├── Sales Team
        │     ├─ sales-engineer
        │     ├─ sales-tester
        │     └─ sales-operator
        │
        ├── People Team
        │     ├─ people-engineer
        │     ├─ people-tester
        │     └─ people-operator
        │
        ├── Account Team
        │     ├─ account-engineer
        │     ├─ account-tester
        │     └─ account-operator
        │
        ├── Project Team
        │     ├─ project-engineer
        │     ├─ project-tester
        │     └─ project-operator
        │
        └── Platform Team
              ├─ platform-engineer
              ├─ platform-tester
              └─ platform-operator
```

**構成**: 統括3名 ＋ エンティティチーム 5×3 = **合計18 agents**

## 2. 責務分担マトリクス

### 統括層

| エージェント | 役割 | model |
|---|---|---|
| `agent-manager` | 全体統括。ユーザー窓口、スコープ決定、委譲、結果統合 | opus |
| `tech-pm` | 技術統括。アーキ判断、DB設計、マイグレ方針、セキュリティ | opus |
| `designer` | UI/UX横断レビュー。ITERRAブランド一貫性の保証 | sonnet |

### エンティティチーム（5チーム × 3ロール）

| チーム | 担当範囲 |
|---|---|
| **Sales** | Deal / Inside-Sales拡張 / Contract |
| **People** | Contact / Talent（ポテンシャル診断含む） |
| **Account** | Company / Account / account_contacts |
| **Project** | Project |
| **Platform** | マスタ / Admin / 認証 / CSV取込 / 共通基盤 |

各チームは Engineer / Tester / Operator の3ロール。

### ロール定義

| ロール | 主な業務 | model |
|---|---|---|
| **Engineer** | 実装（migration / Server Action / validator / UI） | sonnet |
| **Tester** | typecheck / build / Playwright E2E / データ検証 | sonnet |
| **Operator** | 性能監視 / データ健全性 / インシデント対応 | sonnet |

## 3. 典型ワークフロー

### 3-1 新機能開発

```
User → Agent Manager
        ↓ 要件確認
        ↓（技術的に重い場合）
        → Tech PM に相談
        ↓ 設計確定
        → 該当 Entity Engineer に delegate
                ↓ 実装完了
                → Entity Tester に自動引き継ぎ
                → （UI変更時）Designer に並行依頼
        ↓ 全員OK
        → User に統合報告
```

### 3-2 バグ修正（本番インシデント）

```
User → Agent Manager
        ↓
        → 該当 Entity Operator に初動調査
        ↓ 原因特定
        → Entity Engineer に修正依頼
        → Entity Tester に検証依頼
```

### 3-3 CSV取込等の横断機能

```
User → Agent Manager
        → Tech PM（バルクINSERT方針確認）
        → Platform Engineer（取込基盤）
        → Sales Engineer（エンティティ固有ロジック）
        → Sales Tester / Platform Tester（共同検証）
        → Designer（取込UI レビュー）
```

## 4. 委譲ルール

### Agent Manager → 他エージェントの呼び出し基準

| 依頼内容 | 委譲先 |
|---|---|
| 「〇〇のバグを直して」 | 該当 Engineer → Tester |
| 「新機能〇〇を追加」 | Tech PM → Engineer → Tester → Designer |
| 「パフォーマンスが遅い」 | 該当 Operator → (必要なら) Engineer |
| 「設計の見直し」 | Tech PM |
| 「デザインを整えて」 | Designer |
| 「マスタに項目追加」 | Platform Engineer |
| 「CSV取込したい」 | Platform Engineer ＋ 該当エンティティ Engineer |

### エージェント自身での主な禁止事項

- **Engineer が自分でコミット作成しない**（ユーザー承認必須）
- **Operator が DELETE/TRUNCATE/UPDATE 一括 を実行しない**
- **Tester が迂回してコード修正しない**（必ず Engineer に差し戻し）
- **Designer が例外的なブランドトークン使用を放置しない**

## 5. 使用ツール規約

### 全Engineer共通
- `Read` / `Edit` / `Write` / `Grep` / `Glob` / `Bash`
- マイグレーション追加時は `npx supabase db reset --local` で動作確認

### 全Tester共通
- `Skill` で `example-skills:webapp-testing` を起動
- `scripts/test-*.py` 形式でテストスクリプトを保存

### Operator
- `Bash` は read-only 用途が原則
- `node -e "..."` でSupabase接続して集計クエリ

### Designer
- **起動時に必ず `example-skills:iterra-design` スキルを実行**
- `scripts/test-*.py` でスクリーンショット確認

## 6. ファイル所有権マトリクス

**原則**: 下表の Primary Owner 以外は、該当パスへの直接編集を禁止する。変更が必要な場合は agent-manager 経由で該当 Owner に依頼する。

### 6-1 エンティティ固有領域（Primary Owner が単独で編集可）

| パス | Primary Owner |
|---|---|
| `src/app/(app)/deals/**` | sales-engineer |
| `src/app/(app)/contracts/**` | sales-engineer |
| `src/app/(app)/contacts/**` | people-engineer |
| `src/app/(app)/talents/**` | people-engineer |
| `src/app/(app)/companies/**` | account-engineer |
| `src/app/(app)/accounts/**` | account-engineer |
| `src/app/(app)/projects/**` | project-engineer |
| `src/app/(app)/dashboard/**` | platform-engineer |
| `src/app/(app)/admin/**` | platform-engineer |
| `src/app/(auth)/**` (login等) | platform-engineer |
| `src/actions/deals.ts`, `src/actions/deals/**` | sales-engineer |
| `src/actions/contracts.ts` | sales-engineer |
| `src/actions/contacts.ts` | people-engineer |
| `src/actions/talents.ts` | people-engineer |
| `src/actions/companies.ts` | account-engineer |
| `src/actions/accounts.ts` | account-engineer |
| `src/actions/projects.ts` | project-engineer |
| `src/actions/masters.ts`, `users.ts`, `deleted.ts`, `activities.ts` | platform-engineer |
| `src/lib/validators/<entity>.ts`, `src/lib/validators/<entity>/**` | 該当 Engineer |
| `src/lib/validators/masters.ts` | platform-engineer |
| `src/lib/inside-sales/**` | sales-engineer（platform-engineer と共同保守） |
| `src/lib/diagnosis/**` | people-engineer |

### 6-2 横断基盤（Platform Engineer 所有 / 変更時に関係者通知）

| パス | Primary Owner | 変更時の追加アクション |
|---|---|---|
| `src/middleware.ts` | platform-engineer | tech-pm に事前通知 |
| `src/lib/supabase/**` | platform-engineer | tech-pm に事前通知 |
| `src/lib/validators/common.ts` | platform-engineer | **全 Engineer に影響あり** → agent-manager 経由で通知 |
| `src/lib/validators/index.ts` | platform-engineer | 各 Engineer が export 追記する場合は agent-manager が調停 |
| `src/lib/utils.ts` | platform-engineer | 全 Engineer に通知 |
| `src/components/layout/**`（sidebar, header） | platform-engineer | designer レビュー必須 |
| `src/components/ui/**`（共通UIコンポーネント） | platform-engineer | designer レビュー必須 |
| `src/types/**` | tech-pm 承認 → 該当 Engineer 実装 | - |
| `src/app/globals.css` | designer 指示 → platform-engineer 実装 | - |
| `src/styles/tokens.css` | designer 指示 → platform-engineer 実装 | - |
| `src/app/layout.tsx` | platform-engineer | designer レビュー |

### 6-3 設定・ビルド（Platform Engineer 所有 / Tech PM 承認必須）

| パス | 変更時の承認 |
|---|---|
| `package.json` / `package-lock.json`（依存追加） | tech-pm 承認 |
| `next.config.ts` / `tsconfig.json` / `postcss.config.mjs` | tech-pm 承認 |
| `components.json` (shadcn設定) | tech-pm 承認 |
| `.env.local.example` | - |

### 6-4 DB・マイグレーション

| 種別 | ルール |
|---|---|
| **新規マイグレーション作成** | 該当エンティティチームの Engineer が作成。ただし **Tech PM に事前方針相談必須**（RLS / バックフィル / 影響範囲） |
| **既存マイグレーション修正** | **原則禁止**。新マイグレーションで対応。緊急例外時のみ tech-pm 承認 |
| `supabase/seed.sql` | 各セクションを該当 Engineer が追記。**他チームのセクションは変更禁止** |
| `supabase/config.toml` | platform-engineer（tech-pm 承認） |

### 6-5 ドキュメント

| パス | Primary Owner |
|---|---|
| `CLAUDE.md` | tech-pm（**ユーザー承認必須**） |
| `docs/database-design.md` | tech-pm（スキーマ変更時に先に更新） |
| `docs/screen-design.md` | platform-engineer + designer 共同 |
| `docs/test-checklist.md` | 各 Tester が自チーム分を追記 |
| `docs/team-structure.md` | agent-manager |
| `README.md` 等の新規ドキュメント | **ユーザーから明示依頼時のみ作成** |

### 6-6 エージェント定義・ハーネス設定

| パス | Primary Owner / 承認 |
|---|---|
| `.claude/agents/*.md` | agent-manager（**ユーザー承認必須**） |
| `.claude/settings.local.json` | platform-engineer（**ユーザー承認必須**） |

### 6-7 テストスクリプト

| パス | Primary Owner |
|---|---|
| `scripts/test-deals-*.{py,ts}` | sales-tester |
| `scripts/test-inside-sales-*.{py,ts}` | sales-tester |
| `scripts/test-contacts-*.{py,ts}` / `test-talents-*` | people-tester |
| `scripts/test-companies-*.{py,ts}` / `test-accounts-*` | account-tester |
| `scripts/test-projects-*.{py,ts}` | project-tester |
| `scripts/test-bulk-insert.ts`, `test-import-ui.py`, `test-lists-audit.py` など横断系 | platform-tester |

---

## 7. 変更プロセス・承認フロー

### 7-1 変更規模別の承認

| 変更内容 | 必要な承認 |
|---|---|
| 自チーム所有ファイルの機能追加・修正 | 不要（そのまま実装） |
| 新規マイグレーション追加 | **tech-pm 事前相談** |
| 破壊的スキーマ変更 / RLS変更 | **tech-pm 承認** |
| 共通モジュール（`validators/common.ts` 等）の変更 | tech-pm 承認 ＋ agent-manager 経由で全 Engineer 通知 |
| UI コンポーネントの追加 | designer レビュー |
| 依存追加・ビルド設定変更 | **tech-pm 承認** |
| `CLAUDE.md` / `database-design.md` の修正 | **ユーザー承認** |
| 新しいエージェント定義追加 / `.claude/` 配下変更 | **ユーザー承認** |
| git commit / push | **ユーザー明示依頼時のみ** |

### 7-2 競合解決プロセス

同じファイル・同じ機能領域を複数チームが同時に触る場合：

```
競合発生
  ↓
agent-manager が状況ヒアリング
  ↓
├─ 技術面で判断が必要 → tech-pm が判定
├─ 優先順位が必要 → agent-manager がユーザーに確認
└─ 両方必要 → tech-pm + ユーザー相談
  ↓
担当 Engineer が順次作業、他チームは待機
```

### 7-3 通知プロセス（共通モジュール変更時）

1. 変更する Engineer が変更内容・影響範囲・移行方針をまとめる
2. agent-manager に報告（「影響エージェント」リスト付き）
3. agent-manager が影響するチームに通知
4. 各チームの Operator が回帰影響を確認
5. 問題なければ Engineer が実装 → Tester が回帰テスト

---

## 8. 必読ドキュメント

全エージェント共通で参照する情報源：

| ファイル | 内容 |
|---|---|
| `CLAUDE.md` | プロジェクト憲法（アクセス制御・多層防御の必須ルール） |
| `docs/database-design.md` | DB設計書（変更時は先にここを更新） |
| `docs/screen-design.md` | 画面設計 |
| `docs/test-checklist.md` | テスト観点 |
| `.claude/projects/.../memory/MEMORY.md` | 永続メモリインデックス |

## 9. 導入ステータス

**2026-04-18 初期構成完了:**
- 18 agents 定義完了（`.claude/agents/*.md`）
- 本ドキュメント初版策定
- Designer は `example-skills:iterra-design` を内部利用する前提
- ファイル所有権マトリクス・承認フロー・競合解決プロセスを §6-7 に追加

**今後の改善候補:**
- エンティティ分離の粒度見直し（プロジェクト規模拡大時）
- チーム間コミュニケーションパターンの標準化
- エージェント呼び出し頻度の統計取得
