"""Test LP rendering for both Full Doc and DSCR scenarios."""
from playwright.sync_api import sync_playwright
import time

URL = "https://mypricev5.vercel.app"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    # === TEST 1: Full Doc Primary (non-DSCR) ===
    print("=== TEST 1: Full Doc Primary ===")
    page = browser.new_page(viewport={"width": 1400, "height": 900})
    page.goto(URL)
    page.wait_for_load_state("networkidle")
    page.locator('button[type="submit"]').click()

    try:
        page.wait_for_selector('text=Expanded Market Rates', timeout=90000)
    except:
        pass
    time.sleep(3)

    tables = page.locator('table')
    for t in range(tables.count()):
        tbl = tables.nth(t)
        headers = tbl.locator('th')
        h_texts = [headers.nth(i).inner_text() for i in range(headers.count())]
        if 'Price Adj.' in h_texts:
            rows = tbl.locator('tbody tr')
            print(f"LP table: {rows.count()} rows, headers={h_texts}")
            for r in range(min(rows.count(), 8)):
                cells = rows.nth(r).locator('td')
                cell_texts = [cells.nth(c).inner_text() for c in range(cells.count())]
                print(f"  {cell_texts}")

    page.screenshot(path="/tmp/lp_fulldoc.png", full_page=True)
    page.close()

    # === TEST 2: DSCR Investment ===
    print("\n=== TEST 2: DSCR Investment ===")
    page = browser.new_page(viewport={"width": 1400, "height": 900})
    page.goto(URL)
    page.wait_for_load_state("networkidle")

    # Switch Doc Type to DSCR using Radix Select
    page.get_by_role("combobox", name="Doc Type").click()
    time.sleep(0.5)
    page.get_by_role("option", name="DSCR").click()
    time.sleep(1)

    page.locator('button[type="submit"]').click()

    try:
        page.wait_for_selector('text=Expanded Market Rates', timeout=90000)
    except:
        pass
    time.sleep(3)

    # Check for program group headers
    prog_headers = page.locator('.text-indigo-600')
    print(f"Program group headers: {prog_headers.count()}")
    for i in range(prog_headers.count()):
        print(f"  {prog_headers.nth(i).inner_text()}")

    # Find all LP tables (DSCR has one per program group)
    tables = page.locator('table')
    lp_count = 0
    for t in range(tables.count()):
        tbl = tables.nth(t)
        headers = tbl.locator('th')
        h_texts = [headers.nth(i).inner_text() for i in range(headers.count())]
        if 'Price Adj.' in h_texts:
            lp_count += 1
            rows = tbl.locator('tbody tr')
            print(f"\nLP table {lp_count}: {rows.count()} rows")
            for r in range(min(rows.count(), 5)):
                cells = rows.nth(r).locator('td')
                cell_texts = [cells.nth(c).inner_text() for c in range(cells.count())]
                print(f"  {cell_texts}")

    page.screenshot(path="/tmp/lp_dscr.png", full_page=True)

    lp = page.locator('text=Expanded Market Rates')
    if lp.count() > 0:
        lp.scroll_into_view_if_needed()
        time.sleep(1)
        page.screenshot(path="/tmp/lp_dscr_section.png")

    page.close()
    browser.close()
    print("\nDone.")
