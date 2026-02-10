"""Intercept LP request body from frontend vs curl to find the difference."""
from playwright.sync_api import sync_playwright
import json
import time

URL = "https://mypricev5.vercel.app"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})

    # Intercept the LP request
    lp_request_body = []
    lp_responses = []

    def handle_request(request):
        if 'get-lp-pricing' in request.url:
            body = request.post_data
            lp_request_body.append(json.loads(body) if body else None)

    def handle_response(response):
        if 'get-lp-pricing' in response.url:
            try:
                lp_responses.append(response.json())
            except:
                lp_responses.append({"parse_error": True})

    page.on("request", handle_request)
    page.on("response", handle_response)

    page.goto(URL)
    page.wait_for_load_state("networkidle")

    # Submit form with defaults
    page.locator('button[type="submit"]').click()

    # Wait for LP response
    start = time.time()
    while time.time() - start < 70:
        if lp_responses:
            break
        time.sleep(2)

    if lp_request_body:
        body = lp_request_body[0]
        print("=== FRONTEND LP REQUEST BODY ===")
        # Print key fields that mapFormValues uses
        key_fields = ['creditScore', 'citizenship', 'documentationType', 'occupancyType',
                      'propertyType', 'propertyZip', 'propertyState', 'loanPurpose',
                      'loanAmount', 'propertyValue', 'isSelfEmployed', 'dti',
                      'structureType', 'impoundType', 'paymentType', 'dscrValue', 'dscrRatio']
        for k in key_fields:
            print(f"  {k}: {body.get(k, 'MISSING')} (type: {type(body.get(k)).__name__})")

        print("\n=== FULL REQUEST BODY ===")
        print(json.dumps(body, indent=2, default=str)[:3000])
    else:
        print("No LP request intercepted!")

    if lp_responses:
        resp = lp_responses[0]
        print("\n=== LP RESPONSE ===")
        data = resp.get('data', {})
        debug = data.get('debug', {})
        print(f"  success: {resp.get('success')}")
        print(f"  rates: {len(data.get('rateOptions', []))}")
        print(f"  rawRateCount: {debug.get('rawRateCount')}")
        print(f"  mappedValues: {json.dumps(debug.get('mappedValues', {}), indent=4)}")
        diag = debug.get('diag', {})
        if diag:
            print(f"  steps: {diag.get('steps', [])}")
            print(f"  debugRows: {diag.get('debugRows', [])}")
    else:
        print("No LP response received!")

    browser.close()
