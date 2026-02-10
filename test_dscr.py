"""Test DSCR grouped LP rendering."""
from playwright.sync_api import sync_playwright
import time

URL = "https://mypricev5.vercel.app"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})

    console = []
    page.on("console", lambda m: console.append(f"[{m.type}] {m.text}"))

    page.goto(URL)
    page.wait_for_load_state("networkidle")

    # Switch Doc Type to DSCR
    page.get_by_role("combobox", name="Doc Type").click()
    time.sleep(0.5)
    # Look for DSCR option
    dscr_opt = page.get_by_role("option", name="DSCR")
    if dscr_opt.count() > 0:
        dscr_opt.click()
        print("Selected DSCR doc type")
    else:
        # Try alternate
        page.get_by_text("DSCR", exact=True).click()
        print("Clicked DSCR text")
    time.sleep(1)

    # Verify occupancy auto-switched to Investment
    page.screenshot(path="/tmp/dscr_form.png")

    page.locator('button[type="submit"]').click()
    print("Submitted")

    # Wait for LP
    start = time.time()
    while time.time() - start < 90:
        lp_logs = [l for l in console if '[LP]' in l and 'rates:' in l]
        if lp_logs:
            print(f"LP responded at t={time.time()-start:.0f}s: {lp_logs[-1]}")
            break
        time.sleep(2)
    else:
        print("LP timeout")

    time.sleep(3)
    page.screenshot(path="/tmp/dscr_results.png", full_page=True)

    # Scroll to LP section
    lp = page.locator('text=Expanded Market Rates')
    if lp.count() > 0:
        lp.scroll_into_view_if_needed()
        time.sleep(1)
        page.screenshot(path="/tmp/dscr_lp.png")
        print("Expanded Market Rates found and screenshot captured")

        # Check program groups
        prog = page.locator('.text-indigo-600')
        print(f"Program groups: {prog.count()}")
        for i in range(prog.count()):
            print(f"  {prog.nth(i).inner_text()}")

        # Check tables
        tables = page.locator('table')
        for t in range(tables.count()):
            headers = tables.nth(t).locator('th')
            h = [headers.nth(i).inner_text() for i in range(headers.count())]
            if 'Price Adj.' in h:
                rows = tables.nth(t).locator('tbody tr')
                print(f"Table: {rows.count()} rows")
                for r in range(min(rows.count(), 3)):
                    cells = rows.nth(r).locator('td')
                    ct = [cells.nth(c).inner_text() for c in range(cells.count())]
                    print(f"  {ct}")
    else:
        no_rates = page.locator('text=No expanded')
        print(f"No LP card. Empty msg visible: {no_rates.is_visible() if no_rates.count()>0 else 'N/A'}")
        print(f"LP logs: {[l for l in console if 'LP' in l]}")

    page.close()
    browser.close()
