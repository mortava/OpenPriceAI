"""Debug why LP request doesn't fire from frontend."""
from playwright.sync_api import sync_playwright
import json
import time

URL = "https://mypricev5.vercel.app"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})

    console_logs = []
    page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))

    all_requests = []
    all_responses = []
    def on_req(req):
        if 'api/' in req.url or 'get-' in req.url:
            all_requests.append({"url": req.url, "method": req.method, "body": req.post_data})
    def on_resp(resp):
        if 'api/' in resp.url or 'get-' in resp.url:
            try:
                body = resp.json()
            except:
                body = "non-json"
            all_responses.append({"url": resp.url, "status": resp.status, "body_preview": str(body)[:500]})

    page.on("request", on_req)
    page.on("response", on_resp)

    page.goto(URL)
    page.wait_for_load_state("networkidle")

    # Check for validation errors before clicking
    print("Checking form state before submit...")
    error_elements = page.locator('[class*="text-red"]')
    print(f"Red text elements: {error_elements.count()}")

    # Click submit
    print("\nClicking submit...")
    page.locator('button[type="submit"]').click()

    # Wait a bit
    time.sleep(5)

    # Check for validation errors after clicking
    print("\nAfter submit - checking errors...")
    error_elements = page.locator('[class*="text-red"]')
    print(f"Red text elements: {error_elements.count()}")
    for i in range(min(error_elements.count(), 10)):
        txt = error_elements.nth(i).inner_text()
        if txt.strip():
            print(f"  Error: {txt[:100]}")

    # Check page state
    page.screenshot(path="/tmp/lp_v4_after_submit.png", full_page=True)

    # Check for loading state
    loading_indicators = page.locator('[class*="animate"]')
    print(f"\nAnimating elements: {loading_indicators.count()}")

    # Wait longer for API calls
    print("\nWaiting for API calls (60s)...")
    start = time.time()
    while time.time() - start < 60:
        if len(all_responses) >= 2:  # ML + LP
            break
        if len(all_responses) >= 1 and time.time() - start > 40:
            break  # at least ML came back
        time.sleep(2)

    print(f"\nTotal API requests: {len(all_requests)}")
    for r in all_requests:
        body_preview = (r['body'] or '')[:200]
        print(f"  {r['method']} {r['url'][:80]} body={body_preview}")

    print(f"\nTotal API responses: {len(all_responses)}")
    for r in all_responses:
        print(f"  {r['status']} {r['url'][:80]}")
        print(f"    {r['body_preview'][:300]}")

    print(f"\nConsole logs ({len(console_logs)}):")
    for log in console_logs:
        print(f"  {log[:200]}")

    browser.close()
