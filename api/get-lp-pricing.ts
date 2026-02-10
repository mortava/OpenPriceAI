import type { VercelRequest, VercelResponse } from '@vercel/node'

const BROWSERLESS_URL = 'https://production-sfo.browserless.io/chromium/bql'
const FLEX_URL = 'https://flex.digitallending.com/#/pricing?code=Oaktree&company=oaktree.digitallending.com'

// ================= Flex Form Field IDs =================
const FIELD_IDS = {
  fico: '63d2274bf262ed03e49abc6c',
  citizenship: '63fd2c4bd2d5c7d168d741b8',
  docType: '686fb4aab753b53d04cea8c9',
  dscrRatio: '63bda202870841ff37dcffc2',
  occupancy: '61a97be92f993cf968556c19',
  propertyType: '613fe3ebb0d5f45e0b719775',
  units: '61a97b912f993cf968556c14',
  attachmentType: '61a97b4e2f993cf968556c10',
  zip: '613fe802b0d5f45e0b71985b',
  state: '613fe2d8b0d5f45e0b719766',
  loanPurpose: '625cf17a81b3b41288722d24',
  purchasePrice: '63fd2badd2d5c7d168d7404b',
  loanAmount: '625cf3e881b3b41288722d60',
  waiveImpounds: '63ac9dfb44b1dfb7238cbd36',
  interestOnly: '6471198a1808b2759c7290f3',
  selfEmployed: '6219b8a850cbb98496384300',
}

// ================= Form Value Mappings =================
function mapFormValues(formData: any) {
  const occupancyMap: Record<string, string> = {
    primary: 'Primary Residence', secondary: 'Second Home', investment: 'Investment',
  }
  const propTypeMap: Record<string, string> = {
    sfr: 'Single Family Residence', condo: 'Condo', townhouse: 'Townhouse',
    '2unit': '2-4 Units', '3unit': '2-4 Units', '4unit': '2-4 Units', '5-9unit': 'MultiFamily 5-8 Units',
  }
  const purposeMap: Record<string, string> = {
    purchase: 'Purchase', refinance: 'Refinance', cashout: 'Cashout Refinance',
  }
  const citizenMap: Record<string, string> = {
    usCitizen: 'US Citizen', permanentResident: 'Permanent Resident',
    nonPermanentResident: 'Non-Permanent Resident', foreignNational: 'Foreign National', itin: 'ITIN',
  }
  const docTypeMap: Record<string, string> = {
    fullDoc: 'Full Doc', dscr: 'Investor/DSCR',
    bankStatement: '24 Mo Personal Bank Statements', bankStatement12: '12 Mo Personal Bank Statements',
    bankStatement24: '24 Mo Personal Bank Statements', assetDepletion: 'Asset Utilization',
    assetUtilization: 'Asset Utilization', voe: 'WVOE', noRatio: 'Full Doc',
  }
  const stateMap: Record<string, string> = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
    CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
    HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
    KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
    MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
    MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
    NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
    OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
    SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
    VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
    DC: 'District of Columbia',
  }

  const isDSCR = formData.documentationType === 'dscr'

  return {
    fico: String(Number(formData.creditScore) || 740),
    citizenship: citizenMap[formData.citizenship] || 'US Citizen',
    docType: docTypeMap[formData.documentationType] || 'Full Doc',
    dscrRatio: isDSCR ? String(Number(formData.dscrValue) || 1.25) : '',
    occupancy: occupancyMap[formData.occupancyType] || 'Primary Residence',
    propertyType: propTypeMap[formData.propertyType] || 'Single Family Residence',
    units: formData.propertyType?.startsWith('2') ? '2' : formData.propertyType?.startsWith('3') ? '3' : formData.propertyType?.startsWith('4') ? '4' : '1',
    attachmentType: formData.structureType === 'attached' ? 'Attached' : 'Detached',
    zip: formData.propertyZip || '90210',
    state: stateMap[formData.propertyState] || 'California',
    loanPurpose: purposeMap[formData.loanPurpose] || 'Purchase',
    purchasePrice: String(Number(formData.propertyValue) || 800000),
    loanAmount: String(Number(formData.loanAmount) || 600000),
    waiveImpounds: formData.impoundType === 'noescrow',
    interestOnly: formData.paymentType === 'io',
    selfEmployed: !!formData.isSelfEmployed,
    isDSCR,
  }
}

// ================= Build BQL Evaluate Script =================
function buildEvaluateScript(values: ReturnType<typeof mapFormValues>): string {
  // Build setVal calls for each field
  const fieldSets: string[] = [
    `setVal('${FIELD_IDS.fico}', '${values.fico}');`,
    `setVal('${FIELD_IDS.citizenship}', '${values.citizenship}');`,
    `setVal('${FIELD_IDS.docType}', '${values.docType}');`,
    `setVal('${FIELD_IDS.occupancy}', '${values.occupancy}');`,
    `await sleep(300);`,
    `setVal('${FIELD_IDS.propertyType}', '${values.propertyType}');`,
    `setVal('${FIELD_IDS.units}', '${values.units}');`,
    `setVal('${FIELD_IDS.attachmentType}', '${values.attachmentType}');`,
    `setVal('${FIELD_IDS.zip}', '${values.zip}');`,
    `setVal('${FIELD_IDS.state}', '${values.state}');`,
    `setVal('${FIELD_IDS.loanPurpose}', '${values.loanPurpose}');`,
    `await sleep(300);`,
    `setVal('${FIELD_IDS.purchasePrice}', '${values.purchasePrice}');`,
    `setVal('${FIELD_IDS.loanAmount}', '${values.loanAmount}');`,
  ]

  if (values.isDSCR && values.dscrRatio) {
    fieldSets.push(`setVal('${FIELD_IDS.dscrRatio}', '${values.dscrRatio}');`)
  }

  // Handle checkboxes
  const checkboxSets: string[] = []
  if (values.waiveImpounds) {
    checkboxSets.push(`setCheckbox('${FIELD_IDS.waiveImpounds}', true);`)
  }
  if (values.interestOnly) {
    checkboxSets.push(`setCheckbox('${FIELD_IDS.interestOnly}', true);`)
  }
  if (values.selfEmployed) {
    checkboxSets.push(`setCheckbox('${FIELD_IDS.selfEmployed}', true);`)
  }

  return `(async function() {
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  var diag = { steps: [], fieldResults: {} };

  function setVal(id, val) {
    var el = document.getElementById(id);
    if (!el) { diag.fieldResults[id] = 'NOT_FOUND'; return; }
    diag.fieldResults[id] = { tag: el.tagName, found: true };
    var s = el.tagName === 'SELECT'
      ? Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
      : Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    s.call(el, val);
    el.dispatchEvent(new Event('input', {bubbles: true}));
    el.dispatchEvent(new Event('change', {bubbles: true}));
  }
  function setCheckbox(id, checked) {
    var el = document.getElementById(id);
    if (el && el.checked !== checked) { el.click(); }
    diag.fieldResults[id] = el ? 'checkbox_set' : 'NOT_FOUND';
  }

  diag.steps.push('page_url: ' + window.location.href);
  diag.steps.push('title: ' + document.title);

  await sleep(2000);

  // Dismiss cookie consent banner - try multiple strategies
  var dismissed = false;

  // Strategy 1: Click any element containing "allow cookies" text
  var allElements = document.querySelectorAll('button, a, div, span');
  for (var cb = 0; cb < allElements.length; cb++) {
    var elText = (allElements[cb].textContent || '').trim().toLowerCase();
    if (elText === 'allow cookies' || elText === 'accept' || elText === 'accept all' || elText === 'allow') {
      allElements[cb].click();
      diag.steps.push('cookie_clicked: ' + elText + ' (' + allElements[cb].tagName + ')');
      dismissed = true;
      break;
    }
  }

  // Strategy 2: Set common cookie consent cookies directly
  document.cookie = 'CookieConsent=true; path=/; max-age=31536000';
  document.cookie = 'cookieconsent_status=allow; path=/; max-age=31536000';
  document.cookie = 'cc_cookie={%22categories%22:[%22necessary%22,%22analytics%22,%22marketing%22]}; path=/; max-age=31536000';

  // Strategy 3: Remove cookie banner from DOM if it exists
  var banners = document.querySelectorAll('.cc-window, .cookie-consent, .cookie-banner, [class*=cookie], [id*=cookie]');
  for (var bi = 0; bi < banners.length; bi++) {
    banners[bi].style.display = 'none';
    diag.steps.push('cookie_banner_hidden: ' + banners[bi].className.substring(0, 50));
  }

  if (!dismissed) diag.steps.push('cookie_no_button_found');

  await sleep(1500);

  // Check if page loaded
  var bodyText = (document.body.innerText || '').substring(0, 500);
  diag.steps.push('body_preview: ' + bodyText.substring(0, 200));

  ${fieldSets.join('\\n  ')}
  ${checkboxSets.join('\\n  ')}

  await sleep(500);
  diag.steps.push('fields_set');

  // Click Search
  var searchBtn = document.querySelector('button.btn-primary');
  var allBtns = document.querySelectorAll('button');
  diag.steps.push('buttons_found: ' + allBtns.length);
  diag.steps.push('search_btn: ' + (searchBtn ? searchBtn.textContent.trim() : 'NOT_FOUND'));
  if (!searchBtn) return JSON.stringify({ error: 'no search button', diag: diag });
  searchBtn.click();
  diag.steps.push('search_clicked');

  // Poll for results table (check every 2s, up to 20s)
  var foundTable = false;
  for (var attempt = 0; attempt < 10; attempt++) {
    await sleep(2000);
    var checkTables = document.querySelectorAll('table');
    var checkRows = document.querySelectorAll('tr');
    if (checkRows.length > 0) {
      diag.steps.push('results_found_at: ' + ((attempt + 1) * 2) + 's (' + checkRows.length + ' rows)');
      foundTable = true;
      break;
    }
    // Also check for loading spinner or "No results" text
    var bodySnap = (document.body.innerText || '');
    if (bodySnap.indexOf('No results') >= 0 || bodySnap.indexOf('No eligible') >= 0) {
      diag.steps.push('no_results_text_at: ' + ((attempt + 1) * 2) + 's');
      break;
    }
  }

  if (!foundTable) {
    diag.steps.push('no_table_after_20s');
    // Capture page state for debugging
    var pageText2 = (document.body.innerText || '');
    diag.steps.push('final_page: ' + pageText2.substring(0, 400));
  }

  // Extra settle time after table appears
  if (foundTable) await sleep(1000);

  var allRows = document.querySelectorAll('tr');
  diag.steps.push('total_tr_elements: ' + allRows.length);
  var allTables = document.querySelectorAll('table');
  diag.steps.push('total_tables: ' + allTables.length);

  // Extract rate data from table
  function getData(cell) {
    var div = cell.querySelector('[data]');
    return div ? div.getAttribute('data') : (cell.textContent || '').trim();
  }

  var rows = document.querySelectorAll('tr');
  var rates = [];
  var debugRows = [];
  for (var i = 0; i < rows.length && i < 50; i++) {
    var cells = rows[i].querySelectorAll('td');
    if (cells.length < 5) continue;
    var rateText = (cells[0].textContent || '').trim();
    debugRows.push({ cellCount: cells.length, cell0: rateText.substring(0, 30) });
    var rateMatch = rateText.match(/([\\d.]+)\\s*%/);
    if (!rateMatch) continue;
    rates.push({
      rate: parseFloat(rateMatch[1]),
      price: getData(cells[2]),
      payment: getData(cells[3]),
      priceAdj: getData(cells[9])
    });
  }

  diag.debugRows = debugRows.slice(0, 5);

  // Get eligible counts
  var pageText = document.body.innerText || '';
  var qmMatch = pageText.match(/Eligible QM \\((\\d+)\\)/);
  var nonQmMatch = pageText.match(/Eligible Non-Traditional \\((\\d+)\\)/);

  return JSON.stringify({
    rateCount: rates.length,
    eligibleQM: qmMatch ? parseInt(qmMatch[1]) : 0,
    eligibleNonQM: nonQmMatch ? parseInt(nonQmMatch[1]) : 0,
    rates: rates,
    diag: diag
  });
})()`
}

// ================= Parse Scraped Results =================
function parseScrapedRates(rawRates: any[]): any[] {
  return rawRates
    .filter((r: any) => r.rate > 0 && r.price)
    .map((r: any) => {
      const priceStr = String(r.price).replace(/[^0-9.-]/g, '')
      const paymentStr = String(r.payment).replace(/[^0-9.-]/g, '')
      const adjStr = String(r.priceAdj).replace(/[^0-9.-]/g, '')
      return {
        rate: r.rate,
        price: parseFloat(priceStr) || 0,
        payment: parseFloat(paymentStr) || 0,
        totalAdjustments: parseFloat(adjStr) || 0,
      }
    })
    .sort((a: any, b: any) => a.rate - b.rate)
}

// Vercel hobby plan: extend timeout to 60s (BQL scrape takes ~20s)
export const config = { maxDuration: 60 }

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
    return res.json({ success: false, error: 'LP pricing not configured' })
  }

  try {
    const formData = req.body
    const values = mapFormValues(formData)
    console.log('[LP] Mapped values:', JSON.stringify(values))
    console.log('[LP] Raw form data keys:', Object.keys(formData).join(', '))
    const evalScript = buildEvaluateScript(values)

    const bqlQuery = `mutation ScrapeRates {
  goto(url: "${FLEX_URL}", waitUntil: networkIdle) { status time }
  results: evaluate(content: ${JSON.stringify(evalScript)}, timeout: 30000) { value }
}`

    const bqlResp = await fetch(`${BROWSERLESS_URL}?token=${browserlessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: bqlQuery }),
      signal: AbortSignal.timeout(50000),
    })

    if (!bqlResp.ok) {
      return res.json({
        success: true,
        data: { source: 'lenderprice', rateOptions: [], totalRates: 0, debug: { bqlStatus: bqlResp.status } },
      })
    }

    const bqlResult = await bqlResp.json()

    if (bqlResult.errors) {
      return res.json({
        success: true,
        data: { source: 'lenderprice', rateOptions: [], totalRates: 0, debug: { bqlErrors: bqlResult.errors } },
      })
    }

    const evalValue = bqlResult.data?.results?.value
    if (!evalValue) {
      return res.json({
        success: true,
        data: { source: 'lenderprice', rateOptions: [], totalRates: 0, debug: { noEvalValue: true } },
      })
    }

    const scraped = typeof evalValue === 'string' ? JSON.parse(evalValue) : evalValue

    if (scraped.error) {
      return res.json({
        success: true,
        data: { source: 'lenderprice', rateOptions: [], totalRates: 0, debug: { scrapeError: scraped.error } },
      })
    }

    const rateOptions = parseScrapedRates(scraped.rates || [])

    return res.json({
      success: true,
      data: {
        source: 'lenderprice',
        rateOptions,
        totalRates: rateOptions.length,
        eligibleQM: scraped.eligibleQM || 0,
        eligibleNonQM: scraped.eligibleNonQM || 0,
        debug: {
          mappedValues: values,
          rawRateCount: scraped.rateCount,
          rawRatesLength: (scraped.rates || []).length,
          firstRawRate: (scraped.rates || [])[0] || null,
          parsedCount: rateOptions.length,
          diag: scraped.diag || null,
        },
      },
    })
  } catch (error) {
    console.error('LP pricing error:', error)
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'LP pricing unavailable',
    })
  }
}
