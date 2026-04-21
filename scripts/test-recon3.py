# -*- coding: utf-8 -*-
"""Reconnaissance 3: get actual option values and form structure"""
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

    # ---- Lead new form: full select options with values ----
    print("\n=== Lead New Form: Select Options with Values ===")
    page.goto(f"{BASE_URL}/leads/new")
    page.wait_for_load_state("networkidle")

    selects = page.locator("select").all()
    print(f"Total selects: {len(selects)}")
    for i, sel in enumerate(selects):
        opts = sel.locator("option").all()
        opt_data = [(o.inner_text().strip(), o.get_attribute("value")) for o in opts]
        print(f"\nselect[{i}]:")
        for label, val in opt_data:
            print(f"  '{label}' => {val!r}")

    # Inputs with surrounding labels
    print("\n=== Inputs and their preceding labels ===")
    inputs = page.locator("input").all()
    for i, inp in enumerate(inputs):
        placeholder = inp.get_attribute("placeholder") or ""
        inp_type = inp.get_attribute("type") or "text"
        # Get preceding sibling label
        label_text = inp.evaluate("""el => {
            const parent = el.parentElement;
            if (!parent) return '';
            const labels = parent.querySelectorAll('label');
            if (labels.length > 0) return labels[labels.length-1].textContent;
            // try previous sibling
            let prev = el.previousElementSibling;
            while(prev) {
                if (prev.tagName === 'LABEL') return prev.textContent;
                prev = prev.previousElementSibling;
            }
            return parent.textContent.replace(el.value, '').trim().substring(0, 50);
        }""")
        print(f"  input[{i}] type={inp_type!r} placeholder={placeholder!r} label={label_text!r}")

    # ---- Lead detail: check what "error" is shown after Opportunity save ----
    print("\n\n=== Lead Detail: Opportunity Save Result ===")
    page.goto(f"{BASE_URL}/leads/{LEAD_ID_1}")
    page.wait_for_load_state("networkidle")

    # Change stage to Opportunity
    selects2 = page.locator("select").all()
    for sel in selects2:
        opts = sel.locator("option").all()
        if any("Opportunity" in o.inner_text() for o in opts):
            sel.select_option(label="Opportunity")
            print("Staged to Opportunity")
            break

    page.wait_for_timeout(500)

    # Check status select state
    all_selects = page.locator("select").all()
    for i, sel in enumerate(all_selects):
        disabled = sel.is_disabled()
        val = sel.input_value()
        opts = sel.locator("option").all()
        opt_texts = [o.inner_text() for o in opts]
        print(f"select[{i}] disabled={disabled} value={val!r} options={opt_texts[:5]}")

    # Click "変更を保存"
    save_btn = page.get_by_text("変更を保存")
    print(f"Save button count: {save_btn.count()}")
    if save_btn.count() > 0:
        save_btn.click()
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(3000)
        page.screenshot(path="/tmp/recon3-after-save.png")

        # Check all text on page
        body = page.inner_text("body")
        print(f"\nPage body after save (first 800 chars):\n{body[:800]}")

        # Check for error specifically
        error_els = page.locator("p[style*='color'], .error, [role='alert']").all()
        for i, el in enumerate(error_els):
            txt = el.inner_text()
            style = el.get_attribute("style") or ""
            if "error" in style.lower() or "red" in style.lower() or "エラー" in txt:
                print(f"  ERROR element[{i}]: {txt[:200]} style={style[:100]!r}")

    # ---- Campaign new: full form structure ----
    print("\n\n=== Campaign New Form: All selects with values ===")
    page.goto(f"{BASE_URL}/campaigns/new")
    page.wait_for_load_state("networkidle")

    cam_selects = page.locator("select").all()
    for i, sel in enumerate(cam_selects):
        opts = sel.locator("option").all()
        opt_data = [(o.inner_text().strip(), o.get_attribute("value")) for o in opts]
        print(f"\ncampaign select[{i}]:")
        for label, val in opt_data:
            print(f"  '{label}' => {val!r}")

    cam_inputs = page.locator("input").all()
    for i, inp in enumerate(cam_inputs):
        placeholder = inp.get_attribute("placeholder") or ""
        inp_type = inp.get_attribute("type") or "text"
        print(f"  campaign input[{i}] type={inp_type!r} placeholder={placeholder!r}")

    # ---- /admin/deleted ----
    print("\n\n=== /admin/deleted page ===")
    page.goto(f"{BASE_URL}/admin/deleted")
    page.wait_for_load_state("networkidle")
    page.screenshot(path="/tmp/recon3-admin-deleted.png")
    body_del = page.inner_text("body")
    print(f"Content (800 chars): {body_del[:800]}")

    # All buttons
    btns_del = page.locator("button").all()
    for i, btn in enumerate(btns_del):
        txt = btn.inner_text().strip()[:60]
        print(f"  btn[{i}]: {txt!r}")

    browser.close()
    print("\nReconnaissance 3 complete.")
