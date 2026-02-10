"""Final test: verify LP fires in parallel and renders correctly."""
from playwright.sync_api import sync_playwright
import json
import time

URL = "https://mypricev5.vercel.app"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})

    console_logs = []
    page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))

    lp_req_times = []
    ml_req_times = []
    lp_responses = []

    def on_req(req):
        if 'get-lp-pricing' in req.url:
            lp_req_times.append(time.time())
        elif 'get-pricing' in req.url and 'lp' not in req.url:
            ml_req_times.append(time.time())

    def on_resp(resp):
        if 'get-lp-pricing' in resp.url:
            try:
                lp_responses.append({"time": time.time(), "body": resp.json()})
            except:
                lp_responses.append({"time": time.time(), "body": None})

    page.on("request", on_req)
    page.on("response", on_resp)

    page.goto(URL)
    page.wait_for_load_state("networkidle")

    submit_time = time.time()
    print(f"Submitting form at t=0...")
    page.locator('button[type="submit"]').click()

    # Wait for LP response (up to 90s)
    start = time.time()
    while time.time() - start < 90:
        if lp_responses:
            break
        time.sleep(2)

    # Timing analysis
    if ml_req_times:
        print(f"ML request fired at t={ml_req_times[0] - submit_time:.1f}s")
    if lp_req_times:
        print(f"LP request fired at t={lp_req_times[0] - submit_time:.1f}s")
    if ml_req_times and lp_req_times:
        delta = abs(lp_req_times[0] - ml_req_times[0])
        print(f"Delta between ML and LP: {delta:.1f}s {'(PARALLEL!)' if delta < 1 else '(SEQUENTIAL - still broken)'}")

    if lp_responses:
        resp = lp_responses[0]
        elapsed = resp['time'] - submit_time
        print(f"LP response at t={elapsed:.1f}s")
        body = resp['body']
        if body:
            data = body.get('data', {})
            rates = data.get('rateOptions', [])
            print(f"LP success={body.get('success')}, rates={len(rates)}")
            if rates:
                print(f"First rate: {json.dumps(rates[0])}")
                in_range = [r for r in rates if 99 <= r['price'] <= 101]
                print(f"In 99-101 price range: {len(in_range)} rates")
    else:
        print("LP response never received!")

    # Wait for React render
    time.sleep(3)

    # Check LP section rendering
    page.screenshot(path="/tmp/lp_final_results.png", full_page=True)

    # Find all tables
    tables = page.locator('table')
    print(f"\nTables on page: {tables.count()}")
    for t in range(tables.count()):
        tbl = tables.nth(t)
        headers = tbl.locator('th')
        h_texts = [headers.nth(i).inner_text() for i in range(headers.count())]
        rows = tbl.locator('tbody tr')
        print(f"  Table {t}: headers={h_texts}, data rows={rows.count()}")
        if 'Program' in h_texts:
            print("  ^ THIS IS THE LP TABLE")
            for r in range(min(rows.count(), 3)):
                cells = rows.nth(r).locator('td')
                cell_texts = [cells.nth(c).inner_text() for c in range(cells.count())]
                print(f"    Row {r}: {cell_texts}")

    # Check for "Additional Market Rates" header
    lp_header = page.locator('text=Additional Market Rates')
    print(f"\n'Additional Market Rates' visible: {lp_header.is_visible() if lp_header.count() > 0 else 'not found'}")

    # Check for empty state
    empty_msg = page.locator('text=No additional market rates')
    print(f"'No additional market rates' visible: {empty_msg.is_visible() if empty_msg.count() > 0 else 'not found'}")

    # Check loading indicator
    loading = page.locator('text=Fetching additional market rates')
    print(f"Loading indicator visible: {loading.is_visible() if loading.count() > 0 else 'not found'}")

    # Console logs
    lp_logs = [l for l in console_logs if 'LP' in l or 'lp' in l.lower()]
    print(f"\nLP console logs ({len(lp_logs)}):")
    for log in lp_logs:
        print(f"  {log[:200]}")

    # Scroll to bottom and take screenshot
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    time.sleep(1)
    page.screenshot(path="/tmp/lp_final_bottom.png")

    browser.close()
    print("\nScreenshots: /tmp/lp_final_results.png, /tmp/lp_final_bottom.png")
