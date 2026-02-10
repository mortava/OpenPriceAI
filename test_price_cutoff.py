"""Verify LP price cutoff, prepay header, and conforming filter."""
from playwright.sync_api import sync_playwright
import time

URL = "https://mypricev5.vercel.app"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})
    console = []
    page.on("console", lambda m: console.append(f"[{m.type}] {m.text}"))

    lp_done = []
    def on_resp(resp):
        if 'get-lp-pricing' in resp.url:
            lp_done.append(time.time())
    page.on("response", on_resp)

    page.goto(URL)
    page.wait_for_load_state("networkidle")

    # Switch to DSCR
    page.get_by_role("combobox", name="Doc Type").click()
    time.sleep(0.5)
    page.get_by_role("option", name="DSCR").click()
    time.sleep(1)

    # Set 36 month prepay
    page.get_by_role("combobox", name="Prepay Period").click()
    time.sleep(0.3)
    page.get_by_role("option", name="36 Months").click()
    time.sleep(0.5)

    # Submit
    t0 = time.time()
    page.locator('button[type="submit"]').click()
    print("Submitted")

    # Wait for LP response
    while time.time() - t0 < 90:
        if lp_done:
            print(f"LP response at t={lp_done[0]-t0:.0f}s")
            break
        time.sleep(2)
    else:
        print("LP timeout")

    time.sleep(3)

    # Check for "Expanded Market Rates - 36 Month Prepay" header
    header = page.locator('text=Expanded Market Rates - 36 Month Prepay')
    print(f"Header '36 Month Prepay': visible={header.is_visible() if header.count() > 0 else 'NOT FOUND'}")

    # Check for NO conforming programs text
    conf = page.locator('text=CONF')
    print(f"'CONF' text found: {conf.count()}")

    # Find LP table and check prices
    tables = page.locator('table')
    for t in range(tables.count()):
        tbl = tables.nth(t)
        headers = tbl.locator('th')
        h = [headers.nth(i).inner_text() for i in range(headers.count())]
        if 'Price Adj.' in h:
            rows = tbl.locator('tbody tr')
            print(f"\nLP table: {rows.count()} rows")
            max_price = 0
            for r in range(rows.count()):
                cells = rows.nth(r).locator('td')
                ct = [cells.nth(c).inner_text() for c in range(cells.count())]
                price = float(ct[1]) if len(ct) > 1 else 0
                if price > max_price:
                    max_price = price
                print(f"  {ct}")
            print(f"\nMax displayed price: {max_price}")
            print(f"Price cutoff working (<=101): {'YES' if max_price <= 101.001 else 'NO'}")

    # Scroll to LP section and screenshot
    lp = page.locator('text=Expanded Market Rates')
    if lp.count() > 0:
        lp.first.scroll_into_view_if_needed()
        time.sleep(1)
        page.screenshot(path="C:/Users/beach/test_cutoff.png")
        print("Screenshot saved")

    page.close()
    browser.close()
    print("\nDone.")
