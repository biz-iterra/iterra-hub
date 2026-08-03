# エージェント体制

iterra-hub の開発を担うエージェント体制。2026-08-03 に旧体制（21 体）から再編した。

## 1. 体制（5 ロール）

```
User（プロダクトオーナー）
  │
  └── メインセッション（Claude Code 本体）← 窓口・統括・委譲・結果統合
        │
        ├── engineer   実装（全エンティティ横断）
        ├── qa         テスト執行（Gate 3 / 変更検証 / 受入準備）
        ├── reviewer   技術レビュー（アーキ・DB・RLS・セキュリティ）
        ├── designer   UI/UX レビュー（ITERRA ブランド準拠）
        └── operator   運用（Gate 5 / データ健全性 / インシデント一次対応）
```

定義ファイル: `.claude/agents/{engineer,qa,reviewer,designer,operator}.md`

## 2. 旧体制からの変更点と理由

| 変更 | 理由 |
|---|---|
| エンティティ別 6 チーム × 3 ロール（18 体）を廃止し、ロール別 5 体に統合 | 全チームが同一リポジトリ・同一スタック（Next.js + Supabase）で、分割の便益がなかった。所有権マップの維持・委譲先の判断コストだけが残っていた |
| agent-manager を廃止 | 統括はメインセッションの仕事。エージェントを挟むと往復が 1 段増えるだけだった |
| tech-pm を reviewer に改称・存続 | 役割は有効。名前を実態（レビュー担当）に合わせた |
| designer は存続 | 横断レビューという役割が明確で機能していた |
| テスターを qa 1 体に統合し、**テストの正本を文書に移した** | テスターが 6 体いてもテストケースの正本が無く、実施内容がエージェント任せだった。ケースは `docs/test-cases/` が正本、qa はその執行者 |

旧定義は `.claude/agents-archive-2026-08-03/` に保存（git 管理外）。

**並行度はロール数と無関係。** 同じ engineer 定義を複数インスタンス起動すれば並行実装できる。
その際はファイル担当が重ならないよう分割する（例: 「engineer A は src/actions/leads を、B は画面側を」）。

## 3. 標準フロー

### 機能開発・バグ修正

```
User 依頼
  → メインセッションがスコープ確定
  → （DB/RLS/共通基盤に触るなら）reviewer に設計相談
  → engineer 実装（完了条件: Gate 1 の 4 チェック + test-cases 更新）
  → qa 検証（test-strategy.md §5 の回帰範囲）／ UI 変更があれば designer レビューを並行
  → メインセッションが統合してユーザーへ報告
```

### インシデント対応

```
User 報告 → operator が初動調査（再現条件・影響範囲の特定）
  → engineer が修正 → qa が検証 → （データ救済が必要なら）ユーザー承認の上で実施
```

### デプロイ

`docs/test-strategy.md` §4 のデプロイゲートに従う。

```
Gate 1（engineer）→ Gate 2（CI）→ Gate 3（qa）→ Gate 4（プロダクトオーナー）
  → デプロイ（docs/deployment-nas.md）→ Gate 5（operator）
```

ゲートをスキップしたデプロイは禁止。実施記録は `docs/test-checklist.md`。

## 4. 責務境界

| 判断・作業 | 担当 |
|---|---|
| スコープ決定・優先順位・ユーザーへの報告 | メインセッション |
| 実装（migration / Server Action / validator / UI / 単体テスト） | engineer |
| マイグレーション方針・破壊的変更・RLS・依存追加の承認 | reviewer |
| テスト実施・記録・差し戻し | qa（修正はしない） |
| UI の準拠判定・軽微な style 修正 | designer（構造変更は engineer へ） |
| 本番検証・データ健全性・インシデント一次対応 | operator（本番の無承認変更は禁止） |

## 5. 全エージェント共通ルール

- `CLAUDE.md` の開発ルール・データ整合性規約・アクセス制御ルール・シークレット管理を遵守
- シークレット実値ファイル（`.env` 等）は読まない。値はキー名で扱う
- 実装変更とテストケース文書（`docs/test-cases/`）・設計書（`docs/database-design.md`）の更新は同一作業内で行う
- コミット作成はユーザー承認必須（engineer が勝手にコミットしない）
- 本番 DB への一括 UPDATE / DELETE は禁止（必要時はユーザー承認 + reviewer 確認）
