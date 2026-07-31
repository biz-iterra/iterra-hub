-- ============================================================
-- 法人情報のステータスを「実在性」ベースに置き換える
--
-- 背景:
--   company_statuses は アクティブ / 休眠 / 取引停止 / 見込み だった。
--   これは取引状態の語彙で、取引先区分（account_role_types）や商談と役割が重なる。
--   名刺取込で作られた 3,597 件が一律「見込み」になり、意味を持たなくなっていた。
--
--   法人情報は「法的実体の台帳」なので、状態は実在性で表す。
--   取引しているかどうかは取引先（Account）側が持つ。
--
--     未確認     … 実在確認をまだ行っていない
--     実在確認済 … 法人番号システム等で存在を確認できた
--     要確認     … 商号・所在地の変更を検知した、または照合できなかった
--     閉鎖・解散 … 登記が閉鎖されている
--
-- 定期的に実在確認を回すため、確認の記録（いつ・何で・結果）を持たせる。
-- ============================================================

-- ------------------------------------------------------------
-- code 列
-- プログラムから状態を引くため。既存マスタ（account_statuses）にならう
-- ------------------------------------------------------------
ALTER TABLE company_statuses ADD COLUMN IF NOT EXISTS code VARCHAR(32);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'company_statuses_code_key'
  ) THEN
    CREATE UNIQUE INDEX company_statuses_code_key
      ON company_statuses(code) WHERE code IS NOT NULL;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 新しいステータス
-- ------------------------------------------------------------
INSERT INTO company_statuses (name, code, definition, color) VALUES
  ('未確認',     'unverified',   '実在確認をまだ行っていない',                       '#6B7280'),
  ('実在確認済', 'verified',     '法人番号システム等で存在を確認できた',             '#4D7A65'),
  ('要確認',     'needs_review', '商号・所在地の変更を検知した、または照合できなかった', '#B88A2E'),
  ('閉鎖・解散', 'closed',       '登記が閉鎖されている',                             '#B03A2E')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 移行
-- 旧ステータスは取引状態を表しており、実在性は誰も確認していない。
-- 実態に合わせて全件「未確認」から始める
-- ------------------------------------------------------------
DO $$
DECLARE
  v_unverified UUID;
  v_moved      INTEGER := 0;
BEGIN
  SELECT id INTO v_unverified FROM company_statuses WHERE code = 'unverified' LIMIT 1;
  IF v_unverified IS NULL THEN
    RAISE EXCEPTION '法人ステータス「未確認」の作成に失敗しました';
  END IF;

  UPDATE companies c
     SET company_status_id = v_unverified
   WHERE EXISTS (
     SELECT 1 FROM company_statuses s
      WHERE s.id = c.company_status_id
        AND s.code IS NULL          -- 旧ステータス（code を持たない）
   );
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  UPDATE company_statuses
     SET deleted_at      = now(),
         deletion_reason = '取引状態の語彙のため廃止。法人情報は実在性で状態を表す（取引状態は取引先側が持つ）'
   WHERE code IS NULL
     AND deleted_at IS NULL;

  RAISE NOTICE '法人ステータス移行: % 件を「未確認」へ', v_moved;
END $$;

-- ------------------------------------------------------------
-- 実在確認の記録
--
-- companies に「最後にどう確認したか」を持たせる。
-- 一覧・詳細でそのまま出せるようにするため、集計ではなくカラムで持つ。
-- ------------------------------------------------------------
ALTER TABLE companies ADD COLUMN IF NOT EXISTS verified_at          TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS verified_by          UUID REFERENCES crm_users(id);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS verification_source  TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS verification_note    TEXT;

ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_verification_source_check;
ALTER TABLE companies ADD CONSTRAINT companies_verification_source_check
  CHECK (verification_source IS NULL OR verification_source IN ('houjin_bangou_api', 'manual'));

COMMENT ON COLUMN companies.verified_at         IS '実在確認を最後に行った日時';
COMMENT ON COLUMN companies.verification_source IS '確認手段。houjin_bangou_api = 国税庁 法人番号 Web-API、manual = 担当者による手動確認';
COMMENT ON COLUMN companies.verification_note   IS '検知した差分や照合できなかった理由';

-- 未確認・古い確認から順に処理したいので、確認日時で引けるようにする
CREATE INDEX IF NOT EXISTS companies_verified_at_idx
  ON companies (verified_at NULLS FIRST)
  WHERE deleted_at IS NULL;

-- ------------------------------------------------------------
-- 確認履歴
--
-- 「定期的に回す」運用では、いつ何件処理し何が変わったかを後から追えることが要る。
-- companies のカラムは最新の 1 回分しか持てないため履歴を別に残す。
-- INSERT ONLY（履歴テーブルの規約）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS company_verification_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  checked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- houjin_bangou_api / manual
  source      TEXT NOT NULL,
  -- verified: 一致した / changed: 差分を検知 / not_found: 見つからない
  -- closed: 登記閉鎖 / error: 通信・解析エラー
  result      TEXT NOT NULL,
  -- 照合で得た法人番号（引き当てられた場合）
  corporate_number VARCHAR(13),
  -- 差分の内容や API の生応答など。後から原因を追うため
  detail      JSONB,
  checked_by  UUID REFERENCES crm_users(id),

  CONSTRAINT company_verification_logs_source_check
    CHECK (source IN ('houjin_bangou_api', 'manual')),
  CONSTRAINT company_verification_logs_result_check
    CHECK (result IN ('verified', 'changed', 'not_found', 'closed', 'error'))
);

CREATE INDEX IF NOT EXISTS company_verification_logs_company_idx
  ON company_verification_logs(company_id, checked_at DESC);

COMMENT ON TABLE company_verification_logs IS '法人の実在確認の履歴。INSERT ONLY';

ALTER TABLE company_verification_logs ENABLE ROW LEVEL SECURITY;

-- 親 companies の可視性を引き継ぐ
CREATE POLICY company_verification_logs_select ON company_verification_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM companies c
       WHERE c.id = company_verification_logs.company_id
         AND (is_manager_or_above() OR c.owner_user_id = auth.uid())
    )
  );

-- 記録は照合処理（service_role / admin）からのみ
CREATE POLICY company_verification_logs_insert ON company_verification_logs
  FOR INSERT TO authenticated
  WITH CHECK (is_manager_or_above());

-- ------------------------------------------------------------
-- 取込時の既定ステータスを「未確認」にする
--
-- 20260731000003 の resolve_or_create_company を差し替える。
-- 変更点は既定ステータスの選び方のみ（name='見込み' → code='unverified'）。
-- 名刺から作った法人はまだ実在確認をしていないため。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION resolve_or_create_company(
  p_company_name   TEXT,
  p_email          TEXT,
  p_phone          TEXT,
  p_url            TEXT,
  p_owner_user_id  UUID,
  p_lead_source_id UUID,
  p_actor          UUID
) RETURNS UUID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_domain     TEXT := normalize_domain(p_email);
  v_norm       TEXT := normalize_company_name(p_company_name);
  v_usable_dom BOOLEAN;
  v_id         UUID;
  v_status_id  UUID;
BEGIN
  -- フリーメールは個人アドレスなので法人の識別に使えない
  v_usable_dom := v_domain IS NOT NULL AND NOT is_free_email_domain(v_domain);

  -- 1. ドメイン一致
  IF v_usable_dom THEN
    SELECT cd.company_id INTO v_id
      FROM company_domains cd
      JOIN companies c ON c.id = cd.company_id AND c.deleted_at IS NULL
     WHERE cd.domain = v_domain
     LIMIT 1;
  END IF;

  -- 2. 会社名一致
  IF v_id IS NULL AND v_norm IS NOT NULL THEN
    SELECT id INTO v_id
      FROM companies
     WHERE normalize_company_name(name) = v_norm
       AND deleted_at IS NULL
     ORDER BY created_at
     LIMIT 1;
  END IF;

  -- 3. 新規作成。会社名が無ければ法人は作らない（ドメインだけでは社名を決められない）
  IF v_id IS NULL THEN
    IF v_norm IS NULL THEN
      RETURN NULL;
    END IF;

    -- 名刺から作った法人は実在確認をしていないので「未確認」から始める
    SELECT id INTO v_status_id FROM company_statuses
     WHERE code = 'unverified' AND deleted_at IS NULL LIMIT 1;
    IF v_status_id IS NULL THEN
      SELECT id INTO v_status_id FROM company_statuses
       WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;
    END IF;
    IF v_status_id IS NULL THEN
      RAISE EXCEPTION 'company_statuses が未投入です';
    END IF;

    INSERT INTO companies (
      name, phone, website_url, company_status_id,
      lead_source_id, owner_user_id, created_by, last_updated_by
    ) VALUES (
      btrim(p_company_name), NULLIF(btrim(COALESCE(p_phone, '')), ''),
      NULLIF(btrim(COALESCE(p_url, '')), ''), v_status_id,
      p_lead_source_id, p_owner_user_id, p_actor, p_actor
    ) RETURNING id INTO v_id;
  END IF;

  -- ドメインを法人に紐付ける。以降の取込がこの法人に寄るようにする。
  -- 既に他社へ登録済みなら握りつぶす（先に登録された方を正とする）
  IF v_usable_dom THEN
    INSERT INTO company_domains (company_id, domain, is_primary, created_by, last_updated_by)
    VALUES (
      v_id, v_domain,
      NOT EXISTS (SELECT 1 FROM company_domains WHERE company_id = v_id),
      p_actor, p_actor
    )
    ON CONFLICT (domain) DO NOTHING;
  END IF;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION resolve_or_create_company IS
  '名刺の会社名／メールドメインから法人を名寄せし、無ければ「未確認」で作成する。ドメインも同時に登録する';
