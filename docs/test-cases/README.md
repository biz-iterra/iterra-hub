# 詳細テストケース

テストレベルの定義・デプロイゲート・回帰範囲の決定ルールは [../test-strategy.md](../test-strategy.md)、
実施記録は [../test-checklist.md](../test-checklist.md)。

| ファイル | レベル | 対象 |
|---|---|---|
| [01-unit.md](01-unit.md) | 単体 | `src/lib/` 純粋関数・Zod validator（Vitest） |
| [02-integration-db.md](02-integration-db.md) | 結合 | DB 関数・トリガー・RLS・整合性チェッククエリ |
| [03-system-companies-accounts.md](03-system-companies-accounts.md) | システム | 事業者情報・取引先 |
| [04-system-contacts-talents.md](04-system-contacts-talents.md) | システム | 連絡先・タレント |
| [05-system-deals-contracts-projects.md](05-system-deals-contracts-projects.md) | システム | ディール・契約・プロジェクト |
| [06-system-leads-campaigns.md](06-system-leads-campaigns.md) | システム | リード・キャンペーン・アクティビティ・取込 |
| [07-system-platform-admin.md](07-system-platform-admin.md) | システム | 認証・管理・ダッシュボード・共通基盤 |
| [08-e2e-scenarios.md](08-e2e-scenarios.md) | E2E | 業務ジャーニー（Playwright、ランク S はデプロイ毎） |
| [09-acceptance.md](09-acceptance.md) | 受入 | ロール別業務シナリオ（UAT） |

## 運用ルール

- 実装を変更したら、対応するファイルのケースを**同じ作業内で**更新する
- テストで見つかった不具合がケースに無かった場合、修正と同じ PR でケースを追記する
- 各仕様書の「§3 実装上の懸念」は作成時点のコードレビュー所見。対応したら該当行を消し込むこと
