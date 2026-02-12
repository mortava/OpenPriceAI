import type { VercelRequest, VercelResponse } from '@vercel/node'

const BROWSERLESS_URL = 'https://production-sfo.browserless.io/chromium/bql'
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

  const isDSCR = body.documentationType === 'dscr'
  const isInvestment = body.occupancyType === 'investment'
  const loanTypeMap: Record<string, string> = {
    nonqm: 'First Lien', conventional: 'First Lien', fha: 'First Lien', va: 'First Lien',
  }

  const dscrVal = isDSCR ? String(body.dscrRatio || '1.250').replace('>=', '') : ''
  const rentalVal = isDSCR ? String(body.grossRentalIncome || '5000') : ''
  const ppVal = isInvestment ? '5 Year' : 'None'
  const finProps = isInvestment ? '1' : ''

  return {
    'Loan Type': loanTypeMap[body.loanType] || 'Non-QM',
    'Purpose': purposeMap[body.loanPurpose] || 'Purchase',
    'Occupancy': occupancyMap[body.occupancyType] || 'Investment',
    'Property Type': propertyMap[body.propertyType] || 'SFR',
    'Income Doc': docMap[body.documentationType] || 'DSCR',
    'Citizenship': citizenMap[body.citizenship] || 'US Citizen',
    'State': body.propertyState || 'CA',
    'County': body.county || 'Los Angeles',
    'Appraised Value': propertyValue,
    'Purchase Price': body.loanPurpose === 'purchase' ? propertyValue : '',
    'First Lien Amount': loanAmount,
    'FICO': creditScore,
    'DTI': String(body.dti || ''),
    'Escrows': body.impoundType === '3' ? 'No' : 'Yes',
    // DSCR/Investment fields — include label variants
    'DSCR': dscrVal, 'DSCR Ratio': dscrVal, 'DSCR %': dscrVal,
    'Mo. Rental Income': rentalVal, 'Monthly Rental Income': rentalVal, 'Gross Rental Income': rentalVal,
    'Prepay Penalty': ppVal, 'Prepayment Penalty': ppVal,
    'Months Reserves': '12', 'Reserves': '12',
    '# of Financed Properties': finProps, 'Number of Financed Properties': finProps, 'Financed Properties': finProps,
  }
}

// ================= Fill form + Get Price + Scrape =================
function buildFillAndScrapeScript(fieldMap: Record<string, string>, email: string, password: string, isRetry: boolean = false): string {
  const mapJson = JSON.stringify(fieldMap)
  return `(async function() {
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  var diag = { steps: [], fills: [] };
  var fieldMap = ${mapJson};
  var isRetry = ${isRetry};

  diag.steps.push('url: ' + window.location.href);
  diag.steps.push('mode: ' + (isRetry ? 'retry' : 'initial'));

  var formReady = false;

  if (!isRetry) {
  // Initial: handle Angular login + Lock Desk redirect
  for (var w = 0; w < 6; w++) {
    await sleep(1000);
    var usernameField = document.getElementById('username');
    var passwordField = document.getElementById('password');
    var allInputs = document.querySelectorAll('input:not([type=hidden])');

    if (usernameField && passwordField) {
      diag.steps.push('angular_login_at: ' + ((w+1)) + 's');
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
      await sleep(2000);
      diag.steps.push('post_login_url: ' + window.location.href);

      // Check if we landed on Quick Pricer or elsewhere
      var bodyText = (document.body.innerText || '');
      var hasQuickPricer = bodyText.indexOf('Get Price') >= 0;
      diag.steps.push('has_get_price: ' + hasQuickPricer);

      if (!hasQuickPricer) {
        // On Lock Desk — full page navigation for proper Angular form init
        diag.steps.push('on_lock_desk_hard_nav_to_qp');
        setTimeout(function() { window.location.href = '/nex-app'; }, 200);
        return JSON.stringify({ success: true, needsNextStep: true, rates: [], diag: diag });
      }
      formReady = true;
      break;
    }

    if (allInputs.length > 10) {
      diag.steps.push('form_at: ' + ((w+1)) + 's, fields: ' + allInputs.length);
      formReady = true;
      break;
    }
  }
  } else {
    // Retry: wait for properly initialized QP form after hard navigation
    for (var rw = 0; rw < 8; rw++) {
      await sleep(1000);
      var retryInputs = document.querySelectorAll('input:not([type=hidden])');
      if (retryInputs.length > 10) {
        var retryText = (document.body.innerText || '');
        if (retryText.indexOf('Get Price') >= 0) {
          diag.steps.push('retry_form_at: ' + ((rw+1)) + 's, fields: ' + retryInputs.length);
          formReady = true;
          break;
        }
      }
    }
  }

  if (!formReady) {
    diag.steps.push('form_not_loaded');
    diag.bodyPreview = (document.body.innerText || '').substring(0, 1000);
    diag.inputCount = document.querySelectorAll('input').length;
    return JSON.stringify({ success: false, error: 'form_not_loaded', rates: [], diag: diag });
  }

  // Find field input by label text — walk DOM to find associated PrimeNG component
  function findFieldInput(labelText) {
    // Strategy: find text node matching label, then walk up to find container with input/dropdown
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    var node;
    while (node = walker.nextNode()) {
      if (node.textContent.trim() !== labelText) continue;
      var labelEl = node.parentElement;
      if (!labelEl) continue;

      // Walk up DOM levels looking for a container that has an input or dropdown
      var levels = [labelEl, labelEl.parentElement, labelEl.parentElement && labelEl.parentElement.parentElement];
      for (var lvl = 0; lvl < levels.length; lvl++) {
        var container = levels[lvl];
        if (!container) continue;

        // Look for PrimeNG dropdown/select
        var pDropdown = container.querySelector('p-dropdown, .p-dropdown, p-select, .p-select');
        if (pDropdown) return { el: pDropdown, type: 'dropdown', container: container };

        // Look for PrimeNG input number
        var pInputNum = container.querySelector('p-inputnumber, .p-inputnumber');
        if (pInputNum) {
          var innerInput = pInputNum.querySelector('input');
          return { el: innerInput || pInputNum, type: 'number', container: container };
        }

        // Look for regular input
        var input = container.querySelector('input:not([type=hidden]):not([type=checkbox])');
        if (input) return { el: input, type: 'input', container: container };
      }

      // Last resort: check next siblings of the label element
      var sib = labelEl.nextElementSibling;
      for (var s = 0; s < 3 && sib; s++) {
        var pDrop = sib.querySelector ? sib.querySelector('p-dropdown, .p-dropdown, p-select, .p-select') : null;
        if (pDrop) return { el: pDrop, type: 'dropdown', container: sib };
        var pNum = sib.querySelector ? sib.querySelector('p-inputnumber, .p-inputnumber, input:not([type=hidden])') : null;
        if (pNum) {
          var iInput = pNum.querySelector ? pNum.querySelector('input') || pNum : pNum;
          return { el: iInput, type: pNum.tagName === 'INPUT' ? 'input' : 'number', container: sib };
        }
        sib = sib.nextElementSibling;
      }
      break; // Only process first match
    }
    return null;
  }

  // Set PrimeNG Autocomplete value by typing + keyboard selection
  async function setDropdown(labelText, optionText) {
    var field = findFieldInput(labelText);
    if (!field) { diag.fills.push(labelText + ': NOT_FOUND'); return false; }

    var input = field.el;
    if (input.tagName !== 'INPUT') {
      input = field.el.querySelector ? field.el.querySelector('input') || field.el : field.el;
    }

    // Focus and clear
    input.focus();
    input.dispatchEvent(new Event('focus', {bubbles: true}));
    await sleep(100);

    // Select all text and delete it
    input.select();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }));
    await sleep(50);

    // Clear via setter + input event
    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    if (setter) setter.call(input, '');
    input.dispatchEvent(new Event('input', {bubbles: true}));
    await sleep(200);

    // Type the search text to trigger autocomplete suggestions
    var searchText = optionText.length > 3 ? optionText.substring(0, 3) : optionText;
    if (setter) setter.call(input, searchText);
    input.dispatchEvent(new Event('input', {bubbles: true}));
    await sleep(600);

    // Find THIS input's specific autocomplete panel using aria-controls
    function findMyPanel() {
      // Method 1: use aria-controls/aria-owns link
      var panelId = input.getAttribute('aria-controls') || input.getAttribute('aria-owns');
      if (panelId) {
        var linked = document.getElementById(panelId);
        if (linked && linked.offsetHeight > 0) return linked;
      }
      // Method 2: find P-POPOVER inside same nex-app-field, check if it has visible content
      var nexField = input.closest('.nex-app-field');
      if (nexField) {
        var popover = nexField.querySelector('p-popover');
        if (popover) {
          // PrimeNG popover renders content at body level, linked by ng-tns class
          var ngClass = '';
          var classes = (popover.className || '').split(/\s+/);
          for (var ci2 = 0; ci2 < classes.length; ci2++) {
            if (classes[ci2].indexOf('ng-tns-') === 0) { ngClass = classes[ci2]; break; }
          }
          if (ngClass) {
            // Find visible overlay with same ng-tns class at body level
            var overlays = document.querySelectorAll('.' + ngClass + '[role=listbox], .' + ngClass + ' [role=listbox], .' + ngClass + ' ul');
            for (var ovi = 0; ovi < overlays.length; ovi++) {
              if (overlays[ovi].offsetHeight > 0) return overlays[ovi];
            }
          }
        }
      }
      // Method 3: find the most recently visible panel (last resort)
      var allPanels = document.querySelectorAll('[role=listbox]');
      for (var api = allPanels.length - 1; api >= 0; api--) {
        if (allPanels[api].offsetHeight > 0 && allPanels[api].offsetWidth > 0) return allPanels[api];
      }
      return null;
    }

    var panel = findMyPanel();

    if (!panel) {
      // Type full text and try again
      if (setter) setter.call(input, optionText);
      input.dispatchEvent(new Event('input', {bubbles: true}));
      await sleep(600);
      panel = findMyPanel();
    }

    if (!panel) {
      // Try ArrowDown to open
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
      await sleep(400);
      panel = findMyPanel();
    }

    if (panel) {
      // Find matching item and navigate to it with keyboard
      var items = panel.querySelectorAll('li, [class*=autocomplete-item], [class*=option], [role=option]');
      var targetIdx = -1;
      for (var oi = 0; oi < items.length; oi++) {
        var itemText = (items[oi].textContent || '').trim();
        if (itemText === optionText || itemText.indexOf(optionText) >= 0) {
          targetIdx = oi;
          break;
        }
      }

      if (targetIdx === -1) {
        // Case-insensitive search
        var lower = optionText.toLowerCase();
        for (var oi2 = 0; oi2 < items.length; oi2++) {
          if ((items[oi2].textContent || '').trim().toLowerCase().indexOf(lower) >= 0) {
            targetIdx = oi2;
            break;
          }
        }
      }

      if (targetIdx >= 0) {
        var targetItem = items[targetIdx];

        // Method 1: Click the suggestion item directly
        targetItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        await sleep(50);
        targetItem.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        targetItem.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        await sleep(300);

        var afterVal = (input.value || '').trim();
        if (afterVal.length > searchText.length || afterVal.toLowerCase().indexOf(optionText.substring(0, 3).toLowerCase()) >= 0) {
          input.dispatchEvent(new Event('blur', {bubbles: true}));
          await sleep(100);
          diag.fills.push(labelText + ': ' + optionText + ' (click, val=' + afterVal + ')');
          return true;
        }

        // Method 2: Try keyboard ArrowDown + Enter as fallback
        input.focus();
        if (setter) setter.call(input, searchText);
        input.dispatchEvent(new Event('input', {bubbles: true}));
        await sleep(600);
        panel = findMyPanel();
        if (panel) {
          for (var ad = 0; ad <= targetIdx; ad++) {
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
            await sleep(50);
          }
          await sleep(100);
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
          await sleep(200);
        }

        var afterVal2 = (input.value || '').trim();
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        input.dispatchEvent(new Event('blur', {bubbles: true}));
        await sleep(100);
        diag.fills.push(labelText + ': ' + optionText + ' (kbd, val=' + afterVal2 + ')');
        return true;
      } else {
        var optTexts = [];
        for (var x = 0; x < items.length && x < 10; x++) optTexts.push((items[x].textContent || '').trim());
        diag.fills.push(labelText + ': NO_MATCH(' + optionText + ') avail=[' + optTexts.join(',') + ']');
      }
    } else {
      diag.fills.push(labelText + ': NO_PANEL');
    }

    // Close any open panels before moving to next field
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(100);
    // Last resort: set value directly and blur
    if (setter) setter.call(input, optionText);
    input.dispatchEvent(new Event('input', {bubbles: true}));
    input.dispatchEvent(new Event('change', {bubbles: true}));
    input.dispatchEvent(new Event('blur', {bubbles: true}));
    await sleep(100);
    return false;
  }

  // Set numeric input value
  async function setNumeric(labelText, val) {
    if (!val || val === '0') return;
    var field = findFieldInput(labelText);
    if (!field) { diag.fills.push(labelText + ': NOT_FOUND'); return false; }
    var input = field.el;
    if (input.tagName !== 'INPUT') {
      input = field.el.querySelector ? field.el.querySelector('input') || field.el : field.el;
    }
    if (!input || input.tagName !== 'INPUT') { diag.fills.push(labelText + ': NO_INPUT_EL'); return false; }
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

  // Fill dropdown fields (order matters — Income Doc triggers dynamic fields)
  var dropdowns = ['Loan Type', 'Purpose', 'Occupancy', 'Property Type', 'Income Doc'];
  for (var di = 0; di < dropdowns.length; di++) {
    var key = dropdowns[di];
    if (fieldMap[key]) {
      await setDropdown(key, fieldMap[key]);
      await sleep(200);
    }
  }

  // Wait for Angular to re-render dynamic fields based on Income Doc selection
  await sleep(1500);

  // Fill remaining dropdowns (includes DSCR-specific fields that appeared after Income Doc selection)
  var dropdowns2 = ['Citizenship', 'State', 'County', 'Escrows', 'Prepay Penalty'];
  for (var di2 = 0; di2 < dropdowns2.length; di2++) {
    var key2 = dropdowns2[di2];
    if (fieldMap[key2]) {
      await setDropdown(key2, fieldMap[key2]);
      await sleep(200);
    }
  }

  // Fill numeric fields (includes DSCR-specific fields discovered after Income Doc selection)
  var numerics = ['Appraised Value', 'Purchase Price', 'First Lien Amount', 'FICO', 'DTI',
    'Months Reserves', 'DSCR', 'Mo. Rental Income', '# of Financed Properties'];
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
  for (var attempt = 0; attempt < 10; attempt++) {
    await sleep(1500);
    // Check for standard HTML table OR PrimeNG table OR any data grid
    var tables = document.querySelectorAll('table, p-table, .p-datatable');
    for (var ti = 0; ti < tables.length; ti++) {
      var rows = tables[ti].querySelectorAll('tr');
      if (rows.length > 2) {
        diag.steps.push('results_at: ' + ((attempt+1)*1.5) + 's, rows: ' + rows.length + ', tag: ' + tables[ti].tagName);
        resultsFound = true;
        break;
      }
    }
    if (resultsFound) break;
    // Check for loading spinners (still waiting)
    var spinners = document.querySelectorAll('.p-progress-spinner, .loading, [class*=spinner], [class*=loading]');
    if (spinners.length > 0 && attempt < 9) continue;
    // Check for "no results" or error text
    var body = (document.body.innerText || '');
    if (body.indexOf('No results') >= 0 || body.indexOf('no eligible') >= 0 || body.indexOf('No prices') >= 0 || body.indexOf('No programs') >= 0) {
      diag.steps.push('no_results_text_at: ' + ((attempt+1)*1.5) + 's');
      break;
    }
    // Check for any new content after Get Price (investor names, rate numbers)
    if (body.match(/\d+\.\d{3}%/) || body.indexOf('Investor') >= 0) {
      diag.steps.push('rate_text_detected_at: ' + ((attempt+1)*1.5) + 's');
      resultsFound = true;
      break;
    }
  }

  if (!resultsFound) {
    diag.steps.push('no_results_table');
    // Capture page text AFTER "Get Price" to see what appeared
    var fullText = (document.body.innerText || '');
    var gpIdx = fullText.indexOf('Get Price');
    diag.afterGetPrice = gpIdx >= 0 ? fullText.substring(gpIdx, gpIdx + 800) : fullText.substring(0, 1500);
    return JSON.stringify({ success: true, rates: [], diag: diag });
  }

  await sleep(500); // settle

  // Scrape the results table
  var rates = [];
  var tables = document.querySelectorAll('table, p-table, .p-datatable');
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
    const fillScript = buildFillAndScrapeScript(fieldMap, loannexUser, loannexPassword, false)
    const retryScript = buildFillAndScrapeScript(fieldMap, loannexUser, loannexPassword, true)

    // Wrapper login script (fills web.loannex.com form)
    const loginScript = `(async function() {
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  await sleep(1000);
  var u = document.getElementById('UserName');
  var p = document.getElementById('Password');
  var b = document.getElementById('btnSubmit');
  if (!u || !p) return JSON.stringify({ ok: false, error: 'no_form' });
  function si(el, val) {
    el.focus();
    var s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    s.call(el, val);
    el.dispatchEvent(new Event('input', {bubbles: true}));
    el.dispatchEvent(new Event('change', {bubbles: true}));
  }
  si(u, '${loannexUser}');
  await sleep(150);
  si(p, '${loannexPassword}');
  await sleep(150);
  if (b) setTimeout(function() { b.click(); }, 100);
  return JSON.stringify({ ok: true });
})()`

    // Navigate to iframe URL (extracts tokenKey URL from wrapper page)
    const navScript = `(async function() {
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  await sleep(1500);
  var iframes = document.getElementsByTagName('iframe');
  for (var i = 0; i < iframes.length; i++) {
    if (iframes[i].src && iframes[i].src.indexOf('nex-app') >= 0) {
      window.location.href = iframes[i].src;
      return JSON.stringify({ ok: true, src: iframes[i].src });
    }
  }
  if (iframes.length > 0 && iframes[0].src) {
    window.location.href = iframes[0].src;
    return JSON.stringify({ ok: true, src: iframes[0].src });
  }
  return JSON.stringify({ ok: false, error: 'no_iframe', iframes: iframes.length });
})()`

    // 7-step BQL: wrapper login → wait → nav to iframe → fill/scrape → wait → retry
    // Steps 3-4 error from navigation (expected). Step 5 returns needsNextStep if on Lock Desk.
    // Steps 6-7 handle retry after hard nav to /nex-app for proper Angular form init.
    const bqlQuery = `mutation FillAndPrice {
  loginPage: goto(url: "https://web.loannex.com/", waitUntil: networkIdle) { status time }
  login: evaluate(content: ${JSON.stringify(loginScript)}, timeout: 6000) { value }
  waitForNav: evaluate(content: "new Promise(r => setTimeout(r, 3000)).then(() => JSON.stringify({ok:true}))", timeout: 5000) { value }
  navToIframe: evaluate(content: ${JSON.stringify(navScript)}, timeout: 8000) { value }
  price: evaluate(content: ${JSON.stringify(fillScript)}, timeout: 30000) { value }
  waitForQP: evaluate(content: "new Promise(r => setTimeout(r, 5000)).then(() => JSON.stringify({ok:true}))", timeout: 8000) { value }
  retryPrice: evaluate(content: ${JSON.stringify(retryScript)}, timeout: 30000) { value }
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
      return res.json({ success: false, error: 'BQL error', bqlErrors: (bqlResult.errors || []).map((e: any) => e.message).slice(0, 5) })
    }

    // Parse results
    const safeParseValue = (val: any) => {
      if (!val) return null
      try { return typeof val === 'string' ? JSON.parse(val) : val } catch { return null }
    }

    const priceData = safeParseValue(bqlResult.data?.price?.value)
    const retryData = safeParseValue(bqlResult.data?.retryPrice?.value)

    // Use retry data if initial step hit Lock Desk (needsNextStep), or if initial step errored
    const resultData = (priceData?.needsNextStep && retryData) ? retryData
      : (!priceData && retryData) ? retryData
      : priceData

    if (!resultData) {
      return res.json({
        success: false,
        error: 'No data from pricing step',
        debug: {
          bqlErrors: (bqlResult.errors || []).map((e: any) => ({ msg: e.message?.substring(0, 100), path: e.path })).slice(0, 5),
          hasData: !!bqlResult.data,
          dataKeys: bqlResult.data ? Object.keys(bqlResult.data) : [],
          priceNeedsRetry: priceData?.needsNextStep || false,
          retryAvailable: !!retryData,
        }
      })
    }

    // Transform scraped table rows into rate options
    // Header names vary (e.g. "Rate  Lock Period 1", "Price 2") — use keyword matching
    const rates = resultData.rates || []
    const findCol = (row: any, keywords: string[]): string => {
      for (const k of Object.keys(row)) {
        const kl = k.toLowerCase()
        if (keywords.some(kw => kl.includes(kw))) return row[k] || ''
      }
      return ''
    }
    const rateOptions = rates.map((row: any) => {
      const rateField = findCol(row, ['rate'])
      const rateMatch = rateField.match(/([\d.]+)%/)
      const lockMatch = rateField.match(/(\d+)\s*Days/)

      const priceField = findCol(row, ['price'])
      const priceMatch = priceField.match(/([\d.]+)/)
      const costMatch = priceField.match(/\$([\d,.]+)/)

      const product = findCol(row, ['product'])
      const investorField = findCol(row, ['investor', 'lender'])
      const pmtField = findCol(row, ['pmt', 'payment'])
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
        diag: resultData.diag,
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
