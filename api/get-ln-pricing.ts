import type { VercelRequest, VercelResponse } from '@vercel/node'

const BROWSERLESS_URL = 'https://production-sfo.browserless.io/chromium/bql'
const LOANNEX_URL = 'https://web.loannex.com/iframe/loadiframe?_id=&page=nex-app'
const NEXAPI_BASE = 'https://nexapi.loannex.com'

export const config = { maxDuration: 60 }

// ================= Field Mapping =================
function mapFormToNexApp(body: any): Record<string, any> {
  const purposeMap: Record<string, string> = {
    purchase: 'Purchase',
    refinance: 'NoCashOutRefinance',
    cashout: 'CashOutRefinance',
  }
  const occupancyMap: Record<string, string> = {
    primary: 'PrimaryResidence',
    secondary: 'SecondaryResidence',
    investment: 'Investment',
  }
  const propertyMap: Record<string, string> = {
    sfr: 'SingleFamily',
    condo: 'Condominium',
    townhouse: 'Townhouse',
    '2unit': 'TwoUnit',
    '3unit': 'ThreeUnit',
    '4unit': 'FourUnit',
    '5-9unit': 'FiveToNineUnit',
  }
  const docTypeMap: Record<string, string> = {
    fullDoc: 'FullDocumentation',
    dscr: 'DebtServiceCoverageRatio',
    bankStatement: 'BankStatements12MoPersonal',
    assetDepletion: 'AssetUtilization',
    voe: 'VOE',
    noRatio: 'NoRatio',
  }
  const citizenshipMap: Record<string, string> = {
    usCitizen: 'UsCitizen',
    permanentResident: 'UsCitizen',
    foreignNational: 'ForeignNational',
  }

  const loanAmount = Number(String(body.loanAmount || 0).replace(/,/g, ''))
  const propertyValue = Number(String(body.propertyValue || 0).replace(/,/g, ''))
  const prepayMonths = parseInt(body.prepayPeriod) || 0

  return {
    loanAmount,
    appraisedValue: propertyValue,
    purchasePrice: body.loanPurpose === 'purchase' ? propertyValue : 0,
    fico: Number(body.creditScore) || 740,
    state: body.propertyState || 'CA',
    county: body.propertyCounty || '',
    zipCode: body.propertyZip || '',
    purpose: purposeMap[body.loanPurpose] || 'Purchase',
    occupancy: occupancyMap[body.occupancyType] || 'Investment',
    propertyType: propertyMap[body.propertyType] || 'SingleFamily',
    incomeDocumentation: docTypeMap[body.documentationType] || 'FullDocumentation',
    numberOfUnits: 1,
    escrow: body.impoundType === '0' ? 'Yes' : 'No',
    isFirstTimeHomebuyer: body.isFTHB || false,
    isFirstTimeInvestor: false,
    isShortTermRental: body.isShortTermRental || false,
    isRuralProperty: body.isRuralProperty || false,
    isSelfEmployed: body.isSelfEmployed || false,
    numberOfFinancedProperties: 1,
    prePaymentPenaltyTermInMonths: prepayMonths,
    citizenship: citizenshipMap[body.citizenship] || 'UsCitizen',
    lockPeriod: Number(body.lockPeriod) || 30,
    filter: { rule: 'BestByInvestor', targetPrice: 100 },
  }
}

// ================= BQL Scripts =================
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

function buildNavToIframeScript(): string {
  return `(async function() {
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  await sleep(2000);
  var iframes = document.getElementsByTagName('iframe');
  var iframe = null;
  for (var i = 0; i < iframes.length; i++) {
    if (iframes[i].src && iframes[i].src.indexOf('loannex') >= 0) { iframe = iframes[i]; break; }
    if (iframes[i].src && iframes[i].src.indexOf('nex-app') >= 0) { iframe = iframes[i]; break; }
  }
  if (!iframe && iframes.length > 0) iframe = iframes[0];
  if (iframe && iframe.src && iframe.src.length > 10) {
    window.location.href = iframe.src;
    await sleep(500);
    return JSON.stringify({ ok: true });
  }
  if (window.location.href.indexOf('webapp.loannex') >= 0) {
    return JSON.stringify({ ok: true, alreadyOnApp: true });
  }
  return JSON.stringify({ ok: false, error: 'no_iframe' });
})()`
}

function buildAngularLoginAndPriceScript(email: string, password: string, nexAppPayload: string): string {
  return `(async function() {
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  var result = { step: 'init' };

  // Poll for Angular login form
  var usernameField = null;
  var passwordField = null;
  for (var w = 0; w < 10; w++) {
    await sleep(1500);
    usernameField = document.getElementById('username');
    passwordField = document.getElementById('password');
    if (usernameField && passwordField) break;
  }

  if (usernameField && passwordField) {
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
    setInput(usernameField, '${email}');
    await sleep(300);
    setInput(passwordField, '${password}');
    await sleep(300);
    var signInBtn = document.querySelector('button.login-button') || document.querySelector('button');
    if (signInBtn) signInBtn.click();
    result.step = 'login_clicked';

    // Wait for login to complete (dashboard loads)
    for (var i = 0; i < 15; i++) {
      await sleep(1500);
      var jwt = '';
      try {
        var authResult = localStorage.getItem('authentication-result');
        if (authResult) { jwt = JSON.parse(authResult).authenticationToken || ''; }
      } catch(e) {}
      if (jwt) { result.step = 'authenticated'; break; }
    }
  }

  // Extract JWT and user info
  var jwt = '';
  var userGuid = '';
  try {
    var authResult = localStorage.getItem('authentication-result');
    if (authResult) jwt = JSON.parse(authResult).authenticationToken || '';
    userGuid = (localStorage.getItem('userGuid') || '').replace(/"/g, '');
  } catch(e) {}

  if (!jwt || !userGuid) {
    return JSON.stringify({ success: false, error: 'auth_failed', step: result.step });
  }

  // Call the pricing API
  var nexAppData = ${nexAppPayload};
  try {
    var resp = await fetch('${NEXAPI_BASE}/loans/apps/' + userGuid + '/quick-prices?worstCasePricing=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt },
      body: JSON.stringify({ data: nexAppData })
    });
    var body = await resp.text();
    return JSON.stringify({ success: true, status: resp.status, body: body });
  } catch(e) {
    return JSON.stringify({ success: false, error: e.message, step: 'api_call' });
  }
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
  if (!loannexUser || !loannexPassword) return res.json({ success: false, error: 'Loannex credentials not configured' })

  try {
    const body = req.body || {}
    const nexAppData = mapFormToNexApp(body)
    const nexAppPayload = JSON.stringify(nexAppData)

    const loginScript = buildLoginScript(loannexUser, loannexPassword)
    const waitScript = `(async function() { await new Promise(r => setTimeout(r, 5000)); return JSON.stringify({ ok: true }); })()`
    const navScript = buildNavToIframeScript()
    const priceScript = buildAngularLoginAndPriceScript(loannexUser, loannexPassword, nexAppPayload)

    const bqlQuery = `mutation LoginAndPrice {
  loginPage: goto(url: "${LOANNEX_URL}", waitUntil: networkIdle) { status time }
  login: evaluate(content: ${JSON.stringify(loginScript)}, timeout: 8000) { value }
  waitForRedirect: evaluate(content: ${JSON.stringify(waitScript)}, timeout: 8000) { value }
  navToAngular: evaluate(content: ${JSON.stringify(navScript)}, timeout: 10000) { value }
  price: evaluate(content: ${JSON.stringify(priceScript)}, timeout: 35000) { value }
}`

    const bqlResp = await fetch(`${BROWSERLESS_URL}?token=${browserlessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: bqlQuery }),
      signal: AbortSignal.timeout(55000),
    })

    if (!bqlResp.ok) {
      const errText = await bqlResp.text()
      return res.json({ success: false, error: `Browserless error: ${bqlResp.status}`, debug: errText.substring(0, 300) })
    }

    const bqlResult = await bqlResp.json()

    if (bqlResult.errors && !bqlResult.data) {
      return res.json({ success: false, error: 'BQL execution error' })
    }

    // Parse the pricing result from step 5
    let priceData: any = null
    try {
      const raw = bqlResult.data?.price?.value
      priceData = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null
    } catch { priceData = null }

    if (!priceData || !priceData.success) {
      return res.json({
        success: false,
        error: priceData?.error || 'Failed to get pricing from Loannex',
        step: priceData?.step || 'unknown',
      })
    }

    // Parse the Loannex API response
    let apiData: any = null
    try {
      apiData = typeof priceData.body === 'string' ? JSON.parse(priceData.body) : priceData.body
    } catch { apiData = null }

    if (!apiData || apiData.status !== 'Success') {
      return res.json({
        success: false,
        error: 'Loannex API returned error',
        apiStatus: apiData?.status,
      })
    }

    // Transform prices into rate options
    const lnData = apiData.data || {}
    const prices = lnData.prices || []
    const programs = lnData.programs || []
    const investors = lnData.investors || []

    const rateOptions = prices.map((p: any) => ({
      rate: p.rate || 0,
      price: p.price || 0,
      payment: p.payment || 0,
      points: p.points || 0,
      apr: p.apr || 0,
      program: p.programName || p.programCode || '',
      investor: p.investorName || '',
      lockPeriod: p.lockPeriod || 0,
      status: p.status || '',
    }))

    return res.json({
      success: true,
      data: {
        rateOptions,
        programCount: programs.length,
        investorCount: investors.length,
        totalPrices: prices.length,
        hasIneligible: lnData.hasIneligiblePrograms || false,
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
