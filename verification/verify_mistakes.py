from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:5173")

        # Click "Teach Mode" to enable it (which enables analysis mock)
        page.click("button[title='Teach Mode']")
        time.sleep(1)

        # Play some moves to generate history
        # We need a sequence that generates a "mistake" according to mock analysis.
        # Mock analysis generates random points lost.
        # Let's play a few moves.

        # Black
        page.mouse.click(400, 400)
        time.sleep(0.5)
        # White
        page.mouse.click(450, 400)
        time.sleep(0.5)
        # Black
        page.mouse.click(400, 450)
        time.sleep(0.5)
        # White
        page.mouse.click(450, 450)
        time.sleep(0.5)

        # Open Settings to check Mistake Threshold
        page.click("button[title='Settings']")
        time.sleep(1)
        page.screenshot(path="verification/settings_modal.png")
        page.click("button:has-text('Done')")

        # Try finding a mistake (Previous Mistake)
        # This might fail if mock doesn't generate one, but we can verify the button exists
        page.click("button[title='Previous Mistake (Shift+N)']")
        time.sleep(1)

        page.screenshot(path="verification/mistakes_ui.png")

        browser.close()

if __name__ == "__main__":
    run()
