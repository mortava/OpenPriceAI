import type { VercelRequest, VercelResponse } from '@vercel/node'

const BROWSERLESS_URL = 'https://production-sfo.browserless.io/chromium/bql'
const LOANNEX_LOGIN_URL = 'https://web.loannex.com/'

export const config = { maxDuration: 60 }

// ================= Field Mapping =================
function mapFormToLN(body: any): Record<string, string> {
  const purposeMap: Record<string, string> = {
    purchase: 'Purchase', refinance: 'Rate/Term Refinance', cashout: 'Cash-Out Refinance',
  }
  const occupancyMap: Record<string, string> = {
    primary: 'Primary', secondary: 'Second Home', investment: 'Investment',
  }
  const propertyMap: Record<string, string> = {
    sfr: 'SFR', condo: 'Condo', townhouse: 'Townhouse',
    '2unit': '2 Unit', '3unit': '3 Unit', '4unit': '4 Unit', '5-9unit': '5+ Unit',
  }
  const docMap: Record<string, string> = {
    fullDoc: 'Full Doc', dscr: 'DSCR', bankStatement: 'Bank Statement',
    assetDepletion: 'Asset Depletion', voe: 'VOE', noRatio: 'No Ratio',
  }
  const citizenMap: Record<string, string> = {
    usCitizen: 'US Citizen', permanentResident: 'Permanent Resident', foreignNational: 'Foreign National',
  }

  const loanAmount = String(body.loanAmount || '450000').replace(/,/g, '')
  const propertyValue = String(body.propertyValue || '600000').replace(/,/g, '')
  const creditScore = String(body.creditScore || '740')

  return {
    'Purpose': purposeMap[body.loanPurpose] || 'Purchase',
    'Occupancy': occupancyMap[body.occupancyType] || 'Investment',
    'Property Type': propertyMap[body.propertyType] || 'SFR',
    'Income Doc': docMap[body.documentationType] || 'DSCR',
    'Citizenship': citizenMap[body.citizenship] || 'US Citizen',
    'State': body.propertyState || 'CA',
    'Appraised Value': propertyValue,
    'Purchase Price': body.loanPurpose === 'purchase' ? propertyValue : '',
    'First Lien Amount': loanAmount,
    'FICO': creditScore,
    'DTI': String(body.dti || ''),
    'Escrows': body.impoundType === '3' ? 'No' : 'Yes',
  }
}

// ================= Step 2: Login to wrapper =================
function buildLoginScript(email: string, password: string): string {
  return `(async function() {
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  await sleep(1500);
  var userInput = document.getElementById('UserName');
  var passwordInput = document.getElementById('Password');
  var loginBtn = document.getElementById('btnSubmit');
  if (!userInput || !passwordInput) return JSON.stringify({ ok: false, error: 'no_form' });
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

// ================= Step 4: Navigate to iframe =================
function buildNavToIframeScript(): string {
  return `(async function() {
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  await sleep(2000);
  var iframes = document.getElementsByTagName('iframe');
  var iframe = null;
  for (var i = 0; i < iframes.length; i++) {
    if (iframes[i].src && iframes[i].src.indexOf('nex-app') >= 0) { iframe = iframes[i]; break; }
    if (iframes[i].src && iframes[i].src.indexOf('loannex') >= 0) { iframe = iframes[i]; break; }
  }
  if (!iframe && iframes.length > 0) iframe = iframes[0];
  if (iframe && iframe.src && iframe.src.length > 10) {
    window.location.href = iframe.src;
    await sleep(500);
    return JSON.stringify({ ok: true });
  }
  return JSON.stringify({ ok: false, error: 'no_iframe' });
})()`
}

// ================= Step 5: Fill form + Get Price + Scrape =================
function buildFillAndScrapeScript(fieldMap: Record<string, string>, email: string, password: string): string {
  const mapJson = JSON.stringify(fieldMap)
  return `(async function() {
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  var diag = { steps: [], fills: [] };
  var fieldMap = ${mapJson};

  diag.steps.push('url: ' + window.location.href);

  // Poll for either pricing form (>10 inputs) OR Angular login form
  var formReady = false;
  for (var w = 0; w < 10; w++) {
    await sleep(1500);
    var usernameField = document.getElementById('username');
    var passwordField = document.getElementById('password');
    var allInputs = document.querySelectorAll('input:not([type=hidden])');

    if (usernameField && passwordField) {
      diag.steps.push('angular_login_at: ' + ((w+1)*1.5) + 's');
      // Do Angular login
      function setLoginInput(el, val) {
        el.focus(); el.value = '';
        el.dispatchEvent(new Event('focus', {bubbles: true}));
        var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        if (setter) setter.call(el, val);
        el.dispatchEvent(new Event('input', {bubbles: true}));
        el.dispatchEvent(new Event('change', {bubbles: true}));
        el.dispatchEvent(new Event('blur', {bubbles: true}));
      }
      setLoginInput(usernameField, '${email}');
      await sleep(300);
      setLoginInput(passwordField, '${password}');
      await sleep(300);
      var signInBtn = document.querySelector('button.login-button') || document.querySelector('button');
      if (signInBtn) { signInBtn.click(); diag.steps.push('login_clicked'); }

      // Wait for app to load after login
      await sleep(3000);
      diag.steps.push('post_login_url: ' + window.location.href);

      // Check if we landed on Quick Pricer or elsewhere
      var bodyText = (document.body.innerText || '');
      var hasQuickPricer = bodyText.indexOf('Get Price') >= 0;
      diag.steps.push('has_get_price: ' + hasQuickPricer);

      if (!hasQuickPricer) {
        // Try to find and click Quick Pricer navigation
        var navClicked = false;
        var allEls = document.querySelectorAll('a, button, span, div, li, [role=menuitem]');
        for (var ne = 0; ne < allEls.length; ne++) {
          var navText = (allEls[ne].textContent || '').trim().toLowerCase();
          if (navText === 'quick pricer' || navText === 'quick price' || navText === 'add scenario' || navText === 'pricing') {
            diag.steps.push('clicking_nav: ' + (allEls[ne].textContent || '').trim());
            allEls[ne].click();
            navClicked = true;
            break;
          }
        }
        if (!navClicked) {
          // Try hamburger/sidebar menu first
          var menuBtn = document.querySelector('[class*=hamburger], [class*=menu-toggle], [class*=sidebar-toggle], .pi-bars');
          if (menuBtn) { menuBtn.click(); diag.steps.push('opened_menu'); await sleep(800); }
          // Search again after menu opened
          allEls = document.querySelectorAll('a, button, span, div, li, [role=menuitem]');
          for (var ne2 = 0; ne2 < allEls.length; ne2++) {
            var navText2 = (allEls[ne2].textContent || '').trim().toLowerCase();
            if (navText2 === 'quick pricer' || navText2 === 'quick price' || navText2 === 'add scenario' || navText2 === 'pricing') {
              diag.steps.push('clicking_nav_after_menu: ' + (allEls[ne2].textContent || '').trim());
              allEls[ne2].click();
              navClicked = true;
              break;
            }
          }
        }

        if (navClicked) {
          // Wait for Quick Pricer form to load after navigation
          for (var qi = 0; qi < 10; qi++) {
            await sleep(1500);
            var qpBody = (document.body.innerText || '');
            if (qpBody.indexOf('Get Price') >= 0) {
              diag.steps.push('quick_pricer_loaded_at: ' + ((qi+1)*1.5) + 's');
              formReady = true;
              break;
            }
          }
        } else {
          // Dump nav items for debugging
          var navDebug = [];
          var navEls = document.querySelectorAll('a, [role=menuitem], [class*=nav-item], [class*=menu-item]');
          for (var nd = 0; nd < navEls.length && nd < 15; nd++) {
            var ndText = (navEls[nd].textContent || '').trim();
            if (ndText.length > 0 && ndText.length < 40) navDebug.push(ndText);
          }
          diag.navItems = navDebug;
          diag.steps.push('no_quick_pricer_nav');
        }
      } else {
        formReady = true;
      }
      break;
    }

    if (allInputs.length > 10) {
      diag.steps.push('form_at: ' + ((w+1)*1.5) + 's, fields: ' + allInputs.length);
      formReady = true;
      break;
    }
  }

  if (!formReady) {
    diag.steps.push('form_not_loaded');
    diag.bodyPreview = (document.body.innerText || '').substring(0, 1000);
    diag.inputCount = document.querySelectorAll('input').length;
    return JSON.stringify({ success: false, error: 'form_not_loaded', rates: [], diag: diag });
  }

  // Find field container by label text
  function findField(labelText) {
    var allDivs = document.querySelectorAll('div.flex.flex-row');
    for (var d = 0; d < allDivs.length; d++) {
      var divText = (allDivs[d].textContent || '').trim();
      if (divText.indexOf(labelText) === 0 || divText.startsWith(labelText)) {
        return allDivs[d];
      }
    }
    // Fallback: search all elements
    var allEls = document.querySelectorAll('*');
    for (var e = 0; e < allEls.length; e++) {
      var directText = '';
      for (var c = 0; c < allEls[e].childNodes.length; c++) {
        if (allEls[e].childNodes[c].nodeType === 3) directText += allEls[e].childNodes[c].textContent;
      }
      if (directText.trim() === labelText) return allEls[e].closest('div.flex');
    }
    return null;
  }

  // Set PrimeNG dropdown value
  async function setDropdown(labelText, optionText) {
    var container = findField(labelText);
    if (!container) { diag.fills.push(labelText + ': NOT_FOUND'); return false; }
    var input = container.querySelector('input[type=text]');
    if (!input) { diag.fills.push(labelText + ': NO_INPUT'); return false; }

    // Check if already set to correct value
    if (input.value === optionText) { diag.fills.push(labelText + ': ALREADY=' + optionText); return true; }

    // Click to open dropdown
    input.click();
    await sleep(400);

    // Find dropdown panel (PrimeNG renders overlay at body level)
    var panels = document.querySelectorAll('.p-dropdown-panel, .p-overlay-panel, [class*=dropdown-panel]');
    var panel = null;
    for (var pi = 0; pi < panels.length; pi++) {
      if (panels[pi].offsetHeight > 0) { panel = panels[pi]; break; }
    }

    if (!panel) {
      // Try clicking the trigger icon instead
      var trigger = container.querySelector('.p-dropdown-trigger, [class*=trigger]');
      if (trigger) { trigger.click(); await sleep(400); }
      panels = document.querySelectorAll('.p-dropdown-panel, .p-overlay-panel, [class*=dropdown-panel]');
      for (var pi2 = 0; pi2 < panels.length; pi2++) {
        if (panels[pi2].offsetHeight > 0) { panel = panels[pi2]; break; }
      }
    }

    if (!panel) { diag.fills.push(labelText + ': NO_PANEL'); return false; }

    // Find matching option
    var items = panel.querySelectorAll('li, .p-dropdown-item, [class*=dropdown-item]');
    var matched = false;
    for (var oi = 0; oi < items.length; oi++) {
      var itemText = (items[oi].textContent || '').trim();
      if (itemText === optionText || itemText.indexOf(optionText) >= 0) {
        items[oi].click();
        matched = true;
        diag.fills.push(labelText + ': ' + optionText);
        break;
      }
    }

    if (!matched) {
      // Try partial match (case insensitive)
      var lower = optionText.toLowerCase();
      for (var oi2 = 0; oi2 < items.length; oi2++) {
        if ((items[oi2].textContent || '').trim().toLowerCase().indexOf(lower) >= 0) {
          items[oi2].click();
          matched = true;
          diag.fills.push(labelText + ': ~' + (items[oi2].textContent || '').trim());
          break;
        }
      }
    }

    if (!matched) {
      // Close panel by pressing Escape
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      var optTexts = [];
      for (var x = 0; x < items.length && x < 10; x++) optTexts.push((items[x].textContent || '').trim());
      diag.fills.push(labelText + ': NO_MATCH(' + optionText + ') avail=[' + optTexts.join(',') + ']');
      return false;
    }

    await sleep(200);
    return true;
  }

  // Set numeric input value
  async function setNumeric(labelText, val) {
    if (!val || val === '0') return;
    var container = findField(labelText);
    if (!container) { diag.fills.push(labelText + ': NOT_FOUND'); return false; }
    var input = container.querySelector('input');
    if (!input) { diag.fills.push(labelText + ': NO_INPUT'); return false; }
    input.focus();
    input.value = '';
    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    if (setter) setter.call(input, val);
    input.dispatchEvent(new Event('input', {bubbles: true}));
    input.dispatchEvent(new Event('change', {bubbles: true}));
    input.dispatchEvent(new Event('blur', {bubbles: true}));
    diag.fills.push(labelText + ': ' + val);
    await sleep(150);
    return true;
  }

  // Fill dropdown fields
  var dropdowns = ['Purpose', 'Occupancy', 'Property Type', 'Income Doc', 'Citizenship', 'State', 'Escrows'];
  for (var di = 0; di < dropdowns.length; di++) {
    var key = dropdowns[di];
    if (fieldMap[key]) {
      await setDropdown(key, fieldMap[key]);
      await sleep(300);
    }
  }

  // Fill numeric fields
  var numerics = ['Appraised Value', 'Purchase Price', 'First Lien Amount', 'FICO', 'DTI'];
  for (var ni = 0; ni < numerics.length; ni++) {
    var nkey = numerics[ni];
    if (fieldMap[nkey]) {
      await setNumeric(nkey, fieldMap[nkey]);
    }
  }

  diag.steps.push('form_filled');

  // Click "Get Price" button
  var getPriceBtn = document.querySelector('button.quick-price-button') ||
    document.querySelector('[class*=quick-price]') ||
    null;
  if (!getPriceBtn) {
    var allBtns = document.querySelectorAll('button');
    for (var bi = 0; bi < allBtns.length; bi++) {
      if ((allBtns[bi].textContent || '').trim() === 'Get Price') { getPriceBtn = allBtns[bi]; break; }
    }
  }
  if (getPriceBtn) {
    getPriceBtn.click();
    diag.steps.push('clicked_get_price');
  } else {
    diag.steps.push('no_get_price_button');
    return JSON.stringify({ success: false, error: 'no_get_price_button', diag: diag });
  }

  // Wait for results table to appear
  var resultsFound = false;
  for (var attempt = 0; attempt < 20; attempt++) {
    await sleep(1500);
    var tables = document.querySelectorAll('table');
    for (var ti = 0; ti < tables.length; ti++) {
      var rows = tables[ti].querySelectorAll('tr');
      if (rows.length > 2) {
        diag.steps.push('results_at: ' + ((attempt+1)*1.5) + 's, rows: ' + rows.length);
        resultsFound = true;
        break;
      }
    }
    if (resultsFound) break;
    // Also check for "no results" text
    var body = (document.body.innerText || '');
    if (body.indexOf('No results') >= 0 || body.indexOf('no eligible') >= 0 || body.indexOf('No prices') >= 0) {
      diag.steps.push('no_results_text_at: ' + ((attempt+1)*1.5) + 's');
      break;
    }
  }

  if (!resultsFound) {
    diag.steps.push('no_results_table');
    diag.bodyPreview = (document.body.innerText || '').substring(0, 1500);
    return JSON.stringify({ success: true, rates: [], diag: diag });
  }

  await sleep(1000); // settle

  // Scrape the results table
  var rates = [];
  var tables = document.querySelectorAll('table');
  for (var ti2 = 0; ti2 < tables.length; ti2++) {
    var trs = tables[ti2].querySelectorAll('tr');
    if (trs.length < 2) continue;
    var ths = trs[0].querySelectorAll('th, td');
    var headers = [];
    for (var h = 0; h < ths.length; h++) headers.push((ths[h].textContent || '').trim());
    diag.headers = headers;

    for (var ri = 1; ri < trs.length && ri < 50; ri++) {
      var tds = trs[ri].querySelectorAll('td');
      if (tds.length < 3) continue;
      var row = {};
      for (var ci = 0; ci < tds.length && ci < headers.length; ci++) {
        row[headers[ci] || 'col' + ci] = (tds[ci].textContent || '').trim();
      }
      rates.push(row);
    }
    if (rates.length > 0) break;
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

  try {
    const body = req.body || {}
    const fieldMap = mapFormToLN(body)

    const loginScript = buildLoginScript(loannexUser, loannexPassword)
    const waitScript = `(async function() { await new Promise(r => setTimeout(r, 5000)); return JSON.stringify({ ok: true }); })()`
    const navScript = buildNavToIframeScript()
    const fillScript = buildFillAndScrapeScript(fieldMap, loannexUser, loannexPassword)

    const bqlQuery = `mutation FillAndPrice {
  loginPage: goto(url: "${LOANNEX_LOGIN_URL}", waitUntil: networkIdle) { status time }
  login: evaluate(content: ${JSON.stringify(loginScript)}, timeout: 8000) { value }
  waitForRedirect: evaluate(content: ${JSON.stringify(waitScript)}, timeout: 8000) { value }
  navToAngular: evaluate(content: ${JSON.stringify(navScript)}, timeout: 10000) { value }
  price: evaluate(content: ${JSON.stringify(fillScript)}, timeout: 45000) { value }
}`

    const bqlResp = await fetch(`${BROWSERLESS_URL}?token=${browserlessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: bqlQuery }),
      signal: AbortSignal.timeout(58000),
    })

    if (!bqlResp.ok) {
      const errText = await bqlResp.text()
      return res.json({ success: false, error: `Browserless: ${bqlResp.status}`, debug: errText.substring(0, 300) })
    }

    const bqlResult = await bqlResp.json()

    if (bqlResult.errors && !bqlResult.data) {
      return res.json({ success: false, error: 'BQL error' })
    }

    // Parse results
    let priceData: any = null
    try {
      const raw = bqlResult.data?.price?.value
      priceData = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null
    } catch { priceData = null }

    if (!priceData) {
      return res.json({ success: false, error: 'No data from pricing step' })
    }

    // Transform scraped table rows into rate options
    const rates = priceData.rates || []
    const rateOptions = rates.map((row: any) => {
      // Parse rate: "6.000%\n30 Days" or "6.000%"
      const rateField = row['Rate\nLock\nPeriod'] || row['Rate Lock Period'] || row['Rate'] || ''
      const rateMatch = rateField.match(/([\d.]+)%/)
      const lockMatch = rateField.match(/(\d+)\s*Days/)

      // Parse price: "100.948\n$5,689.20" or just "100.948"
      const priceField = row['Price'] || ''
      const priceMatch = priceField.match(/([\d.]+)/)
      const costMatch = priceField.match(/\$([\d,.]+)/)

      // Parse product
      const product = row['Product'] || ''

      // Parse investor/program
      const investorField = row['Investor/Lender Program'] || row['Investor'] || ''

      // Parse payment
      const pmtField = row['P&I PMT'] || row['Payment'] || ''
      const pmtMatch = pmtField.match(/\$([\d,.]+)/)

      return {
        rate: rateMatch ? parseFloat(rateMatch[1]) : 0,
        price: priceMatch ? parseFloat(priceMatch[1]) : 0,
        cost: costMatch ? parseFloat(costMatch[1].replace(/,/g, '')) : 0,
        lockPeriod: lockMatch ? parseInt(lockMatch[1]) : 30,
        product: product,
        investor: investorField,
        payment: pmtMatch ? parseFloat(pmtMatch[1].replace(/,/g, '')) : 0,
      }
    }).filter((r: any) => r.rate > 0)

    return res.json({
      success: true,
      data: {
        rateOptions,
        totalRates: rateOptions.length,
        rawRows: rates.length,
        diag: priceData.diag,
      },
    })
  } catch (error) {
    console.error('LN pricing error:', error)
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Pricing unavailable',
    })
  }
}
