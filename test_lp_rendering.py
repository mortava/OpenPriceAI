"""Test LP results rendering on the live MyPRICEv5 app."""
from playwright.sync_api import sync_playwright
import json
import time

URL = "https://mypricev5.vercel.app"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})

    # Capture console logs
    console_logs = []
    page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))

    print("1. Loading page...")
    page.goto(URL)
    page.wait_for_load_state("networkidle")
    page.screenshot(path="/tmp/lp_01_loaded.png", full_page=True)
    print("   Page loaded. Title:", page.title())

    # Fill form with default values (Full Doc, Primary, Purchase)
    # The form should already have defaults - just click Get Pricing
    print("2. Looking for submit button...")
    submit_btn = page.locator('button[type="submit"]')
    print(f"   Found submit button: {submit_btn.count()} buttons")

    # Take screenshot of form state before submitting
    page.screenshot(path="/tmp/lp_02_form.png", full_page=True)

    print("3. Clicking Get Pricing...")
    submit_btn.click()

    # Wait for ML results to appear (loading state -> results)
    print("4. Waiting for ML results...")
    try:
        page.wait_for_selector('text=Additional Market Rates', timeout=90000)
        print("   'Additional Market Rates' section appeared!")
    except:
        print("   Timeout waiting for 'Additional Market Rates'")
        # Check if ML results appeared at least
        try:
            page.wait_for_selector('text=Target Pricing', timeout=5000)
            print("   ML 'Target Pricing' appeared, but LP section didn't load")
        except:
            print("   No pricing results at all")

    # Wait a bit more for LP to finish
    time.sleep(3)

    # Screenshot results
    page.screenshot(path="/tmp/lp_03_results.png", full_page=True)

    # Check what's on the page
    print("\n5. Checking page content...")

    # Check for LP section
    lp_section = page.locator('text=Additional Market Rates')
    if lp_section.count() > 0:
        print("   LP section FOUND")
        # Scroll to LP section
        lp_section.scroll_into_view_if_needed()
        time.sleep(1)
        page.screenshot(path="/tmp/lp_04_lp_section.png", full_page=False)

        # Get the LP table data
        lp_table = page.locator('table').last
        rows = lp_table.locator('tr')
        print(f"   LP table rows: {rows.count()}")

        # Print header
        headers = lp_table.locator('th')
        header_texts = [headers.nth(i).inner_text() for i in range(headers.count())]
        print(f"   Headers: {header_texts}")

        # Print first few data rows
        for i in range(min(rows.count(), 6)):
            cells = rows.nth(i).locator('td')
            if cells.count() > 0:
                cell_texts = [cells.nth(j).inner_text() for j in range(cells.count())]
                print(f"   Row {i}: {cell_texts}")
    else:
        print("   LP section NOT FOUND on page")
        # Check for loading state
        loading = page.locator('text=Fetching additional market rates')
        if loading.count() > 0:
            print("   LP still loading...")
        else:
            print("   No LP loading indicator either")

    # Check for "Fetching additional..." message that never resolves
    lp_loading = page.locator('text=Fetching additional market rates')
    print(f"\n6. LP loading indicator visible: {lp_loading.is_visible() if lp_loading.count() > 0 else 'not found'}")

    # Print relevant console logs
    print("\n7. Console logs (LP-related):")
    for log in console_logs:
        if 'LP' in log or 'lp' in log.lower() or 'error' in log.lower() or 'pricing' in log.lower():
            print(f"   {log}")

    # Full page screenshot scrolled to bottom
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    time.sleep(1)
    page.screenshot(path="/tmp/lp_05_bottom.png", full_page=True)

    print("\n8. Screenshots saved to /tmp/lp_01-05*.png")

    browser.close()
