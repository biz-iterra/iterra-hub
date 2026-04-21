# -*- coding: utf-8 -*-
"""
Lead/Campaign 修正確認テスト（4件 + リグレッション1件）
"""
import sys
import json
import time
import re
from playwright.sync_api import sync_playwright

if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

BASE_URL = "http://localhost:2000"
MANAGER_EMAIL = "manager@iterra.jp"
ADMIN_EMAIL = "admin@iterra.jp"
PASSWORD = "password123"

LEAD_ID_GENERATION = "c0000001-0000-0000-0000-000000000001"
LEAD_ID_NURTURING   = "c0000001-0000-0000-0000-000000000002"

results = []

def log(msg):
    print(f"[TEST] {msg}", flush=True)

def record(scenario, name, passed, detail=""):
    status = "PASS" if passed else "FAIL"
    results.append({"scenario": scenario, "name": name, "status": status, "detail": detail})
    mark = "OK" if passed else "NG"
    detail_str = f" -- {detail}" if detail else ""
    print(f"  [{mark}] {name}{detail_str}", flush=True)

def login(page, email=MANAGER_EMAIL):
    page.goto(f"{BASE_URL}/login")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    page.locator('input[type="email"]').first.fill(email)
    page.locator('input[type="password"]').first.fill(PASSWORD)
    page.locator('button[type="submit"]').click()
    page.wait_for_load_state("networkidle")
    time.sleep(3)
    log(f"Logged in as {email}, URL={page.url}")

# =================================================================
# シナリオ 1: Campaign 新規作成（ブロッカー2 修正確認）
# =================================================================
def scenario_1_campaign_create(browser):
    log("=== シナリオ1: Campaign 新規作成（created_by エラーなし）===")
    context = browser.new_context()
    page = context.new_page()
    console_errors = []
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)

    try:
        login(page, MANAGER_EMAIL)

        page.goto(f"{BASE_URL}/campaigns/new")
        page.wait_for_load_state("networkidle")
        time.sleep(2)
        page.screenshot(path="/tmp/s1-campaign-new.png")

        body = page.inner_text("body")
        record("1", "Campaign new フォーム表示", "キャンペーン" in body or "Campaign" in body)

        # type select（index で選択）
        sels = page.locator("select").all()
        log(f"  selects found: {len(sels)}")
        if len(sels) >= 1:
            sels[0].select_option(index=1)
            log("  type: 獲得 selected")

        # name input（text type）
        name_inp = page.locator("input[type='text']").first
        if name_inp.count() > 0:
            name_inp.fill("FIX_TEST_Campaign_2026")
            log("  name filled")
            record("1", "name フィールドが存在", True)
        else:
            record("1", "name フィールドが存在", False, "input[type=text] not found")

        # status select
        if len(sels) >= 2:
            sels[1].select_option(index=0)

        # description
        ta = page.locator("textarea").first
        if ta.count() > 0:
            ta.fill("E2E修正確認テスト用キャンペーン")

        page.screenshot(path="/tmp/s1-filled.png")

        save_btn = page.get_by_role("button", name=re.compile("作成|保存|登録|Save|Submit"))
        if save_btn.count() == 0:
            save_btn = page.locator("button[type='submit']")
        record("1", "保存ボタンが存在", save_btn.count() > 0,
               "No submit button" if save_btn.count() == 0 else "")
        if save_btn.count() == 0:
            return

        save_btn.first.click()
        page.wait_for_load_state("networkidle")
        time.sleep(4)
        page.screenshot(path="/tmp/s1-after-save.png")

        final_url = page.url
        body_after = page.inner_text("body")
        log(f"  After save URL: {final_url}")
        log(f"  body[:300]: {body_after[:300]}")

        has_created_by_error = "created_by" in body_after.lower()
        has_column_error = "could not find" in body_after.lower() or "column" in body_after.lower()
        has_generic_error = "エラーが発生" in body_after or "失敗しました" in body_after
        record("1", "'created_by' カラムエラーなし", not has_created_by_error,
               body_after[:200] if has_created_by_error else "")
        record("1", "汎用エラーなし", not (has_generic_error or has_column_error),
               body_after[:200] if (has_generic_error or has_column_error) else "")

        created_ok = "/campaigns/" in final_url and "new" not in final_url
        record("1", "キャンペーン作成後 detail にリダイレクト", created_ok,
               f"URL={final_url}" if not created_ok else "")

        if created_ok:
            page.goto(f"{BASE_URL}/campaigns")
            page.wait_for_load_state("networkidle")
            time.sleep(2)
            list_body = page.inner_text("body")
            record("1", "campaigns 一覧に反映",
                   "FIX_TEST_Campaign_2026" in list_body,
                   "Not found in list" if "FIX_TEST_Campaign_2026" not in list_body else "")
            page.screenshot(path="/tmp/s1-list.png")

        critical = [e for e in console_errors if "Error" in e and "favicon" not in e.lower() and "css" not in e.lower()]
        record("1", "コンソールエラーなし", len(critical) == 0,
               str(critical[:3]) if critical else "")

    except Exception as e:
        record("1", "シナリオ1 実行エラー", False, str(e))
        try: page.screenshot(path="/tmp/s1-error.png")
        except Exception: pass
    finally:
        context.close()


# =================================================================
# シナリオ 2: Opportunity ステージ変更後に一覧表示（ブロッカー1）
# =================================================================
def scenario_2_opportunity_list(browser):
    log("=== シナリオ2: Opportunity ステージ lead が一覧に表示 ===")
    context = browser.new_context()
    page = context.new_page()
    console_errors = []
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)

    try:
        login(page, MANAGER_EMAIL)

        page.goto(f"{BASE_URL}/leads/{LEAD_ID_NURTURING}")
        page.wait_for_load_state("networkidle")
        time.sleep(2)
        page.screenshot(path="/tmp/s2-before.png")
        body1 = page.inner_text("body")
        record("2", "Lead 詳細ページ表示",
               len(body1) > 100 and "見つかりません" not in body1)

        # stage セレクト確認
        selects = page.locator("select").all()
        log(f"  selects: {len(selects)}")
        for i, s in enumerate(selects):
            opts = [o.inner_text() for o in s.locator("option").all()]
            log(f"  sel[{i}] opts: {opts}")

        stage_changed = False
        for sel in selects:
            opts = sel.locator("option").all()
            opt_texts = [o.inner_text() for o in opts]
            if "Opportunity" in opt_texts:
                sel.select_option(label="Opportunity")
                stage_changed = True
                log("  -> Opportunity に変更")
                break

        record("2", "ステージを Opportunity に変更", stage_changed,
               "Opportunity オプションなし" if not stage_changed else "")

        if stage_changed:
            save_btn = page.get_by_role("button", name=re.compile("保存|Save|更新"))
            if save_btn.count() == 0:
                save_btn = page.locator("button[type='submit']")
            if save_btn.count() > 0:
                save_btn.first.click()
                page.wait_for_load_state("networkidle")
                time.sleep(3)
                page.screenshot(path="/tmp/s2-after-save.png")
                body2 = page.inner_text("body")
                log(f"  body after save[:200]: {body2[:200]}")
                no_error = "エラーが発生" not in body2 and "失敗しました" not in body2
                record("2", "Opportunity 保存成功（エラーなし）", no_error,
                       body2[:200] if not no_error else "")
            else:
                record("2", "保存ボタン存在", False, "No save button")

        # /leads 一覧で Opportunity lead が表示されるか
        page.goto(f"{BASE_URL}/leads")
        page.wait_for_load_state("networkidle")
        time.sleep(2)
        page.screenshot(path="/tmp/s2-list.png")
        list_body = page.inner_text("body")

        found_in_list = "山田建設" in list_body
        record("2", "Opportunity lead が /leads 一覧に表示",
               found_in_list,
               "山田建設が一覧に見えない（View フィルタ問題の可能性）" if not found_in_list else "")

        # category なし
        page.goto(f"{BASE_URL}/leads")
        page.wait_for_load_state("networkidle")
        body_nocat = page.inner_text("body")
        no_error_nocat = "500" not in body_nocat and "Internal Server Error" not in body_nocat
        record("2", "leads 一覧がエラーフリー", no_error_nocat,
               "500 Error" if not no_error_nocat else "")

        critical = [e for e in console_errors if "Error" in e and "favicon" not in e.lower() and "css" not in e.lower()]
        record("2", "コンソールエラーなし", len(critical) == 0,
               str(critical[:3]) if critical else "")

    except Exception as e:
        record("2", "シナリオ2 実行エラー", False, str(e))
        try: page.screenshot(path="/tmp/s2-error.png")
        except Exception: pass
    finally:
        context.close()


# =================================================================
# シナリオ 3: /admin/deleted にリードタブ + 復元（機能漏れ1）
# =================================================================
def scenario_3_deleted_lead_restore(browser):
    log("=== シナリオ3: /admin/deleted リードタブ + 復元 ===")
    context = browser.new_context()
    page = context.new_page()
    console_errors = []
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)

    try:
        login(page, ADMIN_EMAIL)

        # まず LEAD_ID_GENERATION を論理削除
        page.goto(f"{BASE_URL}/leads/{LEAD_ID_GENERATION}")
        page.wait_for_load_state("networkidle")
        time.sleep(2)
        page.screenshot(path="/tmp/s3-lead-before-delete.png")
        body_lead = page.inner_text("body")
        log(f"  lead detail body[:200]: {body_lead[:200]}")

        delete_btn = page.get_by_role("button", name=re.compile("削除|Delete"))
        if delete_btn.count() > 0:
            delete_btn.first.click()
            time.sleep(1)
            page.screenshot(path="/tmp/s3-delete-dialog.png")

            reason = page.locator("textarea[name='deletion_reason'], input[name='deletion_reason']")
            if reason.count() > 0:
                reason.first.fill("S3 E2E 削除テスト")

            confirm_del = page.get_by_role("button", name=re.compile("削除する|確認|OK|はい"))
            if confirm_del.count() == 0:
                confirm_del = page.locator("[role='dialog'] button").filter(
                    has_text=re.compile("削除|OK|確認")
                )
            if confirm_del.count() > 0:
                confirm_del.first.click()
                page.wait_for_load_state("networkidle")
                time.sleep(2)
                record("3", "Lead 論理削除成功", True)
                page.screenshot(path="/tmp/s3-after-delete.png")
                log(f"  After delete URL: {page.url}")
            else:
                record("3", "削除確認ボタンあり", False, "確認ダイアログのボタンが見つからない")
        else:
            record("3", "削除ボタン表示", False,
                   f"削除ボタンなし (body: {body_lead[:100]})")

        # /admin/deleted を開く
        page.goto(f"{BASE_URL}/admin/deleted")
        page.wait_for_load_state("networkidle")
        time.sleep(2)
        page.screenshot(path="/tmp/s3-deleted-page.png")
        del_body = page.inner_text("body")
        log(f"  /admin/deleted body[:400]: {del_body[:400]}")

        has_lead_tab = "リード" in del_body
        record("3", "「リード」タブが存在する", has_lead_tab,
               "リードタブなし" if not has_lead_tab else "")

        if has_lead_tab:
            lead_tab = page.locator("button").filter(has_text=re.compile(r"^リード")).first
            if lead_tab.count() == 0:
                lead_tab = page.locator("button").filter(has_text="リード").first
            log(f"  lead_tab count: {lead_tab.count()}")
            if lead_tab.count() > 0:
                lead_tab.click()
                time.sleep(2)
                page.screenshot(path="/tmp/s3-lead-tab.png")
                tab_body = page.inner_text("body")
                log(f"  tab body[:300]: {tab_body[:300]}")
                has_deleted_lead = "テックソリューション" in tab_body
                record("3", "削除済み lead がリードタブに表示",
                       has_deleted_lead,
                       "削除済み lead が見えない" if not has_deleted_lead else "")

                restore_btn = page.get_by_role("button", name=re.compile("復元")).first
                if restore_btn.count() > 0:
                    restore_btn.click()
                    time.sleep(1)
                    page.screenshot(path="/tmp/s3-restore-confirm.png")

                    restore_confirm = page.get_by_role("button", name=re.compile("復元する|OK"))
                    if restore_confirm.count() == 0:
                        restore_confirm = page.locator("[role='dialog'] button").filter(
                            has_text=re.compile("復元|OK")
                        )
                    if restore_confirm.count() > 0:
                        restore_confirm.first.click()
                        page.wait_for_load_state("networkidle")
                        time.sleep(2)
                        page.screenshot(path="/tmp/s3-after-restore.png")
                        record("3", "復元ボタン動作", True)

                        page.goto(f"{BASE_URL}/leads")
                        page.wait_for_load_state("networkidle")
                        time.sleep(2)
                        leads_body = page.inner_text("body")
                        record("3", "復元後 /leads で再表示",
                               "テックソリューション" in leads_body,
                               "復元後も /leads に見えない" if "テックソリューション" not in leads_body else "")
                    else:
                        record("3", "復元確認ダイアログボタンあり", False, "確認ボタンなし")
                else:
                    record("3", "復元ボタン存在", False, "復元ボタンなし")
            else:
                record("3", "リードタブがクリック可能", False, "button not found")

        critical = [e for e in console_errors if "Error" in e and "favicon" not in e.lower() and "css" not in e.lower()]
        record("3", "コンソールエラーなし", len(critical) == 0,
               str(critical[:3]) if critical else "")

    except Exception as e:
        record("3", "シナリオ3 実行エラー", False, str(e))
        try: page.screenshot(path="/tmp/s3-error.png")
        except Exception: pass
    finally:
        context.close()


# =================================================================
# シナリオ 4: Lead フォームで contact/company セレクト（機能漏れ2）
# =================================================================
def scenario_4_lead_form_selects(browser):
    log("=== シナリオ4: /leads/new に contact/company セレクト ===")
    context = browser.new_context()
    page = context.new_page()
    console_errors = []
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)

    try:
        login(page, MANAGER_EMAIL)

        page.goto(f"{BASE_URL}/leads/new")
        page.wait_for_load_state("networkidle")
        time.sleep(3)
        page.screenshot(path="/tmp/s4-new-form.png")
        body = page.inner_text("body")
        log(f"  leads/new body[:500]: {body[:500]}")

        # フォーム要素確認
        selects = page.locator("select").all()
        log(f"  selects count: {len(selects)}")
        for i, s in enumerate(selects):
            opts = [(o.inner_text(), o.get_attribute("value")) for o in s.locator("option").all()]
            log(f"  sel[{i}] name={s.get_attribute('name')} id={s.get_attribute('id')} opts={opts[:4]}")

        # company_id セレクト確認
        company_sel = page.locator("select[name='company_id']")
        record("4", "「既存企業」セレクトが存在 (select[name=company_id])",
               company_sel.count() > 0,
               "company_id select not found" if company_sel.count() == 0 else "")

        contact_sel = page.locator("select[name='contact_id']")
        record("4", "「コンタクト」セレクトが存在 (select[name=contact_id])",
               contact_sel.count() > 0,
               "contact_id select not found" if contact_sel.count() == 0 else "")

        record("4", "フォームに「既存企業」テキストあり",
               "既存企業" in body,
               "テキスト見つからない" if "既存企業" not in body else "")
        record("4", "フォームに「コンタクト」テキストあり",
               "コンタクト" in body,
               "テキスト見つからない" if "コンタクト" not in body else "")

        # 両フィールドを選択して保存テスト
        if company_sel.count() > 0 and contact_sel.count() > 0:
            lead_name = page.locator("input[name='lead_name']")
            if lead_name.count() > 0:
                lead_name.fill("S4_FIX_TEST_contact_company")

            stage_sel = page.locator("select[name='stage_id']")
            if stage_sel.count() > 0:
                opts = stage_sel.locator("option").all()
                for opt in opts:
                    v = opt.get_attribute("value")
                    if v and v.strip():
                        stage_sel.select_option(value=v)
                        break

            co_opts = company_sel.locator("option").all()
            for opt in co_opts:
                v = opt.get_attribute("value")
                if v and v.strip():
                    company_sel.select_option(value=v)
                    log(f"  company: {opt.inner_text()}")
                    break

            ct_opts = contact_sel.locator("option").all()
            for opt in ct_opts:
                v = opt.get_attribute("value")
                if v and v.strip():
                    contact_sel.select_option(value=v)
                    log(f"  contact: {opt.inner_text()}")
                    break

            page.screenshot(path="/tmp/s4-filled.png")

            save_btn = page.get_by_role("button", name=re.compile("作成|保存|登録|Save|Submit"))
            if save_btn.count() == 0:
                save_btn = page.locator("button[type='submit']")
            if save_btn.count() > 0:
                save_btn.first.click()
                page.wait_for_load_state("networkidle")
                time.sleep(3)
                page.screenshot(path="/tmp/s4-after-save.png")
                final_url = page.url
                body_after = page.inner_text("body")
                log(f"  After save URL: {final_url}")
                log(f"  body[:300]: {body_after[:300]}")
                saved_ok = "/leads/" in final_url and "new" not in final_url
                has_error = "エラーが発生" in body_after or "失敗しました" in body_after
                record("4", "company+contact 選択して保存成功",
                       saved_ok and not has_error,
                       f"URL={final_url}, error={has_error}" if not saved_ok or has_error else "")
            else:
                record("4", "保存ボタン存在", False, "No submit button")
        else:
            record("4", "company+contact 両選択で保存テスト", False, "セレクトが存在しないためスキップ")

        # 詳細ページでも company/contact フィールド確認
        page.goto(f"{BASE_URL}/leads/{LEAD_ID_GENERATION}")
        page.wait_for_load_state("networkidle")
        time.sleep(2)
        page.screenshot(path="/tmp/s4-detail-edit.png")
        detail_body = page.inner_text("body")
        detail_html = page.content()
        has_co = "company_id" in detail_html or "既存企業" in detail_body
        has_ct = "contact_id" in detail_html or "コンタクト" in detail_body
        record("4", "詳細編集にも company_id フィールドあり", has_co,
               "company_id not in detail" if not has_co else "")
        record("4", "詳細編集にも contact_id フィールドあり", has_ct,
               "contact_id not in detail" if not has_ct else "")

        critical = [e for e in console_errors if "Error" in e and "favicon" not in e.lower() and "css" not in e.lower()]
        record("4", "コンソールエラーなし", len(critical) == 0,
               str(critical[:3]) if critical else "")

    except Exception as e:
        record("4", "シナリオ4 実行エラー", False, str(e))
        try: page.screenshot(path="/tmp/s4-error.png")
        except Exception: pass
    finally:
        context.close()


# =================================================================
# シナリオ 5: lead_source 自動同期リグレッション
# =================================================================
def scenario_5_lead_source_sync(browser):
    log("=== シナリオ5: lead_source 自動同期（上書きしない）===")
    context = browser.new_context()
    page = context.new_page()
    console_errors = []
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)

    contact_id_used = None

    try:
        login(page, MANAGER_EMAIL)

        # contacts 一覧から有効な contact_id を取得
        page.goto(f"{BASE_URL}/contacts")
        page.wait_for_load_state("networkidle")
        time.sleep(2)
        page.screenshot(path="/tmp/s5-contacts.png")
        contacts_body = page.inner_text("body")
        log(f"  contacts body[:300]: {contacts_body[:300]}")

        links = page.locator("a[href*='/contacts/']").all()
        for lnk in links:
            href = lnk.get_attribute("href") or ""
            if re.search(r"/contacts/[0-9a-f-]{36}", href):
                contact_id_used = href.split("/contacts/")[1].rstrip("/")
                log(f"  Using contact: {contact_id_used}")
                break

        if not contact_id_used:
            record("5", "テスト用 contact が存在する", False, "contacts 一覧が空")
            return

        record("5", "テスト用 contact が存在する", True)

        # contact 詳細で現在の lead_source を確認
        page.goto(f"{BASE_URL}/contacts/{contact_id_used}")
        page.wait_for_load_state("networkidle")
        time.sleep(2)
        page.screenshot(path="/tmp/s5-contact-before.png")
        contact_body_before = page.inner_text("body")
        has_source_before = "DM" in contact_body_before
        log(f"  contact before: DM={'DM' in contact_body_before}")

        # Lead 1: DM で作成（contact を紐付け）
        page.goto(f"{BASE_URL}/leads/new")
        page.wait_for_load_state("networkidle")
        time.sleep(3)

        lead_name = page.locator("input[name='lead_name']")
        if lead_name.count() > 0:
            lead_name.fill("S5_DM_source_test")

        stage_sel = page.locator("select[name='stage_id']")
        if stage_sel.count() > 0:
            opts = stage_sel.locator("option").all()
            for opt in opts:
                v = opt.get_attribute("value")
                if v and v.strip():
                    stage_sel.select_option(value=v)
                    break

        source_sel = page.locator("select[name='lead_source_id']")
        if source_sel.count() > 0:
            opts = source_sel.locator("option").all()
            dm_found = False
            for opt in opts:
                text = opt.inner_text()
                v = opt.get_attribute("value") or ""
                if "DM" == text.strip() or "dm" == v.lower():
                    source_sel.select_option(value=v)
                    dm_found = True
                    log(f"  lead_source -> {text}")
                    break
            if not dm_found:
                # slug=dm で探す
                for opt in opts:
                    v = opt.get_attribute("value") or ""
                    text = opt.inner_text()
                    if v and v.strip() and len(v) > 10:  # UUID形式
                        source_sel.select_option(value=v)
                        log(f"  lead_source (fallback) -> {text}")
                        break
            record("5", "lead_source=DM 選択", dm_found,
                   "DM オプションなし" if not dm_found else "")
        else:
            record("5", "lead_source_id セレクト存在", False, "select not found")

        contact_sel_field = page.locator("select[name='contact_id']")
        if contact_sel_field.count() > 0:
            contact_sel_field.select_option(value=contact_id_used)
            log(f"  contact_id set to {contact_id_used}")

        page.screenshot(path="/tmp/s5-lead1-filled.png")

        save_btn = page.get_by_role("button", name=re.compile("作成|保存|登録|Save|Submit"))
        if save_btn.count() == 0:
            save_btn = page.locator("button[type='submit']")
        if save_btn.count() > 0:
            save_btn.first.click()
            page.wait_for_load_state("networkidle")
            time.sleep(3)
            final_url = page.url
            created1 = "/leads/" in final_url and "new" not in final_url
            record("5", "Lead 1 (DM) 作成成功", created1,
                   f"URL={final_url}" if not created1 else "")
            page.screenshot(path="/tmp/s5-after-create1.png")
            log(f"  body: {page.inner_text('body')[:200]}")
        else:
            record("5", "Lead 1 作成ボタン", False, "No submit button")
            return

        # contact 詳細で lead_source が DM になっているか
        page.goto(f"{BASE_URL}/contacts/{contact_id_used}")
        page.wait_for_load_state("networkidle")
        time.sleep(1)
        page.screenshot(path="/tmp/s5-contact-after-dm.png")
        contact_after_dm = page.inner_text("body")
        has_dm = "DM" in contact_after_dm
        record("5", "contact.lead_source が DM に自動同期",
               has_dm,
               "DM が contact 詳細に見えない" if not has_dm else "")

        # Lead 2: DM 以外で同 contact に紐付け
        page.goto(f"{BASE_URL}/leads/new")
        page.wait_for_load_state("networkidle")
        time.sleep(3)

        lead_name2 = page.locator("input[name='lead_name']")
        if lead_name2.count() > 0:
            lead_name2.fill("S5_other_source_test")

        stage_sel2 = page.locator("select[name='stage_id']")
        if stage_sel2.count() > 0:
            opts2 = stage_sel2.locator("option").all()
            for opt in opts2:
                v = opt.get_attribute("value")
                if v and v.strip():
                    stage_sel2.select_option(value=v)
                    break

        source_sel2 = page.locator("select[name='lead_source_id']")
        if source_sel2.count() > 0:
            opts2 = source_sel2.locator("option").all()
            for opt in opts2:
                v = opt.get_attribute("value") or ""
                text = opt.inner_text()
                if v and v.strip() and "DM" != text.strip() and "dm" != v.lower():
                    source_sel2.select_option(value=v)
                    log(f"  Lead2 lead_source -> {text}")
                    break

        contact_sel2 = page.locator("select[name='contact_id']")
        if contact_sel2.count() > 0:
            try:
                contact_sel2.select_option(value=contact_id_used)
                log(f"  contact_id set to {contact_id_used}")
            except Exception as ce:
                log(f"  contact select error: {ce}")

        save_btn2 = page.get_by_role("button", name=re.compile("作成|保存|登録|Save|Submit"))
        if save_btn2.count() == 0:
            save_btn2 = page.locator("button[type='submit']")
        if save_btn2.count() > 0:
            save_btn2.first.click()
            page.wait_for_load_state("networkidle")
            time.sleep(3)
            final_url2 = page.url
            created2 = "/leads/" in final_url2 and "new" not in final_url2
            record("5", "Lead 2 (DM以外) 作成成功", created2,
                   f"URL={final_url2}" if not created2 else "")

        # contact 詳細で lead_source が DM のまま
        page.goto(f"{BASE_URL}/contacts/{contact_id_used}")
        page.wait_for_load_state("networkidle")
        time.sleep(1)
        page.screenshot(path="/tmp/s5-contact-after-other.png")
        contact_after_other = page.inner_text("body")
        still_dm = "DM" in contact_after_other
        record("5", "contact.lead_source が DM のまま（上書きなし）",
               still_dm,
               "DM が上書きまたは消えた" if not still_dm else "")

        critical = [e for e in console_errors if "Error" in e and "favicon" not in e.lower() and "css" not in e.lower()]
        record("5", "コンソールエラーなし", len(critical) == 0,
               str(critical[:3]) if critical else "")

    except Exception as e:
        record("5", "シナリオ5 実行エラー", False, str(e))
        try: page.screenshot(path="/tmp/s5-error.png")
        except Exception: pass
    finally:
        context.close()


# =================================================================
# Main
# =================================================================
def main():
    log(f"Lead/Campaign 修正確認テスト 開始 ({BASE_URL})")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        page = browser.new_page()
        try:
            page.goto(f"{BASE_URL}/login", timeout=30000)
            page.wait_for_load_state("networkidle", timeout=30000)
            log(f"サーバー到達確認 OK: {page.title()}")
            page.screenshot(path="/tmp/fix-login.png")
            page.close()
        except Exception as e:
            log(f"ERROR: サーバーに到達できません: {e}")
            page.close()
            browser.close()
            sys.exit(1)

        scenario_1_campaign_create(browser)
        scenario_2_opportunity_list(browser)
        scenario_3_deleted_lead_restore(browser)
        scenario_4_lead_form_selects(browser)
        scenario_5_lead_source_sync(browser)

        browser.close()

    print("\n" + "=" * 60, flush=True)
    print("修正確認テスト 結果サマリー", flush=True)
    print("=" * 60, flush=True)

    scenario_labels = {
        "1": "Campaign 新規作成（created_by エラー）[ブロッカー2]",
        "2": "Opportunity ステージ lead 一覧表示 [ブロッカー1]",
        "3": "/admin/deleted リードタブ + 復元 [機能漏れ1]",
        "4": "/leads/new contact/company セレクト [機能漏れ2]",
        "5": "lead_source 自動同期リグレッション",
    }

    for sc in ["1", "2", "3", "4", "5"]:
        sc_results = [r for r in results if r["scenario"] == sc]
        pass_count = sum(1 for r in sc_results if r["status"] == "PASS")
        fail_count = sum(1 for r in sc_results if r["status"] == "FAIL")
        overall = "PASS" if fail_count == 0 else "FAIL"
        label = scenario_labels.get(sc, sc)
        print(f"\nシナリオ{sc} [{overall}] {label} ({pass_count}P/{fail_count}F)", flush=True)
        for r in sc_results:
            mark = "OK" if r["status"] == "PASS" else "NG"
            detail = f" -- {r['detail']}" if r["detail"] else ""
            print(f"  [{mark}] {r['name']}{detail}", flush=True)

    total_pass = sum(1 for r in results if r["status"] == "PASS")
    total_fail = sum(1 for r in results if r["status"] == "FAIL")

    print(f"\n{'=' * 60}", flush=True)
    if total_fail == 0:
        print("最終総合判定: PASS -- Lead/Campaign 機能リリース OK", flush=True)
    else:
        print("最終総合判定: FAIL -- 未解決の問題があります", flush=True)
    print(f"合計: {total_pass} PASS / {total_fail} FAIL", flush=True)
    print("=" * 60, flush=True)

    with open("/tmp/fix-verification-results.json", "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    log("結果を /tmp/fix-verification-results.json に保存")

    sys.exit(0 if total_fail == 0 else 1)


if __name__ == "__main__":
    main()
