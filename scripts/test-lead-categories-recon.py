"""
Lead カテゴリ独立化 E2E テスト - 偵察スクリプト
アプリの現在状態を確認し、セレクタを特定する
"""
import sys
from playwright.sync_api import sync_playwright

BASE_URL = "http://localhost:2000"
EMAIL = "admin@iterra.jp"
PASSWORD = "password123"

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_viewport_size({"width": 1440, "height": 900})

        print("=== Step 1: ログインページ確認 ===")
        page.goto(f"{BASE_URL}/login")
        page.wait_for_load_state("networkidle")
        page.screenshot(path="/tmp/recon_01_login.png", full_page=True)
        print("ログインページ: OK")

        # ログイン
        page.fill("input[type='email'], input[name='email']", EMAIL)
        page.fill("input[type='password'], input[name='password']", PASSWORD)
        page.screenshot(path="/tmp/recon_02_login_filled.png", full_page=True)
        page.click("button[type='submit']")
        page.wait_for_load_state("networkidle")
        page.screenshot(path="/tmp/recon_03_after_login.png", full_page=True)
        print(f"ログイン後URL: {page.url}")

        print("\n=== Step 2: /leads 一覧確認 ===")
        page.goto(f"{BASE_URL}/leads")
        page.wait_for_load_state("networkidle")
        page.screenshot(path="/tmp/recon_04_leads_list.png", full_page=True)
        print("leads 一覧: OK")

        # テーブルヘッダー取得
        headers = page.locator("thead th").all_text_contents()
        print(f"テーブルヘッダー: {headers}")

        # フィルター select 確認
        selects = page.locator("select").all()
        print(f"フィルター select 数: {len(selects)}")
        for i, sel in enumerate(selects):
            options = sel.locator("option").all_text_contents()
            print(f"  select[{i}] options: {options[:5]}")

        # リード件数確認
        rows = page.locator("tbody tr").all()
        print(f"テーブル行数: {len(rows)}")

        print("\n=== Step 3: /leads/new 確認 ===")
        page.goto(f"{BASE_URL}/leads/new")
        page.wait_for_load_state("networkidle")
        page.screenshot(path="/tmp/recon_05_leads_new.png", full_page=True)
        print(f"新規作成URL: {page.url}")

        # フォーム要素確認
        inputs = page.locator("input, select, textarea").all()
        print(f"フォーム要素数: {len(inputs)}")
        for elem in inputs:
            tag = elem.evaluate("el => el.tagName.toLowerCase()")
            name = elem.get_attribute("name") or elem.get_attribute("id") or "(no name)"
            print(f"  {tag}: {name}")

        print("\n=== Step 4: /admin 確認 ===")
        page.goto(f"{BASE_URL}/admin")
        page.wait_for_load_state("networkidle")
        page.screenshot(path="/tmp/recon_06_admin.png", full_page=True)
        print(f"admin URL: {page.url}")

        # タブ一覧確認
        tabs = page.locator("button[role='tab'], [data-state], button").all()
        tab_texts = []
        for t in tabs[:30]:
            txt = t.text_content()
            if txt and txt.strip():
                tab_texts.append(txt.strip())
        print(f"タブ/ボタン: {tab_texts}")

        browser.close()
        print("\n=== 偵察完了 ===")
        print("スクリーンショット: /tmp/recon_0*.png")

if __name__ == "__main__":
    main()
