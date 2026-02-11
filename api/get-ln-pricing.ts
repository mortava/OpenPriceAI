import type { VercelRequest, VercelResponse } from '@vercel/node'

const BROWSERLESS_URL = 'https://production-sfo.browserless.io/chromium/bql'
const LOANNEX_URL = 'https://web.loannex.com/iframe/loadiframe?_id=&page=nex-app'

// Vercel hobby plan: extend timeout to 60s
export const config = { maxDuration: 60 }

// ================= Login Script (Button click via setTimeout) =================
function buildLoginScript(email: string, password: string): string {
  return `(async function() {
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  var diag = { steps: [] };

  await sleep(1500);
  diag.steps.push('page: ' + document.title);

  var userInput = document.getElementById('UserName');
  var passwordInput = document.getElementById('Password');
  var loginBtn = document.getElementById('btnSubmit');

  if (!userInput || !passwordInput) {
    return JSON.stringify({ loggedIn: false, error: 'no_form', diag: diag });
  }

  // Fill credentials
  function setInput(el, val) {
    el.focus();
    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, val);
    el.dispatchEvent(new Event('input', {bubbles: true}));
    el.dispatchEvent(new Event('change', {bubbles: true}));
  }

  setInput(userInput, '${email}');
  await sleep(200);
  setInput(passwordInput, '${password}');
  await sleep(200);

  // Schedule click via setTimeout — returns BEFORE navigation starts
  if (loginBtn) setTimeout(function() { loginBtn.click(); }, 150);
  diag.steps.push('click_scheduled');

  return JSON.stringify({ loginScheduled: true, diag: diag });
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

    let bqlQuery: string

    const waitScript = `(async function() { await new Promise(r => setTimeout(r, 5000)); return JSON.stringify({ waited: true }); })()`

    // After wrapper login, we land on dashboard with iframe. Navigate to iframe URL, then handle Angular login.
    const navigateToIframeScript = `(async function() {
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  var diag = { steps: [] };
  diag.steps.push('url: ' + window.location.href);

  // Wait for dashboard to load
  await sleep(2000);

  // Check for iframe (Angular app embedded in dashboard)
  var iframes = document.getElementsByTagName('iframe');
  var iframe = null;
  for (var fi = 0; fi < iframes.length; fi++) {
    if (iframes[fi].src && iframes[fi].src.indexOf('loannex') >= 0) { iframe = iframes[fi]; break; }
    if (iframes[fi].src && iframes[fi].src.indexOf('nex-app') >= 0) { iframe = iframes[fi]; break; }
  }
  if (!iframe && iframes.length > 0) iframe = iframes[0];
  if (iframe && iframe.src && iframe.src.length > 10) {
    diag.steps.push('iframe_found: ' + iframe.src.substring(0, 100));
    // Navigate to iframe URL directly
    window.location.href = iframe.src;
    await sleep(500);
    return JSON.stringify({ navigating: iframe.src, diag: diag });
  }

  // Maybe already on Angular app (auto-redirect happened)
  if (window.location.href.indexOf('webapp.loannex') >= 0) {
    diag.steps.push('already_on_angular_app');
    return JSON.stringify({ alreadyOnApp: true, diag: diag });
  }

  // Look for any iframe
  var allIframes = document.querySelectorAll('iframe');
  var iframeInfo = [];
  for (var i = 0; i < allIframes.length; i++) {
    iframeInfo.push({ src: (allIframes[i].src || '').substring(0, 150), id: allIframes[i].id || '' });
  }
  diag.steps.push('no_target_iframe');
  diag.iframes = iframeInfo;
  diag.bodyPreview = (document.body.innerText || '').substring(0, 500);
  return JSON.stringify({ error: 'no_iframe_found', diag: diag });
})()`

    // After navigating to Angular app, handle login + discover pricing form
    const angularLoginAndDiscoverScript = `(async function() {
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  var diag = { steps: [] };
  diag.steps.push('url: ' + window.location.href);

  // Poll for Angular app to bootstrap and render login form or pricing form
  var usernameField = null;
  var passwordField = null;
  for (var w = 0; w < 10; w++) {
    await sleep(1500);
    usernameField = document.getElementById('username');
    passwordField = document.getElementById('password');
    var allInputs = document.querySelectorAll('input:not([type=hidden]), select, textarea');
    if (usernameField && passwordField) {
      diag.steps.push('login_form_at: ' + ((w+1)*1.5) + 's');
      break;
    }
    if (allInputs.length > 5) {
      diag.steps.push('pricing_form_at: ' + ((w+1)*1.5) + 's, fields: ' + allInputs.length);
      break;
    }
  }
  diag.steps.push('title: ' + document.title);

  if (usernameField && passwordField) {
    diag.steps.push('angular_login_detected');

    function setInput(el, val) {
      el.focus();
      el.value = '';
      el.dispatchEvent(new Event('focus', {bubbles: true}));
      var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      if (setter) setter.call(el, val);
      el.dispatchEvent(new Event('input', {bubbles: true}));
      el.dispatchEvent(new Event('change', {bubbles: true}));
      el.dispatchEvent(new Event('blur', {bubbles: true}));
    }

    setInput(usernameField, '${loannexUser}');
    await sleep(300);
    setInput(passwordField, '${loannexPassword}');
    await sleep(300);

    var signInBtn = document.querySelector('button.login-button') || document.querySelector('button');
    if (signInBtn) {
      diag.steps.push('clicking_sign_in: ' + (signInBtn.textContent || '').trim());
      signInBtn.click();
    }

    // Wait for pricing form to load after login
    for (var i = 0; i < 15; i++) {
      await sleep(1500);
      var inputs = document.querySelectorAll('input:not([type=hidden]), select, textarea');
      if (inputs.length > 5) {
        diag.steps.push('pricing_form_at: ' + ((i+1)*1.5) + 's, fields: ' + inputs.length);
        break;
      }
      var bodyText = (document.body.innerText || '');
      if (bodyText.indexOf('Invalid') >= 0 || bodyText.indexOf('incorrect') >= 0) {
        diag.steps.push('login_error_at: ' + ((i+1)*1.5) + 's');
        return JSON.stringify({ error: 'angular_login_failed', bodyPreview: bodyText.substring(0, 500), diag: diag });
      }
    }
  } else {
    diag.steps.push('no_login_form - maybe already authenticated');
    for (var i = 0; i < 10; i++) {
      await sleep(1000);
      var inputs = document.querySelectorAll('input:not([type=hidden]), select, textarea');
      if (inputs.length > 3) {
        diag.steps.push('form_ready_at: ' + (i+1) + 's, fields: ' + inputs.length);
        break;
      }
    }
  }

  // Discover all form fields
  var elements = document.querySelectorAll('input:not([type=hidden]), select, textarea, [role="combobox"], [role="listbox"]');
  var fields = [];
  for (var i = 0; i < elements.length; i++) {
    var el = elements[i];
    var label = '';
    var labelEl = el.closest('label') || document.querySelector('label[for="' + el.id + '"]');
    if (labelEl) label = (labelEl.textContent || '').trim();
    if (!label && el.previousElementSibling) label = (el.previousElementSibling.textContent || '').trim();
    if (!label && el.parentElement) {
      var sib = el.parentElement.querySelector('label, .label, span, .field-label, .mat-label');
      if (sib && sib !== el) label = (sib.textContent || '').trim();
    }
    if (!label) label = el.getAttribute('aria-label') || '';
    if (!label) label = el.getAttribute('data-placeholder') || '';
    var opts;
    if (el.tagName === 'SELECT') {
      opts = [];
      for (var j = 0; j < el.options.length && j < 20; j++) opts.push({ v: el.options[j].value, t: el.options[j].text });
    }
    fields.push({ tag: el.tagName, id: el.id || '', name: el.name || '', type: el.type || '', label: label.substring(0, 60), placeholder: el.placeholder || '', value: (el.value || '').substring(0, 40), className: (el.className || '').substring(0, 80), options: opts });
  }

  var buttons = document.querySelectorAll('button, input[type=submit], a.btn, [role="button"]');
  var btnList = [];
  for (var b = 0; b < buttons.length && b < 30; b++) {
    btnList.push({ tag: buttons[b].tagName, text: (buttons[b].textContent || '').trim().substring(0, 50), id: buttons[b].id || '', className: (buttons[b].className || '').substring(0, 80) });
  }

  // Capture auth token (JWT) and user info
  var authInfo = {};
  var jwt = '';
  var userGuid = '';
  try {
    var authResult = localStorage.getItem('authentication-result');
    if (authResult) {
      var parsed = JSON.parse(authResult);
      jwt = parsed.authenticationToken || '';
      authInfo.jwtPrefix = jwt.substring(0, 50) + '...';
    }
    userGuid = (localStorage.getItem('userGuid') || '').replace(/"/g, '');
    authInfo.userGuid = userGuid;
    authInfo.orgGuid = (localStorage.getItem('organizationGuid') || '').replace(/"/g, '');
  } catch(e) { authInfo.error = e.message; }

  // Search JS bundles for NexApp model / field names
  var jsDiscovery = null;
  var apiResult = null;
  if (jwt && userGuid) {
    try {
      var mainUrl = 'https://webapp.loannex.com/main.c8784b76aa7f3603.js';
      var jsResp = await fetch(mainUrl);
      var jsText = await jsResp.text();

      // Search for updateNexAppFromForm to find all field names
      var searches = ['updateNexAppFromForm', 'loanPurpose', 'occupancy', 'propertyType', 'documentationType', 'incomeDocType', 'lockDays', 'lockPeriod', 'dscrRatio', 'dscr', 'state', 'county', 'loanType', 'loanProgram', '.getQuickPrices('];
      var findings = {};
      for (var s = 0; s < searches.length; s++) {
        var term = searches[s];
        var idx = jsText.indexOf(term);
        if (idx >= 0) {
          findings[term] = jsText.substring(Math.max(0, idx - 300), Math.min(jsText.length, idx + 500));
        }
      }

      // Search for all nexApp. field assignments
      var nexAppFields = [];
      var regex = /nexApp\.(\w+)/g;
      var match;
      var seen = {};
      while ((match = regex.exec(jsText)) !== null && nexAppFields.length < 100) {
        if (!seen[match[1]]) {
          seen[match[1]] = true;
          nexAppFields.push(match[1]);
        }
      }
      findings['allNexAppFields'] = nexAppFields.join(', ');

      jsDiscovery = { findings: findings };
      diag.steps.push('js_search_done: ' + nexAppFields.length + ' nexApp fields found');

      // Test API with correct field names
      var apiUrl = 'https://nexapi.loannex.com/loans/apps/' + userGuid + '/quick-prices';
      var testBody = {
        data: {
          loanAmount: 450000,
          appraisedValue: 600000,
          purchasePrice: 600000,
          fico: 740,
          state: 'CA',
          zipCode: '90210',
          loanPurpose: 'Purchase',
          occupancyType: 'InvestmentProperty',
          propertyType: 'SingleFamily'
        }
      };
      var resp = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt },
        body: JSON.stringify(testBody)
      });
      var respText = await resp.text();
      apiResult = { status: resp.status, body: respText.substring(0, 3000) };
      diag.steps.push('api_test: ' + resp.status);
    } catch(e) {
      diag.steps.push('error: ' + e.message);
    }
  }

  var linkList = [];

  return JSON.stringify({ authInfo: authInfo, jsDiscovery: jsDiscovery, apiResult: apiResult, diag: diag });
})()`

    // Single BQL call with 5 steps:
    // 1. goto wrapper login page
    // 2. fill + click login (setTimeout to avoid nav error)
    // 3. wait 5s for redirect to dashboard (expected error — page navigated)
    // 4. extract iframe URL + navigate to Angular app (expected error — page navigates)
    // 5. on Angular app: login + discover pricing form fields
    bqlQuery = `mutation LoginAndDiscover {
  loginPage: goto(url: "${LOANNEX_URL}", waitUntil: networkIdle) { status time }
  login: evaluate(content: ${JSON.stringify(loginScript)}, timeout: 8000) { value }
  waitForRedirect: evaluate(content: ${JSON.stringify(waitScript)}, timeout: 8000) { value }
  navToAngular: evaluate(content: ${JSON.stringify(navigateToIframeScript)}, timeout: 10000) { value }
  discover: evaluate(content: ${JSON.stringify(angularLoginAndDiscoverScript)}, timeout: 35000) { value }
}`

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

    // Parse results from each BQL step
    const loginData = safeParseValue(bqlResult.data?.login?.value)
    const navData = safeParseValue(bqlResult.data?.navToAngular?.value)
    const discoverData = safeParseValue(bqlResult.data?.discover?.value)

    return res.json({
      success: true,
      mode: isDiscovery ? 'discovery' : 'full',
      login: loginData,
      navigation: navData,
      discovery: discoverData,
      debug: { keys: Object.keys(bqlResult.data || {}), errors: bqlResult.errors || null }
    })
  } catch (error) {
    console.error('LN pricing error:', error)
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Loannex pricing unavailable',
    })
  }
}
