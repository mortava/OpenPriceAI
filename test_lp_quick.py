"""Quick debug: just test Full Doc defaults, capture everything."""
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
    t0 = time.time()
    page.locator('button[type="submit"]').click()
    print(f"Submitted at t=0")

    # Poll until LP response or 90s
    while time.time() - t0 < 90:
        if lp_done:
            print(f"LP response at t={lp_done[0]-t0:.0f}s")
            break
        time.sleep(2)
    else:
        print("LP never responded in 90s")

    time.sleep(3)

    # Check page state
    expanded = page.locator('text=Expanded Market Rates')
    no_rates = page.locator('text=No expanded market rates')
    loading = page.locator('text=Fetching expanded')
    print(f"'Expanded Market Rates': {expanded.count()}, visible={expanded.is_visible() if expanded.count()>0 else 'N/A'}")
    print(f"'No expanded market rates': {no_rates.count()}, visible={no_rates.is_visible() if no_rates.count()>0 else 'N/A'}")
    print(f"Loading indicator: {loading.count()}")

    page.screenshot(path="/tmp/lp_quick.png", full_page=True)

    lp_logs = [l for l in console if 'LP' in l or 'lp' in l.lower() or 'error' in l.lower()]
    print(f"\nLP logs:")
    for l in lp_logs:
        print(f"  {l[:200]}")

    page.close()
    browser.close()
