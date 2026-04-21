"""
Lead カテゴリ独立化 E2E テスト - 詳細偵察スクリプト
フォームの全要素とリード一覧の詳細を確認する
"""
from playwright.sync_api import sync_playwright

BASE_URL = "http://localhost:2000"
EMAIL = "admin@iterra.jp"
PASSWORD = "password123"

def login(page):
    page.goto(f"{BASE_URL}/login")
    page.wait_for_load_state("networkidle")
    page.fill("input[type='email']", EMAIL)
    page.fill("input[type='password']", PASSWORD)
    page.click("button[type='submit']")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1000)

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_viewport_size({"width": 1440, "height": 900})

        login(page)

        # --- /leads 一覧の詳細確認 ---
        print("=== /leads 一覧 ===")
        page.goto(f"{BASE_URL}/leads")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(1000)
        page.screenshot(path="/tmp/recon2_01_leads.png", full_page=True)

        # select オプション詳細
        selects = page.locator("select").all()
        print(f"select 数: {len(selects)}")
        for i, sel in enumerate(selects):
            opts = sel.locator("option").all_text_contents()
            print(f"  select[{i}]: {opts}")

        # thead
        th = page.locator("thead th").all_text_contents()
        print(f"thead: {th}")

        # tbody 行
        rows = page.locator("tbody tr").all()
        print(f"tbody 行数: {len(rows)}")
        for i, row in enumerate(rows[:8]):
            cells = row.locator("td").all_text_contents()
            print(f"  row[{i}]: {cells}")

        # --- /leads/new フォーム全体確認 ---
        print("\n=== /leads/new フォーム全体 ===")
        page.goto(f"{BASE_URL}/leads/new")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(500)
        # スクロールして全体確認
        page.evaluate("window.scrollTo(0, 500)")
        page.wait_for_timeout(300)
        page.screenshot(path="/tmp/recon2_02_leads_new_scroll1.png", full_page=True)

        # 全 select のラベルとオプションを確認
        # label との対応を取得
        labels = page.locator("label").all()
        print(f"label 数: {len(labels)}")
        for lbl in labels:
            txt = lbl.text_content()
            if txt:
                print(f"  label: {txt.strip()}")

        # 全 select オプション
        selects = page.locator("select").all()
        print(f"\nselect 数: {len(selects)}")
        for i, sel in enumerate(selects):
            opts = sel.locator("option").all_text_contents()
            print(f"  select[{i}]: {opts[:6]}")

        # --- /admin リードカテゴリタブ ---
        print("\n=== /admin リードカテゴリタブ ===")
        page.goto(f"{BASE_URL}/admin")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(500)

        # タブ一覧
        tabs = page.locator("button[role='tab']").all()
        print(f"タブ数: {len(tabs)}")
        for t in tabs:
            print(f"  tab: {t.text_content()}")

        # リードカテゴリタブをクリック
        page.locator("button[role='tab']", has_text="リードカテゴリ").click()
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(500)
        page.screenshot(path="/tmp/recon2_03_admin_lead_categories.png", full_page=True)

        # テーブル行確認
        rows = page.locator("tbody tr").all()
        print(f"リードカテゴリ件数: {len(rows)}")
        for row in rows:
            cells = row.locator("td").all_text_contents()
            print(f"  {cells}")

        browser.close()
        print("\n=== 偵察完了 ===")

if __name__ == "__main__":
    main()
