# -*- coding: utf-8 -*-
"""ログイン詳細デバッグ"""
from playwright.sync_api import sync_playwright
import os

SS_DIR = os.path.join(os.path.dirname(__file__), "screenshots", "lead-categories")
os.makedirs(SS_DIR, exist_ok=True)

BASE_URL = "http://localhost:2000"
EMAIL = "admin@iterra.jp"
PASSWORD = "password123"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.set_viewport_size({"width": 1440, "height": 900})

    # ログインページ
    page.goto(f"{BASE_URL}/login")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)

    # フォーム要素確認
    inputs = page.locator("input").all()
    print(f"Input count: {len(inputs)}")
    for inp in inputs:
        print(f"  type={inp.get_attribute('type')} name={inp.get_attribute('name')} id={inp.get_attribute('id')}")

    buttons = page.locator("button").all()
    print(f"Button count: {len(buttons)}")
    for btn in buttons:
        print(f"  type={btn.get_attribute('type')} text={btn.text_content()}")

    # 入力
    page.locator("input[type='email']").fill(EMAIL)
    page.locator("input[type='password']").fill(PASSWORD)
    page.screenshot(path=os.path.join(SS_DIR, "debug_login_filled.png"), full_page=True)

    # console ログを取得
    console_msgs = []
    page.on("console", lambda msg: console_msgs.append(f"{msg.type}: {msg.text}"))

    # submit
    page.locator("button[type='submit']").click()

    # 少し待つ
    page.wait_for_timeout(3000)
    print(f"URL after click: {page.url}")
    page.screenshot(path=os.path.join(SS_DIR, "debug_after_submit.png"), full_page=True)

    # networkidle 待ち
    try:
        page.wait_for_load_state("networkidle", timeout=10000)
    except:
        pass
    page.wait_for_timeout(1000)
    print(f"URL after networkidle: {page.url}")
    page.screenshot(path=os.path.join(SS_DIR, "debug_final.png"), full_page=True)

    # エラーメッセージ確認
    page_text = page.content()
    if "error" in page_text.lower() or "エラー" in page_text:
        print("ERROR in page")
    print(f"Console msgs: {console_msgs[:10]}")

    browser.close()
