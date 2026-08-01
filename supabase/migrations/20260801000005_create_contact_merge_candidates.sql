-- ============================================================
-- 連絡先の統合候補（Phase B）
--
-- 姓名だけが一致し、会社が違う連絡先は「同一人物が転職した」のか
-- 「同姓同名の別人」なのかを機械的に決められない。誤統合は元に戻せないため
-- 自動では統合せず、候補として記録して人が判断する。
--
-- 設計: docs/contact-identity.md § 3.4, § 4
-- ============================================================

-- 統合で吸収された側から、残った側を辿れるようにする。
-- 物理削除はしないため（削除ポリシー）、参照は生きたまま残る。
ALTER TABLE contacts
  ADD COLUMN merged_into_contact_id UUID REFERENCES contacts(id);

COMMENT ON COLUMN contacts.merged_into_contact_id IS
  '統合で吸収された側に入る。残った連絡先を指す。統合済みは deleted_at も立つ';

CREATE TABLE contact_merge_candidates (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ペアの向きで重複しないよう、UUID の小さい方を contact_id に置く
  contact_id           UUID        NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  candidate_contact_id UUID        NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  reason               TEXT        NOT NULL
                       CHECK (reason IN ('same_name_diff_company')),
  -- 一致した項目・食い違った項目。画面で判断材料として見せる
  detail               JSONB       NOT NULL DEFAULT '{}'::JSONB,
  status               TEXT        NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'merged', 'rejected')),
  decided_by_user_id   UUID        REFERENCES crm_users(id),
  decided_at           TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_contact_merge_candidates_pair CHECK (contact_id <> candidate_contact_id),
  CONSTRAINT uq_contact_merge_candidates UNIQUE (contact_id, candidate_contact_id)
);

CREATE INDEX idx_contact_merge_candidates_status ON contact_merge_candidates (status);
CREATE INDEX idx_contact_merge_candidates_contact ON contact_merge_candidates (contact_id);
CREATE INDEX idx_contact_merge_candidates_candidate ON contact_merge_candidates (candidate_contact_id);

CREATE TRIGGER trg_contact_merge_candidates_updated_at
  BEFORE UPDATE ON contact_merge_candidates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: どちらかの連絡先に手が届く人が扱える。判断は manager 以上に限る
ALTER TABLE contact_merge_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY contact_merge_candidates_select ON contact_merge_candidates
  FOR SELECT TO authenticated
  USING (
    is_manager_or_above()
    OR EXISTS (
      SELECT 1 FROM contacts c
       WHERE c.id IN (contact_merge_candidates.contact_id, contact_merge_candidates.candidate_contact_id)
         AND c.owner_user_id = auth.uid()
    )
  );

-- 検出は DB 関数（SECURITY DEFINER）が行うため、直接の INSERT は manager 以上に限る
CREATE POLICY contact_merge_candidates_insert ON contact_merge_candidates
  FOR INSERT TO authenticated
  WITH CHECK (is_manager_or_above());

CREATE POLICY contact_merge_candidates_update ON contact_merge_candidates
  FOR UPDATE TO authenticated
  USING (is_manager_or_above())
  WITH CHECK (is_manager_or_above());

CREATE POLICY contact_merge_candidates_delete ON contact_merge_candidates
  FOR DELETE TO authenticated
  USING (is_admin());

COMMENT ON TABLE contact_merge_candidates IS
  '連絡先の統合候補。姓名のみ一致した組を記録し、統合するかは人が判断する';

-- ============================================================
-- 候補の検出
--
-- 指定した連絡先と姓名が一致する別の連絡先を探して記録する。
-- メールや携帯が一致していれば同定の段階（P1/P2）で同じ連絡先に
-- なっているので、ここへ来るのは「姓名しか手掛かりが無い」組だけ。
--
-- SECURITY DEFINER にするのは、取込中に呼ばれても RLS で書けない
-- ことが無いようにするため。読み書きはこのテーブルに閉じている。
-- ============================================================
CREATE OR REPLACE FUNCTION detect_contact_merge_candidates(p_contact_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_me    contacts%ROWTYPE;
  v_other contacts%ROWTYPE;
  v_count INTEGER := 0;
  v_a     UUID;
  v_b     UUID;
BEGIN
  SELECT * INTO v_me FROM contacts WHERE id = p_contact_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  FOR v_other IN
    SELECT c.*
      FROM contacts c
     WHERE c.id <> v_me.id
       AND c.deleted_at IS NULL
       AND c.last_name = v_me.last_name
       AND COALESCE(c.first_name, '') = COALESCE(v_me.first_name, '')
       -- 同じ会社なら P3 で同一人物と判定済み。ここに来るのは会社が違う組
       AND c.company_id IS DISTINCT FROM v_me.company_id
       -- 統合済みは対象外
       AND c.merged_into_contact_id IS NULL
  LOOP
    -- カナが両方あって食い違うなら別人。候補にも挙げない（誤検知を減らす）
    CONTINUE WHEN v_me.last_name_kana IS NOT NULL
              AND v_other.last_name_kana IS NOT NULL
              AND v_me.last_name_kana <> v_other.last_name_kana;
    CONTINUE WHEN v_me.first_name_kana IS NOT NULL
              AND v_other.first_name_kana IS NOT NULL
              AND v_me.first_name_kana <> v_other.first_name_kana;

    -- ペアの向きを揃える。(A,B) と (B,A) を別の候補にしない
    IF v_me.id < v_other.id THEN
      v_a := v_me.id; v_b := v_other.id;
    ELSE
      v_a := v_other.id; v_b := v_me.id;
    END IF;

    INSERT INTO contact_merge_candidates (contact_id, candidate_contact_id, reason, detail)
    VALUES (
      v_a, v_b, 'same_name_diff_company',
      jsonb_build_object(
        'matched', jsonb_build_array('last_name', 'first_name'),
        'differs', jsonb_build_object(
          'company_id', jsonb_build_array(v_me.company_id, v_other.company_id)
        )
      )
    )
    ON CONFLICT (contact_id, candidate_contact_id) DO NOTHING;

    IF FOUND THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION detect_contact_merge_candidates(UUID) IS
  '姓名が一致し会社が違う連絡先を統合候補として記録する。自動統合はしない';
