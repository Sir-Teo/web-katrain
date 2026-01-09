import time
from playwright.sync_api import sync_playwright

def verify_analysis(page):
    # Capture console logs
    page.on("console", lambda msg: print(f"Console: {msg.text}"))
    page.on("pageerror", lambda err: print(f"Page Error: {err}"))

    try:
        page.goto("http://localhost:5173", timeout=10000)
    except Exception as e:
        print(f"Failed to load page: {e}")
        return

    # Wait for React to mount
    try:
        page.wait_for_selector('button', timeout=5000)
    except:
        print("Timed out waiting for buttons")
        return

    analysis_btn = page.locator('button[title="Toggle Analysis Mode"]')
    if analysis_btn.count() > 0:
        analysis_btn.click()
        # Wait for the analysis overlay dots
        try:
            page.wait_for_selector('.bg-blue-500', timeout=5000)
            print("Found analysis dots")
        except:
             print("Did not find analysis dots")
             return

        time.sleep(1)
        page.screenshot(path="verification/analysis_mode.png")
        print("Screenshot taken")
    else:
        print("Analysis button not found")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        try:
            verify_analysis(page)
        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()
