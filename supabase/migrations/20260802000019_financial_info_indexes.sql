-- 金融機関情報（financial_info）を事業者ごとに扱うための索引。
--
-- テーブルと RLS（SELECT は manager 以上、CUD は admin）は既にある。
-- 画面から使い始めるので、引き方に合わせた索引と主口座の一意制約を足す。

-- 事業者ごとに引く。論理削除済みは画面に出さないため部分索引にする
CREATE INDEX IF NOT EXISTS idx_financial_info_company
  ON financial_info (company_id)
  WHERE deleted_at IS NULL;

-- 主口座は事業者ごとに 1 つ。振込先が二重に「主」になると
-- どちらへ払うのかが決まらない
CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_info_primary_company
  ON financial_info (company_id)
  WHERE is_primary AND deleted_at IS NULL AND company_id IS NOT NULL;

COMMENT ON TABLE financial_info IS
  '振込先の口座。事業者（company_id）または個人（contact_id）のどちらか一方に付き、1 件の相手が複数持てる。閲覧は manager 以上、追加・変更・削除は admin。';
