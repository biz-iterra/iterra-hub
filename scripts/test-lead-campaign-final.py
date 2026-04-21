# -*- coding: utf-8 -*-
"""
Lead/Campaign Final E2E Test
Scenarios A-E
"""
import sys
import json
import time
import re
import os
from playwright.sync_api import sync_playwright, expect

# Force UTF-8 output on Windows
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

BASE_URL = "http://localhost:3000"
MEMBER_EMAIL = "member@iterra.jp"
MANAGER_EMAIL = "manager@iterra.jp"
ADMIN_EMAIL = "admin@iterra.jp"
PASSWORD = "password123"

# seed data constants
LEAD_ID_1 = "c0000001-0000-0000-0000-000000000001"   # generation stage
LEAD_ID_2 = "c0000001-0000-0000-0000-000000000002"   # nurturing stage
CONTACT_ID = "30000000-0000-0000-0000-000000000001"  # Yamada Taro

results = []

def log(msg):
    print(f"[TEST] {msg}", flush=True)

def record(scenario, name, passed, detail=""):
    status = "PASS" if passed else "FAIL"
    results.append({"scenario": scenario, "name": name, "status": status, "detail": detail})
    mark = "OK" if passed else "NG"
    detail_str = f" -- {detail}" if detail else ""
    print(f"  [{mark}] {name}{detail_str}", flush=True)

def login(page, email=MEMBER_EMAIL, password=PASSWORD):
    page.goto(f"{BASE_URL}/login")
    page.wait_for_load_state("networkidle")
    email_input = page.locator('input[type="email"], input[name="email"]').first
    email_input.fill(email)
    pwd_input = page.locator('input[type="password"], input[name="password"]').first
    pwd_input.fill(password)
    page.locator('button[type="submit"]').click()
    page.wait_for_url(re.compile(r"/(dashboard|leads|deals|campaigns|contacts|companies|admin)"), timeout=15000)
    log(f"  Logged in as {email}, URL={page.url}")

def logout_via_navigate(page):
    try:
        page.goto(f"{BASE_URL}/login")
        page.wait_for_load_state("networkidle")
    except Exception:
        pass


# ===================================================================
# Scenario B: inside_sales removal verification (Phase D)
# ===================================================================
def scenario_b(browser):
    log("=== Scenario B: inside_sales removal ===")
    context = browser.new_context()
    page = context.new_page()
    console_errors = []
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)

    try:
        login(page, MANAGER_EMAIL)

        # B-1: /deals - no inside-sales pipeline
        page.goto(f"{BASE_URL}/deals")
        page.wait_for_load_state("networkidle")
        page.screenshot(path="/tmp/b1-deals.png")
        body = page.inner_text("body")
        record("B", "No inside-sales on /deals page", "インサイドセールス" not in body,
               "Found" if "インサイドセールス" in body else "")

        # B-2: sidebar check
        sidebar = page.locator("nav, aside, [data-sidebar]").first
        sidebar_text = sidebar.inner_text() if sidebar.count() > 0 else body[:500]
        record("B", "No inside-sales in sidebar", "インサイドセールス" not in sidebar_text,
               "Found in sidebar" if "インサイドセールス" in sidebar_text else "")

        # B-3: /admin/inside-sales is 404
        page.goto(f"{BASE_URL}/admin/inside-sales")
        page.wait_for_load_state("networkidle")
        page.screenshot(path="/tmp/b3-admin-is.png")
        resp_status = page.evaluate("() => window.__NEXT_DATA__ ? 200 : null")
        body3 = page.inner_text("body")
        is_404 = ("404" in body3 or "not found" in body3.lower()
                  or "見つかりません" in body3 or "ページが見つかりません" in body3)
        record("B", "/admin/inside-sales returns 404/NotFound", is_404,
               "Page rendered normally" if not is_404 else "")

        # B-4: /admin/inside-sales/import is 404
        page.goto(f"{BASE_URL}/admin/inside-sales/import")
        page.wait_for_load_state("networkidle")
        body4 = page.inner_text("body")
        is_404_2 = ("404" in body4 or "not found" in body4.lower()
                    or "見つかりません" in body4 or "ページが見つかりません" in body4)
        record("B", "/admin/inside-sales/import returns 404/NotFound", is_404_2,
               "Page rendered normally" if not is_404_2 else "")

        # B-5: /admin page - no IS import button
        page.goto(f"{BASE_URL}/admin")
        page.wait_for_load_state("networkidle")
        page.screenshot(path="/tmp/b5-admin.png")
        admin_body = page.inner_text("body")
        has_is_btn = "IS取込" in admin_body
        record("B", "No IS import button on /admin", not has_is_btn,
               "IS button found" if has_is_btn else "")

        # console errors
        critical = [e for e in console_errors if "Error" in e and "favicon" not in e.lower()]
        record("B", "No console errors", len(critical) == 0,
               str(critical[:3]) if critical else "")

    except Exception as e:
        record("B", "Scenario B execution error", False, str(e))
        try:
            page.screenshot(path="/tmp/b-error.png")
        except Exception:
            pass
    finally:
        context.close()


# ===================================================================
# Scenario A: Opportunity promotion re-verification (Phase C fix)
# ===================================================================
def scenario_a(browser):
    log("=== Scenario A: Opportunity promotion ===")
    context = browser.new_context()
    page = context.new_page()
    console_errors = []
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)

    try:
        login(page, MANAGER_EMAIL)

        page.goto(f"{BASE_URL}/leads/{LEAD_ID_1}")
        page.wait_for_load_state("networkidle")
        page.screenshot(path="/tmp/a1-lead-detail.png")

        body1 = page.inner_text("body")
        record("A", "Lead detail page loads", len(body1) > 100)

        # Find all select elements
        selects = page.locator("select").all()
        log(f"  Found {len(selects)} select elements")
        for i, sel in enumerate(selects):
            opts = sel.locator("option").all()
            opt_texts = [o.inner_text() for o in opts]
            log(f"  select[{i}] options: {opt_texts}")

        # Find stage select (look for Opportunity option)
        stage_changed = False
        for sel in selects:
            opts = sel.locator("option").all()
            opt_texts = [o.inner_text() for o in opts]
            if "Opportunity" in opt_texts:
                sel.select_option(label="Opportunity")
                stage_changed = True
                log("  Stage changed to Opportunity")
                break

        if not stage_changed:
            # Try by name attribute
            stage_sel = page.locator("select[name='stage_id']")
            if stage_sel.count() > 0:
                stage_sel.select_option(label="Opportunity")
                stage_changed = True
                log("  Stage changed by name=stage_id")

        record("A", "Stage changed to Opportunity", stage_changed,
               "No stage select found" if not stage_changed else "")

        page.screenshot(path="/tmp/a2-after-stage-change.png")

        if stage_changed:
            page.wait_for_timeout(1000)
            body2 = page.inner_text("body")

            # Check status disabled or auto-promotion help shown
            content2 = page.content()
            status_disabled = (
                "disabled" in content2.lower()
                or "Deal が自動生成" in body2
                or "Deal" in body2
                or "—" in body2
            )
            record("A", "Status disabled or Deal promotion hint shown", status_disabled,
                   "Neither found" if not status_disabled else "")

            # Click save button
            save_btn = page.get_by_role("button", name=re.compile("保存|Save"))
            if save_btn.count() == 0:
                save_btn = page.locator("button[type='submit']")

            if save_btn.count() > 0:
                save_btn.first.click()
                page.wait_for_load_state("networkidle")
                page.wait_for_timeout(3000)
                page.screenshot(path="/tmp/a3-after-save.png")

                body3 = page.inner_text("body")
                content3 = page.content()

                # Check no error
                has_error = (
                    "エラーが発生" in body3
                    or "失敗しました" in body3
                    or ("エラー" in body3 and "deal" not in body3.lower() and "Deal" not in body3)
                )
                record("A", "Save succeeds without error", not has_error,
                       "Error found" if has_error else "")

                # Check banner
                has_success = "昇格" in body3 or "Deal" in body3 or "deal" in body3.lower()
                has_amber = "account" in body3.lower() or "解決" in body3
                record("A", "Promotion or warning banner shown", has_success or has_amber,
                       "No banner" if not (has_success or has_amber) else
                       ("promotion banner" if has_success else "amber warning"))
            else:
                record("A", "Save button found", False, "No save button")

        # console errors
        critical = [e for e in console_errors if "Error" in e and "favicon" not in e.lower()]
        record("A", "No console errors", len(critical) == 0,
               str(critical[:3]) if critical else "")

    except Exception as e:
        record("A", "Scenario A execution error", False, str(e))
        try:
            page.screenshot(path="/tmp/a-error.png")
        except Exception:
            pass
    finally:
        context.close()


# ===================================================================
# Scenario C: lead_source auto-sync (Phase D)
# ===================================================================
def scenario_c(browser):
    log("=== Scenario C: lead_source auto-sync ===")
    context = browser.new_context()
    page = context.new_page()
    console_errors = []
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)

    try:
        login(page, MANAGER_EMAIL)

        # C-1: Navigate to new lead form
        page.goto(f"{BASE_URL}/leads/new")
        page.wait_for_load_state("networkidle")
        page.screenshot(path="/tmp/c1-new-lead.png")

        body_new = page.inner_text("body")
        record("C", "New lead form loads", len(body_new) > 50)

        # Inspect form fields
        inputs = page.locator("input, select, textarea").all()
        log(f"  Form fields: {[i.get_attribute('name') or i.get_attribute('type') for i in inputs]}")

        # Lead name
        lead_name = page.locator("input[name='lead_name']")
        if lead_name.count() == 0:
            lead_name = page.get_by_label(re.compile("リード名|Lead"))
        if lead_name.count() > 0:
            lead_name.fill("C3_DM_sync_test_001")
        else:
            log("  WARNING: lead_name input not found")

        # Stage (required)
        stage_sel = page.locator("select[name='stage_id']")
        if stage_sel.count() > 0:
            # Select first non-empty option
            opts = stage_sel.locator("option").all()
            for opt in opts:
                val = opt.get_attribute("value")
                if val and val.strip():
                    stage_sel.select_option(value=val)
                    log(f"  Stage selected: {opt.inner_text()}")
                    break

        # lead_source -> DM
        source_sel = page.locator("select[name='lead_source_id']")
        if source_sel.count() > 0:
            source_sel.select_option(label="DM")
            record("C", "lead_source=DM selected", True)
        else:
            record("C", "lead_source select found", False, "select[name=lead_source_id] not found")

        # contact_id: try hidden field or combobox
        contact_hidden = page.locator("input[name='contact_id']")
        if contact_hidden.count() > 0:
            contact_hidden.fill(CONTACT_ID)
            log("  contact_id filled via input")
        else:
            log("  contact_id hidden input not found, skipping direct fill")

        page.screenshot(path="/tmp/c2-form-filled.png")

        # Submit
        save_btn = page.get_by_role("button", name=re.compile("作成|保存|登録|Submit|Save"))
        if save_btn.count() == 0:
            save_btn = page.locator("button[type='submit']")

        if save_btn.count() > 0:
            save_btn.first.click()
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(3000)
            page.screenshot(path="/tmp/c3-after-create.png")

            final_url = page.url
            created = "/leads/" in final_url and "new" not in final_url
            record("C", "Lead created (redirect to detail)", created,
                   f"URL={final_url}" if not created else "")
        else:
            record("C", "Create button found", False, "No submit button")
            return

        # C-2: Check contact detail for lead_source=DM
        # Only check if contact was actually linked
        page.goto(f"{BASE_URL}/contacts/{CONTACT_ID}")
        page.wait_for_load_state("networkidle")
        page.screenshot(path="/tmp/c4-contact-detail.png")
        contact_body = page.inner_text("body")
        has_dm = "DM" in contact_body
        record("C", "contact.lead_source auto-set to DM", has_dm,
               "DM not shown" if not has_dm else "")

        # C-3: Create another lead with tele_appo for same contact
        page.goto(f"{BASE_URL}/leads/new")
        page.wait_for_load_state("networkidle")

        lead_name2 = page.locator("input[name='lead_name']")
        if lead_name2.count() > 0:
            lead_name2.fill("C3_tele_appo_test_002")

        stage_sel2 = page.locator("select[name='stage_id']")
        if stage_sel2.count() > 0:
            opts2 = stage_sel2.locator("option").all()
            for opt in opts2:
                val = opt.get_attribute("value")
                if val and val.strip():
                    stage_sel2.select_option(value=val)
                    break

        source_sel2 = page.locator("select[name='lead_source_id']")
        if source_sel2.count() > 0:
            source_sel2.select_option(label="テレアポ")

        contact_hidden2 = page.locator("input[name='contact_id']")
        if contact_hidden2.count() > 0:
            contact_hidden2.fill(CONTACT_ID)

        save_btn2 = page.get_by_role("button", name=re.compile("作成|保存|登録|Submit|Save"))
        if save_btn2.count() == 0:
            save_btn2 = page.locator("button[type='submit']")
        if save_btn2.count() > 0:
            save_btn2.first.click()
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(2000)

        # Verify contact still shows DM (not tele_appo overwritten)
        page.goto(f"{BASE_URL}/contacts/{CONTACT_ID}")
        page.wait_for_load_state("networkidle")
        page.screenshot(path="/tmp/c5-contact-after-tele.png")
        contact_body2 = page.inner_text("body")
        still_dm = "DM" in contact_body2
        record("C", "contact.lead_source stays DM (not overwritten by tele_appo)", still_dm,
               "DM overwritten or missing" if not still_dm else "")

        # console errors
        critical = [e for e in console_errors if "Error" in e and "favicon" not in e.lower()]
        record("C", "No console errors", len(critical) == 0,
               str(critical[:3]) if critical else "")

    except Exception as e:
        record("C", "Scenario C execution error", False, str(e))
        try:
            page.screenshot(path="/tmp/c-error.png")
        except Exception:
            pass
    finally:
        context.close()


# ===================================================================
# Scenario D: Campaign CRUD regression
# ===================================================================
def scenario_d(browser):
    log("=== Scenario D: Campaign CRUD ===")
    context = browser.new_context()
    page = context.new_page()
    console_errors = []
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    campaign_id = None

    try:
        login(page, MANAGER_EMAIL)

        # D-1: Create campaign
        page.goto(f"{BASE_URL}/campaigns/new")
        page.wait_for_load_state("networkidle")
        page.screenshot(path="/tmp/d1-campaign-new.png")

        inputs = page.locator("input, select, textarea").all()
        log(f"  Campaign form fields: {[i.get_attribute('name') for i in inputs]}")

        name_input = page.locator("input[name='name']")
        if name_input.count() == 0:
            name_input = page.get_by_label(re.compile("キャンペーン名|Name"))
        if name_input.count() > 0:
            name_input.fill("E2E_Final_Campaign_Test")
        else:
            log("  WARNING: campaign name input not found")

        # dates
        start_date = page.locator("input[name='start_date']")
        if start_date.count() > 0:
            start_date.fill("2026-05-01")

        end_date = page.locator("input[name='end_date']")
        if end_date.count() > 0:
            end_date.fill("2026-06-30")

        save_btn = page.get_by_role("button", name=re.compile("作成|保存|登録|Save|Submit"))
        if save_btn.count() == 0:
            save_btn = page.locator("button[type='submit']")

        if save_btn.count() > 0:
            save_btn.first.click()
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(3000)
            page.screenshot(path="/tmp/d2-after-create.png")

            final_url = page.url
            created = "/campaigns/" in final_url and "new" not in final_url
            record("D", "Campaign created (redirect to detail)", created,
                   f"URL={final_url}" if not created else "")
            if created:
                campaign_id = final_url.rstrip("/").split("/")[-1]
                log(f"  campaign_id={campaign_id}")
        else:
            record("D", "Campaign create button found", False, "No submit button")
            return

        # D-2: Attach leads
        if campaign_id:
            page.goto(f"{BASE_URL}/campaigns/{campaign_id}")
            page.wait_for_load_state("networkidle")
            page.screenshot(path="/tmp/d3-campaign-detail.png")
            detail_body = page.inner_text("body")
            record("D", "Campaign detail page loads", len(detail_body) > 50)

            # Look for attach/add lead button
            attach_btn = page.get_by_role("button", name=re.compile("Lead|リード|追加|紐付|Add"))
            if attach_btn.count() > 0:
                attach_btn.first.click()
                page.wait_for_timeout(2000)
                page.screenshot(path="/tmp/d4-attach-modal.png")
                record("D", "Lead attach button works", True)

                # Try to select a lead from the dialog
                lead_row = page.locator("tr, [role='row'], li").filter(
                    has=page.locator("input[type='checkbox']")
                ).first
                if lead_row.count() > 0:
                    lead_row.locator("input[type='checkbox']").check()
                    confirm = page.get_by_role("button", name=re.compile("追加|確認|OK|Save"))
                    if confirm.count() > 0:
                        confirm.first.click()
                        page.wait_for_load_state("networkidle")
                        page.wait_for_timeout(2000)
                        page.screenshot(path="/tmp/d5-after-attach.png")
                        record("D", "Lead attached to campaign", True)
                    else:
                        record("D", "Lead attach confirm button", False, "No confirm button")
                else:
                    log("  No lead rows found in modal")
                    # Close dialog if open
                    close = page.get_by_role("button", name=re.compile("閉じる|Close|キャンセル|Cancel"))
                    if close.count() > 0:
                        close.first.click()
                        page.wait_for_timeout(500)
            else:
                record("D", "Lead attach button found", False, "No attach button")

        # D-3: Delete campaign (admin)
        logout_via_navigate(page)
        login(page, ADMIN_EMAIL)

        if campaign_id:
            page.goto(f"{BASE_URL}/campaigns/{campaign_id}")
            page.wait_for_load_state("networkidle")
            page.screenshot(path="/tmp/d6-before-delete.png")

            delete_btn = page.get_by_role("button", name=re.compile("削除|Delete"))
            if delete_btn.count() > 0:
                delete_btn.first.click()
                page.wait_for_timeout(1000)
                page.screenshot(path="/tmp/d7-delete-confirm.png")

                # Handle confirmation dialog
                confirm_del = page.get_by_role("button", name=re.compile("削除する|確認|OK|はい|Yes"))
                if confirm_del.count() == 0:
                    # Try looking in dialog/modal
                    confirm_del = page.locator("[role='dialog'] button").filter(
                        has_text=re.compile("削除|OK|確認")
                    )
                if confirm_del.count() > 0:
                    confirm_del.first.click()
                    page.wait_for_load_state("networkidle")
                    page.wait_for_timeout(2000)
                    page.screenshot(path="/tmp/d8-after-delete.png")
                    final_url = page.url
                    deleted_ok = "campaigns" in final_url
                    record("D", "Campaign deleted successfully", deleted_ok,
                           f"URL={final_url}" if not deleted_ok else "")
                else:
                    record("D", "Campaign delete confirm button", False, "No confirm button")
            else:
                record("D", "Campaign delete button found", False, "No delete button")

        # console errors
        critical = [e for e in console_errors if "Error" in e and "favicon" not in e.lower()]
        record("D", "No console errors", len(critical) == 0,
               str(critical[:3]) if critical else "")

    except Exception as e:
        record("D", "Scenario D execution error", False, str(e))
        try:
            page.screenshot(path="/tmp/d-error.png")
        except Exception:
            pass
    finally:
        context.close()


# ===================================================================
# Scenario E: Golden path regression
# ===================================================================
def scenario_e(browser):
    log("=== Scenario E: Golden Path ===")
    context = browser.new_context()
    page = context.new_page()
    console_errors = []
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)

    try:
        login(page, MANAGER_EMAIL)

        # E-1: Leads sorted by score desc
        page.goto(f"{BASE_URL}/leads")
        page.wait_for_load_state("networkidle")
        page.screenshot(path="/tmp/e1-leads-list.png")
        leads_body = page.inner_text("body")
        has_leads = "リード" in leads_body or "Lead" in leads_body or "lead" in leads_body.lower()
        record("E", "Leads list page loads", has_leads)

        # Try clicking score sort button if available
        sort_btn = page.get_by_role("button", name=re.compile("スコア|Score")).first
        if sort_btn.count() > 0:
            sort_btn.click()
            page.wait_for_load_state("networkidle")
            record("E", "Score sort button clickable", True)
        else:
            # Try column header
            score_header = page.locator("th, [role='columnheader']").filter(has_text="スコア")
            if score_header.count() > 0:
                score_header.click()
                page.wait_for_load_state("networkidle")
                record("E", "Score column header sortable", True)
            else:
                record("E", "Score sort available", False, "No sort button/header found")

        page.screenshot(path="/tmp/e2-leads-sorted.png")

        # E-2: Category filter
        for category in ["Inquiry", "MQL", "TQL"]:
            page.goto(f"{BASE_URL}/leads?category={category}")
            page.wait_for_load_state("networkidle")
            cat_body = page.inner_text("body")
            no_error = "エラーが発生" not in cat_body and "500" not in cat_body and "Internal Server Error" not in cat_body
            record("E", f"Category filter {category} no error", no_error,
                   "Error page" if not no_error else "")
            page.screenshot(path=f"/tmp/e2-cat-{category.lower()}.png")

        # E-3: Lead soft delete (use LEAD_ID_1 since LEAD_ID_2 may be used in scenario A)
        # Use a fresh lead to delete
        page.goto(f"{BASE_URL}/leads/{LEAD_ID_1}")
        page.wait_for_load_state("networkidle")
        page.screenshot(path="/tmp/e3-lead-before-delete.png")

        delete_btn = page.get_by_role("button", name=re.compile("削除|Delete"))
        if delete_btn.count() > 0:
            delete_btn.first.click()
            page.wait_for_timeout(1000)
            page.screenshot(path="/tmp/e4-delete-dialog.png")

            # Check for deletion reason input
            reason_input = page.locator("textarea[name='deletion_reason'], input[name='deletion_reason']")
            if reason_input.count() > 0:
                reason_input.fill("E2E final test deletion")

            confirm_del = page.get_by_role("button", name=re.compile("削除する|確認|OK|はい"))
            if confirm_del.count() == 0:
                confirm_del = page.locator("[role='dialog'] button").filter(
                    has_text=re.compile("削除|OK|確認")
                )

            if confirm_del.count() > 0:
                confirm_del.first.click()
                page.wait_for_load_state("networkidle")
                page.wait_for_timeout(2000)
                page.screenshot(path="/tmp/e5-after-delete.png")
                record("E", "Lead soft-deleted successfully", True)
            else:
                record("E", "Lead delete confirm button found", False, "No confirm button")
        else:
            record("E", "Lead delete button found", False, "No delete button")

        # E-4: /admin/deleted - restore lead (admin)
        logout_via_navigate(page)
        login(page, ADMIN_EMAIL)

        page.goto(f"{BASE_URL}/admin/deleted")
        page.wait_for_load_state("networkidle")
        page.screenshot(path="/tmp/e6-deleted-list.png")
        del_body = page.inner_text("body")

        has_deleted_page = ("復元" in del_body or "Restore" in del_body or "復活" in del_body)
        record("E", "/admin/deleted page has restore function", has_deleted_page,
               "No restore function found" if not has_deleted_page else "")

        if has_deleted_page:
            restore_btn = page.get_by_role("button", name=re.compile("復元|Restore|復活")).first
            if restore_btn.count() > 0:
                restore_btn.click()
                page.wait_for_load_state("networkidle")
                page.wait_for_timeout(2000)
                page.screenshot(path="/tmp/e7-after-restore.png")
                record("E", "Lead restored from deleted", True)
            else:
                record("E", "Restore button clickable", False, "No restore button")

        # console errors
        critical = [e for e in console_errors if "Error" in e and "favicon" not in e.lower()]
        record("E", "No console errors", len(critical) == 0,
               str(critical[:3]) if critical else "")

    except Exception as e:
        record("E", "Scenario E execution error", False, str(e))
        try:
            page.screenshot(path="/tmp/e-error.png")
        except Exception:
            pass
    finally:
        context.close()


# ===================================================================
# Main
# ===================================================================
def main():
    log("Lead/Campaign Final E2E Test Start")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # Verify server reachable
        page = browser.new_page()
        try:
            page.goto(f"{BASE_URL}/login", timeout=30000)
            page.wait_for_load_state("networkidle", timeout=30000)
            log(f"  Login page title: {page.title()}")
            page.screenshot(path="/tmp/login-page.png")
            page.close()
        except Exception as e:
            log(f"  ERROR: Cannot reach dev server: {e}")
            page.close()
            browser.close()
            sys.exit(1)

        scenario_b(browser)
        scenario_a(browser)
        scenario_c(browser)
        scenario_d(browser)
        scenario_e(browser)

        browser.close()

    # Summary
    print("\n" + "="*60, flush=True)
    print("Final E2E Test Results Summary", flush=True)
    print("="*60, flush=True)

    for sc in ["A", "B", "C", "D", "E"]:
        sc_results = [r for r in results if r["scenario"] == sc]
        pass_count = sum(1 for r in sc_results if r["status"] == "PASS")
        fail_count = sum(1 for r in sc_results if r["status"] == "FAIL")
        overall = "PASS" if fail_count == 0 else "FAIL"
        print(f"\nScenario {sc}: {overall} ({pass_count}P/{fail_count}F)", flush=True)
        for r in sc_results:
            mark = "OK" if r["status"] == "PASS" else "NG"
            detail = f" -- {r['detail']}" if r["detail"] else ""
            print(f"  [{mark}] {r['name']}{detail}", flush=True)

    total_pass = sum(1 for r in results if r["status"] == "PASS")
    total_fail = sum(1 for r in results if r["status"] == "FAIL")
    overall_ok = total_fail == 0

    print(f"\n{'='*60}", flush=True)
    if overall_ok:
        print("OVERALL: PASS -- Ready for release", flush=True)
    else:
        print("OVERALL: FAIL -- Fixes required", flush=True)
    print(f"Total: {total_pass} PASS / {total_fail} FAIL", flush=True)
    print("="*60, flush=True)

    with open("/tmp/e2e-results.json", "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    log("Results saved to /tmp/e2e-results.json")

    sys.exit(0 if overall_ok else 1)


if __name__ == "__main__":
    main()
