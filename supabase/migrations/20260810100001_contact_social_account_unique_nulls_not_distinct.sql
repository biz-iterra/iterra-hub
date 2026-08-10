-- ============================================================
-- SNS・チャットの一意制約を workspace NULL でも効かせる（T-0084）
--
-- `uq_contact_social_account (contact_id, service_id, account_id, workspace)`
-- は PostgreSQL の既定（NULLS DISTINCT）では **NULL 同士を別の値として扱う**ため、
-- workspace を持たないサービス（Chatwork・LINE・X …＝ Slack 以外すべて）では
-- まったく同じ ID を何度でも登録できてしまった。実質、重複防止が効いていたのは
-- Slack だけという状態。
--
-- PostgreSQL 15 で入った `UNIQUE NULLS NOT DISTINCT` へ置き換えて、
-- NULL 同士も「同じ」と見なす。ワークスペース違いが別物として通ることは変わらない。
--
-- 記録: docs/database-design.md § 25.1.1、docs/test-cases/04-system-contacts-talents.md CNT-41
-- ============================================================

-- ------------------------------------------------------------
-- 0. 前提の確認
--
-- NULLS NOT DISTINCT は PostgreSQL 15 以降。古い環境では黙って
-- 素通りさせず、何をすべきか分かる形で止める（部分ユニークインデックス
-- 2 本方式へ切り替えることになる）
-- ------------------------------------------------------------
DO $$
BEGIN
  IF current_setting('server_version_num')::INTEGER < 150000 THEN
    RAISE EXCEPTION
      'UNIQUE NULLS NOT DISTINCT には PostgreSQL 15 以上が必要です（現在 %）。部分ユニークインデックス 2 本方式へ書き換えてください',
      current_setting('server_version');
  END IF;
END $$;

-- ------------------------------------------------------------
-- 1. 既存の重複を掃除する
--
-- **制約を張る前に必ず通す。** 重複が残っていると ADD CONSTRAINT が失敗し、
-- マイグレーション全体が止まる。
--
-- この表は論理削除を持たない（deleted_at 列が無く、連絡先の削除にも
-- ON DELETE CASCADE で追随する従属テーブル）ため、掃除は物理削除で行う。
-- 消した行は `entity_change_logs` のトリガーが DELETE として記録するので
-- 監査証跡は残る。
--
-- 残すのは **created_at が最も古い 1 行**（同時刻なら id 順で先頭）。
-- 後から入った同じ ID の行は表示上も重複でしかない。
--
-- ウィンドウ関数の PARTITION BY は GROUP BY と同じく NULL 同士を等しいと
-- 見なすため、workspace が NULL の組も 1 つのまとまりになる。
-- ------------------------------------------------------------
DO $$
DECLARE
  v_groups  INTEGER;
  v_deleted INTEGER;
BEGIN
  SELECT count(*) INTO v_groups
    FROM (
      SELECT 1
        FROM contact_social_accounts
       GROUP BY contact_id, service_id, account_id, workspace
      HAVING count(*) > 1
    ) g;

  WITH ranked AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY contact_id, service_id, account_id, workspace
             ORDER BY created_at, id
           ) AS rn
      FROM contact_social_accounts
  )
  DELETE FROM contact_social_accounts t
   USING ranked r
   WHERE t.id = r.id
     AND r.rn > 1;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RAISE NOTICE '[uq_contact_social_account] 重複グループ % 件 / 削除 % 行（各グループの最古 1 行を残した）',
    v_groups, v_deleted;
END $$;

-- ------------------------------------------------------------
-- 2. 制約の張り替え
--
-- 列の構成は変えない。NULL の扱いだけを変える
-- ------------------------------------------------------------
ALTER TABLE contact_social_accounts
  DROP CONSTRAINT IF EXISTS uq_contact_social_account;

ALTER TABLE contact_social_accounts
  ADD CONSTRAINT uq_contact_social_account
    UNIQUE NULLS NOT DISTINCT (contact_id, service_id, account_id, workspace);

COMMENT ON CONSTRAINT uq_contact_social_account ON contact_social_accounts IS
  '同じ連絡先に同じサービス・同じ ID を二重登録させない。NULLS NOT DISTINCT なので workspace を持たないサービスでも効く（T-0084）';
