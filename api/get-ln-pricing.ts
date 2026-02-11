import type { VercelRequest, VercelResponse } from '@vercel/node'

const BROWSERLESS_URL = 'https://production-sfo.browserless.io/chromium/bql'
const LOANNEX_URL = 'https://web.loannex.com/iframe/loadiframe?_id=&page=nex-app'

// Vercel hobby plan: extend timeout to 60s
export const config = { maxDuration: 60 }

// ================= Login Script (AJAX — avoids page navigation) =================
function buildLoginScript(email: string, password: string): string {
  return `(async function() {
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  var diag = { steps: [], ts: Date.now() };

  await sleep(1500);
  diag.steps.push('page: ' + document.title + ' | ' + window.location.href);

  // Check if already logged in (no login form)
  var userInput = document.getElementById('UserName');
  if (!userInput) {
    var bodyText = (document.body.innerText || '').substring(0, 300);
    diag.steps.push('no_login_form: ' + bodyText);
    return JSON.stringify({ loggedIn: true, diag: diag });
  }

  // Login via fetch (AJAX) to avoid page navigation that destroys evaluate context
  // Try the form action first, fall back to common endpoints
  var form = userInput.closest('form');
  var loginUrl = form ? form.action : '/Account/Login';
  var returnUrl = '/iframe/loadiframe?_id=&page=nex-app';

  diag.steps.push('login_url: ' + loginUrl);

  // Get any anti-forgery tokens
  var tokenInput = form ? form.querySelector('input[name="__RequestVerificationToken"]') : null;
  var formBody = 'UserName=' + encodeURIComponent('${email}') + '&Password=' + encodeURIComponent('${password}');
  if (tokenInput) {
    formBody += '&__RequestVerificationToken=' + encodeURIComponent(tokenInput.value);
    diag.steps.push('antiforgery_found');
  }

  try {
    var resp = await fetch(loginUrl + '?returnUrl=' + encodeURIComponent(returnUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody,
      redirect: 'manual',
      credentials: 'include'
    });
    diag.steps.push('login_status: ' + resp.status + ' type: ' + resp.type);

    // Check cookies were set
    diag.steps.push('cookies: ' + document.cookie.substring(0, 200));
    return JSON.stringify({ loggedIn: true, status: resp.status, diag: diag });
  } catch(err) {
    diag.steps.push('fetch_error: ' + err.message);

    // Fallback: click the button (will cause navigation but we handle it)
    var loginBtn = document.getElementById('btnSubmit');
    if (loginBtn) {
      // Fill form values first
      function setInput(el, val) {
        el.focus();
        var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, val);
        el.dispatchEvent(new Event('input', {bubbles: true}));
        el.dispatchEvent(new Event('change', {bubbles: true}));
      }
      setInput(userInput, '${email}');
      setInput(document.getElementById('Password'), '${password}');
      setTimeout(function() { loginBtn.click(); }, 100);
      diag.steps.push('fallback_click_scheduled');
    }
    return JSON.stringify({ loggedIn: false, fallback: true, diag: diag });
  }
})()`
}

// ================= Discovery Script =================
function buildDiscoveryScript(): string {
  return `(async function() {
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  var diag = { steps: [] };

  await sleep(2000);
  diag.steps.push('url: ' + window.location.href);
  diag.steps.push('title: ' + document.title);

  // Discover ALL form elements
  var elements = document.querySelectorAll('input, select, textarea, [role="combobox"], [role="listbox"]');
  var fields = [];
  for (var i = 0; i < elements.length; i++) {
    var el = elements[i];
    if (el.type === 'hidden') continue;
    var label = '';
    // Try multiple label discovery strategies
    var labelEl = el.closest('label') || document.querySelector('label[for="' + el.id + '"]');
    if (labelEl) label = (labelEl.textContent || '').trim();
    if (!label && el.previousElementSibling) label = (el.previousElementSibling.textContent || '').trim();
    if (!label) {
      var parent = el.parentElement;
      if (parent) {
        var sibLabel = parent.querySelector('label, .label, span');
        if (sibLabel) label = (sibLabel.textContent || '').trim();
      }
    }
    var opts = undefined;
    if (el.tagName === 'SELECT') {
      opts = [];
      for (var j = 0; j < el.options.length && j < 20; j++) {
        opts.push({ value: el.options[j].value, text: el.options[j].text });
      }
    }
    fields.push({
      tag: el.tagName,
      id: el.id || '',
      name: el.name || '',
      type: el.type || '',
      placeholder: el.placeholder || '',
      className: (el.className || '').substring(0, 80),
      label: label.substring(0, 60),
      value: (el.value || '').substring(0, 50),
      options: opts
    });
  }

  // Also discover buttons
  var buttons = document.querySelectorAll('button, input[type="submit"], a.btn');
  var btnList = [];
  for (var b = 0; b < buttons.length; b++) {
    btnList.push({
      tag: buttons[b].tagName,
      type: buttons[b].type || '',
      text: (buttons[b].textContent || '').trim().substring(0, 50),
      className: (buttons[b].className || '').substring(0, 80),
      id: buttons[b].id || ''
    });
  }

  // Discover links / navigation
  var links = document.querySelectorAll('a[href]');
  var linkList = [];
  for (var l = 0; l < links.length && l < 30; l++) {
    var linkText = (links[l].textContent || '').trim();
    if (linkText.length > 0 && linkText.length < 60) {
      linkList.push({
        text: linkText,
        href: links[l].getAttribute('href').substring(0, 120),
        className: (links[l].className || '').substring(0, 60)
      });
    }
  }

  // Check for iframes (Loannex may embed the pricer in an iframe)
  var iframes = document.querySelectorAll('iframe');
  var iframeList = [];
  for (var fi = 0; fi < iframes.length; fi++) {
    iframeList.push({
      src: (iframes[fi].src || '').substring(0, 200),
      id: iframes[fi].id || '',
      name: iframes[fi].name || '',
      width: iframes[fi].width,
      height: iframes[fi].height
    });
  }

  // Full page HTML structure (divs with IDs/classes)
  var mainDivs = document.querySelectorAll('div[id], div[class*=container], div[class*=panel], div[class*=content], div[class*=app], div[class*=page], div[class*=main], nav');
  var structureList = [];
  for (var di = 0; di < mainDivs.length && di < 30; di++) {
    structureList.push({
      tag: mainDivs[di].tagName,
      id: mainDivs[di].id || '',
      className: (mainDivs[di].className || '').substring(0, 80),
      childCount: mainDivs[di].children.length
    });
  }

  // Page structure
  var bodyText = (document.body.innerText || '').substring(0, 2000);

  return JSON.stringify({
    fields: fields,
    buttons: btnList,
    links: linkList,
    iframes: iframeList,
    structure: structureList,
    bodyPreview: bodyText,
    fieldCount: fields.length,
    buttonCount: btnList.length,
    diag: diag
  });
})()`
}

// ================= Form Fill Script =================
function buildFormFillScript(values: Record<string, any>): string {
  // This will be populated after discovery reveals the field selectors
  // For now, return a placeholder that dumps the current form state
  return `(async function() {
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  var diag = { steps: [], fieldResults: {} };

  function setVal(selector, val) {
    var el = document.querySelector(selector) || document.getElementById(selector);
    if (!el) { diag.fieldResults[selector] = 'NOT_FOUND'; return false; }
    el.focus();
    var setter = el.tagName === 'SELECT'
      ? Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
      : Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    if (setter) setter.call(el, val);
    el.dispatchEvent(new Event('input', {bubbles: true}));
    el.dispatchEvent(new Event('change', {bubbles: true}));
    el.dispatchEvent(new Event('blur', {bubbles: true}));
    diag.fieldResults[selector] = { set: val, actual: el.value };
    return true;
  }

  await sleep(1000);
  diag.steps.push('form_fill_start');

  // TODO: Fill fields based on discovered selectors
  // Placeholder: report what we see
  var formState = [];
  var inputs = document.querySelectorAll('input:not([type=hidden]), select, textarea');
  for (var i = 0; i < inputs.length; i++) {
    formState.push({ id: inputs[i].id, name: inputs[i].name, value: inputs[i].value });
  }

  diag.steps.push('form_state_captured: ' + formState.length + ' fields');
  return JSON.stringify({ formState: formState, diag: diag });
})()`
}

// ================= Scrape Results Script =================
function buildScrapeScript(): string {
  return `(async function() {
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  var diag = { steps: [] };

  // Poll for results (up to 30s)
  var foundResults = false;
  for (var attempt = 0; attempt < 15; attempt++) {
    await sleep(2000);
    var tables = document.querySelectorAll('table');
    var rows = document.querySelectorAll('tr');
    var bodyText = (document.body.innerText || '');

    if (rows.length > 2) {
      diag.steps.push('results_at: ' + ((attempt + 1) * 2) + 's, rows: ' + rows.length);
      foundResults = true;
      break;
    }
    if (bodyText.indexOf('No results') >= 0 || bodyText.indexOf('No eligible') >= 0) {
      diag.steps.push('no_results_text_at: ' + ((attempt + 1) * 2) + 's');
      break;
    }
  }

  if (!foundResults) {
    diag.steps.push('no_results_after_30s');
    diag.bodyText = (document.body.innerText || '').substring(0, 1000);
    return JSON.stringify({ rates: [], diag: diag });
  }

  await sleep(1000); // Extra settle time

  // Scrape table headers
  var thEls = document.querySelectorAll('th');
  var headers = [];
  for (var h = 0; h < thEls.length; h++) {
    headers.push((thEls[h].textContent || '').trim());
  }
  diag.headers = headers;

  // Scrape rate data
  var rows = document.querySelectorAll('tr');
  var rates = [];
  var debugRows = [];

  for (var i = 0; i < rows.length && i < 100; i++) {
    var cells = rows[i].querySelectorAll('td');
    if (cells.length < 3) continue;

    // Dump first few rows for debugging
    if (debugRows.length < 3) {
      var cellDump = [];
      for (var c = 0; c < cells.length; c++) {
        cellDump.push({ idx: c, text: (cells[c].textContent || '').trim().substring(0, 60) });
      }
      debugRows.push({ cellCount: cells.length, cells: cellDump });
    }

    // Try to parse rate from cells
    var rateText = '';
    for (var ci = 0; ci < cells.length; ci++) {
      var cellText = (cells[ci].textContent || '').trim();
      if (cellText.match(/^\\d+\\.\\d+\\s*%?$/)) {
        rateText = cellText;
        break;
      }
    }
    if (!rateText) continue;

    var rateMatch = rateText.match(/([\\d.]+)/);
    if (!rateMatch) continue;

    rates.push({
      rate: parseFloat(rateMatch[1]),
      cells: Array.from(cells).map(function(c) { return (c.textContent || '').trim().substring(0, 60); })
    });
  }

  diag.debugRows = debugRows;
  diag.totalRows = rows.length;

  return JSON.stringify({
    rateCount: rates.length,
    rates: rates,
    headers: headers,
    diag: diag
  });
})()`
}

// ================= Main Handler =================
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' })

  const browserlessToken = process.env.BROWSERLESS_TOKEN
  if (!browserlessToken) {
    return res.json({ success: false, error: 'Browserless not configured' })
  }

  const loannexUser = process.env.LOANNEX_USER || ''
  const loannexPassword = process.env.LOANNEX_PASSWORD || ''
  if (!loannexUser || !loannexPassword) {
    return res.json({ success: false, error: 'Loannex credentials not configured' })
  }

  const isDiscovery = req.query.discover === 'true'

  try {
    // Phase 1: Login to Loannex
    const loginScript = buildLoginScript(loannexUser, loannexPassword)
    const discoveryScript = buildDiscoveryScript()

    // Build BQL query - login then either discover or fill+scrape
    let bqlQuery: string

    // Single-BQL approach: Login via AJAX (no navigation), then goto wrapper, extract iframe URL,
    // navigate to Angular app via evaluate + window.location, then discover/fill/scrape
    // All in one browser session so cookies and tokens persist.

    // Script that extracts iframe URL from wrapper page AND navigates to it
    const extractAndNavScript = `(async function() {
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  await sleep(2000);
  var iframe = document.getElementById('loannex-angular-iframe');
  if (!iframe) {
    return JSON.stringify({ error: 'no iframe', body: (document.body.innerText || '').substring(0, 300) });
  }
  var url = iframe.src;
  // Navigate to the Angular app URL (this will destroy this evaluate, but the next step runs on the new page)
  window.location.href = url;
  // Brief pause to let navigation start
  await sleep(500);
  return JSON.stringify({ iframeUrl: url, navigating: true });
})()`

    // Build BQL query — all in one call, one browser session
    // Steps: goto login → AJAX login → goto wrapper → extract+navigate → wait → discover/fill/scrape
    const waitForAngularScript = `(async function() {
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  // Wait for Angular app to fully bootstrap
  for (var i = 0; i < 10; i++) {
    await sleep(1000);
    var inputs = document.querySelectorAll('input:not([type=hidden]), select, textarea');
    if (inputs.length > 3) {
      return JSON.stringify({ ready: true, fieldCount: inputs.length, url: window.location.href });
    }
  }
  return JSON.stringify({ ready: false, url: window.location.href, body: (document.body.innerText || '').substring(0, 500) });
})()`

    if (isDiscovery) {
      bqlQuery = `mutation AllInOneDiscover {
  loginPage: goto(url: "${LOANNEX_URL}", waitUntil: networkIdle) { status time }
  login: evaluate(content: ${JSON.stringify(loginScript)}, timeout: 10000) { value }
  wrapperPage: goto(url: "${LOANNEX_URL}", waitUntil: networkIdle) { status time }
  extractNav: evaluate(content: ${JSON.stringify(extractAndNavScript)}, timeout: 8000) { value }
  waitAngular: evaluate(content: ${JSON.stringify(waitForAngularScript)}, timeout: 15000) { value }
  discover: evaluate(content: ${JSON.stringify(discoveryScript)}, timeout: 15000) { value }
}`
    } else {
      const formData = req.body || {}
      const fillScript = buildFormFillScript(formData)
      const scrapeScript = buildScrapeScript()

      bqlQuery = `mutation AllInOnePricing {
  loginPage: goto(url: "${LOANNEX_URL}", waitUntil: networkIdle) { status time }
  login: evaluate(content: ${JSON.stringify(loginScript)}, timeout: 10000) { value }
  wrapperPage: goto(url: "${LOANNEX_URL}", waitUntil: networkIdle) { status time }
  extractNav: evaluate(content: ${JSON.stringify(extractAndNavScript)}, timeout: 8000) { value }
  waitAngular: evaluate(content: ${JSON.stringify(waitForAngularScript)}, timeout: 15000) { value }
  fill: evaluate(content: ${JSON.stringify(fillScript)}, timeout: 15000) { value }
  scrape: evaluate(content: ${JSON.stringify(scrapeScript)}, timeout: 30000) { value }
}`
    }

    const bqlResp = await fetch(`${BROWSERLESS_URL}?token=${browserlessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: bqlQuery }),
      signal: AbortSignal.timeout(55000),
    })

    if (!bqlResp.ok) {
      const errText = await bqlResp.text()
      return res.json({
        success: false,
        error: `Browserless error: ${bqlResp.status}`,
        debug: { status: bqlResp.status, body: errText.substring(0, 500) }
      })
    }

    const bqlResult = await bqlResp.json()

    if (bqlResult.errors && !bqlResult.data) {
      // Only fail if there's no data at all (partial errors are OK — login nav causes expected errors)
      return res.json({
        success: false,
        error: 'BQL execution error',
        debug: { errors: bqlResult.errors }
      })
    }

    // Parse results from the single BQL call
    const safeParseValue = (val: any) => {
      if (!val) return null
      try { return typeof val === 'string' ? JSON.parse(val) : val } catch { return val }
    }

    const loginData = safeParseValue(bqlResult.data?.login?.value)
    const waitData = safeParseValue(bqlResult.data?.waitAngular?.value)

    if (isDiscovery) {
      const discoverData = safeParseValue(bqlResult.data?.discover?.value)

      return res.json({
        success: true,
        mode: 'discovery',
        login: loginData,
        angularReady: waitData,
        discovery: discoverData,
        debug: { allKeys: Object.keys(bqlResult.data || {}), errors: bqlResult.errors || null }
      })
    }

    // Full mode - parse fill and scrape results
    const fillData = safeParseValue(bqlResult.data?.fill?.value)
    const scrapeData = safeParseValue(bqlResult.data?.scrape?.value)

    const rates = (scrapeData?.rates || []).map((r: any) => ({
      rate: r.rate,
      cells: r.cells || [],
    }))

    return res.json({
      success: true,
      mode: 'full',
      data: {
        source: 'loannex',
        rateOptions: rates,
        totalRates: rates.length,
        headers: scrapeData?.headers || [],
        angularUrl: waitData?.url || null,
      },
      debug: {
        login: loginData,
        angular: waitData,
        fill: fillData,
        scrape: scrapeData?.diag || null,
      },
    })
  } catch (error) {
    console.error('LN pricing error:', error)
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Loannex pricing unavailable',
    })
  }
}
