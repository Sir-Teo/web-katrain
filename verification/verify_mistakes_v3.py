from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            page.goto("http://localhost:5173", timeout=60000)

            # Use a more generic wait
            page.wait_for_selector("body", state="visible")

            # Wait for any text to confirm load
            page.wait_for_selector("text=Ka", state="visible")

            # Open Settings to check Mistake Threshold
            page.click("button[title='Settings']")
            time.sleep(1)
            page.screenshot(path="verification/settings_modal.png")
            page.click("button:has-text('Done')")

            # Screenshot the main UI to check buttons
            page.screenshot(path="verification/main_ui.png")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error.png")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
