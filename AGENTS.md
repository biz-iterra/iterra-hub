# iterra-hub

**このプロジェクトの規約の正本は [CLAUDE.md](CLAUDE.md)。作業前に必ず全文を読むこと。**

以前はこのファイルに同じ内容を全文複製していたが、片方だけ更新されて食い違う
（実際に参照パスの置換ミスが入っていた）ため、ポインタだけを残す形に変えた。
規約を変えるときは CLAUDE.md を編集する。このファイルには内容を書かない。

CLAUDE.md に書いてあるもの:

- 概要・技術スタック・ディレクトリ構造
- 開発ルール / データ整合性の規約（DB 関数へのまとめ・楽観ロック・型の生成物・migration の順序）
- 品質チェックとデプロイゲート（正本は `docs/test-strategy.md`）
- シークレット管理（正本は `~/.claude/docs/secrets-policy.md` と `docs/secrets-management.md`）
- アクセス制御ルール（多層防御・Server Action の必須チェック・RLS ポリシー設計）
- UI 表示名と内部名の対応 / CRM データモデル概要 / バッジ色

エージェントのロール定義は `.codex/agents/*.toml`（Codex 用）と
`.claude/agents/`（Claude Code 用）にあり、体制の説明は `docs/team-structure.md`。
