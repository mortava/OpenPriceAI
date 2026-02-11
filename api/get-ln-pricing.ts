import type { VercelRequest, VercelResponse } from '@vercel/node'

const BROWSERLESS_URL = 'https://production-sfo.browserless.io/chromium/bql'
const LOANNEX_URL = 'https://web.loannex.com/iframe/loadiframe?_id=&page=nex-app'

// Vercel hobby plan: extend timeout to 60s
export const config = { maxDuration: 60 }

// ================= Login Script =================
function buildLoginScript(email: string, password: string): string {
  return `(async function() {
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  var diag = { steps: [], ts: Date.now() };

  await sleep(3000);
  diag.steps.push('page_loaded: ' + document.title);
  diag.steps.push('url: ' + window.location.href);

  // Look for login form
  var emailInput = document.querySelector('input[type="email"], input[name="email"], input[name="username"], input[placeholder*="mail"], input[placeholder*="user"]');
  var passwordInput = document.querySelector('input[type="password"]');
  var loginBtn = document.querySelector('button[type="submit"], input[type="submit"], button.btn-primary, button.login-btn, button:not([type])');

  diag.steps.push('email_found: ' + !!emailInput + (emailInput ? ' id=' + emailInput.id + ' name=' + emailInput.name : ''));
  diag.steps.push('password_found: ' + !!passwordInput + (passwordInput ? ' id=' + passwordInput.id : ''));
  diag.steps.push('login_btn_found: ' + !!loginBtn + (loginBtn ? ' text=' + (loginBtn.textContent || '').trim().substring(0, 30) : ''));

  if (!emailInput || !passwordInput) {
    // Maybe already logged in?
    var bodyText = (document.body.innerText || '').substring(0, 500);
    diag.steps.push('no_login_form_body: ' + bodyText);
    return JSON.stringify({ loggedIn: bodyText.indexOf('Price') >= 0 || bodyText.indexOf('Loan') >= 0, diag: diag });
  }

  // Fill login form
  function setInput(el, val) {
    el.focus();
    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, val);
    el.dispatchEvent(new Event('input', {bubbles: true}));
    el.dispatchEvent(new Event('change', {bubbles: true}));
    el.dispatchEvent(new Event('blur', {bubbles: true}));
  }

  setInput(emailInput, '${email}');
  await sleep(300);
  setInput(passwordInput, '${password}');
  await sleep(300);

  // Click login
  if (loginBtn) {
    loginBtn.click();
    diag.steps.push('login_clicked');
  } else {
    // Try submitting the form
    var form = emailInput.closest('form');
    if (form) { form.submit(); diag.steps.push('form_submitted'); }
  }

  // Wait for navigation / page load after login
  await sleep(5000);
  diag.steps.push('post_login_url: ' + window.location.href);
  diag.steps.push('post_login_title: ' + document.title);
  diag.steps.push('post_login_body: ' + (document.body.innerText || '').substring(0, 300));

  return JSON.stringify({ loggedIn: true, diag: diag });
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

  // Page structure
  var bodyText = (document.body.innerText || '').substring(0, 1000);

  return JSON.stringify({
    fields: fields,
    buttons: btnList,
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

    if (isDiscovery) {
      // Discovery mode: login → dump all form fields
      bqlQuery = `mutation LoginAndDiscover {
  goto(url: "${LOANNEX_URL}", waitUntil: networkIdle) { status time }
  login: evaluate(content: ${JSON.stringify(loginScript)}, timeout: 15000) { value }
  discover: evaluate(content: ${JSON.stringify(discoveryScript)}, timeout: 10000) { value }
}`
    } else {
      // Full mode: login → fill → scrape
      const formData = req.body || {}
      const fillScript = buildFormFillScript(formData)
      const scrapeScript = buildScrapeScript()

      bqlQuery = `mutation LoginFillScrape {
  goto(url: "${LOANNEX_URL}", waitUntil: networkIdle) { status time }
  login: evaluate(content: ${JSON.stringify(loginScript)}, timeout: 15000) { value }
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

    if (bqlResult.errors) {
      return res.json({
        success: false,
        error: 'BQL execution error',
        debug: { errors: bqlResult.errors }
      })
    }

    // Parse results
    const loginValue = bqlResult.data?.login?.value
    const loginData = loginValue ? (typeof loginValue === 'string' ? JSON.parse(loginValue) : loginValue) : null

    if (isDiscovery) {
      const discoverValue = bqlResult.data?.discover?.value
      const discoverData = discoverValue ? (typeof discoverValue === 'string' ? JSON.parse(discoverValue) : discoverValue) : null

      return res.json({
        success: true,
        mode: 'discovery',
        login: loginData,
        discovery: discoverData,
      })
    }

    // Full mode - parse fill and scrape results
    const fillValue = bqlResult.data?.fill?.value
    const fillData = fillValue ? (typeof fillValue === 'string' ? JSON.parse(fillValue) : fillValue) : null

    const scrapeValue = bqlResult.data?.scrape?.value
    const scrapeData = scrapeValue ? (typeof scrapeValue === 'string' ? JSON.parse(scrapeValue) : scrapeValue) : null

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
      },
      debug: {
        login: loginData,
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
