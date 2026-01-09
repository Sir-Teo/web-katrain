import time
from playwright.sync_api import sync_playwright

def verify_settings(page):
    try:
        # Wait for app to load
        page.goto("http://localhost:5173")
        page.wait_for_selector("text=Ka", timeout=10000)

        # Click settings button (FaCog)
        # The button has title "Settings"
        page.locator('button[title="Settings"]').click()

        # Wait for modal
        page.wait_for_selector("text=Board Theme")

        # Change theme to Dark
        page.select_option("select", "dark")

        # Change mistakes to 5
        page.fill('input[type="range"]', "5")

        # Close modal
        page.click("text=Done")

        # Make some moves to see the board
        # Click on the board
        # Assuming board is canvas or div, let's click center
        # The board is 19x19, click around
        page.mouse.click(500, 300)
        time.sleep(0.5)
        page.mouse.click(550, 300)
        time.sleep(0.5)

        # Take screenshot
        page.screenshot(path="/home/jules/verification/settings_verification.png")
        print("Screenshot taken")
    except Exception as e:
        print(f"Error in verify_settings: {e}")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_settings(page)
        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()
