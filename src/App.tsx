import { useState, useEffect } from 'react'
import { Calculator, DollarSign, Loader2, CheckCircle2, AlertCircle, Info, ChevronDown, ChevronUp, Menu, X, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency, formatPercent } from '@/lib/utils'
import { validateFormBeforeSubmit } from '@/lib/PricingLogic'

interface LoanData {
  // Loan Information
  lienPosition: string
  ltv: string
  lockPeriod: string
  loanType: string
  loanPurpose: string
  cashoutAmount: string
  loanAmount: string
  propertyValue: string
  // Location
  propertyZip: string
  propertyState: string
  propertyCounty: string
  propertyCity: string
  // Property Details
  occupancyType: string
  propertyType: string
  structureType: string
  isRuralProperty: boolean
  isNonWarrantableProject: boolean
  // Borrower Details
  creditScore: string
  isSelfEmployed: boolean
  dti: string
  citizenship: string
  isFTHB: boolean
  // Loan Terms
  loanTerm: string
  amortization: string
  product: string
  paymentType: string
  impoundType: string
  // Investor Details (conditional)
  prepayPeriod: string
  prepayType: string
  dscrEntityType: string
  dscrRatio: string
  presentHousingExpense: string
  grossRent: string
  // Other Details
  isSeasonalProperty: boolean
  loanOriginatorPaidBy: string
  temporaryBuydowns: string
  isCrossCollateralized: boolean
  isMixedUsePML: boolean
  is5PlusUnits: boolean
  isShortTermRental: boolean
  isVestedInLLCOrCorp: boolean
  hasITIN: boolean
  isAVMOrCDA: boolean
  documentationType: string
}

interface Adjustment {
  description: string
  amount: number      // Price adjustment (e.g., -1.500, 0.500)
  rateAdj?: number    // Rate adjustment (e.g., 0.000%, 0.125%)
  percentage?: number // Alternative rate field
}

interface RateOption {
  rate: number
  points: number
  apr: number
  description: string
  price?: number
  payment?: number
  miMonthlyPayment?: number
  totalClosingCost?: number
  prepaidClosingCost?: number
  nonPrepaidClosingCost?: number
  margin?: number
  dti?: number
  investorName?: string
  breakEven?: string
  reserves?: string
  lenderPaidComp?: number
  lenderPaidCompAmount?: number
  pitia?: number
  qualRate?: number
  qualPmt?: number
  cashToClose?: number
  status?: string
  adjustments?: Adjustment[]
}

interface Program {
  name: string
  status?: string
  term?: number
  due?: number
  productType?: string
  finMethT?: string
  parRate?: number
  parPoints?: number
  armIndex?: number
  armIndexName?: string
  rateOptions: RateOption[]
}

interface PricingResult {
  rate: number
  apr: number
  monthlyPayment: number
  points: number
  closingCosts: number
  ltvRatio: number
  source?: string
  programs?: Program[]
  apiError?: string
  totalPrograms?: number
  filterApplied?: string
  debug?: {
    rawProgramsFound: number
    rawRateOptionsFound: number
    formattedProgramsCount: number
    hasPricingResultsField: boolean
    xmlPreview: string
    pricingResultsPreview?: string
  }
}

type ValidationErrors = Partial<Record<keyof LoanData, string>>

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']

const REQUIRED_FIELDS: (keyof LoanData)[] = ['loanPurpose', 'loanAmount', 'propertyValue', 'propertyZip', 'propertyState', 'propertyType', 'occupancyType', 'creditScore', 'dti', 'loanTerm']

const FIELD_LABELS: Record<string, string> = {
  lienPosition: 'Lien Position', loanType: 'Loan Type', loanPurpose: 'Loan Purpose', loanAmount: 'Loan Amount',
  propertyValue: 'Home Value/Sales Price', propertyZip: 'ZIP Code', propertyState: 'State', propertyCounty: 'County',
  propertyCity: 'City', propertyType: 'Property Type', occupancyType: 'Property Use', creditScore: 'Credit Score',
  dti: 'DTI', loanTerm: 'Loan Term', cashoutAmount: 'Cashout Amount', structureType: 'Structure Type',
  amortization: 'Amortization', product: 'Product', paymentType: 'Payment', impoundType: 'Impound Type'
}

// ZIP code to location lookup cache (auto-populated from API + preset values)
const ZIP_LOOKUP: Record<string, { city: string; county: string; state: string }> = {
  '90210': { city: 'Beverly Hills', county: 'Los Angeles', state: 'CA' },
  '90120': { city: 'Beverly Hills', county: 'Los Angeles', state: 'CA' },
  '10001': { city: 'New York', county: 'New York', state: 'NY' },
  '33101': { city: 'Miami', county: 'Miami-Dade', state: 'FL' },
  '60601': { city: 'Chicago', county: 'Cook', state: 'IL' },
  '75201': { city: 'Dallas', county: 'Dallas', state: 'TX' },
  '85001': { city: 'Phoenix', county: 'Maricopa', state: 'AZ' },
  '98101': { city: 'Seattle', county: 'King', state: 'WA' },
}

// Helper to safely format numbers with fallback
const safeNumber = (value: unknown, fallback: number = 0): number => {
  if (typeof value === 'number' && !isNaN(value)) return value
  if (typeof value === 'string') {
    const parsed = parseFloat(value)
    if (!isNaN(parsed)) return parsed
  }
  return fallback
}

// Sanitize and validate pricing result from API
const sanitizePricingResult = (data: unknown): PricingResult | null => {
  if (!data || typeof data !== 'object') return null

  const raw = data as Record<string, unknown>

  // Sanitize programs array
  let programs: Program[] | undefined
  if (Array.isArray(raw.programs)) {
    programs = raw.programs
      .filter((p): p is Record<string, unknown> => p && typeof p === 'object')
      .map(p => ({
        name: String(p.name || 'Unknown Program'),
        parRate: safeNumber(p.parRate),
        parPoints: safeNumber(p.parPoints),
        rateOptions: Array.isArray(p.rateOptions)
          ? p.rateOptions
              .filter((o): o is Record<string, unknown> => o && typeof o === 'object')
              .map(o => ({
                rate: safeNumber(o.rate),
                points: safeNumber(o.points),
                apr: safeNumber(o.apr),
                description: String(o.description || ''),
                payment: safeNumber(o.payment),
                adjustments: Array.isArray(o.adjustments) ? o.adjustments.map((adj: any) => ({
                  description: String(adj.description || ''),
                  amount: safeNumber(adj.amount),
                  rateAdj: safeNumber(adj.rateAdj)
                })) : []
              }))
          : []
      }))
  }

  return {
    rate: safeNumber(raw.rate, 0),
    apr: safeNumber(raw.apr, 0),
    monthlyPayment: safeNumber(raw.monthlyPayment, 0),
    points: safeNumber(raw.points, 0),
    closingCosts: safeNumber(raw.closingCosts, 0),
    ltvRatio: safeNumber(raw.ltvRatio, 0),
    source: typeof raw.source === 'string' ? raw.source : undefined,
    programs,
    apiError: typeof raw.apiError === 'string' ? raw.apiError : undefined,
    totalPrograms: typeof raw.totalPrograms === 'number' ? raw.totalPrograms : undefined,
    filterApplied: typeof raw.filterApplied === 'string' ? raw.filterApplied : undefined
  }
}

const DEFAULT_FORM_DATA: LoanData = {
  lienPosition: '1st',
  ltv: '75',
  lockPeriod: '30',
  loanType: 'nonqm',
  loanPurpose: 'purchase',
  cashoutAmount: '',
  loanAmount: '600,000',
  propertyValue: '800,000',
  propertyZip: '90210',
  propertyState: 'CA',
  propertyCounty: 'Los Angeles',
  propertyCity: 'Beverly Hills',
  occupancyType: 'primary',
  propertyType: 'sfr',
  structureType: 'detached',
  isRuralProperty: false,
  isNonWarrantableProject: false,
  creditScore: '740',
  isSelfEmployed: true,
  dti: '36',
  citizenship: 'usCitizen',
  isFTHB: false,
  loanTerm: '30',
  amortization: 'fixed',
  product: 'conventional',
  paymentType: 'pi',
  impoundType: 'escrowed',
  prepayPeriod: '36mo',
  prepayType: '5pct',
  dscrEntityType: 'individual',
  dscrRatio: '1.00-1.149',
  presentHousingExpense: '5,000',
  grossRent: '5,000',
  isSeasonalProperty: false,
  loanOriginatorPaidBy: 'borrower',
  temporaryBuydowns: 'none',
  isCrossCollateralized: false,
  isMixedUsePML: false,
  is5PlusUnits: false,
  isShortTermRental: false,
  isVestedInLLCOrCorp: false,
  hasITIN: false,
  isAVMOrCDA: false,
  documentationType: 'fullDoc'
}

export default function App() {
  const [formData, setFormData] = useState<LoanData>(DEFAULT_FORM_DATA)
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<PricingResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({})
  const [expandedProgram, setExpandedProgram] = useState<string | null>(null)
  const [showOtherDetails, setShowOtherDetails] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [lpResult, setLpResult] = useState<any>(null)
  const [lpLoading, setLpLoading] = useState(false)

  useEffect(() => {
    if (!isLoading) { setLoadingProgress(0); return }
    setLoadingProgress(10)
    const timer = setTimeout(() => setLoadingProgress(92), 300)
    return () => clearTimeout(timer)
  }, [isLoading])

  // Auto-populate location from ZIP using API lookup
  const [zipLoading, setZipLoading] = useState(false)
  useEffect(() => {
    if (formData.propertyZip.length === 5) {
      // First check local cache
      const cachedLocation = ZIP_LOOKUP[formData.propertyZip]
      if (cachedLocation) {
        setFormData(prev => ({
          ...prev,
          propertyCity: cachedLocation.city,
          propertyCounty: cachedLocation.county,
          propertyState: cachedLocation.state
        }))
        return
      }

      // Fetch from Zippopotam.us API (free, no key required)
      const fetchZipData = async () => {
        setZipLoading(true)
        try {
          const response = await fetch(`https://api.zippopotam.us/us/${formData.propertyZip}`)
          if (response.ok) {
            const data = await response.json()
            if (data.places && data.places.length > 0) {
              const place = data.places[0]
              setFormData(prev => ({
                ...prev,
                propertyCity: place['place name'] || '',
                propertyCounty: place['county'] || place['place name'] || '',
                propertyState: place['state abbreviation'] || ''
              }))
              // Cache the result
              ZIP_LOOKUP[formData.propertyZip] = {
                city: place['place name'] || '',
                county: place['county'] || place['place name'] || '',
                state: place['state abbreviation'] || ''
              }
            }
          }
        } catch (err) {
          console.log('ZIP lookup failed:', err)
        } finally {
          setZipLoading(false)
        }
      }
      fetchZipData()
    }
  }, [formData.propertyZip])

  const handleInputChange = (field: keyof LoanData, value: string | boolean) => {
    // Clear stale pricing results when any form field changes after pricing
    if (result) {
      setResult(null)
      setLpResult(null)
      setExpandedProgram(null)
    }

    setFormData(prev => {
      const updated = { ...prev, [field]: value }

      // Bidirectional LTV <-> Loan Amount calculation
      if (field === 'ltv' && typeof value === 'string') {
        // LTV changed -> recalculate Loan Amount
        const ltvVal = parseFloat(value) || 0
        const propVal = Number(prev.propertyValue.replace(/,/g, '')) || 0
        if (propVal > 0 && ltvVal > 0) {
          updated.loanAmount = Math.round(propVal * (ltvVal / 100)).toLocaleString()
        }
      }
      if (field === 'propertyValue' && typeof value === 'string') {
        // Property Value changed -> keep LTV, recalculate Loan Amount
        const propVal = Number(value.replace(/,/g, '')) || 0
        const ltvVal = parseFloat(prev.ltv) || 0
        if (propVal > 0 && ltvVal > 0) {
          updated.loanAmount = Math.round(propVal * (ltvVal / 100)).toLocaleString()
        }
      }
      if (field === 'loanAmount' && typeof value === 'string') {
        // Loan Amount changed -> recalculate LTV
        const loanAmt = Number(value.replace(/,/g, '')) || 0
        const propVal = Number(prev.propertyValue.replace(/,/g, '')) || 0
        if (propVal > 0 && loanAmt > 0) {
          const newLtv = (loanAmt / propVal) * 100
          updated.ltv = parseFloat(newLtv.toFixed(2)).toString()
        }
      }

      // Auto-sync documentationType when loanType changes to DSCR
      if (field === 'loanType' && value === 'dscr') {
        updated.documentationType = 'dscr'
      }
      // DSCR Income Doc Type: Auto-default occupancy to Investment (but keep loanType as nonqm)
      if (field === 'documentationType' && value === 'dscr') {
        updated.occupancyType = 'investment'
        // Keep loanType as nonqm - don't change it
      }
      // Auto-set hasITIN when citizenship is ITIN
      if (field === 'citizenship') {
        updated.hasITIN = value === 'itin'
      }
      return updated
    })
    setError(null)
    if (validationErrors[field]) {
      setValidationErrors(prev => { const next = { ...prev }; delete next[field]; return next })
    }
  }

  const formatNumberInput = (value: string) => {
    const num = value.replace(/[^0-9]/g, '')
    return num ? Number(num).toLocaleString() : ''
  }

  const validateForm = (): boolean => {
    const errors: ValidationErrors = {}
    REQUIRED_FIELDS.forEach(field => {
      const value = formData[field]
      if (typeof value === 'string' && (!value || value.trim() === '')) {
        errors[field] = `${FIELD_LABELS[field] || field} is required`
      }
    })
    const loanAmt = Number(formData.loanAmount.replace(/,/g, ''))
    const propVal = Number(formData.propertyValue.replace(/,/g, ''))
    if (formData.loanAmount && loanAmt < 50000) errors.loanAmount = 'Minimum loan amount is $50,000'
    if (formData.loanAmount && loanAmt > 5000000) errors.loanAmount = 'Maximum loan amount is $5,000,000'
    if (formData.propertyValue && propVal < 125000) errors.propertyValue = 'Minimum property value is $125,000'
    if (formData.propertyValue && propVal > 100000000) errors.propertyValue = 'Maximum property value is $100,000,000'
    if (formData.loanAmount && formData.propertyValue && loanAmt > propVal) errors.loanAmount = 'Loan amount cannot exceed property value'

    // LTV max 90%
    if (formData.loanAmount && formData.propertyValue && loanAmt > 0 && propVal > 0) {
      const ltv = (loanAmt / propVal) * 100
      if (ltv > 90) {
        errors.loanAmount = `Maximum LTV is 90%. Current LTV: ${ltv.toFixed(1)}%`
      }
    }

    // CRITICAL: Cash-Out Refinance LTV Validation - Max 85% LTV
    if (formData.loanPurpose === 'cashout' && loanAmt > 0 && propVal > 0) {
      const ltv = (loanAmt / propVal) * 100
      if (ltv > 85) {
        errors.loanAmount = `Cash-out refinance max LTV is 85%. Current LTV: ${ltv.toFixed(1)}%`
      }
    }

    // CRITICAL: DSCR loans are ONLY for Investment properties
    if (formData.documentationType === 'dscr' && formData.occupancyType !== 'investment') {
      errors.documentationType = 'DSCR loans are only available for Investment properties'
    }

    const creditScore = Number(formData.creditScore)
    if (formData.creditScore && (creditScore < 620 || creditScore > 999)) errors.creditScore = 'Credit score must be 620-999'
    const dti = Number(formData.dti)
    if (formData.dti && (dti < 1 || dti > 55)) errors.dti = 'DTI must be 1-55%'
    if (formData.propertyZip && formData.propertyZip.length !== 5) errors.propertyZip = 'ZIP must be 5 digits'
    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  // Calculate DSCR from Gross Rent and Present Housing Expense
  const calculatedDSCR = (() => {
    const rent = Number(formData.grossRent.replace(/,/g, '')) || 0
    const expense = Number(formData.presentHousingExpense.replace(/,/g, '')) || 0
    if (expense === 0) return { ratio: 0, range: 'noRatio', display: 'N/A' }
    const ratio = rent / expense
    let range = 'noRatio'
    if (ratio >= 1.250) range = '>=1.250'
    else if (ratio >= 1.150) range = '1.150-1.249'
    else if (ratio >= 1.000) range = '1.00-1.149'
    else if (ratio >= 0.750) range = '0.750-0.999'
    else if (ratio >= 0.500) range = '0.500-0.749'
    else range = 'noRatio'
    return { ratio, range, display: ratio.toFixed(3) }
  })()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) { setError('Please fix the errors above'); return }

    // Pre-submit validation via PricingLogic (prevents fake/invalid data from reaching API)
    const preCheck = validateFormBeforeSubmit(formData)
    if (!preCheck.isValid) {
      setError(preCheck.errors.join('. '))
      return
    }

    setIsLoading(true); setError(null); setResult(null); setLpResult(null); setLpLoading(true)
    const isDSCR = formData.documentationType === 'dscr'
    const requestBody = {
      ...formData,
      loanType: 'nonqm',
      product: 'conventional',
      loanAmount: Number(formData.loanAmount.replace(/,/g, '')),
      propertyValue: Number(formData.propertyValue.replace(/,/g, '')),
      cashoutAmount: formData.cashoutAmount ? Number(formData.cashoutAmount.replace(/,/g, '')) : 0,
      creditScore: Number(formData.creditScore),
      dti: Number(formData.dti),
      ltv: parseFloat(formData.ltv) || 0,
      presentHousingExpense: isDSCR ? Number(formData.presentHousingExpense.replace(/,/g, '')) : undefined,
      grossRent: isDSCR ? Number(formData.grossRent.replace(/,/g, '')) : undefined,
      dscrRatio: isDSCR ? calculatedDSCR.range : undefined,
      dscrValue: isDSCR ? calculatedDSCR.ratio : undefined
    }

    // Fire ML + LP in PARALLEL (LP takes ~20-30s via headless browser)
    const bodyJson = JSON.stringify(requestBody)

    // LP fires immediately — no waiting for ML
    fetch('/api/get-lp-pricing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: bodyJson,
    })
      .then(r => r.json())
      .then(lpData => {
        console.log('[LP] rates:', lpData.data?.rateOptions?.length || 0)
        if (lpData.success && lpData.data) {
          setLpResult(lpData.data)
        } else {
          setLpResult({ rateOptions: [], error: lpData.error || 'No rates returned' })
        }
      })
      .catch(err => {
        console.error('[LP] Error:', err)
        setLpResult({ rateOptions: [], error: 'LP pricing unavailable' })
      })
      .finally(() => setLpLoading(false))

    // ML fires in parallel
    try {
      const mlResponse = await fetch('/api/get-pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyJson,
      })
      const mlData = await mlResponse.json()

      if (mlData.success) {
        const sanitizedResult = sanitizePricingResult(mlData.data)
        if (sanitizedResult) {
          setResult(sanitizedResult)
        } else {
          setError('Invalid pricing response from server')
        }
      } else {
        setError(mlData.error || 'Pricing request failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get pricing')
    } finally {
      setIsLoading(false)
    }
  }

  const hasError = (field: keyof LoanData) => !!validationErrors[field]
  const showInvestorDetails = formData.occupancyType === 'investment'
  const showCashoutField = formData.loanPurpose === 'cashout'

  // Filter rate options to only show prices between 99.000 and 101.000
  const filterRateOptionsByPrice = (rateOptions: RateOption[]) => {
    return rateOptions.filter(opt => {
      const price = 100 - safeNumber(opt.points)
      return price >= 99.0 && price <= 101.0
    })
  }

  // Type for target pricing option
  type TargetPricingOption = {
    rate: number
    points: number
    apr: number
    price: number
    payment: number
    programName: string
    adjustments: Adjustment[]
  }

  // Find the TARGET PRICING - Always prefer 5YR PPP (60MO) for DSCR/Investment (best rates)
  const getTargetPricing = (): TargetPricingOption | null => {
    if (!result?.programs || !Array.isArray(result.programs)) return null

    // CRITICAL: PPP is ONLY allowed for Investment properties
    const isPPPAllowed = formData.occupancyType === 'investment'
    let targetOption: TargetPricingOption | null = null
    let closestDistance = Infinity

    // Helper to check if program has PPP (but 0MO PPP or 0 YR PPP means NO prepay, so allow those)
    const hasPPPInName = (text: string): boolean => {
      const upper = text.toUpperCase()
      // 0MO PPP or 0 YR PPP means NO prepayment penalty - these are OK for all property types
      if (upper.includes('0MO PPP') || upper.includes('0 YR PPP') || upper.includes('0YR PPP')) {
        return false
      }
      return upper.includes(' PPP') || upper.includes('YR PPP') || /\d\s*YR\s*PPP/i.test(upper)
    }

    result.programs.forEach(program => {
      if (!program || !Array.isArray(program.rateOptions)) return
      const programName = program.name || 'Unknown'

      program.rateOptions.forEach(opt => {
        if (!opt) return
        const desc = (opt.description || programName).toUpperCase()
        const hasPPP = hasPPPInName(desc)

        // For Primary/Secondary homes: SKIP any PPP programs entirely
        if (!isPPPAllowed && hasPPP) return

        // For Investment properties: match 5YR/60MO PPP (best rates for DSCR)
        if (isPPPAllowed) {
          const matchesPPP = desc.includes('5 YR PPP') || desc.includes('5YR PPP') || desc.includes('60MO PPP')
          if (!matchesPPP) return
        }

        const points = safeNumber(opt.points)
        const price = 100 - points

        // Only consider prices within range
        if (price >= 99.0 && price <= 101.0) {
          const distance = Math.abs(price - 100)
          if (distance < closestDistance) {
            closestDistance = distance
            targetOption = {
              rate: safeNumber(opt.rate),
              points: points,
              apr: safeNumber(opt.apr),
              price: price,
              payment: safeNumber(opt.payment),
              programName: opt.description || programName,
              adjustments: opt.adjustments || []
            }
          }
        }
      })
    })

    // Fallback: if no match found, find closest to price 100 (still respecting PPP rules)
    if (!targetOption) {
      result.programs.forEach(program => {
        if (!program || !Array.isArray(program.rateOptions)) return
        const programName = program.name || 'Unknown'

        program.rateOptions.forEach(opt => {
          if (!opt) return
          const desc = (opt.description || programName).toUpperCase()
          const hasPPP = hasPPPInName(desc)

          // Still skip PPP programs for Primary/Secondary in fallback
          if (!isPPPAllowed && hasPPP) return

          const points = safeNumber(opt.points)
          const price = 100 - points
          if (price >= 99.0 && price <= 101.0) {
            const distance = Math.abs(price - 100)
            if (distance < closestDistance) {
              closestDistance = distance
              targetOption = {
                rate: safeNumber(opt.rate),
                points: points,
                apr: safeNumber(opt.apr),
                price: price,
                payment: safeNumber(opt.payment),
                programName: opt.description || programName,
                adjustments: opt.adjustments || []
              }
            }
          }
        })
      })
    }

    return targetOption
  }

  const targetPricing: TargetPricingOption | null = result ? getTargetPricing() : null

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-gray-900 tracking-tight">OpenBroker</span>
              <span className="bg-gray-900 text-white text-xs font-bold px-1.5 py-0.5 rounded">AI</span>
            </div>
            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-6">
              <a href="https://app.defywholesale.com" target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-gray-600 hover:text-gray-900">AI Deal Desk</a>
              <a href="https://app.defywholesale.com" target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-gray-600 hover:text-gray-900">Pipeline</a>
              <a href="https://app.defywholesale.com" target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-gray-600 hover:text-gray-900">AVM</a>
              <a href="https://app.defywholesale.com" target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-gray-600 hover:text-gray-900">AUS</a>
              <Button variant="outline" size="sm">Sign Out</Button>
            </nav>
            {/* Mobile hamburger */}
            <button
              type="button"
              className="md:hidden p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
        {/* Mobile dropdown menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-200 bg-white shadow-lg absolute left-0 right-0 z-50">
            <div className="px-4 py-3 space-y-2">
              <a href="https://app.defywholesale.com" target="_blank" rel="noopener noreferrer" className="block px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-md" onClick={() => setMobileMenuOpen(false)}>AI Deal Desk</a>
              <a href="https://app.defywholesale.com" target="_blank" rel="noopener noreferrer" className="block px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-md" onClick={() => setMobileMenuOpen(false)}>Pipeline</a>
              <a href="https://app.defywholesale.com" target="_blank" rel="noopener noreferrer" className="block px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-md" onClick={() => setMobileMenuOpen(false)}>AVM</a>
              <a href="https://app.defywholesale.com" target="_blank" rel="noopener noreferrer" className="block px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-md" onClick={() => setMobileMenuOpen(false)}>AUS</a>
              <div className="border-t pt-2 mt-2">
                <Button variant="outline" size="sm" className="w-full" onClick={() => setMobileMenuOpen(false)}>Sign Out</Button>
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-primary" />Loan Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">

                  {/* LOAN INFORMATION SECTION */}
                  <div className="border-b pb-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Loan Information</h3>
                    {/* LINE 1: Lien Position, Lock Period, Loan Purpose, Term */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="lienPosition">Lien Position</Label>
                        <Select name="lienPosition" value={formData.lienPosition} onValueChange={(v) => handleInputChange('lienPosition', v)}>
                          <SelectTrigger id="lienPosition"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1st">1st</SelectItem>
                            <SelectItem value="2nd">2nd</SelectItem>
                            <SelectItem value="heloc">HELOC</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lockPeriod">Lock Period</Label>
                        <Select name="lockPeriod" value={formData.lockPeriod} onValueChange={(v) => handleInputChange('lockPeriod', v)}>
                          <SelectTrigger id="lockPeriod"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="30">30</SelectItem>
                            <SelectItem value="45">45</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="loanPurpose" className={hasError('loanPurpose') ? 'text-red-600' : ''}>Loan Purpose *</Label>
                        <Select name="loanPurpose" value={formData.loanPurpose} onValueChange={(v) => handleInputChange('loanPurpose', v)}>
                          <SelectTrigger id="loanPurpose" className={hasError('loanPurpose') ? 'border-red-500' : ''}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="purchase">Purchase</SelectItem>
                            <SelectItem value="refinance">Refi Rate/Term</SelectItem>
                            <SelectItem value="cashout">Refinance Cashout</SelectItem>
                          </SelectContent>
                        </Select>
                        {hasError('loanPurpose') && <p className="text-xs text-red-600">{validationErrors.loanPurpose}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="loanTerm" className={hasError('loanTerm') ? 'text-red-600' : ''}>Term *</Label>
                        <Select name="loanTerm" value={formData.loanTerm} onValueChange={(v) => handleInputChange('loanTerm', v)}>
                          <SelectTrigger id="loanTerm" className={hasError('loanTerm') ? 'border-red-500' : ''}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="30">30 Year</SelectItem>
                            <SelectItem value="25">25 Year</SelectItem>
                            <SelectItem value="20">20 Year</SelectItem>
                            <SelectItem value="15">15 Year</SelectItem>
                            <SelectItem value="10">10 Year</SelectItem>
                          </SelectContent>
                        </Select>
                        {hasError('loanTerm') && <p className="text-xs text-red-600">{validationErrors.loanTerm}</p>}
                      </div>
                    </div>

                    {/* LINE 2: Appraised Value/Sales Price, Loan Amount, LTV, CLTV (2nd/HELOC only), Amortization */}
                    <div className={`grid grid-cols-1 sm:grid-cols-2 ${formData.lienPosition !== '1st' ? 'md:grid-cols-5' : 'md:grid-cols-4'} gap-4 mt-4`}>
                      <div className="space-y-2">
                        <Label htmlFor="propertyValue" className={hasError('propertyValue') ? 'text-red-600' : ''}>Value/Sales Price *</Label>
                        <Input
                          id="propertyValue"
                          name="propertyValue"
                          value={formData.propertyValue}
                          onChange={(e) => handleInputChange('propertyValue', formatNumberInput(e.target.value))}
                          icon={<DollarSign className="w-4 h-4" />}
                          className={hasError('propertyValue') ? 'border-red-500' : ''}
                        />
                        {hasError('propertyValue') && <p className="text-xs text-red-600">{validationErrors.propertyValue}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="loanAmount" className={hasError('loanAmount') ? 'text-red-600' : ''}>Loan Amount *</Label>
                        <Input
                          id="loanAmount"
                          name="loanAmount"
                          value={formData.loanAmount}
                          onChange={(e) => handleInputChange('loanAmount', formatNumberInput(e.target.value))}
                          icon={<DollarSign className="w-4 h-4" />}
                          className={hasError('loanAmount') ? 'border-red-500' : ''}
                        />
                        {hasError('loanAmount') && <p className="text-xs text-red-600">{validationErrors.loanAmount}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ltv" className="flex items-center gap-1">
                          LTV
                          <span className="relative group">
                            <Info className="w-3.5 h-3.5 text-blue-500 cursor-help" />
                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                              Loan-to-Value Ratio
                              <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></span>
                            </span>
                          </span>
                        </Label>
                        <div className="relative">
                          <Input
                            id="ltv"
                            name="ltv"
                            value={formData.ltv}
                            onChange={(e) => handleInputChange('ltv', e.target.value.replace(/[^0-9.]/g, ''))}
                            className="pr-8"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none">%</span>
                        </div>
                      </div>
                      {formData.lienPosition !== '1st' && (
                        <div className="space-y-2">
                          <Label htmlFor="cltv">CLTV</Label>
                          <div id="cltv" className="h-10 px-3 py-2 bg-gray-100 border rounded-md text-sm font-medium">
                            Enter 2nd Lien
                          </div>
                        </div>
                      )}
                      <div className="space-y-2">
                        <Label htmlFor="amortization">Amortization</Label>
                        <Select name="amortization" value={formData.amortization} onValueChange={(v) => handleInputChange('amortization', v)}>
                          <SelectTrigger id="amortization"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="fixed">Fixed</SelectItem>
                            <SelectItem value="arm3">3 Year ARM</SelectItem>
                            <SelectItem value="arm5">5 Year ARM</SelectItem>
                            <SelectItem value="arm7">7 Year ARM</SelectItem>
                            <SelectItem value="arm10">10 Year ARM</SelectItem>
                            <SelectItem value="other40">Other/40 Year</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* LINE 3: Payment, Impound Type + Cashout if applicable */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                      <div className="space-y-2">
                        <Label htmlFor="paymentType">Payment</Label>
                        <Select name="paymentType" value={formData.paymentType} onValueChange={(v) => handleInputChange('paymentType', v)}>
                          <SelectTrigger id="paymentType"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pi">P&I</SelectItem>
                            <SelectItem value="io">Interest Only</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="impoundType">Impound Type</Label>
                        <Select name="impoundType" value={formData.impoundType} onValueChange={(v) => handleInputChange('impoundType', v)}>
                          <SelectTrigger id="impoundType"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="escrowed">Taxes and Insurance Escrowed</SelectItem>
                            <SelectItem value="noescrow">No Escrow</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {showCashoutField && (
                        <div className="space-y-2">
                          <Label htmlFor="cashoutAmount">Cashout Amount</Label>
                          <Input
                            id="cashoutAmount"
                            name="cashoutAmount"
                            value={formData.cashoutAmount}
                            onChange={(e) => handleInputChange('cashoutAmount', formatNumberInput(e.target.value))}
                            icon={<DollarSign className="w-4 h-4" />}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* PROPERTY DETAILS SECTION - Merged Location and Property Details */}
                  <div className="border-b pb-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Property Details</h3>
                    {/* LINE 1: Location fields */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="propertyZip" className={hasError('propertyZip') ? 'text-red-600' : ''}>
                          ZIP Code * {zipLoading && <Loader2 className="w-3 h-3 inline animate-spin ml-1" />}
                        </Label>
                        <Input
                          id="propertyZip"
                          name="propertyZip"
                          maxLength={5}
                          value={formData.propertyZip}
                          onChange={(e) => handleInputChange('propertyZip', e.target.value.replace(/\D/g, ''))}
                          className={hasError('propertyZip') ? 'border-red-500' : ''}
                          placeholder="Enter ZIP to auto-fill"
                          autoComplete="postal-code"
                        />
                        {hasError('propertyZip') && <p className="text-xs text-red-600">{validationErrors.propertyZip}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="propertyState" className={hasError('propertyState') ? 'text-red-600' : ''}>State *</Label>
                        <Select name="propertyState" value={formData.propertyState} onValueChange={(v) => handleInputChange('propertyState', v)}>
                          <SelectTrigger id="propertyState" className={hasError('propertyState') ? 'border-red-500' : ''}><SelectValue /></SelectTrigger>
                          <SelectContent>{US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                        </Select>
                        {hasError('propertyState') && <p className="text-xs text-red-600">{validationErrors.propertyState}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="propertyCounty">County</Label>
                        <Input id="propertyCounty" name="propertyCounty" value={formData.propertyCounty} onChange={(e) => handleInputChange('propertyCounty', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="propertyCity">City</Label>
                        <Input id="propertyCity" name="propertyCity" value={formData.propertyCity} onChange={(e) => handleInputChange('propertyCity', e.target.value)} autoComplete="address-level2" />
                      </div>
                    </div>
                    {/* LINE 2: Property type fields */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                      <div className="space-y-2">
                        <Label htmlFor="occupancyType" className={hasError('occupancyType') ? 'text-red-600' : ''}>Property Use *</Label>
                        <Select name="occupancyType" value={formData.occupancyType} onValueChange={(v) => handleInputChange('occupancyType', v)}>
                          <SelectTrigger id="occupancyType" className={hasError('occupancyType') ? 'border-red-500' : ''}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="primary">Primary Residence</SelectItem>
                            <SelectItem value="secondary">Second Home</SelectItem>
                            <SelectItem value="investment">Investment</SelectItem>
                          </SelectContent>
                        </Select>
                        {hasError('occupancyType') && <p className="text-xs text-red-600">{validationErrors.occupancyType}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="propertyType" className={hasError('propertyType') ? 'text-red-600' : ''}>Property Type *</Label>
                        <Select name="propertyType" value={formData.propertyType} onValueChange={(v) => handleInputChange('propertyType', v)}>
                          <SelectTrigger id="propertyType" className={hasError('propertyType') ? 'border-red-500' : ''}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sfr">Single Family</SelectItem>
                            <SelectItem value="condo">Condo</SelectItem>
                            <SelectItem value="townhouse">Townhouse</SelectItem>
                            <SelectItem value="2unit">2 Unit</SelectItem>
                            <SelectItem value="3unit">3 Unit</SelectItem>
                            <SelectItem value="4unit">4 Unit</SelectItem>
                            <SelectItem value="5-9unit">5-9 Units</SelectItem>
                            <SelectItem value="blanket" disabled className="text-gray-400">Blanket Investor</SelectItem>
                          </SelectContent>
                        </Select>
                        {hasError('propertyType') && <p className="text-xs text-red-600">{validationErrors.propertyType}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="structureType">Structure Type</Label>
                        <Select name="structureType" value={formData.structureType} onValueChange={(v) => handleInputChange('structureType', v)}>
                          <SelectTrigger id="structureType"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="detached">Detached</SelectItem>
                            <SelectItem value="attached">Attached</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {/* LINE 3: Property checkboxes */}
                    <div className="flex flex-wrap gap-6 mt-4">
                      <label htmlFor="isRuralProperty" className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          id="isRuralProperty"
                          name="isRuralProperty"
                          checked={formData.isRuralProperty}
                          onChange={(e) => handleInputChange('isRuralProperty', e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <span className="text-sm">Rural Property</span>
                      </label>
                      <label htmlFor="isNonWarrantableProject" className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          id="isNonWarrantableProject"
                          name="isNonWarrantableProject"
                          checked={formData.isNonWarrantableProject}
                          onChange={(e) => handleInputChange('isNonWarrantableProject', e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <span className="text-sm">Non-Warrantable Project?</span>
                      </label>
                      <label htmlFor="isMixedUsePML" className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          id="isMixedUsePML"
                          name="isMixedUsePML"
                          checked={formData.isMixedUsePML}
                          onChange={(e) => handleInputChange('isMixedUsePML', e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <span className="text-sm">Mixed Use</span>
                      </label>
                    </div>
                  </div>

                  {/* BORROWER DETAILS SECTION */}
                  <div className="border-b pb-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Borrower Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="creditScore" className={hasError('creditScore') ? 'text-red-600' : ''}>Estimated Credit Score *</Label>
                        <Input
                          id="creditScore"
                          name="creditScore"
                          maxLength={3}
                          value={formData.creditScore}
                          onChange={(e) => handleInputChange('creditScore', e.target.value.replace(/\D/g, ''))}
                          className={hasError('creditScore') ? 'border-red-500' : ''}
                        />
                        {hasError('creditScore') && <p className="text-xs text-red-600">{validationErrors.creditScore}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="dti" className={hasError('dti') ? 'text-red-600' : ''}>DTI (%) *</Label>
                        <Input
                          id="dti"
                          name="dti"
                          maxLength={2}
                          value={formData.dti}
                          onChange={(e) => handleInputChange('dti', e.target.value.replace(/\D/g, ''))}
                          className={hasError('dti') ? 'border-red-500' : ''}
                        />
                        {hasError('dti') && <p className="text-xs text-red-600">{validationErrors.dti}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="citizenship">Citizenship</Label>
                        <Select name="citizenship" value={formData.citizenship} onValueChange={(v) => handleInputChange('citizenship', v)}>
                          <SelectTrigger id="citizenship"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="usCitizen">US Citizen</SelectItem>
                            <SelectItem value="permanentResident">Permanent Resident</SelectItem>
                            <SelectItem value="nonPermanentResident">Non-Permanent Resident</SelectItem>
                            <SelectItem value="foreignNational">Foreign National</SelectItem>
                            <SelectItem value="itin">ITIN</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="documentationType">Doc Type</Label>
                        <Select name="documentationType" value={formData.documentationType} onValueChange={(v) => handleInputChange('documentationType', v)}>
                          <SelectTrigger id="documentationType"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="fullDoc">Full Document</SelectItem>
                            <SelectItem value="dscr">Debt Service Coverage (DSCR)</SelectItem>
                            <SelectItem value="bankStatement12">12 Mo. Bank Statements</SelectItem>
                            <SelectItem value="bankStatement24">24 Mo. Bank Statements</SelectItem>
                            <SelectItem value="bankStatementOther">Other Bank Statements</SelectItem>
                            <SelectItem value="taxReturns1Yr">1 Yr. Tax Returns</SelectItem>
                            <SelectItem value="voe">VOE</SelectItem>
                            <SelectItem value="assetUtilization">Asset Utilization</SelectItem>
                            <SelectItem value="noRatio">No Ratio</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-6">
                      <label htmlFor="isSelfEmployed" className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          id="isSelfEmployed"
                          name="isSelfEmployed"
                          checked={formData.isSelfEmployed}
                          onChange={(e) => handleInputChange('isSelfEmployed', e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <span className="text-sm">Self Employed</span>
                      </label>
                      <label htmlFor="isFTHB" className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          id="isFTHB"
                          name="isFTHB"
                          checked={formData.isFTHB}
                          onChange={(e) => handleInputChange('isFTHB', e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <span className="text-sm">FTHB (First Time Home Buyer)</span>
                      </label>
                    </div>
                  </div>

                  {/* INVESTOR DETAILS SECTION - Conditional */}
                  {showInvestorDetails && (
                    <div className="border-b pb-4 bg-blue-50 -mx-6 px-6 py-4">
                      <h3 className="text-sm font-semibold text-blue-700 mb-4 uppercase tracking-wide">Investor Details</h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="prepayPeriod">Prepay Period</Label>
                          <Select name="prepayPeriod" value={formData.prepayPeriod} onValueChange={(v) => handleInputChange('prepayPeriod', v)}>
                            <SelectTrigger id="prepayPeriod"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="60mo">60 Months</SelectItem>
                              <SelectItem value="48mo">48 Months</SelectItem>
                              <SelectItem value="36mo">36 Months</SelectItem>
                              <SelectItem value="24mo">24 Months</SelectItem>
                              <SelectItem value="12mo">12 Months</SelectItem>
                              <SelectItem value="0mo">None</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="prepayType">Prepay Type</Label>
                          <Select name="prepayType" value={formData.prepayType} onValueChange={(v) => handleInputChange('prepayType', v)}>
                            <SelectTrigger id="prepayType"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="5pct">5%</SelectItem>
                              <SelectItem value="declining">Declining</SelectItem>
                              <SelectItem value="6mointerest">6 Months Interest</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {formData.documentationType === 'dscr' && (
                        <div className="space-y-2">
                          <Label htmlFor="dscrEntityType">DSCR Entity Type</Label>
                          <Select name="dscrEntityType" value={formData.dscrEntityType} onValueChange={(v) => handleInputChange('dscrEntityType', v)}>
                            <SelectTrigger id="dscrEntityType"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="individual">Individual</SelectItem>
                              <SelectItem value="llc">LLC</SelectItem>
                              <SelectItem value="corp">Corp.</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        )}
                      </div>
                      {/* DSCR Calculation Fields - Only show when Income Doc Type = DSCR */}
                      {formData.documentationType === 'dscr' && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                        <div className="space-y-2">
                          <Label htmlFor="presentHousingExpense">Present Housing Expense</Label>
                          <Input
                            id="presentHousingExpense"
                            name="presentHousingExpense"
                            value={formData.presentHousingExpense}
                            onChange={(e) => handleInputChange('presentHousingExpense', formatNumberInput(e.target.value))}
                            icon={<DollarSign className="w-4 h-4" />}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="grossRent">Gross Rent</Label>
                          <Input
                            id="grossRent"
                            name="grossRent"
                            value={formData.grossRent}
                            onChange={(e) => handleInputChange('grossRent', formatNumberInput(e.target.value))}
                            icon={<DollarSign className="w-4 h-4" />}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="flex items-center gap-1">
                            DSCR %
                            <span className="relative group">
                              <Info className="w-3.5 h-3.5 text-blue-500 cursor-help" />
                              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 text-xs text-white bg-gray-900 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                                DSCR Calculated at {calculatedDSCR.display}
                                <br />
                                <span className="text-gray-300">
                                  Gross Rent (${formData.grossRent}) / Housing Expense (${formData.presentHousingExpense})
                                </span>
                                <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></span>
                              </span>
                            </span>
                          </Label>
                          <div className="h-10 px-3 py-2 bg-white border rounded-md text-sm font-medium flex items-center justify-between">
                            <span className={`${
                              calculatedDSCR.ratio >= 1.0 ? 'text-green-600' :
                              calculatedDSCR.ratio >= 0.75 ? 'text-yellow-600' :
                              'text-red-600'
                            }`}>
                              {calculatedDSCR.display}
                            </span>
                            <span className="text-xs text-gray-500 ml-2">
                              ({calculatedDSCR.range === '>=1.250' ? '≥1.250' :
                                calculatedDSCR.range === 'noRatio' ? 'No Ratio' :
                                calculatedDSCR.range})
                            </span>
                          </div>
                        </div>
                      </div>
                      )}
                      {/* LINE 3: Investor checkboxes */}
                      <div className="flex flex-wrap gap-6 mt-4">
                        <label htmlFor="isSeasonalProperty" className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            id="isSeasonalProperty"
                            name="isSeasonalProperty"
                            checked={formData.isSeasonalProperty || formData.isShortTermRental}
                            onChange={(e) => {
                              handleInputChange('isSeasonalProperty', e.target.checked)
                              handleInputChange('isShortTermRental', e.target.checked)
                            }}
                            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                          />
                          <span className="text-sm">Seasonal Property/Short Term Rental</span>
                        </label>
                        <label htmlFor="isCrossCollateralized" className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            id="isCrossCollateralized"
                            name="isCrossCollateralized"
                            checked={formData.isCrossCollateralized}
                            onChange={(e) => handleInputChange('isCrossCollateralized', e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                          />
                          <span className="text-sm">Cross-Collateralized</span>
                        </label>
                        {/* Prepayment Penalty (None + Has PPP) and Occupancy Rate (100%) are always sent to API but hidden from UI since they cannot be changed */}
                      </div>
                    </div>
                  )}

                  {/* ADDITIONAL DETAILS SECTION - Collapsible */}
                  <div className="border-b pb-4">
                    <button
                      type="button"
                      onClick={() => setShowOtherDetails(!showOtherDetails)}
                      className="flex items-center gap-2 text-sm font-semibold text-gray-700 uppercase tracking-wide hover:text-gray-900"
                    >
                      {showOtherDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      Additional Details
                    </button>

                    {showOtherDetails && (
                      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        <label htmlFor="is5PlusUnits" className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" id="is5PlusUnits" name="is5PlusUnits" checked={formData.is5PlusUnits} onChange={(e) => handleInputChange('is5PlusUnits', e.target.checked)} className="w-4 h-4 rounded" />
                          <span className="text-sm">5+ Units</span>
                        </label>
                        <label htmlFor="hasITIN" className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" id="hasITIN" name="hasITIN" checked={formData.hasITIN} onChange={(e) => handleInputChange('hasITIN', e.target.checked)} className="w-4 h-4 rounded" />
                          <span className="text-sm">Borrower has ITIN</span>
                        </label>
                        <label htmlFor="isAVMOrCDA" className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" id="isAVMOrCDA" name="isAVMOrCDA" checked={formData.isAVMOrCDA} onChange={(e) => handleInputChange('isAVMOrCDA', e.target.checked)} className="w-4 h-4 rounded" />
                          <span className="text-sm">AVM or CDA</span>
                        </label>
                      </div>
                    )}
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                      <AlertCircle className="w-4 h-4" />{error}
                    </div>
                  )}

                  <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
                    {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" />Getting Pricing...</> : <><Calculator className="w-4 h-4" />Get Pricing</>}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* RESULTS PANEL */}
          <div>
            {result ? (
              <>
                <Card className="border-primary/20 bg-primary/5">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-green-600" />Pricing Result
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-md">
                          <CheckCircle2 className="w-3 h-3" />Live Pricing
                        </div>
                        {result.apiError && (
                          <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 px-2 py-1 rounded-md">
                            <AlertCircle className="w-3 h-3" />API Error
                          </div>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Main Pricing Metrics */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                      <div className="bg-white rounded-lg p-4 border border-gray-200 text-center">
                        <div className="text-3xl font-bold text-primary">
                          {targetPricing ? formatPercent(targetPricing.rate) : formatPercent(safeNumber(result.rate))}
                        </div>
                        <div className="text-sm text-gray-500 mt-1">Rate</div>
                      </div>
                      <div className="bg-white rounded-lg p-4 border border-gray-200 text-center">
                        <div className="text-2xl font-semibold text-gray-900">
                          {targetPricing ? targetPricing.price.toFixed(3) : '100.000'}
                        </div>
                        <div className="text-sm text-gray-500 mt-1">Price</div>
                      </div>
                      <div className="bg-white rounded-lg p-4 border border-gray-200 text-center">
                        <div className="text-2xl font-semibold text-gray-900">
                          {targetPricing ? formatPercent(targetPricing.apr) : formatPercent(safeNumber(result.apr))}
                        </div>
                        <div className="text-sm text-gray-500 mt-1">APR</div>
                      </div>
                      <div className="bg-white rounded-lg p-4 border border-gray-200 text-center">
                        <div className="text-2xl font-semibold text-gray-900">
                          {targetPricing && targetPricing.payment > 0 ? formatCurrency(targetPricing.payment) : formatCurrency(safeNumber(result.monthlyPayment))}
                        </div>
                        <div className="text-sm text-gray-500 mt-1">Payment</div>
                      </div>
                      <div className="bg-white rounded-lg p-4 border border-gray-200 text-center">
                        <div className="text-2xl font-semibold text-gray-900">
                          {targetPricing ? targetPricing.points.toFixed(3) : safeNumber(result.points).toFixed(3)}
                        </div>
                        <div className="text-sm text-gray-500 mt-1">Points</div>
                      </div>
                      <div className="bg-white rounded-lg p-4 border border-gray-200 text-center">
                        <div className="text-2xl font-semibold text-gray-900">{safeNumber(result.ltvRatio).toFixed(1)}%</div>
                        <div className="text-sm text-gray-500 mt-1">LTV</div>
                      </div>
                    </div>

                    {/* Pricing Adjustments Table */}
                    {targetPricing && targetPricing.adjustments && targetPricing.adjustments.length > 0 && (
                      <div className="mt-6">
                        <div className="text-sm font-semibold text-gray-700 mb-2">
                          The following adjustments were made to create the above pricing.
                        </div>
                        <div className="bg-white border rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="text-left py-2 px-3 font-medium text-gray-600 w-24">Rate</th>
                                <th className="text-left py-2 px-3 font-medium text-gray-600 w-24">Price</th>
                                <th className="text-left py-2 px-3 font-medium text-gray-600">Description</th>
                              </tr>
                            </thead>
                            <tbody>
                              {targetPricing.adjustments.map((adj, idx) => {
                                const rateDisplay = adj.rateAdj !== undefined ? adj.rateAdj : (adj.percentage !== undefined ? adj.percentage : 0)
                                const priceDisplay = adj.amount || 0
                                return (
                                  <tr key={idx} className="border-t">
                                    <td className="py-2 px-3 text-gray-700">
                                      {rateDisplay.toFixed(3)}%
                                    </td>
                                    <td className={`py-2 px-3 font-medium ${priceDisplay > 0 ? 'text-red-600' : priceDisplay < 0 ? 'text-green-600' : 'text-gray-600'}`}>
                                      {priceDisplay.toFixed(3)}
                                    </td>
                                    <td className="py-2 px-3 text-gray-900">{adj.description}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* PROGRAMS - HORIZONTAL CARDS */}
                {Array.isArray(result.programs) && result.programs.length > 0 ? (
                  <Card className="mt-4">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Available Programs ({result.programs.filter(p => p && Array.isArray(p.rateOptions) && filterRateOptionsByPrice(p.rateOptions).length > 0).length})</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {result.programs.map((program, idx) => {
                        // Defensive: ensure program and rateOptions are valid
                        if (!program || typeof program !== 'object') return null
                        const allRateOptions = Array.isArray(program.rateOptions) ? program.rateOptions : []
                        // Filter to only show prices between 99.000 and 101.000
                        const filteredRateOptions = filterRateOptionsByPrice(allRateOptions)
                        // Skip programs with no options in the price range
                        if (filteredRateOptions.length === 0) return null

                        const programName = program.name || `Program ${idx + 1}`
                        // Find the rate option closest to price 100 for this program
                        const bestRate = filteredRateOptions.reduce((best, opt) => {
                          const price = 100 - safeNumber(opt.points)
                          const bestPrice = best ? 100 - safeNumber(best.points) : Infinity
                          return Math.abs(price - 100) < Math.abs(bestPrice - 100) ? opt : best
                        }, filteredRateOptions[0])

                        const bestPayment = bestRate ? safeNumber(bestRate.payment) : 0

                        return (
                          <div key={idx} className="border rounded-lg overflow-hidden bg-white">
                            {/* Horizontal Card Header */}
                            <button
                              type="button"
                              onClick={() => setExpandedProgram(expandedProgram === programName ? null : programName)}
                              className="w-full px-4 py-3 hover:bg-gray-50"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                {/* Program Name */}
                                <div className="flex-1 text-left">
                                  <div className="font-medium text-sm text-gray-900">{programName}</div>
                                  <div className="text-xs text-gray-500">{filteredRateOptions.length} rate options</div>
                                </div>

                                {/* Key Metrics - Horizontal on desktop, grid on mobile */}
                                <div className="grid grid-cols-4 sm:flex sm:items-center gap-3 sm:gap-6 text-sm w-full sm:w-auto mt-2 sm:mt-0">
                                  <div className="text-center">
                                    <div className="text-primary font-bold text-base sm:text-lg">{bestRate ? safeNumber(bestRate.rate).toFixed(3) : '-'}%</div>
                                    <div className="text-xs text-gray-500">Rate</div>
                                  </div>
                                  <div className="text-center">
                                    <div className="font-semibold text-gray-900 text-sm sm:text-base">{bestRate ? (100 - safeNumber(bestRate.points)).toFixed(3) : '-'}</div>
                                    <div className="text-xs text-gray-500">Price</div>
                                  </div>
                                  <div className="text-center">
                                    <div className="font-semibold text-gray-900 text-sm sm:text-base">{bestRate ? safeNumber(bestRate.apr).toFixed(3) : '-'}%</div>
                                    <div className="text-xs text-gray-500">APR</div>
                                  </div>
                                  <div className="text-center">
                                    <div className="font-semibold text-gray-900 text-sm sm:text-base">{bestPayment > 0 ? formatCurrency(bestPayment) : '-'}</div>
                                    <div className="text-xs text-gray-500">Payment</div>
                                  </div>
                                </div>

                                {/* Expand Icon */}
                                <div className="ml-2">
                                  {expandedProgram === programName ?
                                    <ChevronUp className="w-5 h-5 text-gray-400" /> :
                                    <ChevronDown className="w-5 h-5 text-gray-400" />
                                  }
                                </div>
                              </div>
                            </button>

                            {/* Expanded Rate Options */}
                            {expandedProgram === programName && filteredRateOptions.length > 0 && (
                              <div className="bg-gray-50 border-t">
                                {/* Rate Options Table */}
                                <div className="px-4 py-2 overflow-x-auto">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-gray-500 border-b">
                                        <th className="text-left py-2 pr-2">Program/PPP</th>
                                        <th className="text-right py-2 px-2">Rate</th>
                                        <th className="text-right py-2 px-2">Price</th>
                                        <th className="text-right py-2 px-2">Points</th>
                                        <th className="text-right py-2 px-2">APR</th>
                                        <th className="text-right py-2 px-2">Payment</th>
                                        <th className="text-right py-2 pl-2">Adjustments</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {filteredRateOptions.map((opt, optIdx) => {
                                        // Defensive: ensure opt is valid
                                        if (!opt || typeof opt !== 'object') return null
                                        const points = safeNumber(opt.points)
                                        const price = safeNumber(opt.price) || (100 - points)
                                        const pointsDisplay = points >= 0
                                          ? `(${points.toFixed(3)})`
                                          : `+${Math.abs(points).toFixed(3)}`
                                        const isClosestTo100 = bestRate === opt
                                        const payment = safeNumber(opt.payment)
                                        const adjustments = opt.adjustments || []
                                        const totalAdjustment = adjustments.reduce((sum, adj) => sum + (adj.amount || 0), 0)

                                        return (
                                          <tr key={optIdx} className={`border-t border-gray-200 ${isClosestTo100 ? 'bg-blue-50' : points < 0 ? 'bg-green-50' : ''}`}>
                                            <td className="py-2 pr-2 text-left">
                                              <div className="max-w-[250px] truncate font-medium" title={opt.description || ''}>
                                                {opt.description || programName}
                                              </div>
                                            </td>
                                            <td className="py-2 px-2 text-right font-semibold text-primary">{safeNumber(opt.rate).toFixed(3)}%</td>
                                            <td className={`py-2 px-2 text-right ${price >= 100 ? 'text-green-600 font-medium' : ''}`}>
                                              {price.toFixed(3)}
                                            </td>
                                            <td className={`py-2 px-2 text-right ${points < 0 ? 'text-green-600' : 'text-gray-600'}`}>
                                              {pointsDisplay}
                                            </td>
                                            <td className="py-2 px-2 text-right">{safeNumber(opt.apr).toFixed(3)}%</td>
                                            <td className="py-2 px-2 text-right font-medium">{payment > 0 ? formatCurrency(payment) : '-'}</td>
                                            <td className="py-2 pl-2 text-right">
                                              {adjustments.length > 0 ? (
                                                <span className={`${totalAdjustment >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                  {totalAdjustment >= 0 ? '+' : ''}{totalAdjustment.toFixed(3)}
                                                </span>
                                              ) : '-'}
                                            </td>
                                          </tr>
                                        )
                                      })}
                                    </tbody>
                                  </table>
                                </div>

                                {/* Adjustments Detail (for best rate option) */}
                                {bestRate && bestRate.adjustments && bestRate.adjustments.length > 0 && (
                                  <div className="px-4 py-3 border-t bg-white">
                                    <div className="text-xs font-semibold text-gray-700 mb-2">Pricing Adjustments (Best Rate)</div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                      {bestRate.adjustments.map((adj: Adjustment, adjIdx: number) => (
                                        <div key={adjIdx} className="flex justify-between text-xs bg-gray-50 px-2 py-1 rounded">
                                          <span className="text-gray-600 truncate mr-2">{adj.description}</span>
                                          <span className={`font-medium ${adj.amount >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                                            {adj.amount >= 0 ? '+' : ''}{adj.amount.toFixed(3)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {expandedProgram === programName && filteredRateOptions.length === 0 && (
                              <div className="bg-gray-50 px-4 py-2 text-xs text-gray-500 border-t">
                                No rate options in price range (99-101)
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="border-amber-200 bg-amber-50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base text-amber-700">No Programs Returned</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-amber-600">
                      <p>The API returned pricing but no program details were parsed.</p>
                      {result.debug && (
                        <div className="mt-3 p-2 bg-white rounded border text-xs font-mono text-gray-600 space-y-2">
                          <p>Raw programs found: {result.debug.rawProgramsFound}</p>
                          <p>Raw rate options: {result.debug.rawRateOptionsFound}</p>
                          <p>Formatted programs: {result.debug.formattedProgramsCount}</p>
                          <p>Has PricingResults: {result.debug.hasPricingResultsField ? 'Yes' : 'No'}</p>
                          <div className="mt-2">
                            <p className="font-bold">XML Preview:</p>
                            <pre className="mt-1 p-2 bg-gray-100 rounded text-xs overflow-x-auto whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                              {result.debug.xmlPreview}
                            </pre>
                          </div>
                          {result.debug.pricingResultsPreview && (
                            <div className="mt-2">
                              <p className="font-bold">PricingResults Content:</p>
                              <pre className="mt-1 p-2 bg-gray-100 rounded text-xs overflow-x-auto whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                                {result.debug.pricingResultsPreview}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

              {/* EXPANDED MARKET RATES - Lender Price (above Submit button) */}
              {lpLoading && !lpResult && (
                <Card className="mt-4 border-gray-200">
                  <CardContent className="py-6">
                    <div className="flex items-center justify-center gap-3 text-gray-500">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Fetching expanded market rates...</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {lpResult && lpResult.rateOptions && lpResult.rateOptions.length > 0 && (() => {
                const isDSCR = formData.documentationType === 'dscr'
                // Apply -0.50 price adjustment to all LP rates before display
                const adjustedLpRates = lpResult.rateOptions.map((opt: any) => ({
                  ...opt,
                  price: safeNumber(opt.price) - 0.50,
                }))
                // DSCR: show all rates grouped by program (all PPP options)
                // Non-DSCR: filter to 99.75-100.75 price range
                const filteredLpRates = isDSCR
                  ? adjustedLpRates
                  : adjustedLpRates.filter((opt: any) => opt.price >= 99.75 && opt.price <= 100.75)
                const closestPrice = filteredLpRates.length > 0
                  ? Math.min(...filteredLpRates.map((o: any) => Math.abs(o.price - 100)))
                  : 999
                // Group by program for DSCR
                const programGroups: string[] = isDSCR
                  ? [...new Set(filteredLpRates.map((o: any) => String(o.program || 'Unknown')))].sort() as string[]
                  : []
                return (
                  <Card className="mt-4 border-indigo-200 bg-indigo-50/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center justify-between">
                        <span>Expanded Market Rates</span>
                        <span className="text-xs font-normal text-gray-400">
                          {filteredLpRates.length} of {adjustedLpRates.length} rates
                          {lpResult.eligibleQM > 0 && ` | ${lpResult.eligibleQM} QM`}
                          {lpResult.eligibleNonQM > 0 && ` | ${lpResult.eligibleNonQM} Non-QM`}
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {filteredLpRates.length > 0 ? (
                        isDSCR ? (
                          /* DSCR: grouped by program with all PPP options */
                          <div className="space-y-4">
                            {programGroups.map((prog: string) => {
                              const groupRates = filteredLpRates.filter((o: any) => (o.program || 'Unknown') === prog)
                              const groupFiltered = groupRates.filter((o: any) => o.price >= 99.75 && o.price <= 100.75)
                              const displayRates = groupFiltered.length > 0 ? groupFiltered : groupRates.slice(0, 5)
                              const groupClosest = displayRates.length > 0
                                ? Math.min(...displayRates.map((o: any) => Math.abs(o.price - 100)))
                                : 999
                              return (
                                <div key={prog}>
                                  <p className="text-xs font-medium text-indigo-600 mb-1">{prog} ({groupRates.length} rates)</p>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                      <thead>
                                        <tr className="text-gray-500 border-b">
                                          <th className="text-right py-1 px-3">Rate</th>
                                          <th className="text-right py-1 px-3">Price</th>
                                          <th className="text-right py-1 px-3">Payment</th>
                                          <th className="text-right py-1 px-3">Price Adj.</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {displayRates.map((opt: any, idx: number) => {
                                          const isClosest = Math.abs(opt.price - 100) === groupClosest
                                          return (
                                            <tr key={idx} className={`border-t ${isClosest ? 'bg-blue-50 font-medium' : ''}`}>
                                              <td className="py-1.5 px-3 text-right font-semibold text-primary">
                                                {safeNumber(opt.rate).toFixed(3)}%
                                              </td>
                                              <td className={`py-1.5 px-3 text-right ${opt.price >= 100 ? 'text-green-600 font-medium' : ''}`}>
                                                {safeNumber(opt.price).toFixed(3)}
                                              </td>
                                              <td className="py-1.5 px-3 text-right">
                                                {opt.payment > 0 ? formatCurrency(safeNumber(opt.payment)) : '-'}
                                              </td>
                                              <td className="py-1.5 px-3 text-right">
                                                {opt.totalAdjustments !== 0 ? (
                                                  <span className={opt.totalAdjustments > 0 ? 'text-red-600' : 'text-green-600'}>
                                                    {opt.totalAdjustments > 0 ? '+' : ''}{safeNumber(opt.totalAdjustments).toFixed(3)}
                                                  </span>
                                                ) : '-'}
                                              </td>
                                            </tr>
                                          )
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          /* Non-DSCR: single flat table, 99.75-100.75 */
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-gray-500 border-b">
                                  <th className="text-right py-2 px-3">Rate</th>
                                  <th className="text-right py-2 px-3">Price</th>
                                  <th className="text-right py-2 px-3">Payment</th>
                                  <th className="text-right py-2 px-3">Price Adj.</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredLpRates.map((opt: any, idx: number) => {
                                  const isClosest = Math.abs(opt.price - 100) === closestPrice
                                  return (
                                    <tr key={idx} className={`border-t ${isClosest ? 'bg-blue-50 font-medium' : ''}`}>
                                      <td className="py-2 px-3 text-right font-semibold text-primary">
                                        {safeNumber(opt.rate).toFixed(3)}%
                                      </td>
                                      <td className={`py-2 px-3 text-right ${opt.price >= 100 ? 'text-green-600 font-medium' : ''}`}>
                                        {safeNumber(opt.price).toFixed(3)}
                                      </td>
                                      <td className="py-2 px-3 text-right">
                                        {opt.payment > 0 ? formatCurrency(safeNumber(opt.payment)) : '-'}
                                      </td>
                                      <td className="py-2 px-3 text-right">
                                        {opt.totalAdjustments !== 0 ? (
                                          <span className={opt.totalAdjustments > 0 ? 'text-red-600' : 'text-green-600'}>
                                            {opt.totalAdjustments > 0 ? '+' : ''}{safeNumber(opt.totalAdjustments).toFixed(3)}
                                          </span>
                                        ) : '-'}
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        )
                      ) : (
                        <p className="text-sm text-gray-400 text-center py-2">
                          {adjustedLpRates.length} rates returned, none in price range
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )
              })()}

              {!lpLoading && lpResult && (!lpResult.rateOptions || lpResult.rateOptions.length === 0) && (
                <Card className="mt-4 border-gray-200">
                  <CardContent className="py-4">
                    <p className="text-sm text-gray-400 text-center">
                      No expanded market rates available for this scenario
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Submit Loan Button */}
              <div className="mt-6">
                <a href="https://sub.defywholesale.com/" target="_blank" rel="noopener noreferrer" className="block">
                  <Button type="button" size="lg" className="w-full bg-green-600 hover:bg-green-700 text-white">
                    <ExternalLink className="w-4 h-4 mr-2" />Submit + Lock
                  </Button>
                </a>
              </div>
              </>
            ) : isLoading ? (
              <div className="py-16 flex flex-col items-center justify-center">
                <div className="w-full max-w-md">
                  <div className="loading-bar-track">
                    <div
                      className="loading-bar-fill"
                      style={{ width: `${loadingProgress}%` }}
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-200 bg-white mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-gray-900 tracking-tight">OpenBroker</span>
              <span className="bg-gray-900 text-white text-[10px] font-bold px-1 py-0.5 rounded leading-none">AI</span>
            </div>
            <p className="hidden sm:block text-sm text-gray-500">© {new Date().getFullYear()} OpenBroker AI. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
