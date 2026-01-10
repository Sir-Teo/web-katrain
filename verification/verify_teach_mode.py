
from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("http://localhost:5173")

    # 1. Turn on Teach Mode
    # Look for button with title "Teach Mode"
    teach_btn = page.locator('button[title="Teach Mode"]')
    teach_btn.click()

    # Wait for analysis to run (mock)
    page.wait_for_timeout(1000)

    # 2. Try to make a bad move
    # Click somewhere 1-1 (should be bad in open game)
    # The board is 19x19.
    # Let's find the board container.
    # The click logic depends on coordinates.
    # Let's try to click on the board element at some offset.
    # Board size is usually around 30px per cell.
    # Let's try clicking at 50, 50 (top left corner area)

    # Find board element
    # It has no specific ID, but we can find it by class or structure.
    # It has style width/height.
    board = page.locator('.relative.shadow-lg.rounded-sm')

    # Click at 1-1 (approx 30+30, 30+30)
    # Let's click at 100, 100 to be safe (Star point is 3,3 -> 30*3+30 = 120)
    # Let's click at 1-1: 30*1+30 = 60
    board.click(position={"x": 60, "y": 60})

    # 3. Check for Notification
    # Wait for notification
    page.wait_for_selector('text=Bad move!', timeout=3000)

    # 4. Take Screenshot
    page.screenshot(path="verification/teach_mode.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
