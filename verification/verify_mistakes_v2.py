from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:5173")

        # Wait for app to load
        page.wait_for_selector("div.text-2xl", state="visible") # "Ka" logo

        # Open Settings to check Mistake Threshold
        page.click("button[title='Settings']")
        time.sleep(1)
        page.screenshot(path="verification/settings_modal.png")
        page.click("button:has-text('Done')")

        # We need to find the specific locator for the Mistake buttons.
        # Based on my code:
        # <button ... title="Previous Mistake (Shift+N)"> ... </button>
        # Maybe I should use more robust locators.

        # Screenshot the main UI to check buttons
        page.screenshot(path="verification/main_ui.png")

        browser.close()

if __name__ == "__main__":
    run()
