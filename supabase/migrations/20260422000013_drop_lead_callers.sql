-- ============================================================
-- lead_callers マスタ廃止
-- crm_users に役割統合済み。
-- leads.primary_caller_id FK は 20260422000012 で DROP 済み。
-- lead_activities.caller_id FK は 20260422000011 で caller_user_id に移行済み。
-- ============================================================

DROP POLICY IF EXISTS lead_callers_select_authenticated ON lead_callers;
DROP POLICY IF EXISTS lead_callers_insert_admin         ON lead_callers;
DROP POLICY IF EXISTS lead_callers_update_admin         ON lead_callers;
DROP POLICY IF EXISTS lead_callers_delete_admin         ON lead_callers;

DROP TABLE lead_callers;
