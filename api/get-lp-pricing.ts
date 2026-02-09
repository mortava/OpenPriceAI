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

// ================= Token Extraction via Browserless =================
async function extractTokenViaBrowserless(browserlessToken: string): Promise<{ token: string | null; debug: any }> {
  // Step 1: Use BQL response intercept to capture OAuth token from flex page load
  const bqlQuery = `mutation CaptureAuth {
  goto(url: "${FLEX_URL}", waitUntil: networkIdle) {
    status
    time
  }
  authResponses: response(url: ["*oauth*", "*token*", "*auth*"], type: xhr, timeout: 5000) {
    url
    body
    status
  }
  allXhrResponses: response(type: xhr, timeout: 5000) {
    url
    status
  }
  tokenFromPage: evaluate(content: ${JSON.stringify(`
(async function() {
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  await sleep(1000);

  // Check localStorage
  var token = null;
  var allKeys = {};
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      var v = localStorage.getItem(k);
      allKeys['ls_' + k] = v ? v.substring(0, 200) : null;
      if (v && v.length > 20) {
        try {
          var p = JSON.parse(v);
          if (p.access_token) { token = p.access_token; break; }
          if (p.token) { token = p.token; break; }
        } catch(e) {}
      }
    }
    for (var j = 0; j < sessionStorage.length; j++) {
      var sk = sessionStorage.key(j);
      var sv = sessionStorage.getItem(sk);
      allKeys['ss_' + sk] = sv ? sv.substring(0, 200) : null;
      if (sv && sv.length > 20) {
        try {
          var p2 = JSON.parse(sv);
          if (p2.access_token) { token = p2.access_token; break; }
          if (p2.token) { token = p2.token; break; }
        } catch(e) {}
      }
    }
  } catch(e) {}

  // Check cookies
  var cookies = document.cookie || '';

  return JSON.stringify({
    token: token,
    storageKeys: allKeys,
    cookies: cookies.substring(0, 500),
    url: window.location.href,
    title: document.title,
  });
})()
  `)}, timeout: 10000) {
    value
  }
}`

  const resp = await fetch(`${BROWSERLESS_URL}?token=${browserlessToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: bqlQuery }),
    signal: AbortSignal.timeout(30000),
  })

  if (!resp.ok) {
    return { token: null, debug: { error: `BQL HTTP ${resp.status}` } }
  }

  const bqlResult = await resp.json()

  // Check for BQL errors
  if (bqlResult.errors) {
    return { token: null, debug: { bqlErrors: bqlResult.errors } }
  }

  let token: string | null = null
  const debug: any = {
    gotoStatus: bqlResult.data?.goto?.status,
    gotoTime: bqlResult.data?.goto?.time,
  }

  // Try to find token in auth responses
  const authResponses = bqlResult.data?.authResponses || []
  debug.authResponseCount = authResponses.length
  debug.authResponseUrls = authResponses.map((r: any) => r.url)

  for (const authResp of authResponses) {
    if (authResp.body) {
      try {
        const body = typeof authResp.body === 'string' ? JSON.parse(authResp.body) : authResp.body
        if (body.access_token) {
          token = body.access_token
          break
        }
      } catch {
        // Check if body itself is the token
        if (typeof authResp.body === 'string' && authResp.body.length > 20 && authResp.body.length < 2000) {
          debug.rawAuthBody = authResp.body.substring(0, 200)
        }
      }
    }
  }

  // Also log all XHR URLs for debugging
  const allXhr = bqlResult.data?.allXhrResponses || []
  debug.xhrCount = allXhr.length
  debug.xhrUrls = allXhr.map((r: any) => r.url).slice(0, 20)

  // Try to get token from page evaluate
  if (!token) {
    const pageValue = bqlResult.data?.tokenFromPage?.value
    if (pageValue) {
      try {
        const pageData = typeof pageValue === 'string' ? JSON.parse(pageValue) : pageValue
        if (pageData.token) {
          token = pageData.token
        }
        debug.pageData = pageData
      } catch {
        debug.rawPageValue = String(pageValue).substring(0, 500)
      }
    }
  }

  return { token, debug }
}

// ================= Direct API Call (no auth needed) =================
async function callLPSearchDirect(lpPayload: any): Promise<{ data: any; status: number } | null> {
  try {
    const resp = await fetch(LP_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://flex.digitallending.com',
        'Referer': 'https://flex.digitallending.com/',
      },
      body: JSON.stringify(lpPayload),
      signal: AbortSignal.timeout(20000),
    })
    if (resp.ok) {
      return { data: await resp.json(), status: resp.status }
    }
    return { data: null, status: resp.status }
  } catch {
    return null
  }
}

// ================= Main Handler =================
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' })

  try {
    const formData = req.body
    const lpPayload = buildLPPayload(formData)

    // Strategy 1: Try direct API call (flex page shows no auth needed)
    const directResult = await callLPSearchDirect(lpPayload)

    if (directResult?.data) {
      const rateOptions = parseLPApiResponse(directResult.data)
      const rawPrograms = directResult.data?.results?.programs || []

      return res.json({
        success: true,
        data: {
          source: 'lenderprice',
          rateOptions,
          totalRates: rateOptions.length,
          method: 'direct',
          debug: rateOptions.length === 0 ? {
            hasResults: !!directResult.data?.results,
            qualifiedQMKeys: directResult.data?.results?.qualifiedQMData ? Object.keys(directResult.data.results.qualifiedQMData) : [],
            qualifiedNonQMKeys: directResult.data?.results?.qualifiedNonQMData ? Object.keys(directResult.data.results.qualifiedNonQMData) : [],
            programNames: rawPrograms.slice(0, 5),
            rawResponseKeys: Object.keys(directResult.data || {}),
          } : undefined,
        },
      })
    }

    // Strategy 2: If direct call failed, try via Browserless token extraction
    const browserlessToken = process.env.BROWSERLESS_TOKEN
    if (!browserlessToken) {
      return res.json({
        success: true,
        data: {
          source: 'lenderprice',
          rateOptions: [],
          totalRates: 0,
          debug: { directStatus: directResult?.status, method: 'direct_failed_no_browserless' },
        },
      })
    }

    const { token, debug: tokenDebug } = await extractTokenViaBrowserless(browserlessToken)

    if (!token) {
      return res.json({
        success: true,
        data: {
          source: 'lenderprice',
          rateOptions: [],
          totalRates: 0,
          debug: { ...tokenDebug, directStatus: directResult?.status },
        },
      })
    }

    // Make API call with extracted token
    const apiResponse = await fetch(LP_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://flex.digitallending.com',
      },
      body: JSON.stringify(lpPayload),
      signal: AbortSignal.timeout(20000),
    })

    if (!apiResponse.ok) {
      const errBody = await apiResponse.text().catch(() => '')
      return res.json({
        success: true,
        data: {
          source: 'lenderprice',
          rateOptions: [],
          totalRates: 0,
          debug: { ...tokenDebug, apiStatus: apiResponse.status, apiError: errBody.substring(0, 500) },
        },
      })
    }

    const apiData = await apiResponse.json()
    const rateOptions = parseLPApiResponse(apiData)

    return res.json({
      success: true,
      data: {
        source: 'lenderprice',
        rateOptions,
        totalRates: rateOptions.length,
        method: 'browserless_token',
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
