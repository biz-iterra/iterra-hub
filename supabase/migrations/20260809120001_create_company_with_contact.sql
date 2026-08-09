-- ============================================================
-- 個人事業主の作成時に本人の連絡先を同時に作る（T-0087 / T-0086 の再発防止）
--
-- 背景:
--   本番の CMP-003597（個人事業主）で事業主欄・連絡先一覧が空のまま運用されていた。
--   原因は削除事故ではなく、**手入力での事業者作成が連絡先を一切作らない設計**。
--   新規作成フォームは「代表者の連絡先は作成後に詳細画面から紐づける」という案内を
--   出していたが、その連絡先自体がどこにも作られていなかった。
--   個人事業主は定義上本人が必ず存在するため、作成と同時に本人の連絡先を作る。
--   設計: docs/database-design.md § 22.2.4
--
-- 方針:
--   - 会社と連絡先の 2 テーブルへ書くので、アプリ側の逐次 INSERT ではなく
--     単一トランザクションの DB 関数にまとめる（CLAUDE.md データ整合性の規約）
--   - 連絡先の書き込み規則は 1 箇所に保つため、既存の create_contact_with_details を
--     入れ子で呼ぶ（メール・電話・住所・SNS は今回渡さない）
--   - SECURITY INVOKER。RLS はそのまま効く
--   - **companies の UPDATE ポリシーは is_admin() OR owner_user_id = auth.uid()**。
--     member が担当者を他人にして作ると事業主の紐づけ UPDATE が黙って 0 行になり、
--     「連絡先はあるのに事業主が空」という T-0086 と同じ形が再発する。
--     GET DIAGNOSTICS ROW_COUNT で検出して例外にする（会社ごと巻き戻る）
--
-- 注意:
--   PostgreSQL は引数の個数が変わると CREATE OR REPLACE FUNCTION では置き換えに
--   ならず別オーバーロードとして増える。引数を足すときは旧シグネチャの
--   DROP FUNCTION を先に書くこと（20260809110001 と同じ）。
-- ============================================================

CREATE OR REPLACE FUNCTION create_company_with_contact(
  -- createCompanySchema が整形済みの companies の値
  p_company JSONB,
  -- 本人の連絡先。NULL なら会社だけを作る（同時作成のチェックを外した場合）
  p_contact JSONB DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor      UUID := auth.uid();
  v_company_id UUID;
  v_contact_id UUID := NULL;
  v_owner_id   UUID;
  v_status_id  UUID;
  v_contact    JSONB;
  v_updated    INTEGER;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION '認証が必要です';
  END IF;

  -- ── 1. 事業者情報 ────────────────────────────────────────────────────────
  -- company_code はトリガーが採番する。担当者の指定が無ければ実行者を入れる
  INSERT INTO companies (
    name, name_kana, corporate_type_id, corporate_name, trade_name,
    representative_name, corporate_number,
    invoice_registered, invoice_registration_number,
    phone, fax, website_url,
    industry_classification_id, registration_certificate_url,
    internal_memo, lead_source_id, company_status_id,
    primary_contact_id, representative_contact_id,
    owner_user_id, created_by, last_updated_by
  )
  SELECT
    c.name, c.name_kana, c.corporate_type_id, c.corporate_name, c.trade_name,
    c.representative_name, c.corporate_number,
    COALESCE(c.invoice_registered, FALSE), c.invoice_registration_number,
    c.phone, c.fax, c.website_url,
    c.industry_classification_id, c.registration_certificate_url,
    c.internal_memo, c.lead_source_id, c.company_status_id,
    c.primary_contact_id, c.representative_contact_id,
    COALESCE(c.owner_user_id, v_actor), v_actor, v_actor
  FROM jsonb_to_record(p_company) AS c(
    name                        TEXT,
    name_kana                   TEXT,
    corporate_type_id           UUID,
    corporate_name              TEXT,
    trade_name                  TEXT,
    representative_name         TEXT,
    corporate_number            TEXT,
    invoice_registered          BOOLEAN,
    invoice_registration_number TEXT,
    phone                       TEXT,
    fax                         TEXT,
    website_url                 TEXT,
    industry_classification_id  UUID,
    registration_certificate_url TEXT,
    internal_memo               TEXT,
    lead_source_id              UUID,
    company_status_id           UUID,
    primary_contact_id          UUID,
    representative_contact_id   UUID,
    owner_user_id               UUID
  )
  RETURNING id, owner_user_id INTO v_company_id, v_owner_id;

  -- ── 2. 同時作成を外した場合はここで終わり ────────────────────────────────
  IF p_contact IS NULL OR jsonb_typeof(p_contact) <> 'object' THEN
    RETURN jsonb_build_object('company_id', v_company_id, 'contact_id', NULL);
  END IF;

  -- ── 3. 連絡先の初期ステータス ────────────────────────────────────────────
  -- 指定が無ければ役割フラグから引く。**見つからないときは失敗させる**。
  -- 非決定的な別ステータスへフォールバックすると、誤ったステータスの連絡先を
  -- 作り続けることになり気づきにくい（resolve_or_create_contact と同じ思想）
  v_status_id := NULLIF(p_contact ->> 'contact_status_id', '')::UUID;
  IF v_status_id IS NULL THEN
    SELECT id INTO v_status_id FROM contact_statuses
     WHERE is_new_default AND deleted_at IS NULL LIMIT 1;
    IF v_status_id IS NULL THEN
      RAISE EXCEPTION '連絡先の初期ステータス（is_new_default）が見つかりません。マスタを確認してください';
    END IF;
  END IF;

  -- ── 4. 本人の連絡先 ──────────────────────────────────────────────────────
  -- 事業者・ステータス・担当者を合成して既存の作成関数へ渡す。
  -- 種別は呼び出し側が決める（個人事業主の本人は individual のまま事業者へ結ぶ。
  -- 法人代表へ広げるときは p_contact.contact_type を corporate_rep にする）
  v_contact := p_contact || jsonb_build_object(
    'company_id',        v_company_id,
    'contact_status_id', v_status_id,
    'owner_user_id',     v_owner_id
  );

  v_contact_id := create_contact_with_details(
    v_contact,
    '[]'::JSONB,   -- メール
    '[]'::JSONB,   -- 電話
    NULL::JSONB,   -- 住所
    NULL::UUID,    -- 取引先への紐づけ
    '[]'::JSONB    -- SNS・チャット
  );

  -- ── 5. 事業主・主担当への紐づけ ──────────────────────────────────────────
  -- **0 行更新を黙殺しない。** companies の UPDATE は owner / admin に限られるため、
  -- 担当者を他人にして作った member はここで 0 行になる（T-0086 の再発形）
  UPDATE companies
     SET representative_contact_id = v_contact_id,
         primary_contact_id        = v_contact_id,
         last_updated_by           = v_actor
   WHERE id = v_company_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION '事業主の連絡先を紐づけられませんでした。担当者を自分にするか、管理者に依頼してください';
  END IF;

  RETURN jsonb_build_object('company_id', v_company_id, 'contact_id', v_contact_id);
END;
$$;

COMMENT ON FUNCTION create_company_with_contact IS
'事業者情報と本人の連絡先（個人事業主）を単一トランザクションで作り、事業主・主担当へ紐づける。値の整形は呼び出し側（Server Action）の責務。SECURITY INVOKER なので RLS がそのまま効く';

REVOKE ALL ON FUNCTION create_company_with_contact(JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_company_with_contact(JSONB, JSONB) TO authenticated;
