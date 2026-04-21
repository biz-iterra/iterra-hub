# -*- coding: utf-8 -*-
"""Reconnaissance 2: inspect form/button structure without clicking save"""
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

    # ---- 1. Lead detail: find all buttons ----
    print("\n=== Lead Detail Buttons ===")
    page.goto(f"{BASE_URL}/leads/{LEAD_ID_1}")
    page.wait_for_load_state("networkidle")
    page.screenshot(path="/tmp/recon2-lead-detail.png")

    buttons = page.locator("button").all()
    for i, btn in enumerate(buttons):
        txt = btn.inner_text().strip()[:50]
        btype = btn.get_attribute("type") or ""
        cls = btn.get_attribute("class") or ""
        print(f"  btn[{i}] type={btype!r} text={txt!r} class={cls[:80]!r}")

    # Find forms
    forms = page.locator("form").all()
    print(f"\nForms found: {len(forms)}")
    for i, form in enumerate(forms):
        action = form.get_attribute("action") or ""
        method = form.get_attribute("method") or ""
        print(f"  form[{i}] action={action!r} method={method!r}")

    # Get page content structure
    print(f"\nPage HTML snippet (body start, 1000 chars):")
    body_content = page.content()
    # Find the edit section
    idx = body_content.find("stage_id")
    if idx > 0:
        print(body_content[max(0, idx-200):idx+500])

    # ---- 2. Lead new form ----
    print("\n\n=== Lead New Form ===")
    page.goto(f"{BASE_URL}/leads/new")
    page.wait_for_load_state("networkidle")
    page.screenshot(path="/tmp/recon2-lead-new.png")

    # Full form HTML
    all_html = page.content()
    # Find lead_source area
    idx2 = all_html.find("lead_source")
    if idx2 > 0:
        print(f"lead_source HTML context:\n{all_html[max(0,idx2-300):idx2+300]}")
    else:
        print("lead_source not found in HTML")
        # Find any select
        idx3 = all_html.find("<select")
        if idx3 > 0:
            print(f"First select context:\n{all_html[idx3:idx3+500]}")

    # All inputs/selects
    inputs = page.locator("input, select, textarea").all()
    print(f"\nTotal form controls: {len(inputs)}")
    for inp in inputs:
        name = inp.get_attribute("name") or ""
        id_attr = inp.get_attribute("id") or ""
        placeholder = inp.get_attribute("placeholder") or ""
        data_attrs = inp.evaluate("""el => {
            const result = {};
            for (const attr of el.attributes) {
                if (attr.name.startsWith('data-')) result[attr.name] = attr.value;
            }
            return result;
        }""")
        tag = inp.evaluate("el => el.tagName")
        print(f"  {tag} name={name!r} id={id_attr!r} placeholder={placeholder!r} data={data_attrs}")

    # Buttons
    btns2 = page.locator("button").all()
    for i, btn in enumerate(btns2):
        txt = btn.inner_text().strip()[:50]
        btype = btn.get_attribute("type") or ""
        print(f"  btn[{i}] type={btype!r} text={txt!r}")

    # ---- 3. Campaign new form ----
    print("\n\n=== Campaign New Form ===")
    page.goto(f"{BASE_URL}/campaigns/new")
    page.wait_for_load_state("networkidle")
    page.screenshot(path="/tmp/recon2-campaign-new.png")

    all_html3 = page.content()
    # Find name field
    idx4 = all_html3.find('"name"')
    if idx4 > 0:
        print(f"name field context: {all_html3[max(0,idx4-200):idx4+300]}")

    inputs3 = page.locator("input, select, textarea").all()
    print(f"\nCampaign form controls: {len(inputs3)}")
    for inp in inputs3:
        name = inp.get_attribute("name") or ""
        id_attr = inp.get_attribute("id") or ""
        placeholder = inp.get_attribute("placeholder") or ""
        tag = inp.evaluate("el => el.tagName")
        label = ""
        try:
            label = inp.evaluate("""el => {
                if (el.id) {
                    const lbl = document.querySelector('label[for="' + el.id + '"]');
                    return lbl ? lbl.textContent : '';
                }
                return '';
            }""")
        except:
            pass
        print(f"  {tag} name={name!r} id={id_attr!r} placeholder={placeholder!r} label={label!r}")

    btns3 = page.locator("button").all()
    for i, btn in enumerate(btns3):
        txt = btn.inner_text().strip()[:50]
        btype = btn.get_attribute("type") or ""
        print(f"  btn[{i}] type={btype!r} text={txt!r}")

    # ---- 4. Logout method ----
    print("\n\n=== Logout ===")
    page.goto(f"{BASE_URL}/dashboard")
    page.wait_for_load_state("networkidle")
    page.screenshot(path="/tmp/recon2-dashboard.png")

    # Find logout in header/sidebar
    all_html4 = page.content()
    idx5 = all_html4.lower().find("logout")
    idx6 = all_html4.find("ログアウト")
    print(f"'logout' found at: {idx5}")
    print(f"'ログアウト' found at: {idx6}")
    if idx6 > 0:
        print(f"Logout context: {all_html4[max(0,idx6-200):idx6+200]}")

    # All interactive elements in header
    header_btns = page.locator("header button, header a").all()
    for i, el in enumerate(header_btns):
        txt = el.inner_text().strip()[:50]
        href = el.get_attribute("href") or ""
        print(f"  header el[{i}] text={txt!r} href={href!r}")

    browser.close()
    print("\nReconnaissance 2 complete.")
