# -*- coding: utf-8 -*-
"""Reconnaissance: inspect actual form structures"""
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

def login(page, email=MANAGER_EMAIL):
    page.goto(f"{BASE_URL}/login")
    page.wait_for_load_state("networkidle")
    page.locator('input[type="email"]').first.fill(email)
    page.locator('input[type="password"]').first.fill(PASSWORD)
    page.locator('button[type="submit"]').click()
    page.wait_for_url(re.compile(r"/(dashboard|leads|deals)"), timeout=15000)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    login(page)

    # ---- 1. Lead detail: check error message after Opportunity save ----
    print("\n=== Lead Detail + Opportunity Save ===")
    page.goto(f"{BASE_URL}/leads/{LEAD_ID_1}")
    page.wait_for_load_state("networkidle")
    page.screenshot(path="/tmp/recon-lead-detail.png")

    # Change to Opportunity
    selects = page.locator("select").all()
    for sel in selects:
        opts = sel.locator("option").all()
        if any("Opportunity" in o.inner_text() for o in opts):
            sel.select_option(label="Opportunity")
            break

    page.wait_for_timeout(1000)
    page.screenshot(path="/tmp/recon-lead-opp.png")

    # Save
    save = page.get_by_role("button", name=re.compile("保存|Save"))
    if save.count() == 0:
        save = page.locator("button[type='submit']")
    save.first.click()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(3000)
    page.screenshot(path="/tmp/recon-lead-opp-saved.png")

    body_after = page.inner_text("body")
    print(f"Body after Opp save (first 500 chars): {body_after[:500]}")

    # Check for toast/alert/banner
    alerts = page.locator("[role='alert'], .toast, [data-toast], [data-sonner-toast]").all()
    for i, a in enumerate(alerts):
        print(f"Alert[{i}]: {a.inner_text()[:200]}")

    # ---- 2. Lead new form: inspect HTML ----
    print("\n=== Lead New Form HTML ===")
    page.goto(f"{BASE_URL}/leads/new")
    page.wait_for_load_state("networkidle")
    page.screenshot(path="/tmp/recon-lead-new.png")

    # Get all inputs with their actual HTML
    form_html = page.locator("form").first.inner_html() if page.locator("form").count() > 0 else ""
    print(f"Form HTML (first 2000 chars): {form_html[:2000]}")

    # Get all input/select names and labels
    inputs = page.locator("input, select, textarea").all()
    for inp in inputs:
        name = inp.get_attribute("name") or ""
        id_attr = inp.get_attribute("id") or ""
        placeholder = inp.get_attribute("placeholder") or ""
        tag = inp.evaluate("el => el.tagName")
        print(f"  {tag} name={name!r} id={id_attr!r} placeholder={placeholder!r}")

    # ---- 3. Campaign new form ----
    print("\n=== Campaign New Form HTML ===")
    page.goto(f"{BASE_URL}/campaigns/new")
    page.wait_for_load_state("networkidle")
    page.screenshot(path="/tmp/recon-campaign-new.png")

    form_html2 = page.locator("form").first.inner_html() if page.locator("form").count() > 0 else ""
    print(f"Campaign Form HTML (first 2000 chars): {form_html2[:2000]}")

    inputs2 = page.locator("input, select, textarea").all()
    for inp in inputs2:
        name = inp.get_attribute("name") or ""
        id_attr = inp.get_attribute("id") or ""
        placeholder = inp.get_attribute("placeholder") or ""
        tag = inp.evaluate("el => el.tagName")
        print(f"  {tag} name={name!r} id={id_attr!r} placeholder={placeholder!r}")

    # ---- 4. Logout check ----
    print("\n=== Logout Flow ===")
    # Look for logout button/link
    logout_btn = page.get_by_role("button", name=re.compile("ログアウト|Logout|Sign out"))
    logout_link = page.get_by_role("link", name=re.compile("ログアウト|Logout|Sign out"))
    print(f"Logout buttons found: {logout_btn.count()}")
    print(f"Logout links found: {logout_link.count()}")

    # Check header/sidebar for user menu
    header = page.locator("header").first
    if header.count() > 0:
        print(f"Header text: {header.inner_text()[:200]}")

    # ---- 5. /admin/deleted page ----
    page.goto(f"{BASE_URL}/admin/deleted")
    page.wait_for_load_state("networkidle")
    page.screenshot(path="/tmp/recon-admin-deleted.png")
    print(f"\n=== /admin/deleted ===")
    del_body = page.inner_text("body")
    print(f"Page content (500 chars): {del_body[:500]}")
    restore_btns = page.get_by_role("button", name=re.compile("復元|Restore")).all()
    print(f"Restore buttons: {len(restore_btns)}")

    browser.close()
    print("\nReconnaissance complete.")
