"""Test LP results rendering - wait longer for LP background fetch."""
from playwright.sync_api import sync_playwright
import time

URL = "https://mypricev5.vercel.app"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})

    # Capture console + network
    console_logs = []
    page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))

    # Track LP API call
    lp_responses = []
    def handle_response(response):
        if 'get-lp-pricing' in response.url:
            try:
                body = response.json()
                lp_responses.append({"status": response.status, "body": body})
            except:
                lp_responses.append({"status": response.status, "body": "parse_error"})
    page.on("response", handle_response)

    print("Loading page...")
    page.goto(URL)
    page.wait_for_load_state("networkidle")

    print("Clicking Get Pricing...")
    page.locator('button[type="submit"]').click()

    # Wait for ML results first
    print("Waiting for ML results...")
    try:
        page.wait_for_selector('[class*="text-primary"]', timeout=30000)
        print("ML results loaded")
    except:
        print("ML results timeout")

    # Now wait specifically for LP to complete
    print("Waiting for LP API response (up to 90s)...")
    start = time.time()
    while time.time() - start < 90:
        if len(lp_responses) > 0:
            elapsed = time.time() - start
            print(f"LP API responded after {elapsed:.0f}s")
            break
        time.sleep(2)
    else:
        print("LP API never responded in 90s")

    if lp_responses:
        resp = lp_responses[0]
        print(f"LP status: {resp['status']}")
        if isinstance(resp['body'], dict):
            data = resp['body'].get('data', {})
            rates = data.get('rateOptions', [])
            print(f"LP success: {resp['body'].get('success')}")
            print(f"LP rates returned: {len(rates)}")
            if rates:
                print(f"First rate: {rates[0]}")
                print(f"Last rate: {rates[-1]}")
        else:
            print(f"LP body: {resp['body']}")

    # Wait a moment for React to re-render with LP data
    time.sleep(3)

    # Now check the DOM for LP rendering
    page.screenshot(path="/tmp/lp_v2_results.png", full_page=True)

    # Find all tables on the page
    tables = page.locator('table')
    print(f"\nTotal tables on page: {tables.count()}")
    for t in range(tables.count()):
        tbl = tables.nth(t)
        headers = tbl.locator('th')
        h_texts = [headers.nth(i).inner_text() for i in range(headers.count())]
        rows = tbl.locator('tr')
        print(f"  Table {t}: headers={h_texts}, rows={rows.count()}")

    # Check for LP-specific card
    lp_card = page.locator('text=Additional Market Rates')
    print(f"\n'Additional Market Rates' elements: {lp_card.count()}")
    for i in range(lp_card.count()):
        el = lp_card.nth(i)
        print(f"  [{i}] visible={el.is_visible()}, text='{el.inner_text()[:80]}'")

    # Check LP loading indicator
    loading = page.locator('text=Fetching additional market rates')
    print(f"\nLP loading indicator: count={loading.count()}, visible={loading.is_visible() if loading.count() > 0 else 'N/A'}")

    # Check for LP rate count badge
    rate_count_badge = page.locator('text=/\\d+ rates/')
    print(f"\nRate count badges: {rate_count_badge.count()}")
    for i in range(rate_count_badge.count()):
        print(f"  [{i}] '{rate_count_badge.nth(i).inner_text()}'")

    # Look at the indigo card specifically
    indigo_cards = page.locator('[class*="indigo"]')
    print(f"\nIndigo-styled elements: {indigo_cards.count()}")

    # Print LP console logs
    print("\nConsole logs:")
    for log in console_logs:
        if 'LP' in log or 'error' in log.lower():
            print(f"  {log}")

    # Scroll to LP section and screenshot
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    time.sleep(1)
    page.screenshot(path="/tmp/lp_v2_bottom.png")

    browser.close()
