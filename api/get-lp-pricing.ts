import type { VercelRequest, VercelResponse } from '@vercel/node'

const BROWSERLESS_URL = 'https://production-sfo.browserless.io/chromium/bql'
const FLEX_URL = 'https://flex.digitallending.com/#/pricing?code=Oaktree&company=oaktree.digitallending.com'
const LP_SEARCH_URL = 'https://api.digitallending.com/rest/v1/lp-ppe-integration/public/pricing/search?company=oaktree.digitallending.com'

// ================= LP API Payload Builder =================
function buildLPPayload(formData: any) {
  const loanAmount = Number(formData.loanAmount) || 600000
  const propertyValue = Number(formData.propertyValue) || 800000
  const fico = Number(formData.creditScore) || 740
  const ltv = loanAmount / propertyValue
  const dti = Number(formData.dti) || 36
  const lockDays = Number(formData.lockPeriod) || 30
  const term = Number(formData.loanTerm) || 30
  const isDSCR = formData.documentationType === 'dscr'

  const loanPurposeMap: Record<string, string> = {
    purchase: 'Purchase', refinance: 'Refinance', cashout: 'CashOut Refinance',
  }
  const propertyUseMap: Record<string, string> = {
    primary: 'PrimaryResidence', secondary: 'SecondHome', investment: 'Investment',
  }
  const propTypeMap: Record<string, string> = {
    sfr: 'SingleFamily', condo: 'Condo', townhouse: 'Townhouse',
    '2unit': 'MultiFamily', '3unit': 'MultiFamily', '4unit': 'MultiFamily', '5-9unit': 'MultiFamily',
  }
  const unitMap: Record<string, number> = {
    sfr: 1, condo: 1, townhouse: 1, '2unit': 2, '3unit': 3, '4unit': 4, '5-9unit': 5,
  }
  const citizenMap: Record<string, string> = {
    usCitizen: 'US Citizen', permanentResident: 'Permanent Resident Alien',
    nonPermanentResident: 'Non-Permanent Resident Alien', foreignNational: 'Foreign National', itin: 'ITIN',
  }
  const docTypeMap: Record<string, string> = {
    fullDoc: 'FullDoc', dscr: 'DSCR', bankStatement: 'BankStatement',
    bankStatement12: 'BankStatement', bankStatement24: 'BankStatement',
    bankStatementOther: 'BankStatement', assetUtilization: 'AssetUtilization',
    assetDepletion: 'AssetUtilization', voe: 'VOE', noRatio: 'NoRatio', taxReturns1Yr: 'FullDoc',
  }

  const loanPurpose = loanPurposeMap[formData.loanPurpose] || 'Purchase'
  const propertyUse = propertyUseMap[formData.occupancyType] || 'PrimaryResidence'
  const propertyType = propTypeMap[formData.propertyType] || 'SingleFamily'
  const numberOfUnit = unitMap[formData.propertyType] || 1
  const citizenship = citizenMap[formData.citizenship] || 'US Citizen'
  const incomeDocType = docTypeMap[formData.documentationType] || 'FullDoc'

  let dscrRatioVal = ''
  if (isDSCR) {
    const dscrMap: Record<string, string> = {
      '>=1.250': 'DSCR>=1', '1.150-1.249': 'DSCR>=1', '1.00-1.149': 'DSCR>=1',
      '0.750-0.999': 'DSCR<1', '0.500-0.749': 'DSCR<1',
    }
    dscrRatioVal = dscrMap[formData.dscrRatio] || 'DSCR>=1'
  }

  const dynamicProps: { fieldId: string; value: string }[] = [
    { fieldId: 'Citizenship', value: citizenship },
    { fieldId: 'IncomeDocType', value: incomeDocType },
    { fieldId: 'GLOBAL_BorrowerType', value: 'Individual' },
    { fieldId: 'GLOBAL_GIFTFUNDPERCENT', value: '0' },
    { fieldId: 'PrepayTerm', value: 'None' },
    { fieldId: 'MORT30LATESLAST12M', value: '0' },
    { fieldId: 'MORT60LATESLAST12M', value: '0' },
    { fieldId: 'MORT90LATESLAST12M', value: '0' },
    { fieldId: 'MORT120LATESLAST12M', value: '0' },
  ]
  if (isDSCR) {
    dynamicProps.push({ fieldId: 'DSCRRATIO', value: dscrRatioVal })
    dynamicProps.push({ fieldId: 'AddlOccupancyType', value: 'Long_Term_Rental_Property' })
  }

  return {
    date: null,
    companyId: '646e553bce8ad00001423634',
    code: 'Oaktree',
    criteria: {
      purchasePrice: propertyValue,
      loanAmount,
      loanYear: term,
      loanPurpose,
      loanType: 'Fixed',
      mortgageTypes: ['Conventional'],
      propertyUse,
      fico,
      ltv,
      dscr: isDSCR ? 1 : 0,
      selfEmployed: String(formData.isSelfEmployed || false),
      interestOnly: formData.paymentType === 'io',
      escrowWaiver: formData.impoundType === 'noescrow',
      lenderFeeWaiver: false,
      lienPriorityType: 'FirstLien',
      compensationType: 'LenderCompPlan',
      monthlyIncome: 16667,
      monthlyDebt: Math.round(16667 * (dti / 100)),
      clientDti: dti / 100,
      numberOfBorrower: '1',
      pmiType: 'None',
      downPaymentAmount: 0,
    },
    property: {
      address: {
        censustract: '', city: formData.propertyCity || '',
        zip: formData.propertyZip || '90210', state: formData.propertyState || 'CA',
        county: '', countyName: formData.propertyCounty || '', country: 'US',
      },
      propertyType,
      numberOfUnit,
      attachmentType: formData.structureType === 'attached' ? 'Attached' : 'Detached',
    },
    brokerCriteria: {},
    rateRange: {},
    accessCriteria: {},
    filter: {},
    miCriteria: {},
    closingCost: {},
    dynamicPropertiesMap: dynamicProps,
    groupConfig: {
      paths: [
        { group: 'CriteriaFromLineResultKey', groupSort: 'LoanTypeAndTerm' },
        { group: 'RateKey', groupSort: 'KeyAsc' },
        { group: 'LenderKey', groupSort: 'KeyAsc' },
      ],
      leafSort: 'Point',
      backendGrouping: true,
    },
    dayLocksCriteria: [lockDays],
    termsCriteria: [term],
    loanPurposeCriteria: [loanPurpose],
    loanTypeCriteria: ['Fixed'],
    showDisqualify: true,
    showDisqualifyRules: true,
    skipAdjustments: false,
    maxListingPerRate: -1,
    dynaToSmo: true,
    disqualifyAsync: true,
    fillLenderMap: true,
  }
}

// ================= LP Response Parser =================
function parseLPApiResponse(apiResponse: any) {
  const rateOptions: any[] = []

  function traverseTree(node: any) {
    if (!node) return
    if (node.leafs && Array.isArray(node.leafs)) {
      for (const leaf of node.leafs) {
        const rate = leaf.rate || 0
        const adjustedPoints = leaf.adjustedPoints || 0
        const price = 100 - adjustedPoints
        const payment = leaf.monthlyPayment?.monthlyPI || leaf.monthlyPayment?.total || 0
        const apr = leaf.apr || 0
        const totalAdj = leaf.adjustmentPoints || 0

        // Extract adjustment details from borrowerPaidDetails or closingCostDetails
        const adjustments: { description: string; amount: number }[] = []
        if (leaf.borrowerPaidDetails && Array.isArray(leaf.borrowerPaidDetails)) {
          for (const det of leaf.borrowerPaidDetails) {
            if (det.description && (det.points || det.amount)) {
              adjustments.push({
                description: det.description,
                amount: parseFloat(det.points) || 0,
              })
            }
          }
        }

        if (rate > 0) {
          rateOptions.push({ rate, price, payment, apr, adjustments, totalAdjustments: totalAdj })
        }
      }
    }
    if (node.childs && Array.isArray(node.childs)) {
      for (const child of node.childs) traverseTree(child)
    }
  }

  const results = apiResponse?.results
  if (results) {
    if (results.qualifiedNonQMData) traverseTree(results.qualifiedNonQMData)
    if (results.qualifiedQMData) traverseTree(results.qualifiedQMData)
  }

  // Deduplicate by rate, keep best price for each rate
  const byRate = new Map<string, any>()
  for (const opt of rateOptions) {
    const key = opt.rate.toFixed(3)
    const existing = byRate.get(key)
    if (!existing || Math.abs(opt.price - 100) < Math.abs(existing.price - 100)) {
      byRate.set(key, opt)
    }
  }

  return Array.from(byRate.values()).sort((a, b) => a.rate - b.rate)
}

// ================= BQL Query Builder =================
function buildBQLQuery(lpPayload: any): string {
  const payloadJson = JSON.stringify(lpPayload).replace(/\\/g, '\\\\').replace(/"/g, '\\"')

  // JavaScript that runs in the page context after flex loads:
  // 1. Waits for the app to authenticate
  // 2. Intercepts fetch to capture auth token
  // 3. Makes direct API call with captured token
  // 4. Falls back to extracting token from storage
  const jsExpression = `
(async function() {
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // Accept cookies if banner appears
  try {
    var btns = document.querySelectorAll('button, a');
    for (var b of btns) {
      var t = (b.textContent || '').toLowerCase().trim();
      if (t.includes('accept') || t.includes('agree') || t === 'ok' || t.includes('got it') || t.includes('consent')) {
        b.click(); break;
      }
    }
  } catch(e) {}

  await sleep(2000);

  // Strategy 1: Check localStorage/sessionStorage for token
  var token = null;
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      var v = localStorage.getItem(k);
      if (v && v.length > 20 && v.length < 5000) {
        try {
          var parsed = JSON.parse(v);
          if (parsed.access_token) { token = parsed.access_token; break; }
          if (parsed.token) { token = parsed.token; break; }
        } catch(e2) {
          if (k.toLowerCase().includes('token') || k.toLowerCase().includes('auth')) {
            token = v; break;
          }
        }
      }
    }
    if (!token) {
      for (var j = 0; j < sessionStorage.length; j++) {
        var sk = sessionStorage.key(j);
        var sv = sessionStorage.getItem(sk);
        if (sv && sv.length > 20 && sv.length < 5000) {
          try {
            var parsed2 = JSON.parse(sv);
            if (parsed2.access_token) { token = parsed2.access_token; break; }
            if (parsed2.token) { token = parsed2.token; break; }
          } catch(e3) {
            if (sk.toLowerCase().includes('token') || sk.toLowerCase().includes('auth')) {
              token = sv; break;
            }
          }
        }
      }
    }
  } catch(e) {}

  // Strategy 2: Intercept any ongoing XHR that has Authorization header
  if (!token) {
    try {
      var perfEntries = performance.getEntriesByType('resource');
      // Look for auth-related requests that might reveal the token pattern
    } catch(e) {}
  }

  // Strategy 3: Try to find token in Angular app state
  if (!token) {
    try {
      // Check for ngrx store or Angular services
      var appRoot = document.querySelector('app-root, [ng-version]');
      if (appRoot && appRoot.__ngContext__) {
        // Try to navigate Angular's internal structures
        var ctx = appRoot.__ngContext__;
        if (Array.isArray(ctx)) {
          for (var ci = 0; ci < ctx.length; ci++) {
            var item = ctx[ci];
            if (item && typeof item === 'object' && item.access_token) {
              token = item.access_token;
              break;
            }
          }
        }
      }
    } catch(e) {}
  }

  // Strategy 4: Override fetch and wait for any API call that reveals the token
  if (!token) {
    var capturedToken = null;
    var origFetch = window.fetch;
    window.fetch = async function() {
      var args = arguments;
      var resp = await origFetch.apply(this, args);
      try {
        var url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');
        if (url.includes('oauth/token') || url.includes('/auth')) {
          var clone = resp.clone();
          var data = await clone.json();
          if (data.access_token) capturedToken = data.access_token;
        }
      } catch(e) {}
      return resp;
    };

    // Also check XHR
    var origXhrOpen = XMLHttpRequest.prototype.open;
    var origXhrSetHeader = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
      if (name.toLowerCase() === 'authorization' && value.startsWith('Bearer ')) {
        capturedToken = value.replace('Bearer ', '');
      }
      return origXhrSetHeader.apply(this, arguments);
    };

    // Wait and check
    for (var w = 0; w < 10; w++) {
      await sleep(1000);
      if (capturedToken) { token = capturedToken; break; }
    }

    // Restore
    window.fetch = origFetch;
    XMLHttpRequest.prototype.open = origXhrOpen;
    XMLHttpRequest.prototype.setRequestHeader = origXhrSetHeader;
  }

  // Collect debug info
  var debugInfo = {
    tokenFound: !!token,
    tokenLength: token ? token.length : 0,
    localStorageKeys: [],
    sessionStorageKeys: [],
  };
  try {
    for (var di = 0; di < localStorage.length; di++) debugInfo.localStorageKeys.push(localStorage.key(di));
    for (var dj = 0; dj < sessionStorage.length; dj++) debugInfo.sessionStorageKeys.push(sessionStorage.key(dj));
  } catch(e) {}

  // If we have a token, make the direct API call
  if (token) {
    try {
      var apiResp = await fetch("${LP_SEARCH_URL}", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: '${payloadJson}',
      });
      if (apiResp.ok) {
        var apiData = await apiResp.json();
        return JSON.stringify({ success: true, method: 'directApi', data: apiData, debug: debugInfo });
      } else {
        debugInfo.apiStatus = apiResp.status;
        debugInfo.apiError = await apiResp.text().catch(function() { return 'unreadable'; });
      }
    } catch(e) {
      debugInfo.apiCallError = e.message;
    }
  }

  // Fallback: Try to fill form and capture response via interception
  var interceptedResponse = null;
  var origFetch2 = window.fetch;
  window.fetch = async function() {
    var args = arguments;
    var resp = await origFetch2.apply(this, args);
    try {
      var url = typeof args[0] === 'string' ? args[0] : '';
      if (url.includes('/pricing/search')) {
        var clone = resp.clone();
        interceptedResponse = await clone.json();
      }
    } catch(e) {}
    return resp;
  };

  // Try to click search button (form might already have default values)
  try {
    var allBtns = document.querySelectorAll('button');
    for (var bi = 0; bi < allBtns.length; bi++) {
      var btnText = (allBtns[bi].textContent || '').toLowerCase().trim();
      if (btnText.includes('search') || btnText.includes('price') || btnText.includes('get rate')) {
        allBtns[bi].click();
        break;
      }
    }
  } catch(e) {}

  // Wait for intercepted response
  for (var ri = 0; ri < 30; ri++) {
    await sleep(1000);
    if (interceptedResponse) break;
  }

  window.fetch = origFetch2;

  if (interceptedResponse) {
    return JSON.stringify({ success: true, method: 'intercepted', data: interceptedResponse, debug: debugInfo });
  }

  return JSON.stringify({ success: false, method: 'none', debug: debugInfo });
})()
  `.trim()

  return `mutation GetLPPricing {
  goto(url: "${FLEX_URL}", waitUntil: networkIdle) {
    status
    time
  }
  scrapeResults: javascript(expression: ${JSON.stringify(jsExpression)}) {
    value
  }
}`
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
    return res.json({ success: false, error: 'LP pricing not configured' })
  }

  try {
    const formData = req.body
    const lpPayload = buildLPPayload(formData)
    const bqlQuery = buildBQLQuery(lpPayload)

    const bqlResponse = await fetch(`${BROWSERLESS_URL}?token=${browserlessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: bqlQuery }),
      signal: AbortSignal.timeout(55000),
    })

    if (!bqlResponse.ok) {
      const errText = await bqlResponse.text().catch(() => '')
      console.error('Browserless error:', bqlResponse.status, errText.substring(0, 500))
      return res.json({ success: false, error: `LP engine unavailable (${bqlResponse.status})` })
    }

    const bqlResult = await bqlResponse.json()
    const rawValue = bqlResult?.data?.scrapeResults?.value

    if (!rawValue) {
      return res.json({
        success: true,
        data: { source: 'lenderprice', rateOptions: [], totalRates: 0 },
      })
    }

    let parsed: any
    try {
      parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue
    } catch {
      console.error('Failed to parse BQL result:', String(rawValue).substring(0, 500))
      return res.json({
        success: true,
        data: { source: 'lenderprice', rateOptions: [], totalRates: 0 },
      })
    }

    if (!parsed.success || !parsed.data) {
      return res.json({
        success: true,
        data: {
          source: 'lenderprice',
          rateOptions: [],
          totalRates: 0,
          debug: parsed.debug,
        },
      })
    }

    // Parse the LP API response tree into flat rate options
    const rateOptions = parseLPApiResponse(parsed.data)

    return res.json({
      success: true,
      data: {
        source: 'lenderprice',
        rateOptions,
        totalRates: rateOptions.length,
        method: parsed.method,
      },
    })
  } catch (error) {
    console.error('LP pricing error:', error)
    // Silently fail - MeridianLink results still work
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'LP pricing unavailable',
    })
  }
}
