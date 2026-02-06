import { useState, useEffect } from 'react'
import { Calculator, DollarSign, Cloud, Loader2, CheckCircle2, AlertCircle, Info, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency, formatPercent } from '@/lib/utils'

interface LoanData {
  // Loan Information
  lienPosition: string
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

const REQUIRED_FIELDS: (keyof LoanData)[] = ['loanType', 'loanPurpose', 'loanAmount', 'propertyValue', 'propertyZip', 'propertyState', 'propertyType', 'occupancyType', 'creditScore', 'dti', 'loanTerm']

const FIELD_LABELS: Record<string, string> = {
  lienPosition: 'Lien Position', loanType: 'Loan Type', loanPurpose: 'Loan Purpose', loanAmount: 'Loan Amount',
  propertyValue: 'Home Value/Sales Price', propertyZip: 'ZIP Code', propertyState: 'State', propertyCounty: 'County',
  propertyCity: 'City', propertyType: 'Property Type', occupancyType: 'Property Use', creditScore: 'Credit Score',
  dti: 'DTI', loanTerm: 'Loan Term', cashoutAmount: 'Cashout Amount', structureType: 'Structure Type',
  amortization: 'Amortization', product: 'Product', paymentType: 'Payment', impoundType: 'Impound Type'
}

// ZIP code to location lookup (simplified - in production use API)
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
                description: String(o.description || '')
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
  lockPeriod: '30',
  loanType: 'nonqm',
  loanPurpose: 'purchase',
  cashoutAmount: '',
  loanAmount: '600,000',
  propertyValue: '800,000',
  propertyZip: '90120',
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
  prepayPeriod: '3year',
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

  // Calculate LTV automatically
  const calculatedLTV = (() => {
    const loan = Number(formData.loanAmount.replace(/,/g, '')) || 0
    const prop = Number(formData.propertyValue.replace(/,/g, '')) || 0
    return prop > 0 ? ((loan / prop) * 100).toFixed(2) : '0.00'
  })()

  // Auto-populate location from ZIP
  useEffect(() => {
    if (formData.propertyZip.length === 5) {
      const location = ZIP_LOOKUP[formData.propertyZip]
      if (location) {
        setFormData(prev => ({
          ...prev,
          propertyCity: location.city,
          propertyCounty: location.county,
          propertyState: location.state
        }))
      }
    }
  }, [formData.propertyZip])

  const handleInputChange = (field: keyof LoanData, value: string | boolean) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value }
      // Auto-sync documentationType when loanType changes to DSCR
      if (field === 'loanType' && value === 'dscr') {
        updated.documentationType = 'dscr'
      }
      // Also sync if documentationType is set to dscr and loanType isn't already dscr
      if (field === 'documentationType' && value === 'dscr' && prev.loanType !== 'dscr') {
        updated.loanType = 'dscr'
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
    if (formData.propertyValue && propVal < 50000) errors.propertyValue = 'Minimum property value is $50,000'
    if (formData.loanAmount && formData.propertyValue && loanAmt > propVal) errors.loanAmount = 'Loan amount cannot exceed property value'

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
    if (formData.creditScore && (creditScore < 300 || creditScore > 850)) errors.creditScore = 'Credit score must be 300-850'
    const dti = Number(formData.dti)
    if (formData.dti && (dti < 1 || dti > 65)) errors.dti = 'DTI must be 1-65%'
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
    setIsLoading(true); setError(null); setResult(null)
    try {
      const response = await fetch('/api/get-pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          loanAmount: Number(formData.loanAmount.replace(/,/g, '')),
          propertyValue: Number(formData.propertyValue.replace(/,/g, '')),
          cashoutAmount: formData.cashoutAmount ? Number(formData.cashoutAmount.replace(/,/g, '')) : 0,
          creditScore: Number(formData.creditScore),
          dti: Number(formData.dti),
          ltv: Number(calculatedLTV),
          presentHousingExpense: Number(formData.presentHousingExpense.replace(/,/g, '')),
          grossRent: Number(formData.grossRent.replace(/,/g, '')),
          dscrRatio: calculatedDSCR.range // Use calculated range for API
        })
      })
      const data = await response.json()
      if (!data.success) throw new Error(data.error || 'Pricing request failed')

      // Sanitize and validate the response data
      const sanitizedResult = sanitizePricingResult(data.data)
      if (!sanitizedResult) {
        throw new Error('Invalid pricing response from server')
      }

      setResult(sanitizedResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get pricing')
    }
    finally { setIsLoading(false) }
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

  // Map prepay period form value to PPP pattern in program name
  const getPPPPattern = (prepayPeriod: string): string => {
    const map: Record<string, string> = {
      '5year': '5 YR PPP',
      '4year': '4 YR PPP',
      '3year': '3 YR PPP',
      '2year': '2 YR PPP',
      '1year': '1 YR PPP',
      '0year': '0 YR PPP',
    }
    return map[prepayPeriod] || '3 YR PPP'
  }

  // Find the TARGET PRICING based on user's PPP selection (Investment only) or best non-PPP program
  const getTargetPricing = (): TargetPricingOption | null => {
    if (!result?.programs || !Array.isArray(result.programs)) return null

    // CRITICAL: PPP is ONLY allowed for Investment properties
    const isPPPAllowed = formData.occupancyType === 'investment'
    const selectedPPP = isPPPAllowed ? getPPPPattern(formData.prepayPeriod) : ''
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

        // For Investment properties: match the user's selected PPP
        if (isPPPAllowed) {
          const matchesPPP = desc.includes(selectedPPP.toUpperCase()) ||
                            desc.includes(selectedPPP.replace(' YR ', 'YR ').toUpperCase())
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
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Cloud className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-semibold text-gray-900">MyPrice</span>
            </div>
            <nav className="flex items-center gap-6">
              <a href="#" className="text-sm font-medium text-gray-600 hover:text-gray-900">Dashboard</a>
              <a href="#" className="text-sm font-medium text-gray-600 hover:text-gray-900">Loans</a>
              <a href="#" className="text-sm font-medium text-gray-600 hover:text-gray-900">Settings</a>
              <Button variant="outline" size="sm">Sign Out</Button>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Quick Pricer</h1>
        </div>

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
                    {/* LINE 1: Lien Position, Lock Period, Loan Type, Loan Purpose, Term */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      <div className="space-y-2">
                        <Label>Lien Position</Label>
                        <Select value={formData.lienPosition} onValueChange={(v) => handleInputChange('lienPosition', v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1st">1st</SelectItem>
                            <SelectItem value="2nd">2nd</SelectItem>
                            <SelectItem value="heloc">HELOC</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Lock Period</Label>
                        <Select value={formData.lockPeriod} onValueChange={(v) => handleInputChange('lockPeriod', v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="30">30</SelectItem>
                            <SelectItem value="45">45</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className={hasError('loanType') ? 'text-red-600' : ''}>Loan Type *</Label>
                        <Select value={formData.loanType} onValueChange={(v) => handleInputChange('loanType', v)}>
                          <SelectTrigger className={hasError('loanType') ? 'border-red-500' : ''}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="nonqm">Non-QM</SelectItem>
                          </SelectContent>
                        </Select>
                        {hasError('loanType') && <p className="text-xs text-red-600">{validationErrors.loanType}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label className={hasError('loanPurpose') ? 'text-red-600' : ''}>Loan Purpose *</Label>
                        <Select value={formData.loanPurpose} onValueChange={(v) => handleInputChange('loanPurpose', v)}>
                          <SelectTrigger className={hasError('loanPurpose') ? 'border-red-500' : ''}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="purchase">Purchase</SelectItem>
                            <SelectItem value="refinance">Refi Rate/Term</SelectItem>
                            <SelectItem value="cashout">Refinance Cashout</SelectItem>
                          </SelectContent>
                        </Select>
                        {hasError('loanPurpose') && <p className="text-xs text-red-600">{validationErrors.loanPurpose}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label className={hasError('loanTerm') ? 'text-red-600' : ''}>Term *</Label>
                        <Select value={formData.loanTerm} onValueChange={(v) => handleInputChange('loanTerm', v)}>
                          <SelectTrigger className={hasError('loanTerm') ? 'border-red-500' : ''}><SelectValue /></SelectTrigger>
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

                    {/* LINE 2: Appraised Value/Sales Price, Loan Amount, 1st Lien (LTV tooltip), CLTV, Amortization */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
                      <div className="space-y-2">
                        <Label className={hasError('propertyValue') ? 'text-red-600' : ''}>Value/Sales Price *</Label>
                        <Input
                          value={formData.propertyValue}
                          onChange={(e) => handleInputChange('propertyValue', formatNumberInput(e.target.value))}
                          icon={<DollarSign className="w-4 h-4" />}
                          className={hasError('propertyValue') ? 'border-red-500' : ''}
                        />
                        {hasError('propertyValue') && <p className="text-xs text-red-600">{validationErrors.propertyValue}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label className={hasError('loanAmount') ? 'text-red-600' : ''}>Loan Amount *</Label>
                        <Input
                          value={formData.loanAmount}
                          onChange={(e) => handleInputChange('loanAmount', formatNumberInput(e.target.value))}
                          icon={<DollarSign className="w-4 h-4" />}
                          className={hasError('loanAmount') ? 'border-red-500' : ''}
                        />
                        {hasError('loanAmount') && <p className="text-xs text-red-600">{validationErrors.loanAmount}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label className="flex items-center gap-1">
                          1st Lien
                          <span className="relative group">
                            <Info className="w-3.5 h-3.5 text-blue-500 cursor-help" />
                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                              LTV: Loan-to-Value Ratio
                              <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></span>
                            </span>
                          </span>
                        </Label>
                        <div className="h-10 px-3 py-2 bg-gray-100 border rounded-md text-sm font-medium">
                          {calculatedLTV}%
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>CLTV</Label>
                        <div className="h-10 px-3 py-2 bg-gray-100 border rounded-md text-sm font-medium">
                          {formData.lienPosition === '1st' ? `${calculatedLTV}%` : 'Enter 2nd Lien'}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Amortization</Label>
                        <Select value={formData.amortization} onValueChange={(v) => handleInputChange('amortization', v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
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

                    {/* LINE 3: Product, Payment, Impound Type + Cashout if applicable */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                      <div className="space-y-2">
                        <Label>Product</Label>
                        <div className="h-10 px-3 py-2 bg-gray-100 border rounded-md text-sm font-medium">
                          Conventional
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Payment</Label>
                        <Select value={formData.paymentType} onValueChange={(v) => handleInputChange('paymentType', v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pi">P&I</SelectItem>
                            <SelectItem value="io">Interest Only</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Impound Type</Label>
                        <Select value={formData.impoundType} onValueChange={(v) => handleInputChange('impoundType', v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="escrowed">Taxes and Insurance Escrowed</SelectItem>
                            <SelectItem value="noescrow">No Escrow</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {showCashoutField && (
                        <div className="space-y-2">
                          <Label>Cashout Amount</Label>
                          <Input
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
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label className={hasError('propertyZip') ? 'text-red-600' : ''}>ZIP Code *</Label>
                        <Input
                          maxLength={5}
                          value={formData.propertyZip}
                          onChange={(e) => handleInputChange('propertyZip', e.target.value.replace(/\D/g, ''))}
                          className={hasError('propertyZip') ? 'border-red-500' : ''}
                        />
                        {hasError('propertyZip') && <p className="text-xs text-red-600">{validationErrors.propertyZip}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label className={hasError('propertyState') ? 'text-red-600' : ''}>State *</Label>
                        <Select value={formData.propertyState} onValueChange={(v) => handleInputChange('propertyState', v)}>
                          <SelectTrigger className={hasError('propertyState') ? 'border-red-500' : ''}><SelectValue /></SelectTrigger>
                          <SelectContent>{US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                        </Select>
                        {hasError('propertyState') && <p className="text-xs text-red-600">{validationErrors.propertyState}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>County</Label>
                        <Input value={formData.propertyCounty} onChange={(e) => handleInputChange('propertyCounty', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>City</Label>
                        <Input value={formData.propertyCity} onChange={(e) => handleInputChange('propertyCity', e.target.value)} />
                      </div>
                    </div>
                    {/* LINE 2: Property type fields */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                      <div className="space-y-2">
                        <Label className={hasError('occupancyType') ? 'text-red-600' : ''}>Property Use *</Label>
                        <Select value={formData.occupancyType} onValueChange={(v) => handleInputChange('occupancyType', v)}>
                          <SelectTrigger className={hasError('occupancyType') ? 'border-red-500' : ''}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="primary">Primary Residence</SelectItem>
                            <SelectItem value="secondary">Second Home</SelectItem>
                            <SelectItem value="investment">Investment</SelectItem>
                          </SelectContent>
                        </Select>
                        {hasError('occupancyType') && <p className="text-xs text-red-600">{validationErrors.occupancyType}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label className={hasError('propertyType') ? 'text-red-600' : ''}>Property Type *</Label>
                        <Select value={formData.propertyType} onValueChange={(v) => handleInputChange('propertyType', v)}>
                          <SelectTrigger className={hasError('propertyType') ? 'border-red-500' : ''}><SelectValue /></SelectTrigger>
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
                        <Label>Structure Type</Label>
                        <Select value={formData.structureType} onValueChange={(v) => handleInputChange('structureType', v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="detached">Detached</SelectItem>
                            <SelectItem value="attached">Attached</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {/* LINE 3: Property checkboxes */}
                    <div className="flex flex-wrap gap-6 mt-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.isRuralProperty}
                          onChange={(e) => handleInputChange('isRuralProperty', e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <span className="text-sm">Rural Property</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.isNonWarrantableProject}
                          onChange={(e) => handleInputChange('isNonWarrantableProject', e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <span className="text-sm">Non-Warrantable Project?</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
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
                        <Label className={hasError('creditScore') ? 'text-red-600' : ''}>Estimated Credit Score *</Label>
                        <Input
                          maxLength={3}
                          value={formData.creditScore}
                          onChange={(e) => handleInputChange('creditScore', e.target.value.replace(/\D/g, ''))}
                          className={hasError('creditScore') ? 'border-red-500' : ''}
                        />
                        {hasError('creditScore') && <p className="text-xs text-red-600">{validationErrors.creditScore}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label className={hasError('dti') ? 'text-red-600' : ''}>DTI (%) *</Label>
                        <Input
                          maxLength={2}
                          value={formData.dti}
                          onChange={(e) => handleInputChange('dti', e.target.value.replace(/\D/g, ''))}
                          className={hasError('dti') ? 'border-red-500' : ''}
                        />
                        {hasError('dti') && <p className="text-xs text-red-600">{validationErrors.dti}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>Citizenship</Label>
                        <Select value={formData.citizenship} onValueChange={(v) => handleInputChange('citizenship', v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
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
                        <Label>Doc Type</Label>
                        <Select value={formData.documentationType} onValueChange={(v) => handleInputChange('documentationType', v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
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
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.isSelfEmployed}
                          onChange={(e) => handleInputChange('isSelfEmployed', e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <span className="text-sm">Self Employed</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
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
                          <Label>Prepay Period</Label>
                          <Select value={formData.prepayPeriod} onValueChange={(v) => handleInputChange('prepayPeriod', v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="5year">5 Year</SelectItem>
                              <SelectItem value="4year">4 Year</SelectItem>
                              <SelectItem value="3year">3 Year</SelectItem>
                              <SelectItem value="2year">2 Year</SelectItem>
                              <SelectItem value="1year">1 Year</SelectItem>
                              <SelectItem value="0year">0 Year</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Prepay Type</Label>
                          <Select value={formData.prepayType} onValueChange={(v) => handleInputChange('prepayType', v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="5pct">5%</SelectItem>
                              <SelectItem value="declining">Declining</SelectItem>
                              <SelectItem value="6mointerest">6 Months Interest</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>DSCR Entity Type</Label>
                          <Select value={formData.dscrEntityType} onValueChange={(v) => handleInputChange('dscrEntityType', v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="individual">Individual</SelectItem>
                              <SelectItem value="llc">LLC</SelectItem>
                              <SelectItem value="corp">Corp.</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {/* DSCR Calculation Fields */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                        <div className="space-y-2">
                          <Label>Present Housing Expense</Label>
                          <Input
                            value={formData.presentHousingExpense}
                            onChange={(e) => handleInputChange('presentHousingExpense', formatNumberInput(e.target.value))}
                            icon={<DollarSign className="w-4 h-4" />}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Gross Rent</Label>
                          <Input
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
                      {/* LINE 3: Investor checkboxes */}
                      <div className="flex flex-wrap gap-6 mt-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.isSeasonalProperty || formData.isShortTermRental}
                            onChange={(e) => {
                              handleInputChange('isSeasonalProperty', e.target.checked)
                              handleInputChange('isShortTermRental', e.target.checked)
                            }}
                            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                          />
                          <span className="text-sm">Seasonal Property/Short Term Rental</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.isCrossCollateralized}
                            onChange={(e) => handleInputChange('isCrossCollateralized', e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                          />
                          <span className="text-sm">Cross-Collateralized</span>
                        </label>
                        {/* Prepayment Penalty Section - Greyed out with both options selected */}
                        <div className="flex items-center gap-4 opacity-60">
                          <span className="text-sm font-medium text-gray-500">Prepayment Penalty:</span>
                          <label className="flex items-center gap-1.5 cursor-not-allowed">
                            <input
                              type="checkbox"
                              checked={true}
                              disabled={true}
                              className="w-4 h-4 rounded border-gray-300 text-gray-400 cursor-not-allowed"
                            />
                            <span className="text-sm text-gray-500">None</span>
                          </label>
                          <label className="flex items-center gap-1.5 cursor-not-allowed">
                            <input
                              type="checkbox"
                              checked={true}
                              disabled={true}
                              className="w-4 h-4 rounded border-gray-300 text-gray-400 cursor-not-allowed"
                            />
                            <span className="text-sm text-gray-500">Has PPP</span>
                          </label>
                          {/* Occupancy Rate - Greyed out, default 100 */}
                          <div className="flex items-center gap-1.5 ml-4">
                            <span className="text-sm text-gray-500">Occupancy Rate:</span>
                            <input
                              type="text"
                              value="100"
                              disabled={true}
                              className="w-14 px-2 py-1 text-sm border border-gray-300 rounded bg-gray-100 text-gray-500 cursor-not-allowed"
                            />
                            <span className="text-sm text-gray-500">%</span>
                          </div>
                        </div>
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
                      <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={formData.is5PlusUnits} onChange={(e) => handleInputChange('is5PlusUnits', e.target.checked)} className="w-4 h-4 rounded" />
                          <span className="text-sm">5+ Units</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={formData.hasITIN} onChange={(e) => handleInputChange('hasITIN', e.target.checked)} className="w-4 h-4 rounded" />
                          <span className="text-sm">Borrower has ITIN</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={formData.isAVMOrCDA} onChange={(e) => handleInputChange('isAVMOrCDA', e.target.checked)} className="w-4 h-4 rounded" />
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
                        {result.source === 'meridianlink' ? (
                          <div className="flex items-center gap-1.5 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-md">
                            <CheckCircle2 className="w-3 h-3" />Live PML Pricing
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-md">
                            <Info className="w-3 h-3" />Demo pricing - for illustration only
                          </div>
                        )}
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
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
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
                                    <td className={`py-2 px-3 font-medium ${priceDisplay < 0 ? 'text-red-600' : priceDisplay > 0 ? 'text-green-600' : 'text-gray-600'}`}>
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
                              <div className="flex items-center justify-between flex-wrap gap-2">
                                {/* Program Name */}
                                <div className="flex-1 min-w-[200px] text-left">
                                  <div className="font-medium text-sm text-gray-900">{programName}</div>
                                  <div className="text-xs text-gray-500">{filteredRateOptions.length} rate options</div>
                                </div>

                                {/* Key Metrics - Horizontal */}
                                <div className="flex items-center gap-6 text-sm">
                                  <div className="text-center min-w-[70px]">
                                    <div className="text-primary font-bold text-lg">{bestRate ? safeNumber(bestRate.rate).toFixed(3) : '-'}%</div>
                                    <div className="text-xs text-gray-500">Rate</div>
                                  </div>
                                  <div className="text-center min-w-[70px]">
                                    <div className="font-semibold text-gray-900">{bestRate ? (100 - safeNumber(bestRate.points)).toFixed(3) : '-'}</div>
                                    <div className="text-xs text-gray-500">Price</div>
                                  </div>
                                  <div className="text-center min-w-[70px]">
                                    <div className="font-semibold text-gray-900">{bestRate ? safeNumber(bestRate.apr).toFixed(3) : '-'}%</div>
                                    <div className="text-xs text-gray-500">APR</div>
                                  </div>
                                  <div className="text-center min-w-[90px]">
                                    <div className="font-semibold text-gray-900">{bestPayment > 0 ? formatCurrency(bestPayment) : '-'}</div>
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
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
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

              </>
            ) : null}
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-200 bg-white mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-primary rounded flex items-center justify-center">
                <Cloud className="w-4 h-4 text-white" />
              </div>
              <span className="text-sm font-medium text-gray-600">MyPrice</span>
            </div>
            <p className="text-sm text-gray-500">© {new Date().getFullYear()} MyPrice. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
