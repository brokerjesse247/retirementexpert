import { projectAnnualRules } from '../assumptions/defaults';
import { calculateCashFlow } from './cash-flow';
import { calculateTax } from './tax';
import { ageAtYear, clamp, roundMoney, uniqueWarnings } from './math';
import type { AnnualRules, CashFlowOptions, ModuleMeta, PlanningAssumptions, PlanningInput } from './types';

/** Cash-flow's public row contract, narrowed to the values Roth analysis consumes. */
type CashFlowRow = {
  year: number;
  age: number;
  spouseAge?: number | null;
  socialSecurity: number;
  federalTax: number;
  rmd: number;
  rothConversion: number;
  endingBalance: number;
  taxDeferredBalance: number;
  rothBalance: number;
  hsaBalance: number;
  magi: number;
};

type CashFlowProjection = {
  rows: CashFlowRow[];
  retirementYear: number;
  portfolioAtRetirement: number;
  depletionAge: number | null;
  endingLegacy: number;
  lifetimeFederalTax: number;
};

export interface RothConversionScheduleRow {
  year: number;
  amount: number;
  estimatedFederalTaxCost: number;
  targetBracket: number;
  taxableIncome: number;
  magi: number;
  rmd: number;
  irmaaCap: number | null;
  irmaaCheck: 'NOT_APPLICABLE' | 'WITHIN_CAP' | 'AT_OR_ABOVE_CAP';
}

export interface RothScenarioComparison {
  lifetimeFederalTax: number;
  totalRmd: number;
  largestRmd: number;
  endingLegacy: number;
  taxDeferredAtHorizon: number;
  afterTaxLegacy: number;
  irmaaYears: number[];
  irmaaSurcharge: number | null;
}

export interface RothConversionResult extends ModuleMeta {
  schedule: RothConversionScheduleRow[];
  noConversion: RothScenarioComparison;
  withConversion: RothScenarioComparison;
  /** Positive means the conversion schedule lowers projected lifetime federal tax. */
  lifetimeTaxDifference: number;
  /** Positive means the conversion schedule increases projected after-tax legacy. */
  afterTaxLegacyDifference: number;
  beneficial: boolean;
  /** Medicare years in which the conversion scenario has a projected IRMAA surcharge. */
  irmaaYears: number[];
}

type IrmaaYear = { year: number; surcharge: number; known: boolean };

type CandidateYear = {
  year: number;
  targetTop: number;
  maxConversion: number;
  irmaaCap: number | null;
};

const CENT = 0.01;
const MAX_REFINEMENT_PASSES = 8;
const MAX_SCHEDULE_YEARS = 80;
const ELIGIBLE_PRETAX_TYPES = new Set(['K401_PRETAX', 'TRAD_IRA']);

function asCashFlowProjection(value: unknown): CashFlowProjection {
  const projection = value as CashFlowProjection;
  if (!projection || !Array.isArray(projection.rows) || !Number.isFinite(projection.lifetimeFederalTax) || !Number.isFinite(projection.endingLegacy)) {
    throw new Error('Cash-flow engine returned an unsupported Roth-analysis contract.');
  }
  for (const row of projection.rows) {
    if (!Number.isInteger(row.year) || !Number.isFinite(row.magi) || !Number.isFinite(row.federalTax) || !Number.isFinite(row.rmd) || !Number.isFinite(row.taxDeferredBalance)) {
      throw new Error('Cash-flow engine returned an invalid annual row for Roth analysis.');
    }
  }
  return projection;
}

function runCashFlow(input: PlanningInput, assumptions: PlanningAssumptions, rothConversions?: Record<string, number>): CashFlowProjection {
  const options: CashFlowOptions | undefined = rothConversions && Object.keys(rothConversions).length > 0 ? { rothConversions } : undefined;
  return asCashFlowProjection(calculateCashFlow(input, assumptions, options));
}

function ruleForYear(assumptions: PlanningAssumptions, year: number): AnnualRules {
  return projectAnnualRules(assumptions.annual, year, assumptions.taxBracketInflation);
}

function householdRetirementYear(input: PlanningInput): number {
  const asOfYear = Number(input.asOfDate.slice(0, 4));
  const years = input.persons.map((person) => {
    const yearsToRetirement = Math.max(0, person.retirementAgeMonths - person.ageMonths) / 12;
    return asOfYear + Math.ceil(yearsToRetirement);
  });
  return Math.max(asOfYear, Math.min(...years));
}

function targetBracketTop(rules: AnnualRules, filingStatus: PlanningInput['filingStatus'], targetRate: number): number | null {
  const bracket = rules.taxBrackets[filingStatus]?.find((candidate) => Math.abs(candidate.rate - targetRate) < 1e-10);
  return bracket?.upTo ?? null;
}

/**
 * Cash-flow MAGI already includes taxable Social Security and ordinary withdrawals.
 * The shared tax engine applies the annual standard, age-65, and senior deductions.
 */
export function taxableIncomeFromCashFlowMagi(input: PlanningInput, rules: AnnualRules, year: number, magi: number): number {
  if (!Number.isFinite(magi) || magi < 0) throw new Error('Cash-flow MAGI must be a finite non-negative amount.');
  // MAGI is already post-Social-Security-taxability and includes any modeled taxable gains.
  // Supplying it as ordinary income preserves the deduction-adjusted taxable-income total
  // used to identify the upper edge of the target ordinary bracket.
  return calculateTax({
    filingStatus: input.filingStatus,
    ordinaryIncome: magi,
    ages: input.persons.map((person) => ageAtYear(person.dob, year)),
    taxYear: rules.year,
    separateLivedTogether: input.spouseLivedTogetherForMfs,
  }, rules).taxableIncome;
}

function irmaaTiers(rules: AnnualRules, filingStatus: PlanningInput['filingStatus']) {
  if (filingStatus === 'MARRIED_FILING_JOINTLY') return rules.medicare.irmaaJoint;
  if (filingStatus === 'MARRIED_FILING_SEPARATELY') return rules.medicare.irmaaSeparate;
  return rules.medicare.irmaaSingle;
}

function irmaaCap(input: PlanningInput, rules: AnnualRules, year: number, magi: number): number | null {
  const hasLookbackExposure = input.persons.some((person) => ageAtYear(person.dob, year) >= 63);
  if (!hasLookbackExposure) return null;
  const currentTier = irmaaTiers(rules, input.filingStatus).find((tier) => tier.upTo === null
    || (tier.upperExclusive ? magi < tier.upTo : magi <= tier.upTo));
  if (!currentTier || currentTier.upTo === null) return null;
  return roundMoney(Math.max(0, currentTier.upTo - CENT));
}

function boundedBracketFill(input: PlanningInput, rules: AnnualRules, year: number, baselineMagi: number, targetTop: number, upperBound: number): number {
  let low = 0;
  let high = Math.max(0, upperBound);
  for (let step = 0; step < 40; step += 1) {
    const mid = roundMoney((low + high) / 2);
    if (taxableIncomeFromCashFlowMagi(input, rules, year, baselineMagi + mid) <= targetTop) low = mid;
    else high = Math.max(0, roundMoney(mid - CENT));
    if (high - low < CENT) break;
  }
  return roundMoney(low);
}

function mapRows(projection: CashFlowProjection): Map<number, CashFlowRow> {
  return new Map(projection.rows.map((row) => [row.year, row]));
}

function scheduleMapToOptions(schedule: Record<number, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(schedule)
    .filter(([, amount]) => amount > 0)
    .map(([year, amount]) => [year, roundMoney(amount)]));
}

function hasMedicareEligiblePerson(input: PlanningInput, year: number): boolean {
  return input.persons.some((person) => ageAtYear(person.dob, year) >= 65);
}

function irmaaAssessment(input: PlanningInput, assumptions: PlanningAssumptions, projection: CashFlowProjection, warnings: string[]): IrmaaYear[] {
  const rows = mapRows(projection);
  const result: IrmaaYear[] = [];
  for (const row of projection.rows) {
    if (!hasMedicareEligiblePerson(input, row.year)) continue;
    const sourceYear = row.year - 2;
    const sourceMagi = rows.get(sourceYear)?.magi ?? input.historicalMagi[String(sourceYear)];
    if (sourceMagi === undefined) {
      warnings.push(`Historical MAGI for ${sourceYear} is unavailable; IRMAA for ${row.year} cannot be determined.`);
      result.push({ year: row.year, surcharge: 0, known: false });
      continue;
    }
    const rules = ruleForYear(assumptions, row.year);
    const tiers = irmaaTiers(rules, input.filingStatus);
    const tier = tiers.find((candidate) => candidate.upTo === null || (candidate.upperExclusive ? sourceMagi < candidate.upTo : sourceMagi <= candidate.upTo));
    if (!tier) {
      warnings.push(`IRMAA tiers for ${row.year} do not cover the projected MAGI.`);
      result.push({ year: row.year, surcharge: 0, known: false });
      continue;
    }
    const eligiblePeople = input.persons.filter((person) => ageAtYear(person.dob, row.year) >= 65).length;
    const monthlySurcharge = Math.max(0, tier.partBMonthly - rules.medicare.partBStandard) + Math.max(0, tier.partDMonthly);
    result.push({ year: row.year, surcharge: roundMoney(monthlySurcharge * 12 * eligiblePeople), known: true });
  }
  return result;
}

function scenarioComparison(input: PlanningInput, assumptions: PlanningAssumptions, projection: CashFlowProjection, warnings: string[]): RothScenarioComparison {
  const rows = projection.rows;
  const terminal = rows.at(-1);
  const deferredAtHorizon = Math.max(0, terminal?.taxDeferredBalance ?? 0);
  const irmaa = irmaaAssessment(input, assumptions, projection, warnings);
  const irmaaKnown = irmaa.every((entry) => entry.known);
  return {
    lifetimeFederalTax: roundMoney(projection.lifetimeFederalTax),
    totalRmd: roundMoney(rows.reduce((total, row) => total + Math.max(0, row.rmd), 0)),
    largestRmd: roundMoney(Math.max(0, ...rows.map((row) => row.rmd))),
    endingLegacy: roundMoney(projection.endingLegacy),
    taxDeferredAtHorizon: roundMoney(deferredAtHorizon),
    afterTaxLegacy: roundMoney(Math.max(0, projection.endingLegacy - deferredAtHorizon * assumptions.heirsTaxRate)),
    irmaaYears: irmaa.filter((entry) => entry.known && entry.surcharge > 0).map((entry) => entry.year),
    irmaaSurcharge: irmaaKnown ? roundMoney(irmaa.reduce((total, entry) => total + entry.surcharge, 0)) : null,
  };
}

function buildCandidates(input: PlanningInput, assumptions: PlanningAssumptions, baseline: CashFlowProjection, warnings: string[]): CandidateYear[] {
  const eligiblePretax = roundMoney(input.accounts
    .filter((account) => ELIGIBLE_PRETAX_TYPES.has(account.type))
    .reduce((sum, account) => sum + account.balance, 0));
  if (eligiblePretax <= 0) {
    warnings.push('No eligible pretax 401(k) or traditional IRA balance is available for a Roth conversion.');
    return [];
  }
  const targetRate = assumptions.targetTaxBracket;
  const startYear = householdRetirementYear(input);
  const candidates: CandidateYear[] = [];
  for (const row of [...baseline.rows].sort((a, b) => a.year - b.year)) {
    if (candidates.length >= MAX_SCHEDULE_YEARS) {
      warnings.push(`Roth conversion schedule is limited to ${MAX_SCHEDULE_YEARS} annual rows.`);
      break;
    }
    if (row.year < startYear) continue;
    // The normal conversion window ends before Social Security begins or an RMD is due.
    if (row.socialSecurity > CENT || row.rmd > CENT) continue;
    const rules = ruleForYear(assumptions, row.year);
    const targetTop = targetBracketTop(rules, input.filingStatus, targetRate);
    if (targetTop === null) {
      warnings.push(`The ${Math.round(targetRate * 100)}% target bracket has no finite annual threshold in ${row.year}; no conversion is scheduled for that year.`);
      continue;
    }
    const cap = irmaaCap(input, rules, row.year, row.magi);
    const bracketUpperBound = Math.max(0, row.taxDeferredBalance);
    const byBracket = boundedBracketFill(input, rules, row.year, row.magi, targetTop, bracketUpperBound);
    const byIrmaa = cap === null ? byBracket : Math.max(0, roundMoney(cap - row.magi));
    candidates.push({ year: row.year, targetTop, maxConversion: roundMoney(Math.min(bracketUpperBound, byBracket, byIrmaa)), irmaaCap: cap });
  }
  if (candidates.length === 0) warnings.push('No retirement-to-Social-Security/RMD Roth conversion window is available under the baseline cash-flow projection.');
  return candidates;
}

function initialSchedule(candidates: CandidateYear[], eligiblePretax: number): Record<number, number> {
  let remaining = eligiblePretax;
  const schedule: Record<number, number> = {};
  for (const candidate of candidates) {
    const amount = roundMoney(Math.max(0, Math.min(remaining, candidate.maxConversion)));
    schedule[candidate.year] = amount;
    remaining = roundMoney(Math.max(0, remaining - amount));
  }
  return schedule;
}

function refineSchedule(
  input: PlanningInput,
  assumptions: PlanningAssumptions,
  baseline: CashFlowProjection,
  candidates: CandidateYear[],
  eligiblePretax: number,
  warnings: string[],
): { schedule: Record<number, number>; projection: CashFlowProjection } {
  const baselineRows = mapRows(baseline);
  let schedule = initialSchedule(candidates, eligiblePretax);
  let projection = runCashFlow(input, assumptions, scheduleMapToOptions(schedule));
  let converged = false;

  for (let pass = 0; pass < MAX_REFINEMENT_PASSES; pass += 1) {
    const actualRows = mapRows(projection);
    const next: Record<number, number> = {};
    let alreadyScheduled = 0;
    let changed = false;
    for (const candidate of candidates) {
      const row = actualRows.get(candidate.year);
      const baselineRow = baselineRows.get(candidate.year);
      if (!row || !baselineRow) continue;
      const rules = ruleForYear(assumptions, candidate.year);
      const current = schedule[candidate.year] ?? 0;
      const taxableIncome = taxableIncomeFromCashFlowMagi(input, rules, candidate.year, row.magi);
      const bracketDelta = candidate.targetTop - taxableIncome;
      const actualCap = irmaaCap(input, rules, candidate.year, row.magi);
      const irmaaDelta = actualCap === null ? Number.POSITIVE_INFINITY : actualCap - row.magi;
      const rawAdjustment = Math.min(bracketDelta, irmaaDelta);
      const maximumForYear = Math.max(0, Math.min(
        eligiblePretax - alreadyScheduled,
        Math.max(0, baselineRow.taxDeferredBalance),
      ));
      const adjusted = roundMoney(clamp(current + rawAdjustment, 0, maximumForYear));
      next[candidate.year] = adjusted;
      alreadyScheduled = roundMoney(alreadyScheduled + adjusted);
      if (Math.abs(adjusted - current) >= CENT) changed = true;
    }
    schedule = next;
    projection = runCashFlow(input, assumptions, scheduleMapToOptions(schedule));
    if (!changed) {
      converged = true;
      break;
    }
  }
  if (!converged) warnings.push(`Roth conversion tax/Taxable Social Security/IRMAA recalculation did not converge after ${MAX_REFINEMENT_PASSES} bounded passes; schedule is illustrative and requires review.`);
  return { schedule, projection };
}

/**
 * Evaluates annual bracket-fill conversions by passing the schedule to the shared cash-flow engine.
 * It never performs a parallel withdrawal, RMD, Social Security, or tax projection.
 */
export function calculateRothConversions(input: PlanningInput, assumptions: PlanningAssumptions): RothConversionResult {
  const warnings: string[] = [];
  const baseline = runCashFlow(input, assumptions);
  const eligibleAccounts = input.accounts.filter((account) => ELIGIBLE_PRETAX_TYPES.has(account.type));
  const eligiblePretax = roundMoney(eligibleAccounts.reduce((sum, account) => sum + account.balance, 0));
  if (eligibleAccounts.some((account) => account.costBasis === null)) {
    warnings.push('Pretax account basis is not available. Conversion calculations assume eligible pretax balances are fully taxable; confirm any nondeductible IRA basis and aggregation rules with a tax professional.');
  }
  const firstProjectionYear = Math.min(...baseline.rows.map((row) => row.year));
  if (!Number.isFinite(firstProjectionYear) || input.historicalMagi[String(firstProjectionYear - 2)] === undefined) {
    warnings.push('Historic MAGI for the current Medicare two-year lookback is not supplied; near-term IRMAA is explicitly unknown.');
  }

  const candidates = buildCandidates(input, assumptions, baseline, warnings);
  const refinement = candidates.length > 0 && eligiblePretax > 0
    ? refineSchedule(input, assumptions, baseline, candidates, eligiblePretax, warnings)
    : { schedule: {} as Record<number, number>, projection: baseline };
  const withConversionProjection = refinement.projection;
  const noConversionWarnings: string[] = [];
  const withConversionWarnings: string[] = [];
  const noConversion = scenarioComparison(input, assumptions, baseline, noConversionWarnings);
  const withConversion = scenarioComparison(input, assumptions, withConversionProjection, withConversionWarnings);
  warnings.push(...noConversionWarnings, ...withConversionWarnings);

  const baselineRows = mapRows(baseline);
  const conversionRows = mapRows(withConversionProjection);
  const candidateByYear = new Map(candidates.map((candidate) => [candidate.year, candidate]));
  const schedule = Object.entries(refinement.schedule)
    .map(([rawYear, amount]) => ({ year: Number(rawYear), amount }))
    .filter((entry) => entry.amount > 0)
    .sort((a, b) => a.year - b.year)
    .map(({ year, amount }) => {
      const converted = conversionRows.get(year);
      const noConversionRow = baselineRows.get(year);
      const candidate = candidateByYear.get(year);
      if (!converted || !noConversionRow || !candidate) throw new Error(`Roth conversion schedule lacks cash-flow data for ${year}.`);
      const rules = ruleForYear(assumptions, year);
      const actualCap = irmaaCap(input, rules, year, converted.magi);
      return {
        year,
        amount: roundMoney(amount),
        estimatedFederalTaxCost: roundMoney(converted.federalTax - noConversionRow.federalTax),
        targetBracket: assumptions.targetTaxBracket,
        taxableIncome: taxableIncomeFromCashFlowMagi(input, rules, year, converted.magi),
        magi: roundMoney(converted.magi),
        rmd: roundMoney(converted.rmd),
        irmaaCap: actualCap,
        irmaaCheck: (actualCap === null ? 'NOT_APPLICABLE' : converted.magi < actualCap + CENT ? 'WITHIN_CAP' : 'AT_OR_ABOVE_CAP') as RothConversionScheduleRow['irmaaCheck'],
      };
    });

  const lifetimeTaxDifference = roundMoney(noConversion.lifetimeFederalTax - withConversion.lifetimeFederalTax);
  const afterTaxLegacyDifference = roundMoney(withConversion.afterTaxLegacy - noConversion.afterTaxLegacy);
  const irmaaUnknown = noConversion.irmaaSurcharge === null || withConversion.irmaaSurcharge === null;
  const hasPositiveBenefit = lifetimeTaxDifference > 0 || afterTaxLegacyDifference > 0;
  const beneficial = schedule.length > 0 && hasPositiveBenefit && !irmaaUnknown;
  if (schedule.length === 0) warnings.push('No conversion recommendation is made because there is no modeled Roth conversion amount in the permitted window.');
  else if (irmaaUnknown) warnings.push('No Roth conversion recommendation is made because required IRMAA lookback MAGI is unknown.');
  else if (!hasPositiveBenefit) warnings.push('No Roth conversion recommendation is made because neither lifetime federal tax nor after-tax legacy improves in this model.');

  const sourceUrls = [...assumptions.annual.sources, ...assumptions.sources].map((source) => source.url).filter(Boolean);
  return {
    status: warnings.length > 0 ? 'PARTIAL' : 'COMPLETE',
    warnings: uniqueWarnings(warnings),
    sources: [...new Set(sourceUrls)],
    schedule,
    noConversion,
    withConversion,
    lifetimeTaxDifference,
    afterTaxLegacyDifference,
    beneficial,
    irmaaYears: withConversion.irmaaYears,
  };
}
