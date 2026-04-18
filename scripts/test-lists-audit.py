"""全一覧画面を回ってUUID表示を検出"""
from playwright.sync_api import sync_playwright
import re

BASE = "http://localhost:2000"
UUID_RE = re.compile(r'\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b', re.I)

PAGES = [
    ("/dashboard", "dashboard"),
    ("/deals", "deals"),
    ("/contacts", "contacts"),
    ("/companies", "companies"),
    ("/accounts", "accounts"),
    ("/contracts", "contracts"),
    ("/talents", "talents"),
    ("/admin", "admin"),
    ("/admin/deleted", "admin-deleted"),
    ("/admin/inside-sales/import", "admin-import"),
]

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

        for path, name in PAGES:
            page.goto(f"{BASE}{path}")
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(1500)
            # 可視テキストからUUIDパターンを抽出
            body_text = page.locator("body").inner_text()
            uuids = set(UUID_RE.findall(body_text))
            # hrefなどを除きDOMに表示されているもののみ
            visible_matches = []
            for u in uuids:
                if u in body_text:
                    visible_matches.append(u)
            print(f"{name} ({path}): UUIDs found={len(visible_matches)}")
            for u in visible_matches[:5]:
                print(f"  {u}")
            if visible_matches:
                page.screenshot(path=f"C:/tmp/audit-{name}.png", full_page=True)

        # deals テーブル表示でもチェック
        page.goto(f"{BASE}/deals")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(1000)
        # テーブル表示に切替
        tbl_btn = page.locator('button:has-text("テーブル")').first
        if tbl_btn.count() > 0:
            tbl_btn.click()
            page.wait_for_timeout(1500)
        body_text = page.locator("body").inner_text()
        uuids = set(UUID_RE.findall(body_text))
        print(f"deals (table view): UUIDs found={len(uuids)}")
        for u in list(uuids)[:5]: print(f"  {u}")
        if uuids:
            page.screenshot(path="C:/tmp/audit-deals-table.png", full_page=True)

        browser.close()

if __name__ == "__main__":
    main()
