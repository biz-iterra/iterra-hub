"""
Bulk commit E2Eテスト
- ログイン → /admin/inside-sales/import → ファイルアップロード
- dry-run → commit 実行 → 所要時間と結果を確認
"""
from playwright.sync_api import sync_playwright
import os
import time

BASE = "http://localhost:2000"

def main():
    with sync_playwright() as p:
        # confirm() ダイアログに自動で "OK"
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()
        page.on("dialog", lambda d: d.accept())

        # ログイン
        page.goto(f"{BASE}/login")
        page.wait_for_load_state("networkidle")
        page.fill('#email', "admin@iterra.jp")
        page.fill('#password', "password123")
        with page.expect_navigation(timeout=30000):
            page.click('button[type="submit"]')
        page.wait_for_load_state("networkidle")

        # admin トップ経由（セッション確立のため）
        page.goto(f"{BASE}/admin")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(500)

        # インポート画面へ
        page.goto(f"{BASE}/admin/inside-sales/import")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(500)

        # CSV 選択
        csv_path = None
        for f in os.listdir(r"C:\Users\bizis\iterra.jp\iterra-hub"):
            if f.endswith(".csv"):
                csv_path = os.path.join(r"C:\Users\bizis\iterra.jp\iterra-hub", f)
                break
        print(f"Uploading: {csv_path}")
        page.set_input_files('input#csv-file', csv_path)
        page.wait_for_timeout(500)

        # Dry-run
        print("Clicking 内容チェック...")
        t0 = time.time()
        page.click('button:has-text("内容チェック")')
        page.wait_for_selector('h2:has-text("プレビュー結果")', timeout=60000)
        print(f"Dry-run complete in {time.time() - t0:.1f}s")
        page.screenshot(path="C:/tmp/05-dryrun.png", full_page=True)

        # Commit
        print("Clicking 投入 button...")
        t1 = time.time()
        page.click('button:has-text("件を投入")')
        # 取込結果が出るまで待つ（最大10分）
        try:
            page.wait_for_selector('h2:has-text("取込結果")', timeout=600000)
            print(f"Commit complete in {time.time() - t1:.1f}s")
        except Exception as e:
            print(f"Commit timeout: {e}")
            page.screenshot(path="C:/tmp/06-commit-timeout.png", full_page=True)
            browser.close()
            return

        page.screenshot(path="C:/tmp/07-commit-result.png", full_page=True)

        # 結果の値を抽出
        stat_paragraphs = page.locator('p[style*="font-weight: 700"]').all()
        for sp in stat_paragraphs:
            try:
                txt = sp.inner_text()
                print(f"  stat: {txt}")
            except Exception:
                pass

        browser.close()

if __name__ == "__main__":
    main()
