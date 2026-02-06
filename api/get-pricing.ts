import type { VercelRequest, VercelResponse } from '@vercel/node'

const PRICER_URL = 'https://webservices.mortgage.meridianlink.com/los/webservice/QuickPricer.asmx'
const OAUTH_URL = 'https://secure.mortgage.meridianlink.com/oauth/token'

// ================= OAuth Token =================
let cachedToken: { token: string; expiresAt: number } | null = null

async function getOAuthToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token
  }

  const clientId = process.env.MERIDIANLINK_CLIENT_ID || process.env.CLIENT_ID || ''
  const clientSecret = process.env.MERIDIANLINK_CLIENT_SECRET || process.env.CLIENT_SECRET || ''

  const response = await fetch(OAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
    signal: AbortSignal.timeout(10000),
  })

  if (!response.ok) {
    throw new Error(`OAuth token request failed: HTTP ${response.status}`)
  }

  const data = await response.json()
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 300) * 1000,
  }
  return cachedToken.token
}

// ================= ENUM MAPPING FUNCTIONS =================
function mapLoanPurpose(purpose: string): number {
  const map: Record<string, number> = { purchase: 1, refinance: 2, cashout: 3 }
  return map[purpose] || 1
}

function mapOccupancy(occupancy: string): number {
  const map: Record<string, number> = { primary: 1, secondary: 2, investment: 3 }
  return map[occupancy] || 1
}

function mapPropertyType(type: string): number {
  const map: Record<string, number> = { sfr: 1, condo: 2, townhouse: 3, '2unit': 4, '3unit': 5, '4unit': 6, '5-9unit': 7 }
  return map[type] || 1
}

function mapIncomeDocType(documentationType: string): number {
  const map: Record<string, number> = {
    fullDoc: 1,
    altDoc: 2,
    bankStatement: 3,
    bankStatement12: 3,
    bankStatement24: 3,
    bankStatementOther: 3,
    taxReturns1Yr: 2,
    assetDepletion: 4,
    assetUtilization: 4,
    dscr: 5,
    voe: 6,
    noRatio: 7,
  }
  return map[documentationType] || 1
}

function mapDSCRRatio(dscrRatio: string): number {
  const map: Record<string, number> = {
    '>=1.250': 1,
    '1.150-1.249': 2,
    '1.00-1.149': 3,
    '0.750-0.999': 4,
    '0.500-0.749': 5,
    'noRatio': 6,
  }
  return map[dscrRatio || '1.00-1.149'] || 3
}

function escapeXml(unsafe: string): string {
  if (!unsafe) return ''
  return String(unsafe).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function unescapeXml(escaped: string): string {
  if (!escaped) return ''
  return escaped.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
}

function normalizeFormData(data: any): any {
  const norm = { ...data }
  if (data.fico && !data.creditScore) norm.creditScore = data.fico
  if (data.zipCode && !data.propertyZip) norm.propertyZip = data.zipCode
  if (data.state && !data.propertyState) norm.propertyState = data.state
  if (data.purchasePrice && !data.propertyValue) norm.propertyValue = data.purchasePrice

  if (data.occupancy) {
    const occ = data.occupancy.toLowerCase()
    if (occ.includes('primary')) norm.occupancyType = 'primary'
    else if (occ.includes('second')) norm.occupancyType = 'secondary'
    else if (occ.includes('invest')) norm.occupancyType = 'investment'
  }

  if (data.propertyType) {
    const prop = data.propertyType.toLowerCase()
    if (prop.includes('single')) norm.propertyType = 'sfr'
    else if (prop.includes('condo')) norm.propertyType = 'condo'
    else if (prop.includes('town')) norm.propertyType = 'townhouse'
    else if (prop.includes('2-4')) norm.propertyType = '2unit'
    else if (prop.includes('5-9') || prop.includes('5+')) norm.propertyType = '5-9unit'
  }

  if (data.loanPurpose) {
    const purp = data.loanPurpose.toLowerCase()
    if (purp.includes('purchase')) norm.loanPurpose = 'purchase'
    else if (purp.includes('refi')) norm.loanPurpose = 'refinance'
    else if (purp.includes('cash')) norm.loanPurpose = 'cashout'
  }

  if (data.incomeDocType) {
    const doc = data.incomeDocType.toLowerCase()
    if (doc.includes('full')) norm.documentationType = 'fullDoc'
    else if (doc.includes('dscr') || doc.includes('investor')) norm.documentationType = 'dscr'
    else if (doc.includes('bank')) norm.documentationType = 'bankStatement'
    else if (doc.includes('asset')) norm.documentationType = 'assetUtilization'
    else if (doc.includes('voe')) norm.documentationType = 'voe'
    else if (doc.includes('1099')) norm.documentationType = 'altDoc'
    else if (doc.includes('no ratio') || doc.includes('noratio')) norm.documentationType = 'noRatio'
  }

  return norm
}

function buildLOXmlFormat(formData: any): string {
  const loanAmount = Number(formData.loanAmount) || 400000
  const propertyValue = Number(formData.propertyValue) || 500000
  const downPaymentPct = ((propertyValue - loanAmount) / propertyValue) * 100
  const docType = formData.documentationType || 'fullDoc'
  const loanType = formData.loanType || 'nonqm'
  const isDSCR = docType === 'dscr' || loanType === 'dscr'
  const amort = formData.amortization || 'fixed'
  const isARM = amort.startsWith('arm')
  const isInterestOnly = formData.paymentType === 'io'
  const lockDays = parseInt(formData.lockPeriod) || 30

  // PPP (Prepayment Penalty) is ONLY for Investment properties
  const isInvestment = formData.occupancyType === 'investment'
  const includePPP = isInvestment // Only include PPP programs for Investment

  return `<LOXmlFormat version="1.0">
  <loan>
    <field id="sSpZip">${escapeXml(formData.propertyZip || '')}</field>
    <field id="sSpStatePe">${escapeXml(formData.propertyState || 'CA')}</field>
    <field id="sSpCounty">${escapeXml(formData.propertyCounty || '')}</field>
    <field id="sOccTPe">${isDSCR ? 3 : mapOccupancy(formData.occupancyType || 'primary')}</field>
    <field id="sProdSpT">${mapPropertyType(formData.propertyType || 'sfr')}</field>
    <field id="sProdIsSpInRuralArea">${formData.isRuralProperty || false}</field>
    <field id="sLPurposeTPe">${mapLoanPurpose(formData.loanPurpose || 'purchase')}</field>
    <field id="sHouseValPe">${propertyValue}</field>
    <field id="sDownPmtPcPe">${downPaymentPct.toFixed(2)}</field>
    <field id="sLAmtCalcPe">${loanAmount}</field>
    <field id="sTotalRenovationCosts">0</field>
    <field id="sProdImpound">${formData.impoundType === 'escrowed'}</field>
    <field id="sProdRLckdDays">${lockDays}</field>
    <field id="sCreditScoreEstimatePe">${formData.creditScore || 740}</field>
    <field id="aBTotalScoreIsFthbQP">${formData.isFTHB || false}</field>
    <field id="sIncomeDocumentationType">${mapIncomeDocType(isDSCR ? 'dscr' : docType)}</field>
    ${isDSCR ? `<field id="aDSCR %">${mapDSCRRatio(formData.dscrRatio)}</field>` : ''}
    ${isDSCR ? `<field id="aOccupancyRate">${formData.occupancyRate || 100}</field>` : ''}
    <field id="sProdFilterPrepayNone">true</field>
    <field id="sProdFilterPrepayHasPPP">${includePPP}</field>
    <field id="sProdFilterInclNoPPP">true</field>
    <field id="sProdFilterInclPPP">${includePPP}</field>
    <field id="sProdFilterPPP0">${includePPP}</field>
    <field id="sProdIncludeNormalProc">true</field>
    <field id="sProdFilterProdNonQM">true</field>
    <field id="sProdFilterDue30Yrs">true</field>
    <field id="sProdFilterDue40Yrs">true</field>
    <field id="sProdFilterFinMethFixed">${!isARM}</field>
    <field id="sProdFilterFinMethOther">${isARM}</field>
    <field id="sProdFilterPmtTPI">${!isInterestOnly}</field>
    <field id="sProdFilterPmtTIOnly">${isInterestOnly}</field>
  </loan>
</LOXmlFormat>`
}

function buildSOAPRequest(authTicket: string, formData: any): string {
  const loXml = buildLOXmlFormat(formData)

  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:los="http://www.lendersoffice.com/los/webservices/">
  <soap:Body>
    <los:RunQuickPricerV2>
      <los:authorizationTicket>${escapeXml(authTicket)}</los:authorizationTicket>
      <los:xmlInput>${escapeXml(loXml)}</los:xmlInput>
    </los:RunQuickPricerV2>
  </soap:Body>
</soap:Envelope>`
}

function getAttr(tag: string, attr: string): string {
  const match = tag.match(new RegExp(`${attr}="([^"]*)"`, 'i'))
  return match ? match[1] : ''
}

function parseSOAPResponse(xmlString: string): any {
  const level1 = unescapeXml(xmlString)
  const level2 = unescapeXml(level1)

  const programs: any[] = []

  const programRegex = /<Program\s([^>]+)>([\s\S]*?)<\/Program>/gi
  let programMatch
  while ((programMatch = programRegex.exec(level2)) !== null) {
    const progAttrs = programMatch[1]
    const progBody = programMatch[2]

    const programName = getAttr(progAttrs, 'Name')
    const status = getAttr(progAttrs, 'Status')
    const term = getAttr(progAttrs, 'Term')
    const finMethod = getAttr(progAttrs, 'FinMethT')
    const loanType = getAttr(progAttrs, 'LoanType')
    const parRate = getAttr(progAttrs, 'ParRate')
    const parPoints = getAttr(progAttrs, 'ParPoints')
    const investor = getAttr(progAttrs, 'ProductType')
    const lockDays = getAttr(progAttrs, 'sProdRLckdDays')

    const rateOptions: any[] = []
    // Match RateOption with potential nested content (adjustments)
    const rateRegex = /<RateOption\s([^>]*)(?:\/>|>([\s\S]*?)<\/RateOption>)/gi
    let rateMatch
    while ((rateMatch = rateRegex.exec(progBody)) !== null) {
      const rAttrs = rateMatch[1]
      const rateBody = rateMatch[2] || ''

      // Parse adjustments from within RateOption
      const adjustments: any[] = []
      const adjRegex = /<Adjustment\s([^>]*)\/?>/gi
      let adjMatch
      while ((adjMatch = adjRegex.exec(rateBody)) !== null) {
        const adjAttrs = adjMatch[1]
        adjustments.push({
          description: getAttr(adjAttrs, 'Description') || getAttr(adjAttrs, 'Name'),
          amount: parseFloat(getAttr(adjAttrs, 'Amount')) || parseFloat(getAttr(adjAttrs, 'Price')) || 0,
          rateAdj: parseFloat(getAttr(adjAttrs, 'RateAdj')) || parseFloat(getAttr(adjAttrs, 'Rate')) || 0,
        })
      }

      rateOptions.push({
        rate: parseFloat(getAttr(rAttrs, 'Rate')) || 0,
        points: parseFloat(getAttr(rAttrs, 'Point')) || 0,
        apr: parseFloat(getAttr(rAttrs, 'APR')) || 0,
        payment: parseFloat(getAttr(rAttrs, 'Payment')) || 0,
        description: getAttr(rAttrs, 'Description'),
        investor: getAttr(rAttrs, 'lLpInvestorNm'),
        status: getAttr(rAttrs, 'Status'),
        bestPrice: getAttr(rAttrs, 'BestPrice') === 'True',
        totalClosingCost: parseFloat(getAttr(rAttrs, 'TotalClosingCost')) || 0,
        cashToClose: parseFloat(getAttr(rAttrs, 'CashToClose')) || 0,
        adjustments: adjustments.length > 0 ? adjustments : undefined,
      })
    }

    const bestOption = rateOptions.find(r => r.bestPrice)
      || rateOptions.find(r => r.status === 'Available')
      || rateOptions[0]

    if (programName && bestOption) {
      programs.push({
        name: programName,
        programName,
        status,
        term: parseInt(term) || 360,
        finMethod,
        loanType,
        parRate: parseFloat(parRate) || 0,
        parPoints: parseFloat(parPoints) || 0,
        investor,
        lockDays: parseInt(lockDays) || 30,
        rate: bestOption.rate,
        apr: bestOption.apr,
        points: bestOption.points,
        payment: bestOption.payment,
        description: bestOption.description,
        investorName: bestOption.investor,
        totalClosingCost: bestOption.totalClosingCost,
        cashToClose: bestOption.cashToClose,
        rateOptions,
      })
    }
  }

  programs.sort((a, b) => {
    const aEligible = a.status === 'Eligible' ? 0 : 1
    const bEligible = b.status === 'Eligible' ? 0 : 1
    if (aEligible !== bEligible) return aEligible - bEligible
    return a.rate - b.rate
  })

  return { programs, totalPrograms: programs.length }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' })

  try {
    const formData = normalizeFormData(req.body)

    const oauthToken = await getOAuthToken()
    const authTicket = `Bearer ${oauthToken}`

    const soapRequest = buildSOAPRequest(authTicket, formData)

    const response = await fetch(PRICER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://www.lendersoffice.com/los/webservices/RunQuickPricerV2',
      },
      body: soapRequest,
      signal: AbortSignal.timeout(25000),
    })

    const responseText = await response.text()

    if (!response.ok) {
      return res.json({ success: false, error: `MeridianLink returned HTTP ${response.status}` })
    }

    if (responseText.includes('status=&quot;Error&quot;') || responseText.includes('status="Error"')) {
      const errorMatch = responseText.match(/Error[>"']>([^<]+)</)
      const mlError = errorMatch?.[1] || 'Unknown pricing error'
      return res.json({ success: false, error: mlError })
    }

    const resultMatch = responseText.match(/<RunQuickPricerV2Result>([\s\S]*?)<\/RunQuickPricerV2Result>/)
    const resultXml = resultMatch ? resultMatch[1] : responseText

    const result = parseSOAPResponse(resultXml)

    // Filter eligible programs
    let eligiblePrograms = result.programs.filter((p: any) => p.status === 'Eligible')

    // For Primary/Secondary: filter out ALL PPP programs (PPP is Investment only)
    const isInvestment = formData.occupancyType === 'investment'
    if (!isInvestment) {
      // Helper to check if program has PPP in name/description
      const hasPPP = (text: string) => text && text.toUpperCase().includes('PPP')

      eligiblePrograms = eligiblePrograms.filter((p: any) => {
        // Check program name
        if (hasPPP(p.programName) || hasPPP(p.name)) return false
        // Check description
        if (hasPPP(p.description)) return false
        // Also filter rate options to remove any PPP descriptions
        if (p.rateOptions) {
          p.rateOptions = p.rateOptions.filter((ro: any) => !hasPPP(ro.description))
        }
        return p.rateOptions && p.rateOptions.length > 0
      })
    }

    if (eligiblePrograms.length === 0) {
      return res.json({
        success: false,
        error: 'No programs found. Please adjust your scenario.',
        allPrograms: result.programs.map((p: any) => ({
          programName: p.programName,
          status: p.status,
          rateOptionsCount: p.rateOptions?.length || 0,
          sampleRateDesc: p.rateOptions?.[0]?.description || 'N/A',
        })),
        debug: {
          isInvestment,
          occupancyType: formData.occupancyType,
          eligibleCount: result.programs.filter((p: any) => p.status === 'Eligible').length,
        }
      })
    }

    const loanAmount = Number(formData.loanAmount) || 400000
    const topProgram = eligiblePrograms[0]
    const rate = topProgram.rate
    const monthlyPayment = rate > 0
      ? (loanAmount * (rate / 1200)) / (1 - Math.pow(1 + (rate / 1200), -(topProgram.term || 360)))
      : 0
    const ltvRatio = (loanAmount / (Number(formData.propertyValue) || 500000)) * 100

    return res.json({
      success: true,
      data: {
        rate: topProgram.rate,
        apr: topProgram.apr,
        monthlyPayment: Math.round(monthlyPayment),
        points: topProgram.points,
        closingCosts: topProgram.totalClosingCost || '',
        ltvRatio,
        programName: topProgram.programName,
        investorName: topProgram.investorName || '',
        programs: eligiblePrograms,
        totalPrograms: eligiblePrograms.length,
        source: 'meridianlink',
      },
    })
  } catch (error) {
    console.error('API error:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get pricing',
    })
  }
}
