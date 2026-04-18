"""管理→パイプライン→ディールステータス一覧を確認"""
from playwright.sync_api import sync_playwright

BASE = "http://localhost:2000"

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={"width":1440,"height":900})
    page = ctx.new_page()
    page.goto(f"{BASE}/login"); page.wait_for_load_state("networkidle")
    page.fill('#email',"admin@iterra.jp"); page.fill('#password',"password123")
    with page.expect_navigation(timeout=30000): page.click('button[type="submit"]')
    page.wait_for_load_state("networkidle")

    page.goto(f"{BASE}/admin"); page.wait_for_load_state("networkidle"); page.wait_for_timeout(800)
    # パイプラインタブは最初からアクティブ
    # パイプライン選択で「営業」を選ぶ
    selects = page.locator('select').all()
    for s in selects:
        opts = s.locator('option').all()
        for o in opts:
            if "営業" in (o.inner_text() or ""):
                s.select_option(label="営業")
                break
    page.wait_for_timeout(1500)
    # ディールステータス見出しまでスクロール
    status_heading = page.locator('h2:has-text("ディールステータス")').first
    if status_heading.count():
        status_heading.scroll_into_view_if_needed()
        page.wait_for_timeout(500)
        box = status_heading.bounding_box()
        if box:
            top = max(int(box["y"]) - 20, 0)
            page.screenshot(path="C:/tmp/31-status-bottom.png", clip={"x":0,"y":top,"width":1440,"height":500})
            print("Captured status table near y=", top)
        else:
            page.screenshot(path="C:/tmp/31-status-bottom.png", full_page=True)
    else:
        print("ディールステータス heading not found")
        page.screenshot(path="C:/tmp/31-status-bottom.png", full_page=True)
    b.close()
