# -*- coding: utf-8 -*-
"""Recon 5: detailed lead creation error + amber warning check"""
import sys
import io
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

import re
from playwright.sync_api import sync_playwright

BASE_URL = "http://localhost:3000"
MANAGER_EMAIL = "manager@iterra.jp"
PASSWORD = "password123"
LEAD_ID_MANAGER = "c0000001-0000-0000-0000-000000000004"
ACCOUNT_TYPE_HOJIN = "8f5c8b7e-26fd-4748-8d6e-d193df75e6c1"
DM_SOURCE_ID = "20e522fb-fab0-409c-af4e-bdb65c711a36"
STAGE_GENERATION_ID = "a1000000-0000-0000-0000-000000000001"

def login(page):
    page.goto(f"{BASE_URL}/login")
    page.wait_for_load_state("networkidle")
    page.locator('input[type="email"]').first.fill(MANAGER_EMAIL)
    page.locator('input[type="password"]').first.fill(PASSWORD)
    page.locator('button[type="submit"]').click()
    page.wait_for_url(re.compile(r"/(dashboard|leads)"), timeout=15000)
    print(f"Logged in, URL={page.url}")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    login(page)

    # ---- 1. Lead creation error detail ----
    print("\n=== Lead Create Error Detail ===")
    page.goto(f"{BASE_URL}/leads/new")
    page.wait_for_load_state("networkidle")

    inputs = page.locator("input").all()
    selects = page.locator("select").all()
    print(f"inputs={len(inputs)}, selects={len(selects)}")

    # Fill all required fields step by step
    inputs[0].fill("ReconTest_DM_001")
    print(f"  lead_name filled")

    selects[0].select_option(value=ACCOUNT_TYPE_HOJIN)
    print(f"  account_type = hojin")

    selects[1].select_option(value=DM_SOURCE_ID)
    print(f"  lead_source = DM")

    selects[3].select_option(value=STAGE_GENERATION_ID)
    print(f"  stage = generation")
    page.wait_for_timeout(1000)  # wait for status cascade

    # Get fresh select[4] options
    selects4 = page.locator("select").nth(4)
    opts4 = selects4.locator("option").all()
    print(f"  status options after stage change: {[(o.inner_text(), o.get_attribute('value')) for o in opts4]}")

    # Check all current select values
    for i in range(len(selects)):
        try:
            val = page.locator("select").nth(i).input_value()
            print(f"  select[{i}] current value: {val!r}")
        except:
            pass

    page.screenshot(path="/tmp/recon5-before-submit.png")

    # Submit and capture response
    submit = page.locator("button[type='submit']")
    print(f"\nSubmit button count: {submit.count()}")
    submit.click()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(3000)
    page.screenshot(path="/tmp/recon5-after-submit.png")

    print(f"URL after submit: {page.url}")
    body = page.inner_text("body")

    # Find all error-styled elements
    err_els = page.locator("p, div, span").all()
    found_errors = []
    for el in err_els:
        style = el.get_attribute("style") or ""
        if "error" in style.lower() or "red" in style.lower() or "#f" in style.lower():
            txt = el.inner_text().strip()
            if txt and len(txt) < 200 and txt not in found_errors:
                found_errors.append(txt)

    print(f"Error elements: {found_errors}")
    print(f"Body (first 600): {body[:600]}")

    # ---- 2. Amber warning after Opportunity save ----
    print("\n=== Amber Warning After Opportunity Save ===")
    page.goto(f"{BASE_URL}/leads/{LEAD_ID_MANAGER}")
    page.wait_for_load_state("networkidle")

    # Change to Opportunity
    selects_d = page.locator("select").all()
    for sel in selects_d:
        opts = sel.locator("option").all()
        if any("Opportunity" in o.inner_text() for o in opts):
            sel.select_option(value="a1000000-0000-0000-0000-000000000005")
            print("Stage->Opportunity")
            break

    page.wait_for_timeout(500)

    # Check that status div shows "—"
    page_content = page.content()
    has_dash = ">—<" in page_content or "—" in page_content
    print(f"'—' in page content: {has_dash}")

    # Find the "—" element
    all_text = page.inner_text("body")
    print(f"Body snippet (stage area): {all_text[400:800]}")

    # Save
    save = page.get_by_text("変更を保存")
    print(f"Save button count: {save.count()}")
    save.click()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(4000)
    page.screenshot(path="/tmp/recon5-opp-saved.png")

    after_body = page.inner_text("body")
    after_html = page.content()

    print(f"\nAfter save body (first 800): {after_body[:800]}")

    # Check for promoteWarning div (amber)
    amber_divs = page.locator("div").all()
    for div in amber_divs:
        style = div.get_attribute("style") or ""
        if "E5C47F" in style or "amber" in style.lower() or "昇格に問題" in div.inner_text():
            txt = div.inner_text()[:200]
            print(f"AMBER DIV found: {txt!r}")

    # Check for promoteMessage (success)
    for div in amber_divs:
        style = div.get_attribute("style") or ""
        if "7AA592" in style or "昇格しました" in div.inner_text():
            txt = div.inner_text()[:200]
            print(f"SUCCESS DIV found: {txt!r}")

    # Search for key strings
    for key in ["昇格", "promot", "Deal", "account", "E5C47F", "7AA592"]:
        idx = after_html.find(key)
        if idx > 0:
            print(f"Found {key!r} at {idx}: {after_html[max(0,idx-30):idx+100]!r}")

    browser.close()
    print("\nRecon 5 complete.")
