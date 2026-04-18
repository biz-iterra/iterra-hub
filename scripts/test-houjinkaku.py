"""法人格ラベルの確認"""
from playwright.sync_api import sync_playwright

BASE = "http://localhost:2000"

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()

        page.goto(f"{BASE}/login")
        page.wait_for_load_state("networkidle")
        page.fill('#email', "admin@iterra.jp")
        page.fill('#password', "password123")
        with page.expect_navigation(timeout=30000):
            page.click('button[type="submit"]')
        page.wait_for_load_state("networkidle")

        # admin タブ：法人格タブ確認
        page.goto(f"{BASE}/admin")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(800)
        page.screenshot(path="C:/tmp/20-admin-tabs.png", clip={"x": 0, "y": 0, "width": 1440, "height": 400})
        print("Admin tabs saved.")
        if page.locator('button:has-text("法人格")').count() > 0:
            print("OK: admin tab '法人格' exists")
            page.click('button:has-text("法人格")')
            page.wait_for_timeout(800)
            page.screenshot(path="C:/tmp/21-admin-houjinkaku.png", clip={"x": 0, "y": 0, "width": 1440, "height": 600})

        # companies 一覧（ヘッダ確認）
        page.goto(f"{BASE}/companies")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(800)
        page.screenshot(path="C:/tmp/22-companies-list.png", clip={"x": 0, "y": 0, "width": 1440, "height": 500})
        print("Companies list saved.")

        browser.close()

if __name__ == "__main__":
    main()
