"""Verify LP UI changes: position, name, -0.50 adj, no program name."""
from playwright.sync_api import sync_playwright
import time

URL = "https://mypricev5.vercel.app"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})

    page.goto(URL)
    page.wait_for_load_state("networkidle")
    page.locator('button[type="submit"]').click()

    # Wait for LP to load
    print("Waiting for Expanded Market Rates...")
    try:
        page.wait_for_selector('text=Expanded Market Rates', timeout=90000)
        print("Found!")
    except:
        print("Not found - checking page...")

    time.sleep(3)
    page.screenshot(path="/tmp/lp_ui_full.png", full_page=True)

    # Check ordering: LP card should be ABOVE Submit+Lock
    lp_card = page.locator('text=Expanded Market Rates')
    submit_btn = page.locator('text=Submit + Lock')

    if lp_card.count() > 0 and submit_btn.count() > 0:
        lp_box = lp_card.bounding_box()
        submit_box = submit_btn.bounding_box()
        if lp_box and submit_box:
            print(f"\nLP card Y: {lp_box['y']:.0f}, Submit button Y: {submit_box['y']:.0f}")
            print(f"LP is {'ABOVE' if lp_box['y'] < submit_box['y'] else 'BELOW'} Submit button")

    # Check LP table contents
    tables = page.locator('table')
    for t in range(tables.count()):
        tbl = tables.nth(t)
        headers = tbl.locator('th')
        h_texts = [headers.nth(i).inner_text() for i in range(headers.count())]
        if 'Price Adj.' in h_texts:
            print(f"\nLP table headers: {h_texts}")
            print(f"Program column present: {'Program' in h_texts}")
            rows = tbl.locator('tbody tr')
            print(f"Data rows: {rows.count()}")
            for r in range(min(rows.count(), 5)):
                cells = rows.nth(r).locator('td')
                cell_texts = [cells.nth(c).inner_text() for c in range(cells.count())]
                print(f"  Row {r}: {cell_texts}")

    # Scroll to LP section for close-up screenshot
    if lp_card.count() > 0:
        lp_card.scroll_into_view_if_needed()
        time.sleep(1)
        page.screenshot(path="/tmp/lp_ui_section.png")

    browser.close()
