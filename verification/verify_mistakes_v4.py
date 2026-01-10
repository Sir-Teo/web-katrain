from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Use context with larger viewport
        context = browser.new_context(viewport={"width": 1280, "height": 720})
        page = context.new_page()
        try:
            page.goto("http://localhost:5173", timeout=60000)

            # Wait for root div
            page.wait_for_selector("#root", state="visible")

            # Take early screenshot to see what's rendering
            time.sleep(2)
            page.screenshot(path="verification/early_render.png")

            # Try to find the title "Ka" or similar
            # page.wait_for_selector("text=Ka", state="visible", timeout=10000)

            # Check for settings button
            # page.click("button[title='Settings']")
            # time.sleep(1)
            # page.screenshot(path="verification/settings_modal.png")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error.png")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
