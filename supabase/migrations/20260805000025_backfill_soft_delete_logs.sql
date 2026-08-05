-- ============================================================
-- 過去の変更履歴でも論理削除を「削除」として見せる
--
-- 20260805000024 で新しい記録は SOFT_DELETE / RESTORE として残るようにしたが、
-- **それ以前の記録は UPDATE のまま**で、一覧では「更新」に見え、
-- 変更内容も空（deleted_at / deleted_by しか変わっていないため）になる。
--
-- 409 件が該当した。履歴は消さずに、operation の付け替えだけを行う
-- （何が変わったかの記録＝ changed_fields はそのまま残す）。
-- ============================================================

DO $$
DECLARE
  v_deleted  INTEGER;
  v_restored INTEGER;
BEGIN
  -- deleted_at が「NULL → 値」になった更新は削除操作だった
  UPDATE entity_change_logs
     SET operation = 'SOFT_DELETE'
   WHERE operation = 'UPDATE'
     AND changed_fields ? 'deleted_at'
     AND changed_fields -> 'deleted_at' ->> 'new' IS NOT NULL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- 逆（値 → NULL）は復活
  UPDATE entity_change_logs
     SET operation = 'RESTORE'
   WHERE operation = 'UPDATE'
     AND changed_fields ? 'deleted_at'
     AND changed_fields -> 'deleted_at' ->> 'new' IS NULL
     AND changed_fields -> 'deleted_at' ->> 'old' IS NOT NULL;
  GET DIAGNOSTICS v_restored = ROW_COUNT;

  RAISE NOTICE '過去の履歴: 削除 % 件 / 復活 % 件を付け替えた', v_deleted, v_restored;
END $$;
