"""ディール一覧画面を開いてスクリーンショット"""
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

        # 先に /admin にアクセス（セッション確立）
        page.goto(f"{BASE}/admin")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(500)

        # ディール一覧
        page.goto(f"{BASE}/deals")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(1500)

        # パイプラインをインサイドセールスに切替
        pipeline_select = page.locator('button:has-text("営業")').first
        if pipeline_select.count() > 0:
            pipeline_select.click()
            page.wait_for_timeout(300)
            page.locator('text=インサイドセールス').first.click()
            page.wait_for_timeout(1500)
        # テーブル表示に切替
        table_btn = page.locator('button:has-text("テーブル")').first
        if table_btn.count() > 0:
            table_btn.click()
            page.wait_for_timeout(2000)

        page.screenshot(path="C:/tmp/11-deals-table-top.png", clip={"x": 0, "y": 0, "width": 1440, "height": 900})
        print("Saved: 11-deals-table-top.png")

        browser.close()

if __name__ == "__main__":
    main()
