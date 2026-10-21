import Decimal from 'decimal.js';
import { roundMoney, uniqueWarnings } from './math';
import type {
  AnnualRules,
  FilingStatus,
  MfsLivingTogetherTreatment,
  ModuleMeta,
  PlanningAssumptions,
  PlanningInput,
  SourceRecord,
  TaxBracket,
  TaxInput,
} from './types';

export interface FederalTaxResult {
  taxableIncome: number;
  federalTax: number;
  marginalRate: number;
  effectiveRate: number;
  taxableSocialSecurity: number;
  provisionalIncome: number;
  standardDeduction: number;
  seniorDeduction: number;
  magi: number;
  /** Discloses whether MFS zero-base Social Security treatment was confirmed or conservatively illustrated. */
  mfsSocialSecurityTreatment: MfsLivingTogetherTreatment;
  warnings: string[];
}

/** The planning-level current-household summary. It is not a filed-return calculation. */
export interface TaxesResult extends ModuleMeta {
  current: FederalTaxResult;
  currentTaxInput: TaxInput;
  sourceMetadata: SourceRecord[];
}

interface SocialSecurityTaxability {
  taxable: number;
  provisionalIncome: number;
}

interface CapitalGainTax {
  tax: number;
  marginalRate: number;
}

const FILING_STATUSES: FilingStatus[] = [
  'SINGLE',
  'MARRIED_FILING_JOINTLY',
  'MARRIED_FILING_SEPARATELY',
  'HEAD_OF_HOUSEHOLD',
];

function mfsLivingTogetherTreatment(
  filingStatus: FilingStatus,
  separateLivedTogether: boolean | null | undefined,
): MfsLivingTogetherTreatment {
  if (filingStatus !== 'MARRIED_FILING_SEPARATELY') return 'NOT_APPLICABLE';
  if (separateLivedTogether === true) return 'CONFIRMED_LIVED_TOGETHER';
  if (separateLivedTogether === false) return 'CONFIRMED_LIVED_APART';
  // Preserve the numeric TaxResult contract without representing this conservative
  // illustration as a confirmed household fact.
  return 'UNKNOWN_CONSERVATIVE_LIVED_TOGETHER';
}

function zeroBaseSocialSecurityApplies(treatment: MfsLivingTogetherTreatment): boolean {
  return treatment === 'CONFIRMED_LIVED_TOGETHER' || treatment === 'UNKNOWN_CONSERVATIVE_LIVED_TOGETHER';
}

function requireFiniteNonNegative(value: number | undefined, name: string): number {
  const normalized = value ?? 0;
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error(`${name} must be a finite, non-negative amount.`);
  }
  return normalized;
}

function requireFilingStatus(status: FilingStatus): void {
  if (!FILING_STATUSES.includes(status)) throw new Error('Unsupported filing status.');
}

function roundRate(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Tax rate must be finite.');
  return new Decimal(value).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toNumber();
}

function annualAmount<T extends Record<FilingStatus, number>>(
  values: T,
  filingStatus: FilingStatus,
  name: string,
): number {
  const amount = values[filingStatus];
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`Annual rule ${name} is missing or invalid for ${filingStatus}.`);
  return amount;
}

function qualifyingSeniorCount(ages: number[] | undefined, filingStatus: FilingStatus): number {
  const seniorCount = (ages ?? []).filter((age) => Number.isFinite(age) && age >= 65).length;
  return filingStatus === 'MARRIED_FILING_JOINTLY' ? Math.min(2, seniorCount) : Math.min(1, seniorCount);
}

function progressiveTax(taxableOrdinaryIncome: number, brackets: TaxBracket[]): number {
  if (!Array.isArray(brackets) || brackets.length === 0) throw new Error('Annual tax brackets are required.');

  let lowerBound = 0;
  let remaining = taxableOrdinaryIncome;
  let tax = 0;

  for (const bracket of brackets) {
    if (!Number.isFinite(bracket.rate) || bracket.rate < 0 || bracket.rate > 1) {
      throw new Error('Annual tax bracket rate is invalid.');
    }
    if (bracket.upTo !== null && (!Number.isFinite(bracket.upTo) || bracket.upTo < lowerBound)) {
      throw new Error('Annual tax brackets must be ordered by upper bound.');
    }

    const bracketWidth = bracket.upTo === null ? remaining : Math.max(0, bracket.upTo - lowerBound);
    const amountInBracket = Math.min(remaining, bracketWidth);
    tax += amountInBracket * bracket.rate;
    remaining -= amountInBracket;
    if (remaining <= 0) return tax;

    if (bracket.upTo === null) return tax;
    lowerBound = bracket.upTo;
  }

  throw new Error('Annual tax brackets do not include a final open-ended bracket.');
}

function ordinaryMarginalRate(taxableOrdinaryIncome: number, brackets: TaxBracket[]): number {
  if (taxableOrdinaryIncome <= 0) return 0;
  for (const bracket of brackets) {
    if (bracket.upTo === null || taxableOrdinaryIncome <= bracket.upTo) return bracket.rate;
  }
  throw new Error('Annual tax brackets do not include a final open-ended bracket.');
}

function capitalGainTax(
  taxableOrdinaryIncome: number,
  taxableLongTermCapitalGains: number,
  thresholds: { zero: number; fifteen: number },
): CapitalGainTax {
  if (!Number.isFinite(thresholds.zero) || !Number.isFinite(thresholds.fifteen) || thresholds.zero < 0 || thresholds.fifteen < thresholds.zero) {
    throw new Error('Annual capital-gain thresholds are invalid.');
  }
  if (taxableLongTermCapitalGains <= 0) return { tax: 0, marginalRate: 0 };

  // The thresholds apply to total taxable income, so ordinary taxable income fills the stack first.
  const zeroRateGain = Math.min(taxableLongTermCapitalGains, Math.max(0, thresholds.zero - taxableOrdinaryIncome));
  const afterZeroRate = taxableLongTermCapitalGains - zeroRateGain;
  const fifteenRateGain = Math.min(afterZeroRate, Math.max(0, thresholds.fifteen - taxableOrdinaryIncome - zeroRateGain));
  const twentyRateGain = afterZeroRate - fifteenRateGain;

  return {
    tax: fifteenRateGain * 0.15 + twentyRateGain * 0.2,
    marginalRate: twentyRateGain > 0 ? 0.2 : fifteenRateGain > 0 ? 0.15 : 0,
  };
}

function taxableSocialSecurityDetails(
  ss: number,
  otherIncome: number,
  taxExemptInterest: number,
  filingStatus: FilingStatus,
  rules: AnnualRules,
  separateLivedTogether: boolean,
): SocialSecurityTaxability {
  requireFilingStatus(filingStatus);
  const socialSecurity = requireFiniteNonNegative(ss, 'Social Security');
  const other = requireFiniteNonNegative(otherIncome, 'Other income');
  const exemptInterest = requireFiniteNonNegative(taxExemptInterest, 'Tax-exempt interest');
  const provisionalIncome = other + exemptInterest + socialSecurity * 0.5;
  const supplied = rules.socialSecurity.taxThresholds[filingStatus];
  if (!supplied) throw new Error(`Social Security tax thresholds are missing for ${filingStatus}.`);

  // IRS treats MFS taxpayers who lived with their spouse at any point in the year
  // as having a zero base amount. The zeroes are statutory treatment rather than
  // annual indexed values; all ordinary threshold values remain AnnualRules data.
  const thresholds = filingStatus === 'MARRIED_FILING_SEPARATELY' && separateLivedTogether
    ? { base1: 0, base2: 0, cap: 0 }
    : supplied;

  let taxable = 0;
  if (provisionalIncome > thresholds.base2) {
    taxable = Math.min(
      socialSecurity * 0.85,
      (provisionalIncome - thresholds.base2) * 0.85 + Math.min(socialSecurity * 0.5, thresholds.cap),
    );
  } else if (provisionalIncome > thresholds.base1) {
    taxable = Math.min(socialSecurity * 0.5, (provisionalIncome - thresholds.base1) * 0.5);
  }

  return { taxable: roundMoney(taxable), provisionalIncome: roundMoney(provisionalIncome) };
}

/**
 * Calculates the taxable portion of annual Social Security benefits using the
 * supplied annual threshold table. `otherIncome` must exclude Social Security
 * but include taxable capital gains/qualified dividends where applicable.
 */
export function taxableSocialSecurity(
  ss: number,
  otherIncome: number,
  taxExemptInterest: number,
  filingStatus: FilingStatus,
  rules: AnnualRules,
  separateLivedTogether: boolean | null = false,
): number {
  return taxableSocialSecurityDetails(
    ss,
    otherIncome,
    taxExemptInterest,
    filingStatus,
    rules,
    zeroBaseSocialSecurityApplies(mfsLivingTogetherTreatment(filingStatus, separateLivedTogether)),
  ).taxable;
}

function standardDeduction(input: TaxInput, rules: AnnualRules): number {
  const base = annualAmount(rules.standardDeduction, input.filingStatus, 'standardDeduction');
  const additionalPerEligiblePerson = annualAmount(rules.additionalDeduction65, input.filingStatus, 'additionalDeduction65');
  return roundMoney(base + additionalPerEligiblePerson * qualifyingSeniorCount(input.ages, input.filingStatus));
}

function seniorDeduction(input: TaxInput, rules: AnnualRules, magi: number): number {
  const seniorRule = rules.seniorDeduction;
  if (rules.year > seniorRule.endYear || !seniorRule.eligibleFilingStatuses.includes(input.filingStatus)) return 0;

  const qualifyingPeople = qualifyingSeniorCount(input.ages, input.filingStatus);
  if (qualifyingPeople === 0) return 0;

  const amount = requireFiniteNonNegative(seniorRule.amount, 'Senior deduction amount');
  const phaseoutStart = annualAmount(seniorRule.phaseoutStart, input.filingStatus, 'seniorDeduction.phaseoutStart');
  if (!Number.isFinite(seniorRule.phaseoutRate) || seniorRule.phaseoutRate < 0 || seniorRule.phaseoutRate > 1) {
    throw new Error('Annual senior deduction phaseout rate is invalid.');
  }

  // Each qualifying person receives an independently phased deduction. This
  // deliberately does not phase a household-level amount only once.
  const deductionPerPerson = Math.max(0, amount - Math.max(0, magi - phaseoutStart) * seniorRule.phaseoutRate);
  return roundMoney(qualifyingPeople * deductionPerPerson);
}

/**
 * Produces a federal planning estimate from annual rules. `ordinaryIncome` is
 * deliberately exclusive of long-term capital gains, preventing gains from
 * being included both in ordinary income and in the capital-gain stack.
 */
export function calculateTax(input: TaxInput, rules: AnnualRules): FederalTaxResult {
  requireFilingStatus(input.filingStatus);
  const ordinaryIncome = requireFiniteNonNegative(input.ordinaryIncome, 'Ordinary income');
  const socialSecurity = requireFiniteNonNegative(input.socialSecurityAnnual, 'Social Security');
  const taxExemptInterest = requireFiniteNonNegative(input.taxExemptInterest, 'Tax-exempt interest');
  const longTermCapitalGains = requireFiniteNonNegative(input.longTermCapitalGains, 'Long-term capital gains');
  const mfsSocialSecurityTreatment = mfsLivingTogetherTreatment(input.filingStatus, input.separateLivedTogether);
  const warnings: string[] = [
    'Federal income-tax estimate only; no state tax estimate is included.',
    'Uses the supplied standard deduction; itemized deductions, credits, AMT, NIIT, payroll taxes, and other return-specific adjustments are not modeled.',
    'MAGI is modeled as included ordinary income, taxable Social Security, and long-term capital gains; excluded foreign income and adjustments are not available in TaxInput.',
  ];

  if (input.taxYear !== undefined && input.taxYear !== rules.year) {
    warnings.push(`TaxInput taxYear ${input.taxYear} differs from annual rules year ${rules.year}; annual rules year was used.`);
  }
  if (!input.ages?.length) warnings.push('No taxpayer ages supplied; age-65 deductions were not applied.');
  if (mfsSocialSecurityTreatment === 'CONFIRMED_LIVED_TOGETHER') {
    warnings.push('MFS taxpayer reported living with spouse during the year; the zero-base Social Security treatment was applied.');
  }
  if (mfsSocialSecurityTreatment === 'UNKNOWN_CONSERVATIVE_LIVED_TOGETHER') {
    warnings.push('MFS living-together status is not confirmed; the zero-base Social Security treatment is a conservative illustration, not a finding that the spouses lived together. An adviser must select true or false.');
  }

  // For provisional income, non-SS AGI includes the modeled preferential gains.
  const socialSecurityResult = taxableSocialSecurityDetails(
    socialSecurity,
    ordinaryIncome + longTermCapitalGains,
    taxExemptInterest,
    input.filingStatus,
    rules,
    zeroBaseSocialSecurityApplies(mfsSocialSecurityTreatment),
  );
  const magi = roundMoney(ordinaryIncome + longTermCapitalGains + socialSecurityResult.taxable);
  const deduction = standardDeduction(input, rules);
  const senior = seniorDeduction(input, rules, magi);
  const totalDeduction = deduction + senior;

  // Deductions reduce ordinary taxable income first. Any unused amount then
  // reduces the taxable gain stack, matching the taxable-income ordering.
  const grossOrdinaryIncome = ordinaryIncome + socialSecurityResult.taxable;
  const taxableOrdinaryIncome = Math.max(0, grossOrdinaryIncome - totalDeduction);
  const unusedDeduction = Math.max(0, totalDeduction - grossOrdinaryIncome);
  const taxableLongTermCapitalGains = Math.max(0, longTermCapitalGains - unusedDeduction);
  const brackets = rules.taxBrackets[input.filingStatus];
  const gains = capitalGainTax(
    taxableOrdinaryIncome,
    taxableLongTermCapitalGains,
    rules.capitalGainsThresholds[input.filingStatus],
  );
  const ordinaryTax = progressiveTax(taxableOrdinaryIncome, brackets);
  const federalTax = roundMoney(ordinaryTax + gains.tax);
  const taxableIncome = roundMoney(taxableOrdinaryIncome + taxableLongTermCapitalGains);
  const grossIncomeForEffectiveRate = ordinaryIncome + socialSecurityResult.taxable + longTermCapitalGains;

  return {
    taxableIncome,
    federalTax,
    marginalRate: taxableIncome === 0
      ? 0
      : taxableLongTermCapitalGains > 0
        ? gains.marginalRate
        : ordinaryMarginalRate(taxableOrdinaryIncome, brackets),
    effectiveRate: grossIncomeForEffectiveRate === 0 ? 0 : roundRate(federalTax / grossIncomeForEffectiveRate),
    taxableSocialSecurity: socialSecurityResult.taxable,
    provisionalIncome: socialSecurityResult.provisionalIncome,
    standardDeduction: deduction,
    seniorDeduction: senior,
    magi,
    mfsSocialSecurityTreatment,
    warnings: uniqueWarnings(warnings),
  };
}

function activeMonthlyIncome(monthly: number, startAgeMonths: number | null, currentAgeMonths: number): number {
  if (monthly <= 0 || startAgeMonths === null || currentAgeMonths < startAgeMonths) return 0;
  return monthly * 12;
}

/**
 * Creates the current-household federal estimate from information that is
 * unambiguously active at `input.asOfDate`. Projection callers should call
 * calculateTax directly with that year's prepared TaxInput.
 */
export function calculateTaxes(input: PlanningInput, assumptions: PlanningAssumptions): TaxesResult {
  const warnings: string[] = [
    ...input.warnings,
    'Current household tax summary is partial: taxable interest, dividends, realized gains, itemized deductions, credits, adjustments, and state income tax are not collected by PlanningInput.',
    'No state tax estimate is included; state-specific tax rules are not modeled.',
  ];

  let ordinaryIncome = 0;
  let socialSecurityAnnual = 0;
  for (const person of input.persons) {
    ordinaryIncome += requireFiniteNonNegative(person.earnedIncomeAnnual, `${person.role} earned income`);
    socialSecurityAnnual += person.alreadyReceiving
      ? requireFiniteNonNegative(person.currentBenefitMonthly ?? undefined, `${person.role} current benefit`) * 12
      : 0;

    ordinaryIncome += activeMonthlyIncome(person.pensionMonthly, person.pensionStartAgeMonths, person.ageMonths);
    ordinaryIncome += activeMonthlyIncome(person.annuityMonthly, person.annuityStartAgeMonths, person.ageMonths);

    if (person.pensionMonthly > 0 && person.pensionStartAgeMonths === null) {
      warnings.push(`${person.role} pension start age is unknown, so that pension was excluded from the current tax summary.`);
    }
    if (person.annuityMonthly > 0 && person.annuityStartAgeMonths === null) {
      warnings.push(`${person.role} annuity start age is unknown, so that annuity was excluded from the current tax summary.`);
    }
    if (person.rentalOtherMonthly > 0 && (person.rentalEndAgeMonths === null || person.ageMonths <= person.rentalEndAgeMonths)) {
      ordinaryIncome += person.rentalOtherMonthly * 12;
    }
    if (person.partTimeAnnual > 0) {
      warnings.push(`${person.role} part-time income is a retirement-plan field without a current start date, so it was excluded from the current tax summary.`);
    }
  }

  const currentTaxInput: TaxInput = {
    filingStatus: input.filingStatus,
    ordinaryIncome: roundMoney(ordinaryIncome),
    socialSecurityAnnual: roundMoney(socialSecurityAnnual),
    taxExemptInterest: 0,
    longTermCapitalGains: 0,
    ages: input.persons.map((person) => person.ageMonths / 12),
    taxYear: assumptions.annual.year,
    separateLivedTogether: input.spouseLivedTogetherForMfs,
  };
  const calculated = calculateTax(currentTaxInput, assumptions.annual);
  const sourceMetadata = assumptions.annual.sources.map((source) => ({ ...source }));

  if (sourceMetadata.length === 0) warnings.push('Annual-rule source metadata is absent; verify the supplied annual rules before use.');

  return {
    status: 'PARTIAL',
    warnings: uniqueWarnings([...warnings, ...calculated.warnings]),
    sources: sourceMetadata.map((source) => source.url),
    sourceMetadata,
    current: { ...calculated, warnings: uniqueWarnings([...calculated.warnings, ...warnings]) },
    currentTaxInput,
  };
}
