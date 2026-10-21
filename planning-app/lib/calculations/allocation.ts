import { clamp, roundMoney, uniqueWarnings } from './math';
import type { ModuleMeta, PlanningAssumptions, PlanningInput, RiskProfile } from './types';

/** Fractions, rather than percentage points: 0.30 represents 30%. */
export interface EquityRange {
  min: number;
  max: number;
  retirementFloor: number;
}

/**
 * The editable targetEquity settings must remain inside these client-profile
 * guardrails. A floor equals the lower end of each approved profile range.
 */
export const TARGET_EQUITY_RANGES: Readonly<Record<RiskProfile, EquityRange>> = Object.freeze({
  CONSERVATIVE: Object.freeze({ min: 0.30, max: 0.40, retirementFloor: 0.30 }),
  MODERATE: Object.freeze({ min: 0.50, max: 0.60, retirementFloor: 0.50 }),
  AGGRESSIVE: Object.freeze({ min: 0.70, max: 0.80, retirementFloor: 0.70 }),
});

/**
 * A modest cash sleeve completes each stock/bond/cash illustration. It is a
 * disclosed educational planning convention, not a money-market, security, or
 * account-level recommendation.
 */
export const EDUCATIONAL_CASH_TARGET = 0.05;
export const GLIDE_START_MONTHS = 120;
export const GLIDE_INTERVAL_YEARS = 5;

export interface AllocationMix {
  stocks: number;
  bonds: number;
  cash: number;
  total: number;
}

export interface AllocationDollars {
  stocks: number;
  bonds: number;
  cash: number;
  /** The three component dollars total exactly to this cent-rounded amount. */
  total: number;
}

export interface AllocationAdjustment {
  rule: 'HORIZON' | 'INCOME_COVERAGE';
  category: string;
  requested: number;
  applied: number;
  detail: string;
}

export interface AllocationTarget extends AllocationMix {
  profile: RiskProfile;
  equityRange: EquityRange;
  /** Editable source setting before the transparent horizon/coverage rules. */
  configuredEquity: number;
  /** Equity after the adjustments but before the final ten-year glide path. */
  preGlideEquity: number;
  /** Equity target applicable at the household's present retirement horizon. */
  currentEquity: number;
  retirementFloorEquity: number;
  adjustments: AllocationAdjustment[];
  adjustmentWasRangeClamped: boolean;
}

export interface CurrentAllocation extends AllocationMix {
  /** Current mix supplied as a household estimate, not reconstructed by account. */
  householdEstimateOnly: true;
}

export interface RebalancingIllustration {
  /** This is an arithmetic household illustration, never a trade instruction. */
  householdEstimateOnly: true;
  eligibleHouseholdBalance: number;
  /** Amount not used because it is an insurance-policy value rather than a tradable household mix. */
  excludedInsurancePolicyValue: number;
  currentDollars: AllocationDollars;
  targetDollars: AllocationDollars;
  /** Target less current amounts; positive and negative values sum to exactly $0.00. */
  change: AllocationDollars;
  netChange: number;
  limitations: string[];
}

export interface GlidePathRow extends AllocationMix {
  yearsToRetirement: number;
  equity: number;
}

export interface GlidePath {
  startYearsBeforeRetirement: number;
  intervalYears: number;
  currentHorizonMonths: number;
  currentHorizonYears: number;
  retirementFloorEquity: number;
  rows: GlidePathRow[];
}

export interface AssetLocationEducation {
  educational: true;
  tips: string[];
  limitations: string[];
}

export interface AllocationResult extends ModuleMeta {
  current: CurrentAllocation | null;
  target: AllocationTarget;
  rebalancing: RebalancingIllustration | null;
  glidePath: GlidePath;
  assetLocation: AssetLocationEducation;
  educational: true;
}

interface AdjustmentRule {
  category: string;
  adjustment: number;
  detail: string;
}

/** Transparent household-horizon policy; the result is still bounded by the profile range. */
export const HORIZON_ADJUSTMENT_RULES: ReadonlyArray<Readonly<AdjustmentRule & { minimumMonths: number }>> = Object.freeze([
  Object.freeze({ minimumMonths: 180, category: '15_OR_MORE_YEARS', adjustment: 0.05, detail: '15 or more years to the earliest household retirement age.' }),
  Object.freeze({ minimumMonths: 120, category: '10_TO_14_YEARS', adjustment: 0.025, detail: '10 through 14 years to the earliest household retirement age.' }),
  Object.freeze({ minimumMonths: 60, category: '5_TO_9_YEARS', adjustment: 0, detail: '5 through 9 years to the earliest household retirement age.' }),
  Object.freeze({ minimumMonths: 0, category: 'UNDER_5_YEARS_OR_RETIRED', adjustment: -0.025, detail: 'Under 5 years to retirement, or already retired.' }),
]);

/**
 * Income coverage is guaranteed income divided by essential spending. A null
 * result deliberately receives no inferred adjustment.
 */
export const INCOME_COVERAGE_ADJUSTMENT_RULES: ReadonlyArray<Readonly<AdjustmentRule & { minimumRatio: number }>> = Object.freeze([
  Object.freeze({ minimumRatio: 1.25, category: 'AT_LEAST_125_PERCENT', adjustment: 0.025, detail: 'Guaranteed income is at least 125% of essential spending.' }),
  Object.freeze({ minimumRatio: 1, category: '100_TO_124_PERCENT', adjustment: 0, detail: 'Guaranteed income covers 100% through 124% of essential spending.' }),
  Object.freeze({ minimumRatio: 0.75, category: '75_TO_99_PERCENT', adjustment: -0.025, detail: 'Guaranteed income covers 75% through 99% of essential spending.' }),
  Object.freeze({ minimumRatio: 0, category: 'UNDER_75_PERCENT', adjustment: -0.05, detail: 'Guaranteed income covers less than 75% of essential spending.' }),
]);

const ALLOCATION_SOURCE = 'RetirementExpert planning policy (TODO.md §8.12)';
const INSURANCE_POLICY_ACCOUNT_TYPES = new Set(['ANNUITY', 'CASH_VALUE_LIFE']);

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a finite non-negative amount.`);
  roundMoney(value);
}

function assertRiskProfile(value: RiskProfile): void {
  if (!(value in TARGET_EQUITY_RANGES)) throw new Error('Risk profile must be CONSERVATIVE, MODERATE, or AGGRESSIVE.');
}

function roundToFourDecimals(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Calculation value must be finite.');
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

function roundRatio(value: number): number {
  if (value < 0 || value > 1) throw new Error('Allocation percentage must be a finite fraction from 0 through 1.');
  return roundToFourDecimals(value);
}

function mixForEquity(equity: number): AllocationMix {
  const stocks = roundRatio(equity);
  const cash = EDUCATIONAL_CASH_TARGET;
  const bonds = roundRatio(1 - stocks - cash);
  const total = roundRatio(stocks + bonds + cash);
  if (total !== 1) throw new Error('Allocation target does not total 100%.');
  return { stocks, bonds, cash, total };
}

function selectHorizonRule(horizonMonths: number): Readonly<AdjustmentRule & { minimumMonths: number }> {
  return HORIZON_ADJUSTMENT_RULES.find((rule) => horizonMonths >= rule.minimumMonths) ?? HORIZON_ADJUSTMENT_RULES[HORIZON_ADJUSTMENT_RULES.length - 1];
}

function selectCoverageRule(incomeCoverageRatio: number): Readonly<AdjustmentRule & { minimumRatio: number }> {
  return INCOME_COVERAGE_ADJUSTMENT_RULES.find((rule) => incomeCoverageRatio >= rule.minimumRatio)
    ?? INCOME_COVERAGE_ADJUSTMENT_RULES[INCOME_COVERAGE_ADJUSTMENT_RULES.length - 1];
}

function validateKnownAllocation(allocation: NonNullable<PlanningInput['allocation']>): CurrentAllocation {
  const values = [allocation.stocks, allocation.bonds, allocation.cash];
  if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
    throw new Error('Known current allocation values must be finite fractions from 0 through 1.');
  }
  const total = allocation.stocks + allocation.bonds + allocation.cash;
  if (Math.abs(total - 1) > 0.000_001) throw new Error('Known current allocation must total exactly 100%.');
  const stocks = roundRatio(allocation.stocks);
  const bonds = roundRatio(allocation.bonds);
  // Preserve a 100% total after display precision rounding without modifying inputs.
  const cash = roundRatio(1 - stocks - bonds);
  return { stocks, bonds, cash, total: 1, householdEstimateOnly: true };
}

/** Ensures every editable profile setting remains within its approved 10-point range. */
export function validateTargetEquityProfiles(targetEquity: PlanningAssumptions['targetEquity']): void {
  (Object.keys(TARGET_EQUITY_RANGES) as RiskProfile[]).forEach((profile) => {
    const value = targetEquity?.[profile];
    const range = TARGET_EQUITY_RANGES[profile];
    if (!Number.isFinite(value) || value < range.min || value > range.max) {
      throw new Error(`${profile} target equity must be between ${range.min * 100}% and ${range.max * 100}%.`);
    }
  });
}

function earliestRetirementHorizonMonths(input: PlanningInput): number {
  if (!Array.isArray(input.persons) || input.persons.length === 0) throw new Error('At least one household person is required to calculate allocation.');
  const horizons = input.persons.map((person) => {
    if (!Number.isFinite(person.ageMonths) || !Number.isFinite(person.retirementAgeMonths)) {
      throw new Error(`${person.name || 'Household person'} requires finite current and retirement ages.`);
    }
    return person.retirementAgeMonths - person.ageMonths;
  });
  return Math.max(0, Math.min(...horizons));
}

function equityAtHorizon(preGlideEquity: number, retirementFloor: number, horizonMonths: number): number {
  if (horizonMonths >= GLIDE_START_MONTHS) return roundRatio(preGlideEquity);
  if (horizonMonths <= 0) return roundRatio(retirementFloor);
  const fractionOfGlideRemaining = horizonMonths / GLIDE_START_MONTHS;
  return roundRatio(retirementFloor + (preGlideEquity - retirementFloor) * fractionOfGlideRemaining);
}

function glidePath(preGlideEquity: number, retirementFloorEquity: number, currentHorizonMonths: number): GlidePath {
  const rows = [10, 5, 0].map((yearsToRetirement) => {
    const equity = equityAtHorizon(preGlideEquity, retirementFloorEquity, yearsToRetirement * 12);
    return { yearsToRetirement, equity, ...mixForEquity(equity) };
  });
  return {
    startYearsBeforeRetirement: GLIDE_START_MONTHS / 12,
    intervalYears: GLIDE_INTERVAL_YEARS,
    currentHorizonMonths,
    currentHorizonYears: roundToFourDecimals(currentHorizonMonths / 12),
    retirementFloorEquity,
    rows,
  };
}

function allocateDollars(total: number, mix: AllocationMix): AllocationDollars {
  const roundedTotal = roundMoney(total);
  const stocks = roundMoney(roundedTotal * mix.stocks);
  const bonds = roundMoney(roundedTotal * mix.bonds);
  // Cash is deliberately the residual, making cent-rounded components reconcile.
  const cash = roundMoney(roundedTotal - stocks - bonds);
  return { stocks, bonds, cash, total: roundedTotal };
}

function householdEligibleBalance(input: PlanningInput): { eligible: number; excludedInsurancePolicyValue: number } {
  let eligible = 0;
  let excludedInsurancePolicyValue = 0;
  input.accounts.forEach((account) => {
    assertFiniteNonNegative(account.balance, `${account.type} balance`);
    if (INSURANCE_POLICY_ACCOUNT_TYPES.has(account.type)) excludedInsurancePolicyValue += account.balance;
    else eligible += account.balance;
  });
  return { eligible: roundMoney(eligible), excludedInsurancePolicyValue: roundMoney(excludedInsurancePolicyValue) };
}

function rebalancingIllustration(input: PlanningInput, current: CurrentAllocation, target: AllocationMix): RebalancingIllustration {
  const { eligible, excludedInsurancePolicyValue } = householdEligibleBalance(input);
  const currentDollars = allocateDollars(eligible, current);
  const targetDollars = allocateDollars(eligible, target);
  const stocks = roundMoney(targetDollars.stocks - currentDollars.stocks);
  const bonds = roundMoney(targetDollars.bonds - currentDollars.bonds);
  // Preserve an exact zero-sum illustration after all component cent rounding.
  const cash = roundMoney(-stocks - bonds);
  const change: AllocationDollars = { stocks, bonds, cash, total: 0 };
  const netChange = roundMoney(change.stocks + change.bonds + change.cash);
  if (netChange !== 0) throw new Error('Rebalancing illustration must sum to zero.');
  return {
    householdEstimateOnly: true,
    eligibleHouseholdBalance: eligible,
    excludedInsurancePolicyValue,
    currentDollars,
    targetDollars,
    change,
    netChange,
    limitations: [
      'Illustrative household arithmetic only; it is not a request or instruction to buy, sell, or exchange any holding.',
      'Annuity and cash-value life-insurance policy values are excluded because their liquidity and underlying allocation are not known.',
      'Tax consequences, trading costs, plan restrictions, withdrawal needs, and account-specific holdings require advisor review before any implementation.',
    ],
  };
}

function assetLocationEducation(): AssetLocationEducation {
  return {
    educational: true,
    tips: [
      'Bonds are commonly considered for tax-deferred accounts, subject to each account’s purpose, tax situation, and available choices.',
      'Longer-term growth assets are commonly considered for Roth accounts, where qualified growth may be tax-free.',
      'Tax-efficient diversified index funds are commonly considered for taxable accounts; taxable income and cost-basis effects still matter.',
    ],
    limitations: [
      'These are general educational concepts, not specific securities, account-level allocation instructions, or a recommendation to transact.',
      'Account location should be reviewed with the client’s tax professional and qualified investment professional before implementation.',
    ],
  };
}

/**
 * Produces an educational household allocation comparison. It consumes only
 * supplied annual assumptions and client inputs, never calls a service, and
 * does not mutate either argument.
 */
export function calculateAllocation(
  input: PlanningInput,
  assumptions: PlanningAssumptions,
  incomeCoverageRatio: number | null = null,
): AllocationResult {
  assertRiskProfile(input.riskProfile);
  validateTargetEquityProfiles(assumptions.targetEquity);
  if (incomeCoverageRatio !== null && (!Number.isFinite(incomeCoverageRatio) || incomeCoverageRatio < 0)) {
    throw new Error('Income coverage ratio must be a finite non-negative ratio or null.');
  }

  const range = TARGET_EQUITY_RANGES[input.riskProfile];
  const horizonMonths = earliestRetirementHorizonMonths(input);
  const horizonRule = selectHorizonRule(horizonMonths);
  const coverageRule = incomeCoverageRatio === null ? null : selectCoverageRule(incomeCoverageRatio);
  const configuredEquity = assumptions.targetEquity[input.riskProfile];
  const requestedAfterHorizon = configuredEquity + horizonRule.adjustment;
  const afterHorizon = roundRatio(clamp(requestedAfterHorizon, range.min, range.max));
  const requestedPreGlide = afterHorizon + (coverageRule?.adjustment ?? 0);
  const preGlideEquity = roundRatio(clamp(requestedPreGlide, range.min, range.max));
  const currentEquity = equityAtHorizon(preGlideEquity, range.retirementFloor, horizonMonths);
  const targetMix = mixForEquity(currentEquity);
  const adjustments: AllocationAdjustment[] = [
    {
      rule: 'HORIZON',
      category: horizonRule.category,
      requested: horizonRule.adjustment,
      applied: roundToFourDecimals(afterHorizon - configuredEquity),
      detail: horizonRule.detail,
    },
    coverageRule
      ? {
        rule: 'INCOME_COVERAGE',
        category: coverageRule.category,
        requested: coverageRule.adjustment,
        applied: roundToFourDecimals(preGlideEquity - afterHorizon),
        detail: coverageRule.detail,
      }
      : {
        rule: 'INCOME_COVERAGE',
        category: 'UNAVAILABLE',
        requested: 0,
        applied: 0,
        detail: 'Income coverage is unavailable, so no income-coverage adjustment was applied.',
      },
  ];

  const target: AllocationTarget = {
    ...targetMix,
    profile: input.riskProfile,
    equityRange: { ...range },
    configuredEquity,
    preGlideEquity,
    currentEquity,
    retirementFloorEquity: range.retirementFloor,
    adjustments,
    adjustmentWasRangeClamped: afterHorizon !== roundRatio(requestedAfterHorizon) || preGlideEquity !== roundRatio(requestedPreGlide),
  };

  const current = input.allocation === null ? null : validateKnownAllocation(input.allocation);
  const rebalancing = current === null ? null : rebalancingIllustration(input, current, targetMix);
  const warnings = uniqueWarnings([
    ...(input.warnings ?? []),
    incomeCoverageRatio === null ? 'Income coverage ratio is unavailable; the target does not apply an income-coverage adjustment.' : '',
    current === null ? 'Current household allocation is unknown; no current dollar allocation, rebalancing dollars, or trade-style comparison was created.' : '',
    current !== null && rebalancing?.eligibleHouseholdBalance === 0 ? 'No eligible household account balance is available for a dollar illustration.' : '',
    current !== null && (rebalancing?.excludedInsurancePolicyValue ?? 0) > 0 ? 'Annuity and cash-value life-insurance policy values are excluded from the allocation-dollar illustration.' : '',
    'Allocation output is educational and illustrative only; it does not recommend actual securities or transactions.',
  ]);
  const isComplete = current !== null && incomeCoverageRatio !== null && (rebalancing?.eligibleHouseholdBalance ?? 0) > 0;

  return {
    status: isComplete ? 'COMPLETE' : 'PARTIAL',
    warnings,
    sources: [ALLOCATION_SOURCE],
    current,
    target,
    rebalancing,
    glidePath: glidePath(preGlideEquity, range.retirementFloor, horizonMonths),
    assetLocation: assetLocationEducation(),
    educational: true,
  };
}
