# -*- coding: utf-8 -*-
"""Reconnaissance 4: lead detail tab structure + admin/deleted as admin"""
import sys
import io
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

import re
from playwright.sync_api import sync_playwright

BASE_URL = "http://localhost:3000"
MANAGER_EMAIL = "manager@iterra.jp"
ADMIN_EMAIL = "admin@iterra.jp"
PASSWORD = "password123"
LEAD_ID_1 = "c0000001-0000-0000-0000-000000000001"
LEAD_ID_2 = "c0000001-0000-0000-0000-000000000002"

def login(page, email=MANAGER_EMAIL):
    page.goto(f"{BASE_URL}/login")
    page.wait_for_load_state("networkidle")
    page.locator('input[type="email"]').first.fill(email)
    page.locator('input[type="password"]').first.fill(PASSWORD)
    page.locator('button[type="submit"]').click()
    page.wait_for_url(re.compile(r"/(dashboard|leads|deals)"), timeout=15000)

def logout(page):
    logout_btn = page.get_by_text("ログアウト")
    if logout_btn.count() > 0:
        logout_btn.click()
        page.wait_for_url(re.compile(r"/login"), timeout=10000)
        print("Logged out successfully")
    else:
        page.goto(f"{BASE_URL}/login")
        page.wait_for_load_state("networkidle")
        print("Logout button not found, navigated to login")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    login(page)

    # ---- Lead detail: full structure ----
    print("\n=== Lead Detail: Tab Structure ===")
    page.goto(f"{BASE_URL}/leads/{LEAD_ID_1}")
    page.wait_for_load_state("networkidle")
    page.screenshot(path="/tmp/recon4-lead-detail.png")

    # All buttons
    btns = page.locator("button").all()
    for i, btn in enumerate(btns):
        txt = btn.inner_text().strip()[:60]
        btype = btn.get_attribute("type") or ""
        style = btn.get_attribute("style") or ""
        print(f"  btn[{i}] type={btype!r} text={txt!r} style={style[:50]!r}")

    # Look for tabs
    tabs = page.locator("[role='tab'], [role='tablist'], button[data-tab]").all()
    print(f"\nTab elements: {len(tabs)}")

    # Check page structure for tabs
    html = page.content()
    # Find tab-like buttons
    tab_idx = html.find("activeTab")
    print(f"'activeTab' found at: {tab_idx}")
    if tab_idx > 0:
        print(f"context: {html[max(0,tab_idx-100):tab_idx+300]}")

    # Try clicking "基本情報" or "編集" or first data tab
    tab_candidates = ["基本情報", "編集", "情報", "概要", "詳細"]
    for tab_name in tab_candidates:
        tab_btn = page.get_by_text(tab_name)
        if tab_btn.count() > 0:
            print(f"\nFound tab: {tab_name!r}, clicking...")
            tab_btn.first.click()
            page.wait_for_timeout(500)
            btns2 = page.locator("button").all()
            save_found = any("変更を保存" in b.inner_text() for b in btns2)
            print(f"Save button found after clicking {tab_name!r}: {save_found}")
            if save_found:
                break

    # Final check: all buttons
    page.screenshot(path="/tmp/recon4-after-tab.png")
    btns3 = page.locator("button").all()
    print("\nAll buttons after tab click:")
    for i, btn in enumerate(btns3):
        txt = btn.inner_text().strip()[:60]
        print(f"  btn[{i}]: {txt!r}")

    # ---- Check body content structure ----
    print(f"\nVisible text (first 600): {page.inner_text('body')[:600]}")

    # ---- /admin/deleted as admin ----
    print("\n\n=== /admin/deleted as ADMIN ===")
    logout(page)
    login(page, ADMIN_EMAIL)

    page.goto(f"{BASE_URL}/admin/deleted")
    page.wait_for_load_state("networkidle")
    page.screenshot(path="/tmp/recon4-admin-deleted.png")
    del_body = page.inner_text("body")
    print(f"Content (1000 chars): {del_body[:1000]}")

    btns_del = page.locator("button").all()
    for i, btn in enumerate(btns_del):
        txt = btn.inner_text().strip()[:60]
        print(f"  btn[{i}]: {txt!r}")

    # ---- Lead detail: investigate what causes "error" detection ----
    print("\n\n=== Lead detail save with Opportunity - find error source ===")
    login(page, MANAGER_EMAIL)
    page.goto(f"{BASE_URL}/leads/{LEAD_ID_2}")
    page.wait_for_load_state("networkidle")

    # Click the first non-logout tab button
    btns_all = page.locator("button").all()
    print(f"All buttons on page load: {[b.inner_text()[:30] for b in btns_all]}")

    # Find the stage select and change to Opportunity
    selects = page.locator("select").all()
    for sel in selects:
        opts = sel.locator("option").all()
        if any("Opportunity" in o.inner_text() for o in opts):
            sel.select_option(label="Opportunity")
            print("Changed to Opportunity")
            break

    page.wait_for_timeout(500)

    # Now find save button
    save_btn = page.get_by_text("変更を保存")
    print(f"Save button count after stage change: {save_btn.count()}")

    if save_btn.count() > 0:
        save_btn.click()
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(3000)
        page.screenshot(path="/tmp/recon4-opp-saved.png")
        body_saved = page.inner_text("body")
        print(f"\nBody after save (800 chars): {body_saved[:800]}")

        # Find specific error/success elements
        all_html = page.content()
        # Check for saveError
        for marker in ["saveError", "promotedDealId", "promoteWarning", "Deal に昇格", "昇格しました", "エラーが発生", "失敗"]:
            idx = all_html.find(marker)
            if idx > 0:
                print(f"Found {marker!r} at {idx}: {all_html[max(0,idx-50):idx+100]!r}")

    browser.close()
    print("\nReconnaissance 4 complete.")
