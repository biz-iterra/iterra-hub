-- ============================================================
-- 兼務: 1 人の連絡先が複数の事業者情報に関わる
--
-- 背景（2026-08-06 の指摘）:
--   freee の突合で、同じ人が 2 社の担当者になっている例が出た
--   （坂本 明久 = DOCTOR QREATIVES と PICASSO INTERNATIONAL JAPAN、
--     人見 麻里 = ペリニィヨン と アークヒューマンキャピタル）。
--   `contacts.company_id` は 1 列なので **1 人は 1 社にしか属せず**、
--   freee の担当者として選ぶ候補にも出てこない。差分が消せない。
--
-- 方針（利用者判断・案 B）:
--   **`contacts.company_id` は「主たる所属」として残す。** 兼務だけを
--   中間表で足す。既存の取込・名寄せ・RLS・一覧はそのまま動く。
--   参照は `company_contact_affiliations` ビューに寄せ、
--   **「どの連絡先がこの事業者に関わるか」を 2 か所で判定させない。**
--
--   全面的に中間表へ移す案（`company_id` の廃止）は採らなかった。
--   TS 33 ファイル・マイグレーション 35 本・ポリシー 23 本に影響し、
--   一度に動かすと壊れたときの切り分けができないため。
--   このビューを挟んでおけば、後から移すときの受け皿になる。
-- ============================================================

-- ------------------------------------------------------------
-- 1. 兼務表
-- ------------------------------------------------------------
CREATE TABLE company_contacts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id  UUID        NOT NULL REFERENCES contacts(id)  ON DELETE CASCADE,
  -- この事業者での役職。連絡先本体の役職は主たる所属のもので、兼務先では違う
  job_title   TEXT        CHECK (job_title IS NULL OR char_length(job_title) <= 100),
  note        TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES crm_users(id),
  last_updated_by UUID REFERENCES crm_users(id),

  -- 同じ組み合わせは 1 行だけ
  UNIQUE (company_id, contact_id)
);

CREATE INDEX company_contacts_company_idx ON company_contacts(company_id);
CREATE INDEX company_contacts_contact_idx ON company_contacts(contact_id);

COMMENT ON TABLE company_contacts IS
'兼務。主たる所属は contacts.company_id が持ち、ここには「それ以外に関わる事業者」だけを入れる';
COMMENT ON COLUMN company_contacts.job_title IS
'この事業者での役職。連絡先本体の役職は主たる所属のもの';

CREATE TRIGGER trg_company_contacts_updated_at
  BEFORE UPDATE ON company_contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 変更履歴（トリガーが全経路を記録する。アプリからは INSERT しない）
CREATE TRIGGER trg_company_contacts_change_log
  AFTER INSERT OR UPDATE OR DELETE ON company_contacts
  FOR EACH ROW EXECUTE FUNCTION log_entity_change();

-- ------------------------------------------------------------
-- 2. 主たる所属と重ねない
--
-- `contacts.company_id` と同じ事業者を兼務にも入れると、ビューで
-- 同じ人が 2 行出る。**入れさせない**（気づかないまま二重に数える）。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_company_contact_not_primary()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_primary UUID;
BEGIN
  SELECT company_id INTO v_primary FROM contacts WHERE id = NEW.contact_id;
  IF v_primary IS NOT NULL AND v_primary = NEW.company_id THEN
    RAISE EXCEPTION '主たる所属と同じ事業者情報は兼務に登録できません';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_company_contacts_not_primary
  BEFORE INSERT OR UPDATE OF company_id, contact_id ON company_contacts
  FOR EACH ROW EXECUTE FUNCTION check_company_contact_not_primary();

COMMENT ON FUNCTION check_company_contact_not_primary IS
'主たる所属（contacts.company_id）と同じ事業者を兼務に入れさせない。ビューで二重に出るのを防ぐ';

-- ------------------------------------------------------------
-- 3. 参照はここに寄せる
--
-- **「この事業者に関わる連絡先」を聞かれたら必ずこのビューを使う。**
-- contacts.company_id を直接見ると兼務が漏れる。
--
-- security_invoker を立てて、下のテーブルの RLS がそのまま効くようにする
-- （既定の definer だと RLS を素通りする）。
-- ------------------------------------------------------------
CREATE VIEW company_contact_affiliations
WITH (security_invoker = true) AS
  SELECT c.company_id,
         c.id            AS contact_id,
         TRUE            AS is_primary_affiliation,
         c.job_title,
         NULL::UUID      AS company_contact_id
    FROM contacts c
   WHERE c.company_id IS NOT NULL
     AND c.deleted_at IS NULL
  UNION ALL
  SELECT cc.company_id,
         cc.contact_id,
         FALSE,
         COALESCE(cc.job_title, ct.job_title),
         cc.id
    FROM company_contacts cc
    JOIN contacts ct ON ct.id = cc.contact_id AND ct.deleted_at IS NULL;

COMMENT ON VIEW company_contact_affiliations IS
'事業者情報に関わる連絡先。主たる所属（contacts.company_id）と兼務（company_contacts）を合わせたもの。参照はここに寄せる';

GRANT SELECT ON company_contact_affiliations TO authenticated;

-- ------------------------------------------------------------
-- 4. RLS
--
-- 参照は認証済み全員（従属テーブルの方針。20260803000008）。
-- 書き込みは親の事業者情報の担当者か manager 以上。
--
-- 引数なしの関数はスカラーサブクエリで包む（プランナが行ごとに評価するのを防ぐ）。
-- ------------------------------------------------------------
ALTER TABLE company_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY company_contacts_select ON company_contacts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY company_contacts_insert ON company_contacts
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT is_manager_or_above())
    OR EXISTS (
      SELECT 1 FROM companies c
       WHERE c.id = company_contacts.company_id
         AND c.owner_user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY company_contacts_update ON company_contacts
  FOR UPDATE TO authenticated
  USING (
    (SELECT is_manager_or_above())
    OR EXISTS (
      SELECT 1 FROM companies c
       WHERE c.id = company_contacts.company_id
         AND c.owner_user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY company_contacts_delete ON company_contacts
  FOR DELETE TO authenticated
  USING (
    (SELECT is_manager_or_above())
    OR EXISTS (
      SELECT 1 FROM companies c
       WHERE c.id = company_contacts.company_id
         AND c.owner_user_id = (SELECT auth.uid())
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON company_contacts TO authenticated;

-- ------------------------------------------------------------
-- 5. freee の担当者候補を兼務まで広げる
--
-- 変更は探す範囲だけ。**同名の別人を拾わない**という前提は変わらない
-- （範囲は「その事業者に関わる人」のままで、そこに兼務が加わる）。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION detect_freee_contact_candidates(p_partner_id UUID)
RETURNS TABLE (
  contact_id   UUID,
  contact_name TEXT,
  reason       TEXT,
  is_primary   BOOLEAN
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  fp        freee_partners%ROWTYPE;
  v_target  TEXT;
BEGIN
  SELECT * INTO fp FROM freee_partners WHERE id = p_partner_id;
  IF NOT FOUND OR fp.company_id IS NULL THEN
    RETURN;
  END IF;

  v_target := normalize_person_name(fp.contact_name);
  IF v_target IS NULL THEN
    RETURN;  -- freee 側が空なら候補を出さない
  END IF;

  RETURN QUERY
  SELECT c.id,
         btrim(concat_ws(' ',
           NULLIF(btrim(COALESCE(c.last_name, '')), ''),
           NULLIF(btrim(COALESCE(c.middle_name, '')), ''),
           NULLIF(btrim(COALESCE(c.first_name, '')), '')
         )),
         m.reason,
         (co.primary_contact_id = c.id) AS is_primary
    FROM company_contact_affiliations aff
    JOIN contacts c  ON c.id = aff.contact_id
    JOIN companies co ON co.id = aff.company_id
    JOIN LATERAL (
      SELECT CASE
        WHEN normalize_person_name(
               concat(c.last_name, c.middle_name, c.first_name)) = v_target
          THEN 'exact_full'
        WHEN normalize_person_name(concat(c.last_name, c.first_name)) = v_target
          THEN 'exact_name'
        WHEN normalize_person_name(c.last_name) = v_target
          THEN 'last_name'
      END AS reason
    ) m ON m.reason IS NOT NULL
   -- **その事業者に関わる連絡先だけ**を見る（主たる所属 + 兼務）。
   -- 全件から探すと同名の別人を拾う
   WHERE aff.company_id = fp.company_id
     AND c.deleted_at IS NULL
   ORDER BY CASE m.reason
              WHEN 'exact_full' THEN 1
              WHEN 'exact_name' THEN 2
              ELSE 3
            END,
            c.last_name, c.first_name;
END;
$$;

COMMENT ON FUNCTION detect_freee_contact_candidates IS
'freee の担当者名に近い連絡先の候補。提案のみで自動確定には使わない。範囲はその事業者に関わる連絡先（主たる所属 + 兼務）';

REVOKE ALL ON FUNCTION detect_freee_contact_candidates(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION detect_freee_contact_candidates(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 6. 主担当の設定も兼務を許す
--
-- 画面から任意の ID を送られても弾く、という守りは変えない。
-- 判定の範囲がビューに変わるだけ。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_company_primary_contact_from_freee(
  p_partner_id UUID,
  p_contact_id UUID,
  p_actor      UUID DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  fp      freee_partners%ROWTYPE;
  v_actor UUID := COALESCE(auth.uid(), p_actor);
  v_prev  UUID;
BEGIN
  IF NOT COALESCE(is_admin(), FALSE) THEN
    RAISE EXCEPTION 'freee との同期は admin だけが行えます';
  END IF;

  SELECT * INTO fp FROM freee_partners WHERE id = p_partner_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'freee 取引先が見つかりません'; END IF;
  IF fp.company_id IS NULL THEN RAISE EXCEPTION '事業者情報に紐付いていません'; END IF;

  -- **その事業者に関わる連絡先であることを必ず確認する**（主たる所属 + 兼務）。
  -- 画面から任意の ID を送られても、関わりの無い連絡先は紐づけない
  IF NOT EXISTS (
    SELECT 1 FROM company_contact_affiliations aff
      JOIN contacts c ON c.id = aff.contact_id AND c.deleted_at IS NULL
     WHERE aff.contact_id = p_contact_id
       AND aff.company_id = fp.company_id
  ) THEN
    RAISE EXCEPTION 'この連絡先は対象の事業者に関わっていません（所属か兼務の登録が要ります）';
  END IF;

  SELECT primary_contact_id INTO v_prev FROM companies WHERE id = fp.company_id;

  UPDATE companies
     SET primary_contact_id = p_contact_id,
         last_updated_by    = v_actor
   WHERE id = fp.company_id;
END;
$$;

COMMENT ON FUNCTION set_company_primary_contact_from_freee IS
'freee の担当者名から選んだ連絡先を事業者の主担当にする。連絡先は作らない。範囲は主たる所属 + 兼務';

REVOKE ALL ON FUNCTION set_company_primary_contact_from_freee(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_company_primary_contact_from_freee(UUID, UUID, UUID) TO authenticated;

DO $mig$
BEGIN
  RAISE NOTICE '兼務（company_contacts）を追加した。参照は company_contact_affiliations へ';
END $mig$;
