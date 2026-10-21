import { roundMoney, uniqueWarnings } from './math';
import type { CashFlowOptions, ModuleMeta, MonteCarloInput, PlanningAssumptions, PlanningInput, PlanningPerson } from './types';

/**
 * The minimum cash-flow result consumed by the LTC wrapper.  It intentionally
 * mirrors the public cash-flow contract rather than reimplementing that model.
 */
export interface LtcCashFlowResult {
  endingLegacy: number;
  portfolioAtRetirement: number;
  rows: ReadonlyArray<{ age: number; portfolioWithdrawal: number }>;
}

/** The minimum Monte Carlo result consumed by the LTC wrapper. */
export interface LtcMonteCarloResult {
  successPercent: number;
}

/**
 * Explicit dependencies keep this module pure and prevent it from maintaining
 * a shadow cash-flow or simulation engine.  The parent analysis orchestrator
 * supplies the sibling public functions once those modules are integrated.
 */
export interface LongTermCareEngineDependencies {
  calculateCashFlow: (
    input: PlanningInput,
    assumptions: PlanningAssumptions,
    options?: CashFlowOptions,
  ) => LtcCashFlowResult;
  calculateMonteCarlo: (
    input: MonteCarloInput,
    assumptions?: PlanningAssumptions,
  ) => LtcMonteCarloResult;
}

export interface LongTermCareResult {
  costAt85: number;
  existingCoverage: number | null;
  coverageGap: number | null;
  eventYear: number;
  eventCost: number;
  baseLegacy: number | null;
  stressLegacy: number | null;
  legacyChange: number | null;
  baseSuccessPercent: number | null;
  stressSuccessPercent: number | null;
  /** Stress success minus baseline success, in percentage points. */
  successPercentChange: number | null;
  /** The contract has one event; it is assigned to the primary person. */
  eventPerson: 'PRIMARY';
  meta: ModuleMeta;
}

interface AnnualLtcEventAmount {
  year: number;
  grossExpense: number;
  supportedCoverage: number | null;
  netExpense: number | null;
}

interface LtcEventProjection {
  eventYear: number;
  eventStart: string;
  eventEnd: string;
  rows: AnnualLtcEventAmount[];
  eventCost: number;
  existingCoverage: number | null;
  coverageGap: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a finite non-negative number.`);
}

function parseIsoDate(value: string, label: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.slice(0, 10));
  if (!match) throw new Error(`${label} must be a YYYY-MM-DD date.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`${label} is not a valid calendar date.`);
  }
  return { year, month, day };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * A February 29 birth anniversary is February 28 in a non-leap year.  This
 * deterministic convention avoids JavaScript's implicit rollover to March.
 */
function anniversaryDate(dob: string, age: number): string {
  const birth = parseIsoDate(dob, 'Person date of birth');
  const year = birth.year + age;
  return isoDate(year, birth.month, Math.min(birth.day, daysInMonth(year, birth.month)));
}

function utcMillis(value: string): number {
  const date = parseIsoDate(value, 'Calendar date');
  return Date.UTC(date.year, date.month - 1, date.day);
}

function daysInCalendarYear(year: number): number {
  return (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / DAY_MS;
}

function fullYearExpense(monthlyCost: number, healthcareInflation: number, baseYear: number, year: number): number {
  return monthlyCost * 12 * Math.pow(1 + healthcareInflation, year - baseYear);
}

function requirePrimary(input: PlanningInput): PlanningPerson {
  const primary = input.persons.find((person) => person.role === 'PRIMARY');
  if (!primary) throw new Error('Long-term care requires a PRIMARY planning person.');
  return primary;
}

function validateLtcAssumptions(assumptions: PlanningAssumptions): void {
  assertFiniteNonNegative(assumptions.ltcMonthly, 'LTC monthly cost');
  if (!Number.isInteger(assumptions.ltcYears) || assumptions.ltcYears <= 0) {
    throw new Error('LTC duration must be a positive whole number of years for calendar event scheduling.');
  }
  if (!Number.isInteger(assumptions.ltcEventAge) || assumptions.ltcEventAge < 0) {
    throw new Error('LTC event age must be a non-negative whole age.');
  }
  if (!Number.isFinite(assumptions.healthcareInflation) || assumptions.healthcareInflation <= -1) {
    throw new Error('Healthcare inflation must be finite and greater than -100%.');
  }
  if (!Number.isInteger(assumptions.year) || assumptions.year < 1900 || assumptions.year > 9999) {
    throw new Error('Assumption year must be a supported calendar year.');
  }
}

function coverageForRow(
  grossExpense: number,
  eligibleDays: number,
  ltcInsured: boolean | null,
  dailyBenefit: number | null,
): number | null {
  if (ltcInsured === null || (ltcInsured && dailyBenefit === null)) return null;
  if (!ltcInsured) return 0;
  if (dailyBenefit === null) return null;
  // A supplied daily benefit is a level nominal amount; no indexation rider is inferred.
  return roundMoney(Math.min(grossExpense, dailyBenefit * eligibleDays));
}

/**
 * Builds calendar-year extra expenses for an event beginning on the primary
 * person's birthday.  Annual amounts are prorated by actual eligible calendar
 * days, so a December birthday or leap year is not placed in the wrong year.
 */
function projectLtcEvent(input: PlanningInput, assumptions: PlanningAssumptions, primary: PlanningPerson): LtcEventProjection {
  const eventStart = anniversaryDate(primary.dob, assumptions.ltcEventAge);
  const eventEnd = anniversaryDate(primary.dob, assumptions.ltcEventAge + assumptions.ltcYears);
  const eventStartMs = utcMillis(eventStart);
  const eventEndMs = utcMillis(eventEnd);
  const eventYear = parseIsoDate(eventStart, 'LTC event start').year;
  const endYear = parseIsoDate(eventEnd, 'LTC event end').year;
  const rows: AnnualLtcEventAmount[] = [];

  for (let year = eventYear; year <= endYear; year += 1) {
    const yearStart = Date.UTC(year, 0, 1);
    const yearEnd = Date.UTC(year + 1, 0, 1);
    const overlapStart = Math.max(eventStartMs, yearStart);
    const overlapEnd = Math.min(eventEndMs, yearEnd);
    const eligibleDays = Math.max(0, (overlapEnd - overlapStart) / DAY_MS);
    if (eligibleDays === 0) continue;

    const grossExpense = roundMoney(
      fullYearExpense(assumptions.ltcMonthly, assumptions.healthcareInflation, assumptions.year, year)
      * (eligibleDays / daysInCalendarYear(year)),
    );
    const supportedCoverage = coverageForRow(grossExpense, eligibleDays, input.ltcInsured, input.ltcDailyBenefit);
    rows.push({
      year,
      grossExpense,
      supportedCoverage,
      netExpense: supportedCoverage === null ? null : roundMoney(grossExpense - supportedCoverage),
    });
  }

  const eventCost = roundMoney(rows.reduce((total, row) => total + row.grossExpense, 0));
  const existingCoverage = rows.some((row) => row.supportedCoverage === null)
    ? null
    : roundMoney(rows.reduce((total, row) => total + (row.supportedCoverage ?? 0), 0));
  const coverageGap = existingCoverage === null ? null : roundMoney(eventCost - existingCoverage);
  return { eventYear, eventStart, eventEnd, rows, eventCost, existingCoverage, coverageGap };
}

function annualExtraExpenses(rows: ReadonlyArray<AnnualLtcEventAmount>): Record<string, number> | null {
  if (rows.some((row) => row.netExpense === null)) return null;
  return Object.fromEntries(rows.map((row) => [String(row.year), row.netExpense ?? 0]));
}

function validateCashFlowResult(result: LtcCashFlowResult, scenario: string): void {
  assertFiniteNonNegative(result.endingLegacy, `${scenario} cash-flow ending legacy`);
  assertFiniteNonNegative(result.portfolioAtRetirement, `${scenario} cash-flow retirement portfolio`);
  if (!Array.isArray(result.rows) || result.rows.length === 0) {
    throw new Error(`${scenario} cash-flow result must include at least one projection row.`);
  }
  for (const row of result.rows) {
    if (!Number.isFinite(row.age) || !Number.isFinite(row.portfolioWithdrawal) || row.portfolioWithdrawal < 0) {
      throw new Error(`${scenario} cash-flow result has an invalid Monte Carlo row.`);
    }
  }
}

function monteCarloInputFromCashFlow(
  cashFlow: LtcCashFlowResult,
  input: PlanningInput,
  assumptions: PlanningAssumptions,
): MonteCarloInput {
  validateCashFlowResult(cashFlow, 'Cash-flow');
  return {
    portfolio: cashFlow.portfolioAtRetirement,
    annualWithdrawals: cashFlow.rows.map((row) => roundMoney(row.portfolioWithdrawal)),
    meanReturn: assumptions.returnByRisk[input.riskProfile],
    volatility: assumptions.volatilityByRisk[input.riskProfile],
    runs: assumptions.monteCarloRuns,
    seed: assumptions.monteCarloSeed,
    startAge: Math.floor(cashFlow.rows[0].age),
  };
}

function makeUnavailableResult(
  costAt85: number,
  event: LtcEventProjection,
  warnings: string[],
): LongTermCareResult {
  return {
    costAt85,
    existingCoverage: event.existingCoverage,
    coverageGap: event.coverageGap,
    eventYear: event.eventYear,
    eventCost: event.eventCost,
    baseLegacy: null,
    stressLegacy: null,
    legacyChange: null,
    baseSuccessPercent: null,
    stressSuccessPercent: null,
    successPercentChange: null,
    eventPerson: 'PRIMARY',
    meta: {
      status: 'PARTIAL',
      warnings: uniqueWarnings(warnings),
      sources: ['Editable planning assumptions: ltcMonthly, ltcYears, ltcEventAge, and healthcareInflation.'],
    },
  };
}

/**
 * Calculates the LTC cost illustration and, when public sibling engines are
 * supplied, compares the actual baseline cash-flow/Monte Carlo results with a
 * calendar-timed LTC expense scenario.  No fallback cash-flow or simulation is
 * implemented here: unavailable engines intentionally yield null stress values.
 */
export function calculateLongTermCare(
  input: PlanningInput,
  assumptions: PlanningAssumptions,
  engines?: LongTermCareEngineDependencies,
): LongTermCareResult {
  validateLtcAssumptions(assumptions);
  const primary = requirePrimary(input);
  const warnings: string[] = [];
  const event = projectLtcEvent(input, assumptions, primary);
  const age85Year = parseIsoDate(anniversaryDate(primary.dob, 85), 'Age-85 date').year;
  const costAt85 = roundMoney(
    assumptions.ltcMonthly
    * 12
    * assumptions.ltcYears
    * Math.pow(1 + assumptions.healthcareInflation, age85Year - assumptions.year),
  );

  if (input.persons.some((person) => person.role === 'SPOUSE')) {
    warnings.push('The contract models one LTC event; this scenario is assigned to the primary person rather than assuming simultaneous household claims.');
  }
  if (input.ltcInsured === null) {
    warnings.push('LTC coverage status is unknown; coverage and coverage gap are intentionally not shown as $0.');
  } else if (input.ltcInsured && input.ltcDailyBenefit === null) {
    warnings.push('LTC insurance is reported, but the daily benefit is unknown; coverage and coverage gap cannot be quantified.');
  } else if (input.ltcInsured) {
    warnings.push('The supplied LTC daily benefit is treated as level; no inflation rider was provided.');
    warnings.push('Policy benefit duration, elimination period, reimbursement method, and rider terms were not provided; coverage is limited to the supplied daily benefit during this hypothetical event.');
  }

  const asOf = parseIsoDate(input.asOfDate, 'Planning as-of date');
  const asOfDate = isoDate(asOf.year, asOf.month, asOf.day);
  if (event.eventStart <= asOfDate) {
    warnings.push('The LTC event begins on or before the planning as-of date, so a prospective cash-flow stress rerun was not produced.');
    return makeUnavailableResult(costAt85, event, warnings);
  }
  if (primary.planningAge < assumptions.ltcEventAge) {
    warnings.push('The LTC event age is beyond the primary person’s planning age, so a cash-flow stress rerun was not produced.');
    return makeUnavailableResult(costAt85, event, warnings);
  }

  const extraExpenses = annualExtraExpenses(event.rows);
  if (extraExpenses === null) {
    warnings.push('The LTC event was not rerun because existing coverage is unknown; treating it as zero would fabricate a stress cost.');
    return makeUnavailableResult(costAt85, event, warnings);
  }
  if (!engines) {
    warnings.push('Cash-flow and Monte Carlo engines were not supplied; no legacy or probability change was estimated.');
    return makeUnavailableResult(costAt85, event, warnings);
  }

  const baselineCashFlow = engines.calculateCashFlow(input, assumptions);
  const stressCashFlow = engines.calculateCashFlow(input, assumptions, { extraExpenses });
  validateCashFlowResult(baselineCashFlow, 'Baseline');
  validateCashFlowResult(stressCashFlow, 'LTC stress');

  const baselineMonteCarlo = engines.calculateMonteCarlo(monteCarloInputFromCashFlow(baselineCashFlow, input, assumptions), assumptions);
  const stressMonteCarlo = engines.calculateMonteCarlo(monteCarloInputFromCashFlow(stressCashFlow, input, assumptions), assumptions);
  if (!Number.isFinite(baselineMonteCarlo.successPercent) || !Number.isFinite(stressMonteCarlo.successPercent)) {
    throw new Error('Monte Carlo engine returned a non-finite success percentage.');
  }

  const baseLegacy = roundMoney(baselineCashFlow.endingLegacy);
  const stressLegacy = roundMoney(stressCashFlow.endingLegacy);
  const baseSuccessPercent = baselineMonteCarlo.successPercent;
  const stressSuccessPercent = stressMonteCarlo.successPercent;
  const status = input.ltcInsured === false ? 'COMPLETE' : 'PARTIAL';

  return {
    costAt85,
    existingCoverage: event.existingCoverage,
    coverageGap: event.coverageGap,
    eventYear: event.eventYear,
    eventCost: event.eventCost,
    baseLegacy,
    stressLegacy,
    legacyChange: roundMoney(stressLegacy - baseLegacy),
    baseSuccessPercent,
    stressSuccessPercent,
    successPercentChange: stressSuccessPercent - baseSuccessPercent,
    eventPerson: 'PRIMARY',
    meta: {
      status,
      warnings: uniqueWarnings(warnings),
      sources: ['Editable planning assumptions: ltcMonthly, ltcYears, ltcEventAge, and healthcareInflation.'],
    },
  };
}
