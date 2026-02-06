/**
 * PricingLogic.ts
 *
 * Central pricing logic and memory store for OpenPricev7
 * Contains all pricing calculations, filters, and state management
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface Adjustment {
  description: string
  amount: number      // Price adjustment (e.g., -1.500, 0.500)
  rateAdj?: number    // Rate adjustment (e.g., 0.000%, 0.125%)
  percentage?: number // Alternative rate field
}

export interface RateOption {
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

export interface Program {
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

export interface PricingResult {
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

export interface TargetPricingOption {
  rate: number
  points: number
  apr: number
  price: number
  payment: number
  programName: string
  adjustments: Adjustment[]
}

export interface LoanScenario {
  loanAmount: number
  propertyValue: number
  ltv: number
  creditScore: number
  dti: number
  occupancyType: string
  propertyType: string
  loanPurpose: string
  loanTerm: number
  prepayPeriod?: string
}

export interface PricingMemoryEntry {
  id: string
  timestamp: Date
  scenario: LoanScenario
  result: PricingResult | null
  targetPricing: TargetPricingOption | null
  duration: number // API call duration in ms
}

// ============================================================================
// PRICING MEMORY STORE
// ============================================================================

class PricingMemoryStore {
  private entries: PricingMemoryEntry[] = []
  private maxEntries: number = 100

  /**
   * Add a new pricing entry to memory
   */
  add(scenario: LoanScenario, result: PricingResult | null, targetPricing: TargetPricingOption | null, duration: number): string {
    const id = `pricing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const entry: PricingMemoryEntry = {
      id,
      timestamp: new Date(),
      scenario,
      result,
      targetPricing,
      duration
    }

    this.entries.unshift(entry)

    // Trim to max entries
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(0, this.maxEntries)
    }

    return id
  }

  /**
   * Get all pricing history entries
   */
  getAll(): PricingMemoryEntry[] {
    return [...this.entries]
  }

  /**
   * Get entry by ID
   */
  getById(id: string): PricingMemoryEntry | undefined {
    return this.entries.find(e => e.id === id)
  }

  /**
   * Get recent entries (last N)
   */
  getRecent(count: number = 10): PricingMemoryEntry[] {
    return this.entries.slice(0, count)
  }

  /**
   * Find similar scenarios in history
   */
  findSimilar(scenario: LoanScenario, tolerance: number = 0.1): PricingMemoryEntry[] {
    return this.entries.filter(entry => {
      const s = entry.scenario
      const ltvDiff = Math.abs(s.ltv - scenario.ltv) / scenario.ltv
      const scoreDiff = Math.abs(s.creditScore - scenario.creditScore) / scenario.creditScore
      const amountDiff = Math.abs(s.loanAmount - scenario.loanAmount) / scenario.loanAmount

      return ltvDiff <= tolerance &&
             scoreDiff <= tolerance &&
             amountDiff <= tolerance &&
             s.occupancyType === scenario.occupancyType &&
             s.loanPurpose === scenario.loanPurpose
    })
  }

  /**
   * Get statistics from pricing history
   */
  getStats(): {
    totalQueries: number
    avgDuration: number
    avgRate: number
    successRate: number
  } {
    const successful = this.entries.filter(e => e.result && !e.result.apiError)
    const avgDuration = this.entries.length > 0
      ? this.entries.reduce((sum, e) => sum + e.duration, 0) / this.entries.length
      : 0
    const avgRate = successful.length > 0
      ? successful.reduce((sum, e) => sum + (e.targetPricing?.rate || 0), 0) / successful.length
      : 0

    return {
      totalQueries: this.entries.length,
      avgDuration: Math.round(avgDuration),
      avgRate: Math.round(avgRate * 1000) / 1000,
      successRate: this.entries.length > 0
        ? Math.round((successful.length / this.entries.length) * 100)
        : 0
    }
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries = []
  }

  /**
   * Export to JSON
   */
  export(): string {
    return JSON.stringify(this.entries, null, 2)
  }
}

// Singleton instance
export const pricingMemory = new PricingMemoryStore()

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Safely convert value to number with fallback
 */
export const safeNumber = (value: unknown, fallback: number = 0): number => {
  if (typeof value === 'number' && !isNaN(value)) return value
  if (typeof value === 'string') {
    const parsed = parseFloat(value)
    if (!isNaN(parsed)) return parsed
  }
  return fallback
}

/**
 * Calculate LTV ratio
 */
export const calculateLTV = (loanAmount: number, propertyValue: number): number => {
  if (propertyValue <= 0) return 0
  return Math.round((loanAmount / propertyValue) * 1000) / 10
}

/**
 * Calculate DSCR ratio from rent and housing expense
 */
export const calculateDSCR = (grossRent: number, presentHousingExpense: number): {
  value: number
  range: string
  display: string
} => {
  if (presentHousingExpense <= 0) {
    return { value: 0, range: 'noRatio', display: 'N/A' }
  }

  const ratio = grossRent / presentHousingExpense
  let range: string

  // Ranges must match App.tsx calculatedDSCR and API mapDSCRRatio
  if (ratio >= 1.250) range = '>=1.250'
  else if (ratio >= 1.150) range = '1.150-1.249'
  else if (ratio >= 1.000) range = '1.00-1.149'
  else if (ratio >= 0.750) range = '0.750-0.999'
  else if (ratio >= 0.500) range = '0.500-0.749'
  else range = 'noRatio'

  return {
    value: Math.round(ratio * 1000) / 1000,
    range,
    display: ratio.toFixed(3)
  }
}

/**
 * Format currency string
 */
export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}

/**
 * Format percentage string
 */
export const formatPercent = (value: number, decimals: number = 3): string => {
  return `${value.toFixed(decimals)}%`
}

/**
 * Format price (100 - points)
 */
export const formatPrice = (points: number): string => {
  return (100 - points).toFixed(3)
}

// ============================================================================
// PPP (PREPAYMENT PENALTY) LOGIC
// ============================================================================

/**
 * Map prepay period form value to PPP pattern in program name
 */
export const getPPPPattern = (prepayPeriod: string): string => {
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

/**
 * Check if a program/option has PPP (prepayment penalty)
 * Note: 0MO PPP or 0 YR PPP means NO prepay penalty, so these are OK for all property types
 */
export const hasPPPInName = (text: string): boolean => {
  const upper = text.toUpperCase()
  // 0MO PPP or 0 YR PPP means NO prepayment penalty - these are OK for all property types
  if (upper.includes('0MO PPP') || upper.includes('0 YR PPP') || upper.includes('0YR PPP')) {
    return false
  }
  return upper.includes(' PPP') || upper.includes('YR PPP') || /\d\s*YR\s*PPP/i.test(upper)
}

/**
 * Check if PPP is allowed based on occupancy type
 */
export const isPPPAllowed = (occupancyType: string): boolean => {
  return occupancyType === 'investment'
}

// ============================================================================
// PRICING FILTERS
// ============================================================================

/**
 * Filter rate options by price range (99.000 to 101.000)
 */
export const filterRateOptionsByPrice = (
  rateOptions: RateOption[],
  minPrice: number = 99.0,
  maxPrice: number = 101.0
): RateOption[] => {
  return rateOptions.filter(opt => {
    const price = 100 - safeNumber(opt.points)
    return price >= minPrice && price <= maxPrice
  })
}

/**
 * Filter programs to exclude PPP for non-investment properties
 */
export const filterProgramsByOccupancy = (
  programs: Program[],
  occupancyType: string
): Program[] => {
  if (occupancyType === 'investment') {
    return programs // All programs allowed for investment
  }

  // For Primary/Secondary: filter out PPP programs
  return programs.filter(program => {
    const name = program.name || ''
    if (hasPPPInName(name)) return false

    // Also filter out rate options with PPP in description
    if (program.rateOptions) {
      program.rateOptions = program.rateOptions.filter(
        opt => !hasPPPInName(opt.description || '')
      )
    }

    return program.rateOptions && program.rateOptions.length > 0
  })
}

/**
 * Sort rate options by rate (lowest first) or by price (closest to par)
 */
export const sortRateOptions = (
  rateOptions: RateOption[],
  sortBy: 'rate' | 'price' = 'rate'
): RateOption[] => {
  return [...rateOptions].sort((a, b) => {
    if (sortBy === 'rate') {
      return safeNumber(a.rate) - safeNumber(b.rate)
    } else {
      const priceA = Math.abs(100 - safeNumber(a.points) - 100)
      const priceB = Math.abs(100 - safeNumber(b.points) - 100)
      return priceA - priceB
    }
  })
}

// ============================================================================
// TARGET PRICING CALCULATION
// ============================================================================

/**
 * Find the TARGET PRICING based on user's PPP selection (Investment only) or best non-PPP program
 */
export const getTargetPricing = (
  programs: Program[] | undefined,
  occupancyType: string,
  prepayPeriod: string
): TargetPricingOption | null => {
  if (!programs || !Array.isArray(programs)) return null

  const pppAllowed = isPPPAllowed(occupancyType)
  const selectedPPP = pppAllowed ? getPPPPattern(prepayPeriod) : ''
  let targetOption: TargetPricingOption | null = null
  let closestDistance = Infinity

  // First pass: find exact PPP match (for investment) or best non-PPP
  programs.forEach(program => {
    if (!program || !Array.isArray(program.rateOptions)) return
    const programName = program.name || 'Unknown'

    program.rateOptions.forEach(opt => {
      if (!opt) return
      const desc = (opt.description || programName).toUpperCase()
      const hasPPP = hasPPPInName(desc)

      // For Primary/Secondary homes: SKIP any PPP programs entirely
      if (!pppAllowed && hasPPP) return

      // For Investment properties: match the user's selected PPP
      if (pppAllowed) {
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
    programs.forEach(program => {
      if (!program || !Array.isArray(program.rateOptions)) return
      const programName = program.name || 'Unknown'

      program.rateOptions.forEach(opt => {
        if (!opt) return
        const desc = (opt.description || programName).toUpperCase()
        const hasPPP = hasPPPInName(desc)

        // Still skip PPP programs for Primary/Secondary in fallback
        if (!pppAllowed && hasPPP) return

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

/**
 * Calculate total adjustments from an array of adjustments
 */
export const calculateTotalAdjustments = (adjustments: Adjustment[]): {
  priceAdjustment: number
  rateAdjustment: number
} => {
  return adjustments.reduce(
    (totals, adj) => ({
      priceAdjustment: totals.priceAdjustment + (adj.amount || 0),
      rateAdjustment: totals.rateAdjustment + (adj.rateAdj || 0)
    }),
    { priceAdjustment: 0, rateAdjustment: 0 }
  )
}

/**
 * Find the best rate option from a list (lowest rate)
 */
export const findBestRate = (rateOptions: RateOption[]): RateOption | null => {
  if (!rateOptions || rateOptions.length === 0) return null

  return rateOptions.reduce((best, opt) => {
    return safeNumber(opt.rate) < safeNumber(best.rate) ? opt : best
  }, rateOptions[0])
}

/**
 * Find the option closest to par pricing (100)
 */
export const findClosestToPar = (rateOptions: RateOption[]): RateOption | null => {
  if (!rateOptions || rateOptions.length === 0) return null

  return rateOptions.reduce((best, opt) => {
    const bestDistance = Math.abs(100 - safeNumber(best.points) - 100)
    const optDistance = Math.abs(100 - safeNumber(opt.points) - 100)
    return optDistance < bestDistance ? opt : best
  }, rateOptions[0])
}

// ============================================================================
// PRICING VALIDATION
// ============================================================================

export interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Validate loan scenario for pricing
 */
export const validateScenario = (scenario: LoanScenario): ValidationResult => {
  const errors: string[] = []
  const warnings: string[] = []

  // Required field checks
  if (scenario.loanAmount <= 0) errors.push('Loan amount must be greater than 0')
  if (scenario.propertyValue <= 0) errors.push('Property value must be greater than 0')
  if (scenario.creditScore < 300 || scenario.creditScore > 850) errors.push('Credit score must be between 300 and 850')
  if (scenario.dti < 0 || scenario.dti > 100) errors.push('DTI must be between 0 and 100')

  // LTV checks
  if (scenario.ltv > 100) errors.push('LTV cannot exceed 100%')
  if (scenario.ltv > 95) warnings.push('High LTV may limit program availability')

  // Credit score warnings
  if (scenario.creditScore < 620) warnings.push('Credit score below 620 may limit options')
  if (scenario.creditScore < 680) warnings.push('Better rates available with 680+ credit score')

  // DTI warnings
  if (scenario.dti > 43) warnings.push('DTI above 43% may require manual underwriting')
  if (scenario.dti > 50) warnings.push('High DTI may significantly limit options')

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

// ============================================================================
// PRE-SUBMIT FORM VALIDATION
// ============================================================================

/**
 * Validate form data before sending to API.
 * Prevents fake/default/invalid data from reaching MeridianLink.
 */
export const validateFormBeforeSubmit = (formData: Record<string, any>): ValidationResult => {
  const errors: string[] = []
  const warnings: string[] = []

  const parseNum = (val: any): number => Number(String(val || '0').replace(/,/g, '')) || 0

  const loanAmount = parseNum(formData.loanAmount)
  const propertyValue = parseNum(formData.propertyValue)
  const creditScore = parseNum(formData.creditScore)
  const dti = parseNum(formData.dti)
  const ltv = parseFloat(formData.ltv) || 0

  // === Required numeric validations ===
  if (loanAmount < 50000) errors.push('Loan amount must be at least $50,000')
  if (loanAmount > 10000000) errors.push('Loan amount exceeds maximum ($10M)')
  if (propertyValue < 50000) errors.push('Property value must be at least $50,000')
  if (propertyValue > 50000000) errors.push('Property value exceeds maximum ($50M)')
  if (loanAmount > propertyValue) errors.push('Loan amount cannot exceed property value')
  if (creditScore < 300 || creditScore > 850) errors.push('Credit score must be 300-850')
  if (dti < 1 || dti > 65) errors.push('DTI must be 1-65%')
  if (ltv <= 0 || ltv > 100) errors.push('LTV must be between 0% and 100%')

  // === Required string fields ===
  if (!formData.propertyZip || String(formData.propertyZip).length !== 5) {
    errors.push('Valid 5-digit ZIP code is required')
  }
  if (!formData.propertyState) errors.push('Property state is required')
  if (!formData.occupancyType) errors.push('Property use is required')
  if (!formData.propertyType) errors.push('Property type is required')
  if (!formData.loanPurpose) errors.push('Loan purpose is required')
  if (!formData.loanTerm) errors.push('Loan term is required')

  // === DSCR-specific validation ===
  if (formData.documentationType === 'dscr') {
    if (formData.occupancyType !== 'investment') {
      errors.push('DSCR income documentation is only available for Investment properties')
    }
    const grossRent = parseNum(formData.grossRent)
    const housingExpense = parseNum(formData.presentHousingExpense)
    if (grossRent <= 0) errors.push('Gross Rent is required for DSCR loans')
    if (housingExpense <= 0) errors.push('Housing Expense is required for DSCR loans')
    if (grossRent > 0 && housingExpense > 0) {
      const dscrRatio = grossRent / housingExpense
      if (dscrRatio < 0.5) warnings.push(`DSCR ratio ${dscrRatio.toFixed(3)} is very low - may not qualify`)
    }
  }

  // === Cash-out LTV cap ===
  if (formData.loanPurpose === 'cashout' && ltv > 85) {
    errors.push(`Cash-out refinance max LTV is 85%. Current: ${ltv.toFixed(1)}%`)
  }

  // === LTV consistency check ===
  if (loanAmount > 0 && propertyValue > 0) {
    const calculatedLtv = (loanAmount / propertyValue) * 100
    if (Math.abs(calculatedLtv - ltv) > 1) {
      warnings.push(`LTV (${ltv}%) doesn't match Loan/Value calc (${calculatedLtv.toFixed(1)}%)`)
    }
  }

  return { isValid: errors.length === 0, errors, warnings }
}

// ============================================================================
// EXPORT DEFAULTS
// ============================================================================

export default {
  pricingMemory,
  safeNumber,
  calculateLTV,
  calculateDSCR,
  formatCurrency,
  formatPercent,
  formatPrice,
  getPPPPattern,
  hasPPPInName,
  isPPPAllowed,
  filterRateOptionsByPrice,
  filterProgramsByOccupancy,
  sortRateOptions,
  getTargetPricing,
  calculateTotalAdjustments,
  findBestRate,
  findClosestToPar,
  validateScenario,
  validateFormBeforeSubmit
}
