-- ============================================================
-- 連絡手段（メール・電話）の主連絡先を 1 つに保つ
--
-- 1 人の連絡先に複数のメール・電話が紐づくのは通常の状態で、
-- 画面から増やしたり減らしたりする。そのとき「主」が複数になったり
-- 全部消えたりしないよう、DB 側で保証する。
--
-- 現状 is_primary に制約が無く、UI から切り替えると複数が主になりうる。
-- ============================================================

-- 念のため既存の重複を整理する（最初に作られた 1 件を残す）
UPDATE contact_emails SET is_primary = FALSE
 WHERE is_primary
   AND id NOT IN (
     SELECT DISTINCT ON (contact_id) id FROM contact_emails
      WHERE is_primary ORDER BY contact_id, created_at
   );

UPDATE contact_phones SET is_primary = FALSE
 WHERE is_primary
   AND id NOT IN (
     SELECT DISTINCT ON (contact_id) id FROM contact_phones
      WHERE is_primary ORDER BY contact_id, created_at
   );

CREATE UNIQUE INDEX uq_contact_emails_primary
  ON contact_emails (contact_id) WHERE is_primary;

CREATE UNIQUE INDEX uq_contact_phones_primary
  ON contact_phones (contact_id) WHERE is_primary;

-- ------------------------------------------------------------
-- 主連絡先の切り替え
--
-- 一意インデックスがあるため「落としてから立てる」順序が要る。
-- アプリから 2 回 UPDATE すると途中で制約に触れるので DB 関数にまとめる。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_primary_contact_email(p_id UUID, p_actor UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contact_id UUID;
BEGIN
  SELECT contact_id INTO v_contact_id FROM contact_emails WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'メールアドレスが見つかりません';
  END IF;

  UPDATE contact_emails SET is_primary = FALSE
   WHERE contact_id = v_contact_id AND is_primary AND id <> p_id;

  UPDATE contact_emails
     SET is_primary = TRUE, last_updated_by = COALESCE(p_actor, last_updated_by)
   WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION set_primary_contact_phone(p_id UUID, p_actor UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contact_id UUID;
BEGIN
  SELECT contact_id INTO v_contact_id FROM contact_phones WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '電話番号が見つかりません';
  END IF;

  UPDATE contact_phones SET is_primary = FALSE
   WHERE contact_id = v_contact_id AND is_primary AND id <> p_id;

  UPDATE contact_phones
     SET is_primary = TRUE, last_updated_by = COALESCE(p_actor, last_updated_by)
   WHERE id = p_id;
END;
$$;

-- ------------------------------------------------------------
-- 主連絡先が空にならないようにする
--
-- 主を消したら、残りの中で最初に作られたものを主に繰り上げる。
-- 連絡先に 1 件も無くなった場合は何もしない。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION promote_next_contact_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.is_primary THEN
    UPDATE contact_emails SET is_primary = TRUE
     WHERE id = (
       SELECT id FROM contact_emails
        WHERE contact_id = OLD.contact_id ORDER BY created_at LIMIT 1
     );
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_contact_emails_promote_next
  AFTER DELETE ON contact_emails
  FOR EACH ROW EXECUTE FUNCTION promote_next_contact_email();

CREATE OR REPLACE FUNCTION promote_next_contact_phone()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.is_primary THEN
    UPDATE contact_phones SET is_primary = TRUE
     WHERE id = (
       SELECT id FROM contact_phones
        WHERE contact_id = OLD.contact_id ORDER BY created_at LIMIT 1
     );
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_contact_phones_promote_next
  AFTER DELETE ON contact_phones
  FOR EACH ROW EXECUTE FUNCTION promote_next_contact_phone();

COMMENT ON FUNCTION set_primary_contact_email(UUID, UUID) IS
  '主メールアドレスを切り替える。一意インデックスがあるため落としてから立てる';
COMMENT ON FUNCTION set_primary_contact_phone(UUID, UUID) IS
  '主電話番号を切り替える。一意インデックスがあるため落としてから立てる';
