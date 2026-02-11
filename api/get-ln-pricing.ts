import type { VercelRequest, VercelResponse } from '@vercel/node'

const BROWSERLESS_URL = 'https://production-sfo.browserless.io/chromium/bql'
const LOANNEX_LOGIN_URL = 'https://web.loannex.com/'

export const config = { maxDuration: 60 }

// ================= Login Script (wrapper site) =================
function buildLoginScript(email: string, password: string): string {
  return `(async function() {
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  await sleep(1500);
  var diag = { url: window.location.href, title: document.title };
  var userInput = document.getElementById('UserName');
  var passwordInput = document.getElementById('Password');
  var loginBtn = document.getElementById('btnSubmit');
  if (!userInput || !passwordInput) return JSON.stringify({ ok: false, error: 'no_form', diag: diag });
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
  if (loginBtn) setTimeout(function() { loginBtn.click(); }, 150);
  return JSON.stringify({ ok: true });
})()`
}

// ================= Discovery Script (main site after login) =================
function buildDiscoverMainSiteScript(): string {
  return `(async function() {
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  var diag = { steps: [] };

  // Wait for page to load after login redirect
  await sleep(3000);
  diag.steps.push('url: ' + window.location.href);
  diag.steps.push('title: ' + document.title);

  // Check for iframes (the pricing form might be in an iframe)
  var iframes = document.querySelectorAll('iframe');
  var iframeList = [];
  for (var fi = 0; fi < iframes.length; fi++) {
    iframeList.push({
      src: (iframes[fi].src || '').substring(0, 200),
      id: iframes[fi].id || '',
      name: iframes[fi].name || '',
      width: iframes[fi].width || iframes[fi].offsetWidth,
      height: iframes[fi].height || iframes[fi].offsetHeight
    });
  }
  diag.steps.push('iframes: ' + iframes.length);

  // Discover ALL form elements on the main page
  var elements = document.querySelectorAll('input, select, textarea, [role="combobox"], [role="listbox"]');
  var fields = [];
  for (var i = 0; i < elements.length; i++) {
    var el = elements[i];
    if (el.type === 'hidden') continue;
    var label = '';
    var labelEl = el.closest('label') || document.querySelector('label[for="' + el.id + '"]');
    if (labelEl) label = (labelEl.textContent || '').trim();
    if (!label && el.previousElementSibling) label = (el.previousElementSibling.textContent || '').trim();
    if (!label && el.parentElement) {
      var sib = el.parentElement.querySelector('label, .label, span');
      if (sib && sib !== el) label = (sib.textContent || '').trim();
    }
    var opts;
    if (el.tagName === 'SELECT') {
      opts = [];
      for (var j = 0; j < el.options.length && j < 25; j++) opts.push({ v: el.options[j].value, t: el.options[j].text });
    }
    fields.push({
      tag: el.tagName, id: el.id || '', name: el.name || '', type: el.type || '',
      label: label.substring(0, 60), placeholder: el.placeholder || '',
      value: (el.value || '').substring(0, 40),
      className: (el.className || '').substring(0, 80),
      options: opts
    });
  }

  // Discover buttons
  var buttons = document.querySelectorAll('button, input[type=submit], a.btn, [role="button"]');
  var btnList = [];
  for (var b = 0; b < buttons.length && b < 30; b++) {
    btnList.push({
      tag: buttons[b].tagName, text: (buttons[b].textContent || '').trim().substring(0, 50),
      id: buttons[b].id || '', className: (buttons[b].className || '').substring(0, 80)
    });
  }

  // Discover links/navigation
  var links = document.querySelectorAll('a[href]');
  var linkList = [];
  for (var l = 0; l < links.length && l < 40; l++) {
    var lt = (links[l].textContent || '').trim();
    if (lt.length > 0 && lt.length < 60) {
      linkList.push({ text: lt, href: links[l].getAttribute('href').substring(0, 120) });
    }
  }

  // Body text preview
  var bodyText = (document.body.innerText || '').substring(0, 3000);

  return JSON.stringify({
    fields: fields, fieldCount: fields.length,
    buttons: btnList, buttonCount: btnList.length,
    links: linkList, iframes: iframeList,
    bodyPreview: bodyText,
    diag: diag
  });
})()`
}

// ================= Form Fill + Scrape Script =================
function buildFillAndScrapeScript(formValues: Record<string, any>): string {
  const valJson = JSON.stringify(formValues)
  return `(async function() {
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  var diag = { steps: [] };
  var vals = ${valJson};

  await sleep(3000);
  diag.steps.push('url: ' + window.location.href);

  // Helper to set form values
  function setVal(id, val) {
    var el = document.getElementById(id) || document.querySelector('[name="' + id + '"]');
    if (!el) { diag.steps.push('NOT_FOUND: ' + id); return false; }
    if (el.tagName === 'SELECT') {
      el.value = val;
      el.dispatchEvent(new Event('change', {bubbles: true}));
    } else {
      el.focus();
      var setter = Object.getOwnPropertyDescriptor(
        el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
        'value'
      ).set;
      if (setter) setter.call(el, val);
      el.dispatchEvent(new Event('input', {bubbles: true}));
      el.dispatchEvent(new Event('change', {bubbles: true}));
      el.dispatchEvent(new Event('blur', {bubbles: true}));
    }
    diag.steps.push('SET: ' + id + ' = ' + val);
    return true;
  }

  // Fill form fields (selectors TBD from discovery)
  var keys = Object.keys(vals);
  for (var k = 0; k < keys.length; k++) {
    setVal(keys[k], vals[keys[k]]);
    await sleep(100);
  }

  // Click search/price button (selector TBD)
  var searchBtn = document.querySelector('#btnSearch') ||
    document.querySelector('button[type=submit]') ||
    document.querySelector('input[type=submit]');
  if (searchBtn) {
    diag.steps.push('clicking: ' + (searchBtn.id || searchBtn.textContent || '').substring(0, 30));
    searchBtn.click();
  } else {
    diag.steps.push('no_search_button');
  }

  // Wait for results table
  for (var attempt = 0; attempt < 20; attempt++) {
    await sleep(1500);
    var rows = document.querySelectorAll('table tr, .results-row, [class*=result]');
    if (rows.length > 3) {
      diag.steps.push('results_at: ' + ((attempt+1)*1.5) + 's, rows: ' + rows.length);
      break;
    }
  }
  await sleep(1000);

  // Scrape results table
  var tables = document.querySelectorAll('table');
  var rates = [];
  for (var ti = 0; ti < tables.length; ti++) {
    var trs = tables[ti].querySelectorAll('tr');
    if (trs.length < 2) continue;
    // Get headers
    var ths = trs[0].querySelectorAll('th, td');
    var headers = [];
    for (var h = 0; h < ths.length; h++) headers.push((ths[h].textContent || '').trim());
    // Get data rows
    for (var ri = 1; ri < trs.length && ri < 50; ri++) {
      var tds = trs[ri].querySelectorAll('td');
      if (tds.length < 3) continue;
      var row = {};
      for (var ci = 0; ci < tds.length && ci < headers.length; ci++) {
        row[headers[ci] || 'col' + ci] = (tds[ci].textContent || '').trim();
      }
      rates.push(row);
    }
    if (rates.length > 0) break; // use first table with data
  }

  diag.steps.push('scraped: ' + rates.length + ' rows');
  return JSON.stringify({ success: true, rates: rates, diag: diag });
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
  if (!browserlessToken) return res.json({ success: false, error: 'Browserless not configured' })

  const loannexUser = process.env.LOANNEX_USER || ''
  const loannexPassword = process.env.LOANNEX_PASSWORD || ''
  if (!loannexUser || !loannexPassword) return res.json({ success: false, error: 'Credentials not configured' })

  const isDiscovery = req.query.discover === 'true'

  try {
    const loginScript = buildLoginScript(loannexUser, loannexPassword)
    const waitScript = `(async function() { await new Promise(r => setTimeout(r, 5000)); return JSON.stringify({ ok: true }); })()`

    let mainScript: string
    if (isDiscovery) {
      mainScript = buildDiscoverMainSiteScript()
    } else {
      // TODO: map form fields after discovery reveals selectors
      mainScript = buildDiscoverMainSiteScript() // temp: discovery for now
    }

    // 3-step BQL: goto login → fill+click → wait for redirect → discover/scrape main site
    const bqlQuery = `mutation LoginAndDiscover {
  loginPage: goto(url: "${LOANNEX_LOGIN_URL}", waitUntil: networkIdle) { status time }
  login: evaluate(content: ${JSON.stringify(loginScript)}, timeout: 8000) { value }
  waitForRedirect: evaluate(content: ${JSON.stringify(waitScript)}, timeout: 8000) { value }
  main: evaluate(content: ${JSON.stringify(mainScript)}, timeout: 40000) { value }
}`

    const bqlResp = await fetch(`${BROWSERLESS_URL}?token=${browserlessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: bqlQuery }),
      signal: AbortSignal.timeout(55000),
    })

    if (!bqlResp.ok) {
      const errText = await bqlResp.text()
      return res.json({ success: false, error: `Browserless: ${bqlResp.status}`, debug: errText.substring(0, 300) })
    }

    const bqlResult = await bqlResp.json()

    if (bqlResult.errors && !bqlResult.data) {
      return res.json({ success: false, error: 'BQL error', debug: bqlResult.errors })
    }

    // Parse main step result
    let mainData: any = null
    try {
      const raw = bqlResult.data?.main?.value
      mainData = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null
    } catch { mainData = null }

    const loginData = (() => {
      try {
        const raw = bqlResult.data?.login?.value
        return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null
      } catch { return null }
    })()

    return res.json({
      success: true,
      mode: isDiscovery ? 'discovery' : 'pricing',
      login: loginData,
      data: mainData,
      debug: { keys: Object.keys(bqlResult.data || {}), errors: bqlResult.errors || null }
    })
  } catch (error) {
    console.error('LN pricing error:', error)
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Pricing unavailable',
    })
  }
}
