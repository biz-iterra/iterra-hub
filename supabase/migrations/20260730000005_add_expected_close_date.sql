-- ============================================================
-- 商談のクローズ予定日と、パイプライン別の既定リードタイム
--
-- これまで deals の日付は application_date / review_completed_date /
-- stage_updated_at / closed_at の 4 つで、すべて「起きたこと」の実績日だった。
-- 着地見込みや期日超過を扱えなかったため、予定日を持たせる。
--
-- 予定日は商談新規作成時にパイプライン別の既定月数から自動セットする。
-- 商材によってリードタイムが違う（例: 単発の営業案件と長期の業務委託）ため、
-- 月数はパイプライン種別マスタ側に持たせて admin から変更できるようにする。
-- ============================================================

-- ---------- deals.expected_close_date ----------
ALTER TABLE deals
  ADD COLUMN expected_close_date DATE;

COMMENT ON COLUMN deals.expected_close_date IS
  'クローズ予定日。新規作成時に pipeline_types.default_close_months から自動セット（手動変更可）';

-- 期日順ソート・期日超過の抽出用。クローズ済みは対象外なので部分インデックスにする
CREATE INDEX idx_deals_expected_close_date
  ON deals(expected_close_date)
  WHERE closed_at IS NULL AND deleted_at IS NULL;

-- 実績日との前後関係に制約は設けない。
-- 予定より早くクローズするのは正常であり、CHECK を入れると正当な入力を弾く。

-- ---------- pipeline_types.default_close_months ----------
ALTER TABLE pipeline_types
  ADD COLUMN default_close_months INTEGER
  CONSTRAINT chk_pipeline_types_default_close_months
  CHECK (
    default_close_months IS NULL
    OR (default_close_months >= 0 AND default_close_months <= 120)
  );

COMMENT ON COLUMN pipeline_types.default_close_months IS
  '商談新規作成時のクローズ予定日を「今日 + N ヶ月」で初期設定する。NULL なら自動設定しない（空欄で作成）';

-- 既存パイプラインは 1 ヶ月を初期値にする。
-- 実際のリードタイムは業務判断なので、マスタ・取込画面で調整する前提の暫定値。
UPDATE pipeline_types
SET default_close_months = 1
WHERE default_close_months IS NULL
  AND deleted_at IS NULL;

-- 既存 deals の expected_close_date は NULL のままにする。
-- 過去の商談に予定日を後付けで推定して入れると実態と乖離した数字が残るため。
